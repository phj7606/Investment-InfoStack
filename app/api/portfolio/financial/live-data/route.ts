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
import { readAccountData as readEducationData } from "@/lib/portfolio/educationData";
import { readAccountData as readShorttermData } from "@/lib/portfolio/shorttermData";
import { fetchYahooCurrentPrices } from "@/lib/fetchers/yahoo";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { fetchExchangeRates } from "@/lib/fetchers/exchange-rate";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import type { LivePortfolioData } from "@/types/financial";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const usdKrw = Number(searchParams.get("usdKrw") ?? "1475.27");

  if (usdKrw <= 0) {
    return NextResponse.json({ error: "usdKrw는 0보다 커야 합니다" }, { status: 400 });
  }

  try {
    // ── 1. 모든 포트폴리오 데이터 + 현재 환율 병렬 로드 ─────
    const [educationData, shorttermData, liveRates] = await Promise.all([
      readEducationData(),
      readShorttermData(),
      fetchExchangeRates(),  // 현재 환율 — DRAFT 월 자산관리 II 계산에 사용
    ]);

    // Longterm: 거래내역 로드 후 포지션 계산 (가격 없이 먼저 계산하여 종목 목록 추출)
    const longtermTxs = await readLongtermTxs();
    const rawPositions = calcLongtermPositions(longtermTxs, {});

    // KR/US 종목 현재가 조회 (캐시 우선)
    // longterm + education + shortterm 종목을 모두 포함하여 한 번에 Naver 조회
    const krPositions = rawPositions.filter((p) => p.market === "KR" && p.assetType !== "FUND");
    const usPositions = rawPositions.filter((p) => p.market === "US");
    const krStocks = krPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
    const usSymbols = usPositions.map((p) => p.stockCode);

    // education/shortterm 종목을 longterm과 합산 (중복 제거)
    const eduShortStocks = [
      ...educationData.positions.map((p: { stockCode: string; stockName: string }) => ({ code: p.stockCode, name: p.stockName })),
      ...shorttermData.positions.map((p: { stockCode: string; stockName: string }) => ({ code: p.stockCode, name: p.stockName })),
    ].filter((s) => !krStocks.some((k) => k.code === s.code));
    const allKrStocks = [...krStocks, ...eduShortStocks];

    const allSymbols = [...usSymbols.sort(), ...allKrStocks.map((s) => s.code).sort()];
    // 캐시 키: 종목 목록을 해시로 압축하여 파일명 길이 초과(ENAMETOOLONG) 방지
    // v2: education/shortterm 종목 추가
    const symbolsHash = Buffer.from(allSymbols.join(",")).toString("base64url").slice(0, 40);
    const cacheKey = `financial-live-prices-v2-${symbolsHash}`;

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
        await writeCache(cacheKey, { prices }, params.cache.priceTTLSeconds);
      }
    }

    // 실제 가격으로 포지션 재계산
    const longtermPositions = calcLongtermPositions(longtermTxs, prices);

    // Pension
    const pensionTxs = await readPensionTxs();
    const pensionPositions = calcPensionPositions(pensionTxs, {});

    // ── 2. FUND 집계 (assetType === "FUND", KRW) ─────────
    const fundPositions = longtermPositions.filter((p) => p.assetType === "FUND" && p.currency === "KRW");
    const fundBalance = fundPositions.reduce((s, p) => s + p.evalAmount, 0);
    const fundPrincipal = fundPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const fundUnrealizedPnl = fundPositions.reduce((s, p) => s + p.evalPL, 0);
    const fundRealizedPnl = fundPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
    const fundCumulativePnl = fundUnrealizedPnl + fundRealizedPnl;
    const fundPnlRate = fundPrincipal > 0 ? fundUnrealizedPnl / fundPrincipal : 0;

    // ── 3. KOR Stocks 집계 (KR, STOCK/ETF, KRW) ──────────
    const korStockPositions = longtermPositions.filter(
      (p) => p.market === "KR" && p.currency === "KRW" && (p.assetType === "STOCK" || p.assetType === "ETF")
    );
    const korStocksBalance = korStockPositions.reduce((s, p) => s + p.evalAmount, 0);
    const korStocksPrincipal = korStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const korStocksUnrealizedPnl = korStockPositions.reduce((s, p) => s + p.evalPL, 0);
    const korStocksRealizedPnl = korStockPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
    const korStocksCumulativePnl = korStocksUnrealizedPnl + korStocksRealizedPnl;
    const korStocksPnlRate = korStocksPrincipal > 0 ? korStocksUnrealizedPnl / korStocksPrincipal : 0;

    // ── 4. US Stocks 집계 (USD) ───────────────────────────
    const usStockPositions = longtermPositions.filter((p) => p.market === "US" && p.currency === "USD");
    const usBalanceUsd = usStockPositions.reduce((s, p) => s + p.evalAmount, 0);
    const usPrincipalUsd = usStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0);
    const usUnrealizedPnlUsd = usStockPositions.reduce((s, p) => s + p.evalPL, 0);
    const usRealizedPnlUsd = usStockPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
    const usCumulativePnlUsd = usUnrealizedPnlUsd + usRealizedPnlUsd;
    const usPnlRateUsd = usPrincipalUsd > 0 ? usUnrealizedPnlUsd / usPrincipalUsd : 0;

    // ── 5. Stock Deposit (예수금) ─────────────────────────
    // Shortterm 계좌를 주식계좌 KRW 예수금으로 사용
    // prices에 실시간 가격이 있으면 사용, 없으면 avgPrice fallback
    const stockDepositKrw = shorttermData.positions.reduce(
      (s, p) => s + (prices[p.stockCode] ?? p.avgPrice) * p.quantity,
      0
    );

    // ── 5-B. Shortterm 포지션 집계 (자산관리 II 표시용) ──
    const shorttermStockBalance = shorttermData.positions.reduce(
      (s, p) => s + (prices[p.stockCode] ?? p.avgPrice) * p.quantity,
      0
    );
    const shorttermPrincipal = shorttermData.positions.reduce(
      (s, p) => s + p.avgPrice * p.quantity,
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
    // prices에 실시간 가격이 있으면 사용, 없으면 avgPrice fallback
    const education1470Stock = educationData.positions.reduce(
      (s, p) => s + (prices[p.stockCode] ?? p.avgPrice) * p.quantity,
      0
    );
    const education1470Deposit = 0; // 별도 예금 계좌 추적 시 업데이트
    const education1470Principal = educationData.positions.reduce(
      (s, p) => s + p.avgPrice * p.quantity,
      0
    );
    const education1470Pnl = education1470Stock - education1470Principal;

    // ── 8. 당월 거래 집계 (Bid / Ask BV / Fixed P/L) ─────
    // 엑셀 Asset Management 시트: Bid=매수금액, Ask(BV)=매도장부가, Fixed P/L=실현손익
    // Value Investment Account 거래 내역에서 현재 월 데이터만 필터
    const currentMonthStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"

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
        pnlRate: Math.round(fundPnlRate * 10000) / 10000,
      },
      korStocks: {
        balance: Math.round(korStocksBalance),
        principal: Math.round(korStocksPrincipal),
        cumulativePnl: Math.round(korStocksCumulativePnl),
        unrealizedPnl: Math.round(korStocksUnrealizedPnl),
        pnlRate: Math.round(korStocksPnlRate * 10000) / 10000,
      },
      usStocks: {
        balanceUsd: Math.round(usBalanceUsd * 100) / 100,
        principalUsd: Math.round(usPrincipalUsd * 100) / 100,
        cumulativePnlUsd: Math.round(usCumulativePnlUsd * 100) / 100,
        unrealizedPnlUsd: Math.round(usUnrealizedPnlUsd * 100) / 100,
        pnlRateUsd: Math.round(usPnlRateUsd * 10000) / 10000,
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
