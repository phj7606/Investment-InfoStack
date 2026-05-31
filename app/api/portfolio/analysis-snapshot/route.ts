/**
 * GET /api/portfolio/analysis-snapshot
 *
 * Claude 분석용 포트폴리오 스냅샷 생성
 *
 * CLI 환경: curl http://localhost:3000/api/portfolio/analysis-snapshot | jq .
 * Desktop 환경: 브라우저 다운로드 버튼 → JSON 파일 저장 후 Claude Desktop에 첨부
 *
 * 각 계좌 운용 전략에 맞게 Claude가 바로 판단할 수 있는 데이터만 포함:
 *   - Education: 추세추종 시스템 검증 데이터 (실제 승률/손익비 vs 설계값, 포지션별 손절 여유)
 *   - Longterm:  가치투자 포지션별 보유기간·수익률 (thesis 점검 기초 데이터)
 *   - Pension:   섹터별 현재 비중 vs 목표 비중 + 리밸런싱 경과 기간
 *   - Cross:     계좌 간 중복 노출 (의도치 않은 쏠림)
 */

import { NextResponse } from "next/server";
import {
  readTransactions as readLongtermTxs,
} from "@/lib/portfolio/longterm-store";
import {
  readTransactions as readEducationTxs,
} from "@/lib/portfolio/educationTransactionsData";
import {
  readTransactions as readPensionTxs,
  readRebalancingConfig,
} from "@/lib/portfolio/pension-store";
import {
  readTransactions as readShorttermTxs,
} from "@/lib/portfolio/shorttermData";
import {
  calcPositions,
  enrichTransactionsFromHistory,
} from "@/lib/portfolio/longterm-calc";
import {
  calcPensionPositions,
  enrichTransactionsFromHistory as enrichPensionTxs,
} from "@/lib/portfolio/pension-calc";
import { getLongtermCurrentPrices } from "@/lib/portfolio/current-price-service";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import type { LongtermTransaction, LongtermPosition, PensionPosition } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────
// Education: 추세추종 시스템 통계 계산
// ─────────────────────────────────────────

/**
 * 완료된 SELL 거래 기반으로 시스템 설계값(승률30%/손익비1:3) 대비 실제값 계산
 *
 * 손절 기준 -8%: 설계상 최대 손실은 8%이므로 평균손실이 8%를 크게 초과하면
 * 손절 규칙이 지켜지지 않고 있다는 신호
 */
function calcEducationSystemStats(txs: LongtermTransaction[]) {
  const sellTxs = txs.filter((t) => t.tradeType === "SELL" && t.realizedPL !== undefined);

  if (sellTxs.length === 0) {
    return { totalClosedTrades: 0, note: "완료된 거래 없음 — 시스템 통계 산출 불가" };
  }

  // 거래별 수익률: realizedPL / (avgCostAtSell * quantity)
  const tradeReturns = sellTxs.map((t) => {
    const costBasis = (t.avgCostAtSell ?? t.price) * t.quantity;
    return costBasis > 0 ? ((t.realizedPL ?? 0) / costBasis) * 100 : 0;
  });

  const wins  = tradeReturns.filter((r) => r > 0);
  const loses = tradeReturns.filter((r) => r <= 0);

  const actualWinRate    = wins.length / tradeReturns.length;
  const avgWinPct        = wins.length > 0 ? wins.reduce((s, r) => s + r, 0) / wins.length : 0;
  const avgLossPct       = loses.length > 0 ? Math.abs(loses.reduce((s, r) => s + r, 0) / loses.length) : 0;
  const actualRiskReward = avgLossPct > 0 ? avgWinPct / avgLossPct : null;

  // 기대값: 양수면 시스템이 장기적으로 수익 창출
  const expectedValue =
    actualWinRate * avgWinPct - (1 - actualWinRate) * avgLossPct;

  // 설계값 대비 기대값: 설계(30% 승률, 1:3 손익비) 기준 기대값 = 0.3*24 - 0.7*8 = 1.6%
  // 실제 기대값이 양수면 시스템 유효, 음수면 재점검 필요
  return {
    totalClosedTrades:   tradeReturns.length,
    wins:                wins.length,
    losses:              loses.length,
    actualWinRate:       Math.round(actualWinRate * 1000) / 10,    // % 소수1자리
    targetWinRate:       30,
    avgWinPct:           Math.round(avgWinPct * 100) / 100,
    avgLossPct:          Math.round(avgLossPct * 100) / 100,
    actualRiskReward:    actualRiskReward ? Math.round(actualRiskReward * 100) / 100 : null,
    targetRiskReward:    3.0,
    expectedValuePct:    Math.round(expectedValue * 100) / 100,
    // 손절 규칙 준수 여부: 평균 손실이 8%를 크게 초과하면 규칙 위반
    stopLossCompliance:  avgLossPct <= 10
      ? "양호 (평균손실 10% 이내)"
      : `주의 (평균손실 ${Math.round(avgLossPct * 10) / 10}% — 손절 규칙 점검 필요)`,
  };
}

// ─────────────────────────────────────────
// Education: 포지션별 손절 여유 계산
// ─────────────────────────────────────────

/**
 * 추세추종 전략의 핵심 리스크 지표:
 *   - stopLossLevel: avgCost × 0.92 (8% 손절선)
 *   - distanceToStop: (현재가 - 손절선) / 현재가 × 100
 *   - status: 여유 충분 / 경고(3% 이내) / 손절 초과
 */
function enrichEducationPositions(
  positions: LongtermPosition[],
  prices: Record<string, number>
) {
  return positions.map((p) => {
    const currentPrice = prices[p.stockCode] ?? p.avgCost;
    const stopLossLevel = Math.round(p.avgCost * 0.92);
    const distanceToStop =
      currentPrice > 0
        ? Math.round(((currentPrice - stopLossLevel) / currentPrice) * 10000) / 100
        : null;

    const evalPLPct = Math.round(
      ((currentPrice - p.avgCost) / p.avgCost) * 10000
    ) / 100;

    let stopStatus: string;
    if (evalPLPct <= -8)        stopStatus = "⛔ 손절선 돌파 — 즉시 검토";
    else if (evalPLPct <= -5)   stopStatus = "⚠️  경고 — 손절선 3% 이내";
    else                        stopStatus = "✅ 정상";

    return {
      stockName:     p.stockName,
      stockCode:     p.stockCode,
      market:        p.market,
      quantity:      p.quantity,
      avgCost:       p.avgCost,
      currentPrice,
      evalPLPct,
      stopLossLevel,
      distanceToStop,
      stopStatus,
      evalAmount:    Math.round(currentPrice * p.quantity),
    };
  });
}

// ─────────────────────────────────────────
// Longterm: 가치투자 포지션 보강
// ─────────────────────────────────────────

/**
 * 가치투자 thesis 점검에 필요한 필드:
 *   - holdingMonths: 매수 후 경과 기간 (BUY 거래 최초 날짜 기준)
 *   - evalPLPct: 현재 평가손익률
 *   - 스크린상 이미 보이는 단순 수익률은 제외하고, thesis 판단에 필요한 맥락만 포함
 */
function enrichLongtermPositions(
  positions: LongtermPosition[],
  txs: LongtermTransaction[],
  prices: Record<string, number>
) {
  return positions.map((p) => {
    const currentPrice = prices[p.stockCode] ?? p.avgCost;
    const evalPLPct = Math.round(
      ((currentPrice - p.avgCost) / p.avgCost) * 10000
    ) / 100;

    // 최초 매수일로 보유 기간 계산
    const buyTxs = txs.filter(
      (t) => t.stockCode === p.stockCode && t.accountNo === p.accountNo && t.tradeType === "BUY"
    );
    const firstBuyDate = buyTxs.length > 0
      ? buyTxs.map((t) => t.date).sort()[0]
      : null;
    const holdingMonths = firstBuyDate
      ? Math.round(
          ((new Date().getTime() - new Date(firstBuyDate).getTime()) /
            (1000 * 60 * 60 * 24 * 30.44)) * 10
        ) / 10
      : null;

    return {
      stockName:    p.stockName,
      stockCode:    p.stockCode,
      market:       p.market,
      accountNo:    p.accountNo,
      quantity:     p.quantity,
      avgCost:      p.avgCost,
      currentPrice,
      evalPLPct,
      holdingMonths,
      firstBuyDate,
      evalAmount:   Math.round(currentPrice * p.quantity),
      weight:       Math.round(p.currentWeight * 1000) / 10,  // %
    };
  });
}

// ─────────────────────────────────────────
// Pension: 섹터 비중 + 리밸런싱 판단
// ─────────────────────────────────────────

/**
 * 4섹터 분류: 연금 계좌 내 EQUITY/BOND × KR/US
 * 실제 종목명/코드로 시장 추론 (종목 이름에 "미국", "US", "S&P" 포함 → US)
 */
function classifyPensionSector(
  pos: PensionPosition
): "US_EQUITY" | "US_BOND" | "KR_EQUITY" | "KR_BOND" | "UNKNOWN" {
  const name = pos.stockName.toUpperCase();
  const isUS  = name.includes("미국") || name.includes("US") || name.includes("S&P") ||
                name.includes("나스닥") || name.includes("NASDAQ") || pos.stockCode.startsWith("H") ||
                name.includes("달러") || name.includes("DOLLAR");
  const isBond = pos.category === "BOND" ||
                 name.includes("채권") || name.includes("BOND") || name.includes("국채");

  if (isUS && isBond)  return "US_BOND";
  if (isUS && !isBond) return "US_EQUITY";
  if (!isUS && isBond) return "KR_BOND";
  if (!isUS && !isBond && pos.category === "EQUITY") return "KR_EQUITY";
  return "UNKNOWN";
}

function calcPensionSectorBreakdown(positions: PensionPosition[], accountType: "RETIREMENT" | "SAVINGS") {
  const filtered = positions.filter((p) => p.accountType === accountType);
  const total = filtered.reduce((s, p) => s + p.evalAmount, 0);

  const sectors: Record<string, number> = {
    US_EQUITY: 0, US_BOND: 0, KR_EQUITY: 0, KR_BOND: 0, UNKNOWN: 0,
  };
  for (const p of filtered) {
    sectors[classifyPensionSector(p)] += p.evalAmount;
  }

  return {
    totalEval: Math.round(total),
    sectorPct: {
      US_EQUITY: total > 0 ? Math.round((sectors.US_EQUITY / total) * 1000) / 10 : 0,
      US_BOND:   total > 0 ? Math.round((sectors.US_BOND   / total) * 1000) / 10 : 0,
      KR_EQUITY: total > 0 ? Math.round((sectors.KR_EQUITY / total) * 1000) / 10 : 0,
      KR_BOND:   total > 0 ? Math.round((sectors.KR_BOND   / total) * 1000) / 10 : 0,
    },
    positions: filtered.map((p) => ({
      stockName:  p.stockName,
      stockCode:  p.stockCode,
      sector:     classifyPensionSector(p),
      evalAmount: Math.round(p.evalAmount),
      evalPLPct:  Math.round(p.evalPLPct * 100) / 100,
      weightPct:  total > 0 ? Math.round((p.evalAmount / total) * 1000) / 10 : 0,
    })),
  };
}

/** 마지막 거래일 기준 리밸런싱 경과 기간 추정 */
function calcMonthsSinceLastRebalancing(
  txs: Awaited<ReturnType<typeof readPensionTxs>>,
  accountType: "RETIREMENT" | "SAVINGS"
): number | null {
  const filtered = txs.filter((t) => t.accountType === accountType);
  if (filtered.length === 0) return null;
  const lastDate = filtered.map((t) => t.date).sort().at(-1)!;
  const msElapsed = new Date().getTime() - new Date(lastDate).getTime();
  return Math.round((msElapsed / (1000 * 60 * 60 * 24 * 30.44)) * 10) / 10;
}

// ─────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────

export async function GET() {
  try {
    // ── 1. 데이터 병렬 로딩 ──
    const [longtermRawTxs, educationRawTxs, pensionRawTxs, rebalancingConfig, shorttermRawTxs] =
      await Promise.all([
        readLongtermTxs(),
        readEducationTxs(),
        readPensionTxs(),
        readRebalancingConfig(),
        readShorttermTxs(),
      ]);

    const longtermTxs  = enrichTransactionsFromHistory(longtermRawTxs);
    const educationTxs = enrichTransactionsFromHistory(educationRawTxs);
    const shorttermTxs = enrichTransactionsFromHistory(shorttermRawTxs);
    const pensionTxs   = enrichPensionTxs(pensionRawTxs);

    const longtermPositions  = calcPositions(longtermTxs);
    const educationPositions = calcPositions(educationTxs);
    const shorttermPositions = calcPositions(shorttermTxs);

    // ── 2. 현재가 병렬 조회 ──
    // longterm + education + shortterm 합산 (KR 주식 + US 심볼)
    const allKrPositions = [
      ...longtermPositions.filter((p) => p.market === "KR" && p.assetType !== "FUND"),
      ...educationPositions.filter((p) => p.market === "KR" && p.assetType !== "FUND"),
      ...shorttermPositions.filter((p) => p.market === "KR" && p.assetType !== "FUND"),
    ];
    const allUsSymbols = [
      ...longtermPositions.filter((p) => p.market === "US").map((p) => p.stockCode),
      ...educationPositions.filter((p) => p.market === "US").map((p) => p.stockCode),
      ...shorttermPositions.filter((p) => p.market === "US").map((p) => p.stockCode),
    ];

    // pension은 전부 국내 ETF이므로 fetchNaverCurrentPrices로 별도 조회
    // 거래 이력에서 코드 추출 (포지션 계산 전이라 rawTxs 사용)
    const pensionStockInputs = [...new Set(pensionRawTxs.map((t) => t.stockCode))]
      .map((code) => {
        const tx = pensionRawTxs.find((t) => t.stockCode === code);
        return { code, name: tx?.stockName };
      });

    const [prices, pensionPrices] = await Promise.all([
      getLongtermCurrentPrices(
        allKrPositions.map((p) => ({ code: p.stockCode, name: p.stockName })),
        [...new Set(allUsSymbols)]
      ),
      fetchNaverCurrentPrices(pensionStockInputs),
    ]);

    // pension 현재가 반영하여 포지션 계산
    const pensionPositions = calcPensionPositions(pensionTxs, pensionPrices);

    // ── 3. Education 분석 데이터 ──
    const educationSystem   = calcEducationSystemStats(educationTxs);
    const educationEnriched = enrichEducationPositions(educationPositions, prices);

    // ── 4. Shortterm 분석 데이터 ──
    // longterm과 동일 모델이므로 enrichLongtermPositions 재사용
    const shorttermEnriched = enrichLongtermPositions(shorttermPositions, shorttermTxs, prices);
    const shorttermTotalKRW = shorttermEnriched
      .filter((p) => p.market === "KR")
      .reduce((s, p) => s + p.evalAmount, 0);
    const shorttermTotalUSD = shorttermEnriched
      .filter((p) => p.market === "US")
      .reduce((s, p) => s + p.evalAmount, 0);

    // ── 5. Longterm 분석 데이터 ──
    const longtermEnriched = enrichLongtermPositions(longtermPositions, longtermTxs, prices);
    const longtermTotalKRW = longtermEnriched
      .filter((p) => p.market === "KR")
      .reduce((s, p) => s + p.evalAmount, 0);
    const longtermTotalUSD = longtermEnriched
      .filter((p) => p.market === "US")
      .reduce((s, p) => s + p.evalAmount, 0);

    // ── 6. Pension 분석 데이터 ──
    const retirementBreakdown = calcPensionSectorBreakdown(pensionPositions, "RETIREMENT");
    const savingsBreakdown    = calcPensionSectorBreakdown(pensionPositions, "SAVINGS");
    const monthsSinceRetirement = calcMonthsSinceLastRebalancing(pensionRawTxs, "RETIREMENT");
    const monthsSinceSavings    = calcMonthsSinceLastRebalancing(pensionRawTxs, "SAVINGS");

    // ── 7. 계좌 간 KR 주식 중복 노출 점검 ──
    const longtermKrStocks  = longtermPositions.filter((p) => p.market === "KR");
    const pensionKrEquity   = pensionPositions.filter(
      (p) => (p.category === "EQUITY" || classifyPensionSector(p) === "KR_EQUITY")
    );
    const longtermKrTotal   = longtermKrStocks.reduce((s, p) => s + (prices[p.stockCode] ?? p.avgCost) * p.quantity, 0);
    const pensionKrTotal    = pensionKrEquity.reduce((s, p) => s + p.evalAmount, 0);
    const educationKrTotal  = educationPositions
      .filter((p) => p.market === "KR")
      .reduce((s, p) => s + (prices[p.stockCode] ?? p.avgCost) * p.quantity, 0);
    const shorttermKrTotal  = shorttermPositions
      .filter((p) => p.market === "KR")
      .reduce((s, p) => s + (prices[p.stockCode] ?? p.avgCost) * p.quantity, 0);
    const combinedKrTotal   = longtermKrTotal + pensionKrTotal + educationKrTotal + shorttermKrTotal;

    // ── 8. 스냅샷 조립 ──
    const snapshot = {
      meta: {
        generatedAt: new Date().toISOString(),
        // 분석 컨텍스트: Claude가 각 계좌를 올바른 전략 기준으로 평가할 수 있도록
        investmentContext: {
          education: {
            strategy: "추세추종",
            rules: {
              maxStopLoss:    "-8% (avgCost 기준)",
              targetRR:       "1:3 (손익비)",
              assumedWinRate: "30%",
              impliedMinRR:   "손익분기 손익비 = (1-0.3)/0.3 = 2.33 → 목표 3.0은 충분한 버퍼",
            },
          },
          longterm: {
            strategy: "중장기 가치투자",
            rules: { focus: "내재가치 대비 안전마진, 개별 기업 thesis 유지 여부" },
          },
          pension: {
            strategy: "4섹터 리밸런싱",
            rules: {
              sectors:           "미국주식 / 미국채권 / 한국주식 / 한국채권",
              rebalancingCycle:  "3~6개월",
            },
          },
          shortterm: {
            strategy: "단기 운용 (유동성 확보)",
            rules: { focus: "현금성 자산 대체, 즉각적 유동성 유지" },
          },
        },
      },

      education: {
        systemStats:  educationSystem,
        positions:    educationEnriched,
        summary: {
          totalPositions:  educationEnriched.length,
          stopBreached:    educationEnriched.filter((p) => p.evalPLPct <= -8).length,
          stopWarning:     educationEnriched.filter((p) => p.evalPLPct > -8 && p.evalPLPct <= -5).length,
          healthy:         educationEnriched.filter((p) => p.evalPLPct > -5).length,
        },
      },

      longterm: {
        positions:   longtermEnriched,
        summary: {
          totalKRW:       Math.round(longtermTotalKRW),
          totalUSD:       Math.round(longtermTotalUSD),
          totalPositions: longtermEnriched.length,
          // thesis 판단 보조: 장기 보유(12개월+) 중 손실 포지션은 thesis 점검 우선순위
          longHoldingLoss: longtermEnriched
            .filter((p) => (p.holdingMonths ?? 0) >= 12 && p.evalPLPct < 0)
            .map((p) => ({ stockName: p.stockName, holdingMonths: p.holdingMonths, evalPLPct: p.evalPLPct })),
        },
      },

      pension: {
        retirement: {
          ...retirementBreakdown,
          targetAllocation: {
            BOND:   rebalancingConfig.RETIREMENT.bondRatio,
            EQUITY: rebalancingConfig.RETIREMENT.equityRatio,
          },
          monthsSinceLastRebalancing: monthsSinceRetirement,
          rebalancingDue: monthsSinceRetirement !== null && monthsSinceRetirement >= 3,
        },
        savings: {
          ...savingsBreakdown,
          targetAllocation: {
            BOND:   rebalancingConfig.SAVINGS.bondRatio,
            EQUITY: rebalancingConfig.SAVINGS.equityRatio,
          },
          monthsSinceLastRebalancing: monthsSinceSavings,
          rebalancingDue: monthsSinceSavings !== null && monthsSinceSavings >= 3,
        },
      },

      shortterm: {
        positions: shorttermEnriched,
        summary: {
          totalKRW:       Math.round(shorttermTotalKRW),
          totalUSD:       Math.round(shorttermTotalUSD),
          totalPositions: shorttermEnriched.length,
        },
      },

      crossAccountRisk: {
        krStockExposure: {
          longterm_KRW:  Math.round(longtermKrTotal),
          pension_KRW:   Math.round(pensionKrTotal),
          education_KRW: Math.round(educationKrTotal),
          shortterm_KRW: Math.round(shorttermKrTotal),
          combined_KRW:  Math.round(combinedKrTotal),
          note: combinedKrTotal > 0
            ? "longterm + pension KR주식 + education + shortterm KR주식 합산 노출. 동일 매크로 리스크 동시 집중 여부 확인 필요."
            : "KR 주식 노출 없음",
        },
      },
    };

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error("[analysis-snapshot GET]", err);
    return NextResponse.json({ error: "스냅샷 생성 실패" }, { status: 500 });
  }
}
