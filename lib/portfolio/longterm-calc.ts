/**
 * 중장기 투자 계좌 성과 계산 모듈
 *
 * 핵심 원칙:
 * - 종목별 독립 계산: stockCode+accountNo 기준 가중평균단가 관리
 * - 부분 매도 지원: SELL 시 realizedPL 계산, 남은 수량은 동일 avgCost 유지
 * - 성과 평가: SELL 거래 날짜 기준 집계 (전체·부분 매도 모두 동일)
 * - KR/US 분리: currency 기준으로 절대 혼산하지 않음
 */

import type {
  LongtermTransaction,
  LongtermPosition,
  RebalancingTarget,
  StockPerformance,
} from "@/types/portfolio";

// ─────────────────────────────────────────
// 포지션 계산
// ─────────────────────────────────────────

/**
 * 전체 거래 이력 → 현재 보유 포지션 계산
 *
 * 알고리즘:
 * 1. stockCode+accountNo 조합별로 거래를 날짜순으로 처리
 * 2. BUY: 누적 수량·금액으로 가중평균단가 갱신
 * 3. SELL: realizedPL 계산, 잔여 수량 차감 (avgCost는 변경 없음)
 * 4. 잔여 수량 > 0 인 항목이 현재 포지션
 */
export function calcPositions(
  txs: LongtermTransaction[],
  currentPrices: Record<string, number> = {}
): LongtermPosition[] {
  // 종목+계좌 기준으로 그룹핑 (키: `${stockCode}::${accountNo}`)
  const posMap = new Map<string, {
    stockCode: string;
    stockName: string;
    market: "KR" | "US";
    assetType: "STOCK" | "FUND" | "ETF";
    accountNo: string;
    currency: "KRW" | "USD";
    quantity: number;
    totalCost: number;     // BUY 누적 금액 (수수료 제외 — amount는 qty×price 기준)
    totalRealizedPL: number;
    targetWeight?: number;
    sector?: string;       // 섹터 (Short-term 계좌용, 최초 BUY에서 전파)
  }>();

  // 날짜 오름차순으로 정렬 후 처리
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    if (tx.tradeType === "DIVIDEND") continue; // 배당은 포지션 계산 제외

    const key = `${tx.stockCode}::${tx.accountNo}`;
    let pos = posMap.get(key);

    if (!pos) {
      pos = {
        stockCode: tx.stockCode,
        stockName: tx.stockName,
        market: tx.market,
        assetType: tx.assetType,
        accountNo: tx.accountNo,
        currency: tx.currency,
        quantity: 0,
        totalCost: 0,
        totalRealizedPL: 0,
        sector: tx.sector,  // 최초 BUY 거래에서 섹터 전파
      };
      posMap.set(key, pos);
    }

    if (tx.tradeType === "BUY") {
      // 매수: 가중평균단가 갱신 (수수료 제외 — 종목별 탭 groupByStock과 동일 기준)
      pos.quantity += tx.quantity;
      pos.totalCost += tx.amount;
    } else if (tx.tradeType === "SELL") {
      // 매도: 실현손익 누적, 잔여 수량 차감
      // avgCost는 남은 수량에 그대로 유지 (FIFO 단순화)
      if (tx.realizedPL !== undefined) {
        pos.totalRealizedPL += tx.realizedPL;
      } else {
        // 기존 데이터에 realizedPL 없는 경우 현재 avgCost로 계산
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        pos.totalRealizedPL += (tx.price - avgCost) * tx.quantity;
      }
      // totalCost에서 매도 수량 비율만큼 차감 (남은 수량의 원가 보존)
      if (pos.quantity > 0) {
        pos.totalCost = pos.totalCost * ((pos.quantity - tx.quantity) / pos.quantity);
      }
      pos.quantity = Math.max(0, pos.quantity - tx.quantity);
    }
  }

  // 잔여 수량 > 0 인 포지션만 반환
  const positions: LongtermPosition[] = [];
  const allQuantities = Array.from(posMap.values()).filter((p) => p.quantity > 0);
  const totalKRW = allQuantities
    .filter((p) => p.currency === "KRW")
    .reduce((sum, p) => sum + (currentPrices[p.stockCode] ?? p.totalCost / p.quantity) * p.quantity, 0);
  const totalUSD = allQuantities
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + (currentPrices[p.stockCode] ?? p.totalCost / p.quantity) * p.quantity, 0);

  for (const p of allQuantities) {
    const avgCost = p.quantity > 0 ? p.totalCost / p.quantity : 0;
    const currentPrice = currentPrices[p.stockCode];
    const evalAmount = (currentPrice ?? avgCost) * p.quantity;
    const evalPL = currentPrice ? evalAmount - avgCost * p.quantity : 0;
    const evalPLPct = currentPrice && avgCost > 0
      ? (evalPL / (avgCost * p.quantity)) * 100
      : 0;
    const total = p.currency === "KRW" ? totalKRW : totalUSD;
    const currentWeight = total > 0 ? evalAmount / total : 0;

    positions.push({
      stockCode: p.stockCode,
      stockName: p.stockName,
      market: p.market,
      assetType: p.assetType,
      accountNo: p.accountNo,
      currency: p.currency,
      quantity: Math.round(p.quantity * 1000) / 1000, // 소수점 오차 방지
      avgCost: Math.round(avgCost * 100) / 100,
      currentPrice,
      evalAmount: Math.round(evalAmount),
      evalPL: Math.round(evalPL),
      evalPLPct: Math.round(evalPLPct * 100) / 100,
      totalRealizedPL: Math.round(p.totalRealizedPL),
      currentWeight: Math.round(currentWeight * 10000) / 10000,
      sector: p.sector,
    });
  }

  return positions;
}

// ─────────────────────────────────────────
// SELL 거래에 realizedPL 자동 계산 (저장 전 호출)
// ─────────────────────────────────────────

/**
 * SELL 거래 추가 전, 현재 포지션의 avgCost로 realizedPL 자동 계산
 * 저장소에 쓰기 전에 이 함수로 tx를 보강한다.
 */
export function enrichSellTransaction(
  tx: LongtermTransaction,
  existingTxs: LongtermTransaction[]
): LongtermTransaction {
  if (tx.tradeType !== "SELL") return tx;

  // 해당 종목+계좌의 기존 거래 추적 (existingTxs에는 현재 tx 미포함)
  const relevant = existingTxs
    .filter(
      (t) =>
        t.stockCode === tx.stockCode &&
        t.accountNo === tx.accountNo &&
        t.tradeType !== "DIVIDEND"
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  let qty     = 0;
  let runCost = 0;  // fee-exclusive BUY 누적 원가 (잔량 기준)

  for (const t of relevant) {
    if (t.tradeType === "BUY") {
      qty     += t.quantity;
      runCost += t.amount;
    } else if (t.tradeType === "SELL") {
      if (qty > 0) runCost *= (qty - t.quantity) / qty;
      qty = Math.max(0, qty - t.quantity);
    }
  }

  // 행별 실현손익: (단가 - 평균단가) × 수량 — 수수료 미포함
  // 수수료는 테이블 하단 총매수/총매도 기준 요약에서만 반영
  const avgCostAtSell = qty > 0 ? runCost / qty : 0;
  const realizedPL    = (tx.price - avgCostAtSell) * tx.quantity;
  const realizedPLPct = avgCostAtSell > 0 ? ((tx.price - avgCostAtSell) / avgCostAtSell) * 100 : 0;

  return {
    ...tx,
    avgCostAtSell: Math.round(avgCostAtSell * 100) / 100,
    realizedPL:    Math.round(realizedPL * 100) / 100,   // USD 소수점 2자리 보존, KRW도 정수로 자연 수렴
    realizedPLPct: Math.round(realizedPLPct * 100) / 100,
  };
}

// ─────────────────────────────────────────
// 성과 분석용 어댑터
// ─────────────────────────────────────────

/**
 * SELL 거래 → StockPerformance[] 변환
 * 기존 lib/portfolio/performance.ts의 calcPerformanceSummary, buildEquityCurve 재사용을 위한 어댑터
 *
 * @param currency 필터: 해당 통화의 SELL 거래만 변환
 */
export function toStockPerformances(
  txs: LongtermTransaction[],
  currency: "KRW" | "USD"
): StockPerformance[] {
  return txs
    .filter((t) => t.tradeType === "SELL" && t.currency === currency)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      stockCode: t.stockCode,
      stockName: t.stockName,
      exitDate: t.date,
      holdingDays: 0,        // 중장기 계좌는 보유일수 미추적
      profitLoss: t.realizedPL ?? 0,
      profitLossPct: t.realizedPLPct ?? 0,
      result: (t.realizedPLPct ?? 0) > 0 ? "WIN" : "LOSS",
    }));
}

// ─────────────────────────────────────────
// 월별/일별 성과 집계
// ─────────────────────────────────────────

/** 일별 실현손익 (SELL 거래 기준) */
export function buildDailyPL(
  txs: LongtermTransaction[],
  currency: "KRW" | "USD"
): { date: string; pl: number }[] {
  const map = new Map<string, number>();

  for (const t of txs) {
    if (t.tradeType !== "SELL" || t.currency !== currency) continue;
    const pl = t.realizedPL ?? 0;
    map.set(t.date, (map.get(t.date) ?? 0) + pl);
  }

  return Array.from(map.entries())
    .map(([date, pl]) => ({ date, pl }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 월별 실현손익 (SELL 거래 기준) */
export function buildMonthlyPL(
  txs: LongtermTransaction[],
  currency: "KRW" | "USD"
): { year: number; month: number; pl: number }[] {
  const map = new Map<string, number>();

  for (const t of txs) {
    if (t.tradeType !== "SELL" || t.currency !== currency) continue;
    const key = t.date.slice(0, 7); // YYYY-MM
    const pl = t.realizedPL ?? 0;
    map.set(key, (map.get(key) ?? 0) + pl);
  }

  return Array.from(map.entries())
    .map(([key, pl]) => ({
      year: parseInt(key.slice(0, 4)),
      month: parseInt(key.slice(5, 7)),
      pl,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

// ─────────────────────────────────────────
// 대시보드 요약
// ─────────────────────────────────────────

export interface LongtermSummary {
  currency: "KRW" | "USD";
  totalInvested: number;         // BUY 금액 합계 - SELL 금액 합계 (순 투자금)
  totalEvalAmount: number;       // 현재 평가금액 합계
  totalRealizedPL: number;       // 누적 실현손익
  totalEvalPL: number;           // 현재 평가손익 (현재가 있는 종목만)
  dividendTotal: number;         // 배당금 합계
  positionCount: number;         // 보유 종목 수
}

/** KR 또는 US 섹션 요약 계산 */
export function calcLongtermSummary(
  txs: LongtermTransaction[],
  positions: LongtermPosition[],
  currency: "KRW" | "USD"
): LongtermSummary {
  const filtered = txs.filter((t) => t.currency === currency);

  const totalBuy = filtered
    .filter((t) => t.tradeType === "BUY")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSell = filtered
    .filter((t) => t.tradeType === "SELL")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalRealizedPL = filtered
    .filter((t) => t.tradeType === "SELL")
    .reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);
  const dividendTotal = filtered
    .filter((t) => t.tradeType === "DIVIDEND")
    .reduce((sum, t) => sum + t.amount, 0);

  const currPositions = positions.filter((p) => p.currency === currency);
  const totalEvalAmount = currPositions.reduce((sum, p) => sum + p.evalAmount, 0);
  const totalEvalPL = currPositions.reduce((sum, p) => sum + p.evalPL, 0);

  return {
    currency,
    totalInvested: Math.round(totalBuy - totalSell),
    totalEvalAmount: Math.round(totalEvalAmount),
    totalRealizedPL: Math.round(totalRealizedPL),
    totalEvalPL: Math.round(totalEvalPL),
    dividendTotal: Math.round(dividendTotal),
    positionCount: currPositions.length,
  };
}

// ─────────────────────────────────────────
// 리밸런싱
// ─────────────────────────────────────────

export interface RebalancingSuggestion {
  stockCode: string;
  stockName: string;
  currentWeight: number;    // 현재 비중 (0~1)
  targetWeight: number;     // 목표 비중 (0~1)
  diffPct: number;          // 차이 %p
  diffAmount: number;       // 매수/매도 금액
  action: "BUY" | "SELL" | "HOLD";
}

/**
 * 리밸런싱 제안 계산
 * diffAmount = (targetWeight - currentWeight) × 총 평가금액
 * 양수 = 매수, 음수 = 매도
 */
export function calcRebalancingSuggestions(
  positions: LongtermPosition[],
  targets: RebalancingTarget[]
): RebalancingSuggestion[] {
  const totalAmount = positions.reduce((sum, p) => sum + p.evalAmount, 0);

  return targets.map((t) => {
    const pos = positions.find((p) => p.stockCode === t.stockCode);
    const currentWeight = pos ? pos.currentWeight : 0;
    const diffPct = (t.targetWeight - currentWeight) * 100;
    const diffAmount = (t.targetWeight - currentWeight) * totalAmount;
    const action: "BUY" | "SELL" | "HOLD" =
      Math.abs(diffPct) < 0.5 ? "HOLD" : diffAmount > 0 ? "BUY" : "SELL";

    return {
      stockCode: t.stockCode,
      stockName: t.stockName,
      currentWeight,
      targetWeight: t.targetWeight,
      diffPct: Math.round(diffPct * 100) / 100,
      diffAmount: Math.round(diffAmount),
      action,
    };
  });
}
