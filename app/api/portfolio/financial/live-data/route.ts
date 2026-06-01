/**
 * Live Portfolio Data API — 실시간 포트폴리오 데이터 집계
 *
 * GET /api/portfolio/financial/live-data?usdKrw=1475.27
 *
 * DRAFT 상태 자산관리 탭에서 실시간 포지션 현황을 표시하기 위해 사용.
 * 서버 사이드에서 모든 포트폴리오 데이터를 한 번에 집계하여 반환.
 *
 * 분류 기준:
 * - FUND: assetType === "FUND" (KRW)
 * - KOR Stocks: market === "KR" && assetType !== "FUND" (KRW)
 * - US Stocks: market === "US" (USD)
 * - Stock Deposit: shortterm 계좌 (주식계좌 예수금 역할)
 * - Education 1470: education 계좌 (예금 + 주식)
 * - Pension: RETIREMENT / SAVINGS / IRP 별도 집계
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions as readLongtermTxs } from "@/lib/portfolio/longterm-store";
import { calcPositions as calcLongtermPositions } from "@/lib/portfolio/longterm-calc";
import { readTransactions as readPensionTxs } from "@/lib/portfolio/pension-store";
import { calcPensionPositions } from "@/lib/portfolio/pension-calc";
import { readTransactions as readEducationTxs } from "@/lib/portfolio/educationTransactionsData";
import { readTransactions as readShorttermTxs } from "@/lib/portfolio/shorttermData";
import { calcPositions as calcShorttermPositions } from "@/lib/portfolio/longterm-calc";
import { fetchYahooCurrentPrices } from "@/lib/fetchers/yahoo";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { fetchExchangeRates } from "@/lib/fetchers/exchange-rate";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import type { LivePortfolioData } from "@/types/financial";
import { currentMonth } from "@/lib/portfolio/financial-calc";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const usdKrw = Number(searchParams.get("usdKrw") ?? "1475.27");

  if (usdKrw <= 0) {
    return NextResponse.json({ error: "usdKrw는 0보다 커야 합니다" }, { status: 400 });
  }

  try {
    // ── 1. 모든 포트폴리오 데이터 + 현재 환율 병렬 로드 ─────
    const [educationTxs, shorttermTxs, liveRates] = await Promise.all([
      readEducationTxs(),
      readShorttermTxs(),
      fetchExchangeRates(),  // 현재 환율 — DRAFT 월 자산관리 II 계산에 사용
    ]);

    // Shortterm 포지션 계산 (가격 없이 avgCost 기준 — 현재가는 prices 로드 후 반영)
    const rawShorttermPositions = calcShorttermPositions(shorttermTxs);

    // Longterm: 거래내역 로드 후 포지션 계산 (가격 없이 먼저 계산하여 종목 목록 추출)
    const longtermTxs = await readLongtermTxs();
    const rawPositions = calcLongtermPositions(longtermTxs, {});

    // KR/US 종목 현재가 조회 (캐시 우선)
    // longterm + education + shortterm 종목을 모두 포함하여 한 번에 Naver 조회
    const krPositions = rawPositions.filter((p) => p.market === "KR" && p.assetType !== "FUND");
    const usPositions = rawPositions.filter((p) => p.market === "US");
    const krStocks = krPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
    const usSymbols = usPositions.map((p) => p.stockCode);

    // education/shortterm/pension 종목을 longterm과 합산 (중복 제거)
    // pension: /risk/prices와 동일 기준 — 6자리이고 숫자 포함이면 KR (알파뉴메릭 코드 포함)
    const rawPensionPositions = calcPensionPositions(await readPensionTxs(), {});
    const pensionKrStocks = rawPensionPositions
      .filter((p) => p.stockCode.length === 6 && /[0-9]/.test(p.stockCode))
      .map((p) => ({ code: p.stockCode, name: p.stockName }));

    // education: 신규 트랜잭션 시스템 (Education Account 페이지와 동일 데이터 소스)
    const rawEducationPositions = calcShorttermPositions(educationTxs, {});

    const eduShortStocks = [
      ...rawEducationPositions.map((p) => ({ code: p.stockCode, name: p.stockName })),
      ...rawShorttermPositions.map((p) => ({ code: p.stockCode, name: p.stockName })),
      ...pensionKrStocks,
    ].filter((s) => !krStocks.some((k) => k.code === s.code));
    const allKrStocks = [...krStocks, ...eduShortStocks];

    const allSymbols = [...usSymbols.sort(), ...allKrStocks.map((s) => s.code).sort()];
    // 캐시 키: 종목 목록을 해시로 압축하여 파일명 길이 초과(ENAMETOOLONG) 방지
    // v3: pension 종목 추가
    const symbolsHash = Buffer.from(allSymbols.join(",")).toString("base64url").slice(0, 40);
    const cacheKey = `financial-live-prices-v3-${symbolsHash}`;

    let prices: Record<string, number> = {};
    const cachedPrices = await readCache<{ prices: Record<string, number> }>(cacheKey);
    if (cachedPrices) {
      prices = cachedPrices.prices;
    } else if (allSymbols.length > 0) {
      const [krPrices, usPrices] = await Promise.all([
        fetchNaverCurrentPrices(allKrStocks),
        fetchYahooCurrentPrices(usSymbols),
      ]);
      prices = { ...krPrices, ...usPrices };
      if (Object.keys(prices).length > 0) {
        const now = new Date().toISOString();
        const ttl = params.cache.priceTTLSeconds;

        // 통합 캐시 저장
        const writeOps: Promise<void>[] = [
          writeCache(cacheKey, { prices }, ttl),
        ];

        // 각 대시보드 prices API와 캐시 공유 — 동일 TTL, 동일 종목 기준 캐시 키
        // 각 대시보드 API가 조회하기 전 이미 캐시에 값이 있으면 같은 가격을 읽게 됨

        // longterm (account=all): portfolio-longterm-prices-v2-all-{US정렬,KR정렬}
        const ltKrCodes = krPositions.map((p) => p.stockCode).sort();
        const ltUsSymbols = usPositions.map((p) => p.stockCode).sort();
        const ltAllSymbols = [...ltUsSymbols, ...ltKrCodes];
        if (ltAllSymbols.length > 0) {
          const ltKey = `portfolio-longterm-prices-v2-all-${ltAllSymbols.join("-")}`;
          const ltPrices: Record<string, number> = {};
          const ltNotFound: string[] = [];
          for (const sym of ltAllSymbols) {
            if (prices[sym] !== undefined) ltPrices[sym] = prices[sym];
            else ltNotFound.push(sym);
          }
          writeOps.push(writeCache(ltKey, { prices: ltPrices, fetchedAt: now, notFound: ltNotFound }, ttl));
        }

        // shortterm: portfolio-shortterm-prices-v1-{US정렬,KR정렬}
        const stKrCodes = rawShorttermPositions.filter((p) => p.market === "KR").map((p) => p.stockCode).sort();
        const stUsSymbols = rawShorttermPositions.filter((p) => p.market === "US").map((p) => p.stockCode).sort();
        const stAllSymbols = [...stUsSymbols, ...stKrCodes];
        if (stAllSymbols.length > 0) {
          const stKey = `portfolio-shortterm-prices-v1-${stAllSymbols.join("-")}`;
          const stPrices: Record<string, number> = {};
          const stNotFound: string[] = [];
          for (const sym of stAllSymbols) {
            if (prices[sym] !== undefined) stPrices[sym] = prices[sym];
            else stNotFound.push(sym);
          }
          writeOps.push(writeCache(stKey, { prices: stPrices, fetchedAt: now, notFound: stNotFound }, ttl));
        }

        // education: portfolio-education-prices-v1-{US정렬,KR정렬}
        const eduKrCodes = rawEducationPositions.filter((p) => p.market === "KR").map((p) => p.stockCode).sort();
        const eduUsSymbols = rawEducationPositions.filter((p) => p.market === "US").map((p) => p.stockCode).sort();
        const eduAllSymbols = [...eduUsSymbols, ...eduKrCodes];
        if (eduAllSymbols.length > 0) {
          const eduKey = `portfolio-education-prices-v1-${eduAllSymbols.join("-")}`;
          const eduPrices: Record<string, number> = {};
          const eduNotFound: string[] = [];
          for (const sym of eduAllSymbols) {
            if (prices[sym] !== undefined) eduPrices[sym] = prices[sym];
            else eduNotFound.push(sym);
          }
          writeOps.push(writeCache(eduKey, { prices: eduPrices, fetchedAt: now, notFound: eduNotFound }, ttl));
        }

        // pension: portfolio-pension-prices-v1-latest (고정 키)
        // /risk/prices route가 캐시 키를 모르므로 고정 키 사용 — Pension 대시보드와 가격 공유
        // pension KR 종목만 대상 (비표준 코드는 live-data 조회에서 이미 제외됨)
        const penKrCodes = pensionKrStocks.map((s) => s.code).sort();
        if (penKrCodes.length > 0) {
          const penPrices: Record<string, number> = {};
          for (const code of penKrCodes) {
            if (prices[code] !== undefined) penPrices[code] = prices[code];
          }
          if (Object.keys(penPrices).length > 0) {
            writeOps.push(
              writeCache("portfolio-pension-prices-v1-latest", { prices: penPrices, fetchedAt: now }, ttl)
            );
          }
        }

        await Promise.all(writeOps);
      }
    }

    // 실제 가격으로 포지션 재계산
    const longtermPositions = calcLongtermPositions(longtermTxs, prices);

    // Pension — 가격 맵 전달로 표준 코드 ETF는 실시간 종가 반영, 비표준 코드는 avgCost fallback
    const pensionTxs = await readPensionTxs();
    const pensionPositions = calcPensionPositions(pensionTxs, prices);

    // ── 2. FUND 집계 (assetType === "FUND", KRW) ─────────
    const fundPositions = longtermPositions.filter((p) => p.assetType === "FUND" && p.currency === "KRW");
    const fundBalance = fundPositions.reduce((s, p) => s + p.evalAmount, 0);
    const fundPrincipal = fundPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const fundUnrealizedPnl = fundPositions.reduce((s, p) => s + p.evalPL, 0);
    const fundRealizedPnl = fundPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
    const fundCumulativePnl = fundUnrealizedPnl + fundRealizedPnl;

    // ── 3. KOR Stocks 집계 (KR, STOCK/ETF, KRW) ──────────
    const korStockPositions = longtermPositions.filter(
      (p) => p.market === "KR" && p.currency === "KRW" && (p.assetType === "STOCK" || p.assetType === "ETF")
    );
    const korStocksBalance = korStockPositions.reduce((s, p) => s + p.evalAmount, 0);
    const korStocksPrincipal = korStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const korStocksUnrealizedPnl = korStockPositions.reduce((s, p) => s + p.evalPL, 0);
    const korStocksRealizedPnl = korStockPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
    const korStocksCumulativePnl = korStocksUnrealizedPnl + korStocksRealizedPnl;

    // ── 4. US Stocks 집계 (USD) ───────────────────────────
    const usStockPositions = longtermPositions.filter((p) => p.market === "US" && p.currency === "USD");
    const usBalanceUsd = usStockPositions.reduce((s, p) => s + p.evalAmount, 0);
    const usPrincipalUsd = usStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const usUnrealizedPnlUsd = usStockPositions.reduce((s, p) => s + p.evalPL, 0);
    const usRealizedPnlUsd = usStockPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
    const usCumulativePnlUsd = usUnrealizedPnlUsd + usRealizedPnlUsd;

    // ── 5. Stock Deposit (예수금) ─────────────────────────
    // Shortterm 계좌를 주식계좌 KRW 예수금으로 사용
    // 대시보드 총 평가금액과 동일하게 현재가 확인된 종목만 합산 (avgCost fallback 제외)
    const shorttermPositions = calcShorttermPositions(shorttermTxs, prices);
    const shorttermPricedPositions = shorttermPositions.filter((p) => p.currentPrice !== undefined);
    const stockDepositKrw = shorttermPricedPositions.reduce((s, p) => s + p.evalAmount, 0);

    // ── 5-B. Shortterm 포지션 집계 (자산관리 II 표시용) ──
    const shorttermStockBalance = shorttermPricedPositions.reduce((s, p) => s + p.evalAmount, 0);
    const shorttermPrincipal = shorttermPositions.reduce(
      (s, p) => s + p.avgCost * p.quantity,
      0
    );

    // ── 6. Pension 집계 (계좌별) ──────────────────────────
    // RETIREMENT = pensionFund (채권형/주식형 합산)
    const retirementPositions = pensionPositions.filter((p) => p.accountType === "RETIREMENT");
    const pensionFundBalance = retirementPositions.reduce((s, p) => s + p.evalAmount, 0);
    const pensionFundPrincipal = retirementPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const pensionFundPnl = retirementPositions.reduce((s, p) => s + p.evalPL, 0);

    // SAVINGS = pensionDeposit
    const savingsPositions = pensionPositions.filter((p) => p.accountType === "SAVINGS");
    const pensionDepositBalance = savingsPositions.reduce((s, p) => s + p.evalAmount, 0);
    const pensionDepositPrincipal = savingsPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const pensionDepositPnl = savingsPositions.reduce((s, p) => s + p.evalPL, 0);

    // IRP
    const irpPositions = pensionPositions.filter((p) => p.accountType === "IRP");
    const irpBalance = irpPositions.reduce((s, p) => s + p.evalAmount, 0);
    const irpPrincipal = irpPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const irpPnl = irpPositions.reduce((s, p) => s + p.evalPL, 0);

    // ── 7. Education 1470 집계 ────────────────────────────
    // 신 트랜잭션 시스템: Education Account 페이지와 동일 데이터 소스로 집계
    const educationPositions = calcShorttermPositions(educationTxs, prices);
    // 대시보드와 동일하게 현재가 확인된 종목만 합산 (avgCost fallback 제외)
    const education1470Stock = educationPositions
      .filter((p) => p.currentPrice !== undefined)
      .reduce((s, p) => s + p.evalAmount, 0);
    const education1470Deposit = 0; // 별도 예금 계좌 추적 시 업데이트
    const education1470Principal = educationPositions.reduce(
      (s, p) => s + p.avgCost * p.quantity,
      0
    );
    const education1470Pnl = education1470Stock - education1470Principal;

    // ── 8. 당월 거래 집계 (Bid / Ask BV / Fixed P/L) ─────
    // 엑셀 Asset Management 시트: Bid=매수금액, Ask(BV)=매도장부가, Fixed P/L=실현손익
    // Value Investment Account 거래 내역에서 현재 월 데이터만 필터
    const currentMonthStr = currentMonth(); // KST 기준 "YYYY-MM"

    // FUND 당월 거래 (assetType=FUND, KRW)
    const fundMonthTxs = longtermTxs.filter(
      (t) => t.assetType === "FUND" && t.currency === "KRW" && t.date.startsWith(currentMonthStr)
    );
    const fundTxBid = fundMonthTxs.filter((t) => t.tradeType === "BUY")
      .reduce((s, t) => s + t.amount, 0);
    const fundTxAskBv = fundMonthTxs.filter((t) => t.tradeType === "SELL")
      .reduce((s, t) => s + (t.avgCostAtSell ?? 0) * t.quantity, 0);
    const fundTxFixedPnl = fundMonthTxs.filter((t) => t.tradeType === "SELL")
      .reduce((s, t) => s + (t.realizedPL ?? 0), 0);

    // KOR Stocks 당월 거래 (KR, STOCK/ETF, KRW)
    const korMonthTxs = longtermTxs.filter(
      (t) => t.market === "KR" && t.currency === "KRW" && t.assetType !== "FUND" && t.date.startsWith(currentMonthStr)
    );
    const korTxBid = korMonthTxs.filter((t) => t.tradeType === "BUY")
      .reduce((s, t) => s + t.amount, 0);
    const korTxAskBv = korMonthTxs.filter((t) => t.tradeType === "SELL")
      .reduce((s, t) => s + (t.avgCostAtSell ?? 0) * t.quantity, 0);
    const korTxFixedPnl = korMonthTxs.filter((t) => t.tradeType === "SELL")
      .reduce((s, t) => s + (t.realizedPL ?? 0), 0);

    // US Stocks 당월 거래 (US, USD)
    const usMonthTxs = longtermTxs.filter(
      (t) => t.market === "US" && t.currency === "USD" && t.date.startsWith(currentMonthStr)
    );
    const usTxBid = usMonthTxs.filter((t) => t.tradeType === "BUY")
      .reduce((s, t) => s + t.amount, 0);
    const usTxAskBv = usMonthTxs.filter((t) => t.tradeType === "SELL")
      .reduce((s, t) => s + (t.avgCostAtSell ?? 0) * t.quantity, 0);
    const usTxFixedPnl = usMonthTxs.filter((t) => t.tradeType === "SELL")
      .reduce((s, t) => s + (t.realizedPL ?? 0), 0);

    // ── 9. 응답 조립 ──────────────────────────────────────
    const result: LivePortfolioData = {
      fund: {
        balance: Math.round(fundBalance),
        principal: Math.round(fundPrincipal),
        cumulativePnl: Math.round(fundCumulativePnl),
        unrealizedPnl: Math.round(fundUnrealizedPnl),
      },
      korStocks: {
        balance: Math.round(korStocksBalance),
        principal: Math.round(korStocksPrincipal),
        cumulativePnl: Math.round(korStocksCumulativePnl),
        unrealizedPnl: Math.round(korStocksUnrealizedPnl),
      },
      usStocks: {
        balanceUsd: Math.round(usBalanceUsd * 100) / 100,
        principalUsd: Math.round(usPrincipalUsd * 100) / 100,
        cumulativePnlUsd: Math.round(usCumulativePnlUsd * 100) / 100,
        unrealizedPnlUsd: Math.round(usUnrealizedPnlUsd * 100) / 100,
        balanceKrw: Math.round(usBalanceUsd * usdKrw),
      },
      stockDepositKrw: Math.round(stockDepositKrw),
      stockDepositUsd: 0,
      pensionFund: {
        balance: Math.round(pensionFundBalance),
        principal: Math.round(pensionFundPrincipal),
        pnl: Math.round(pensionFundPnl),
      },
      pensionDeposit: {
        balance: Math.round(pensionDepositBalance),
        principal: Math.round(pensionDepositPrincipal),
        pnl: Math.round(pensionDepositPnl),
      },
      irp: {
        balance: Math.round(irpBalance),
        principal: Math.round(irpPrincipal),
        pnl: Math.round(irpPnl),
      },
      education1470: {
        deposit: Math.round(education1470Deposit),
        stock: Math.round(education1470Stock),
        principal: Math.round(education1470Principal),
        pnl: Math.round(education1470Pnl),
      },
      // 자산관리 II 표시용 shortterm 잔액 (stockBalance + principal)
      shortterm: {
        stockBalance: Math.round(shorttermStockBalance),
        principal: Math.round(shorttermPrincipal),
      },
      // 조회 시점의 현재 환율 — DRAFT 월 환율 계산에 사용 (스냅샷 초기화 환율 대체)
      currentRates: {
        usdKrw: liveRates.usdKrw,
        cadKrw: liveRates.cadKrw,
      },
      monthlyTxSummary: {
        fund:      { bid: Math.round(fundTxBid), askBv: Math.round(fundTxAskBv), fixedPnl: Math.round(fundTxFixedPnl) },
        korStocks: { bid: Math.round(korTxBid),  askBv: Math.round(korTxAskBv),  fixedPnl: Math.round(korTxFixedPnl)  },
        usStocks:  {
          bid:      Math.round(usTxBid    * 100) / 100,
          askBv:    Math.round(usTxAskBv  * 100) / 100,
          fixedPnl: Math.round(usTxFixedPnl * 100) / 100,
        },
      },
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (e) {
    console.error("[live-data] 집계 오류:", e);
    return NextResponse.json(
      { error: "포트폴리오 데이터 집계 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
