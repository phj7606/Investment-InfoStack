/**
 * 종가 미리보기 API — 저장 없이 현재/과거 시장 가격 + 마감 상태만 반환
 *
 * GET /api/portfolio/financial/snapshot/2026-05/closing-prices?market=KR|US|II&date=YYYY-MM-DD
 *
 * date 파라미터:
 *   - 생략 or 오늘: 실시간 현재가 조회
 *   - 과거 날짜: Naver fchart / Yahoo history로 과거 종가 조회
 *
 * 실제 저장은 lock-balances POST 엔드포인트에서 수행.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMarketStatus, getNowKst } from "@/lib/portfolio/market-hours";
import { readTransactions as readLongtermTxs } from "@/lib/portfolio/longterm-store";
import { calcPositions as calcLongtermPositions } from "@/lib/portfolio/longterm-calc";
import { readTransactions as readPensionTxs } from "@/lib/portfolio/pension-store";
import { calcPensionPositions } from "@/lib/portfolio/pension-calc";
import { readTransactions as readEducationTxs } from "@/lib/portfolio/educationTransactionsData";
import { readTransactions as readShorttermTxs } from "@/lib/portfolio/shorttermData";
import { calcPositions as calcShorttermPositions } from "@/lib/portfolio/longterm-calc";
import { fetchNaverCurrentPrices, fetchNaverHistoricalClosePrices } from "@/lib/fetchers/naver";
import { fetchYahooCurrentPrices, fetchYahooHistoricalClosePrices } from "@/lib/fetchers/yahoo";
import { readSnapshots } from "../../route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") ?? "KR") as "KR" | "US" | "II";
  const dateParam = searchParams.get("date"); // "YYYY-MM-DD" or null

  const kstToday = getNowKst().isoDate;
  // 과거 날짜 지정 시 과거 종가 조회, 그 외 실시간 현재가 조회
  const isHistorical = !!dateParam && dateParam < kstToday;
  const targetDate = dateParam ?? kstToday;

  const status = getMarketStatus();

  try {
    // Deposit & FX 페이지에서 달이 바뀌면 lock되는 snapshot.exchangeRates를 사용
    const snapshots = await readSnapshots();
    const snap = snapshots.find((s) => s.month === month);
    const exchangeRatesPromise: Promise<{ usdKrw: number; cadKrw: number }> =
      Promise.resolve({
        usdKrw: snap!.exchangeRates.usdKrw,
        cadKrw: snap!.exchangeRates.cadKrw,
      });

    if (market === "KR" || market === "II") {
      // KR 종목 현재가 + 환율 병렬 조회
      const [longtermTxs, pensionTxs, educationTxs, shorttermTxs, exchangeRates] = await Promise.all([
        readLongtermTxs(),
        readPensionTxs(),
        readEducationTxs(),
        readShorttermTxs(),
        exchangeRatesPromise,
      ]);

      const rawLongtermPositions = calcLongtermPositions(longtermTxs, {});

      // KR 종목 코드 수집
      const krPositions = rawLongtermPositions.filter(
        (p) => p.market === "KR" && p.assetType !== "FUND"
      );
      const rawPensionPositions = calcPensionPositions(pensionTxs, {});
      const rawEducationPositions = calcShorttermPositions(educationTxs, {});
      const rawShorttermPositions = calcShorttermPositions(shorttermTxs, {});

      const baseKrStocks = krPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
      const pensionKrStocks = rawPensionPositions
        .filter((p) => /^\d{6}$/.test(p.stockCode))
        .map((p) => ({ code: p.stockCode, name: p.stockName }));
      const eduStocks = rawEducationPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
      const shortStocks = rawShorttermPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));

      const allKrStocks = [
        ...baseKrStocks,
        ...pensionKrStocks,
        ...eduStocks,
        ...shortStocks,
      ].filter(
        (s, idx, arr) => arr.findIndex((x) => x.code === s.code) === idx
      );

      // 과거 날짜 지정 시 Naver fchart 과거 종가 사용, 오늘은 실시간 현재가 사용
      const prices = isHistorical
        ? await fetchNaverHistoricalClosePrices(allKrStocks, targetDate)
        : await fetchNaverCurrentPrices(allKrStocks);

      // 계좌별 집계
      const longtermPositions = calcLongtermPositions(longtermTxs, prices);
      const fundPositions = longtermPositions.filter((p) => p.assetType === "FUND" && p.currency === "KRW");
      const korStockPositions = longtermPositions.filter(
        (p) => p.market === "KR" && p.currency === "KRW" && p.assetType !== "FUND"
      );

      const pensionPositions = calcPensionPositions(pensionTxs, prices);
      const educationPositions = calcShorttermPositions(educationTxs, prices);
      const shorttermPositions = calcShorttermPositions(shorttermTxs, prices);

      // 과거 날짜는 항상 "마감" 상태, 오늘은 실시간 상태 표시
      const krStatus = isHistorical
        ? { open: false, warning: null }
        : { open: status.krxOpen, warning: status.krWarning };

      const rates = { usdKrw: exchangeRates.usdKrw, cadKrw: exchangeRates.cadKrw };

      if (market === "KR") {
        return NextResponse.json({
          market: "KR",
          targetDate,
          status: krStatus,
          rates,
          preview: {
            fund: Math.round(fundPositions.reduce((s, p) => s + p.evalAmount, 0)),
            fundPrincipal: Math.round(fundPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
            korStocks: Math.round(korStockPositions.reduce((s, p) => s + p.evalAmount, 0)),
            korStocksPrincipal: Math.round(korStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
            stockDepositKrw: Math.round(shorttermPositions.reduce((s, p) => s + p.evalAmount, 0)),
          },
        });
      }

      // market === "II"
      const retirementPositions = pensionPositions.filter((p) => p.accountType === "RETIREMENT");
      const savingsPositions    = pensionPositions.filter((p) => p.accountType === "SAVINGS");
      const irpPositions        = pensionPositions.filter((p) => p.accountType === "IRP");

      return NextResponse.json({
        market: "II",
        targetDate,
        status: krStatus,
        rates,
        preview: {
          pensionFundBalance:    Math.round(retirementPositions.reduce((s, p) => s + p.evalAmount, 0)),
          pensionFundPrincipal:  Math.round(retirementPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
          pensionDepositBalance: Math.round(savingsPositions.reduce((s, p) => s + p.evalAmount, 0)),
          pensionDepositPrincipal: Math.round(savingsPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
          irpBalance:    Math.round(irpPositions.reduce((s, p) => s + p.evalAmount, 0)),
          irpPrincipal:  Math.round(irpPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
          education1470Stock:      Math.round(educationPositions.reduce((s, p) => s + p.evalAmount, 0)),
          education1470Principal:  Math.round(educationPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
          shorttermStockBalance: Math.round(shorttermPositions.reduce((s, p) => s + p.evalAmount, 0)),
          shorttermPrincipal:    Math.round(shorttermPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
        },
      });
    }

    // market === "US" — 주가 + 환율 병렬 조회
    const [longtermTxs, exchangeRates] = await Promise.all([
      readLongtermTxs(),
      exchangeRatesPromise,
    ]);
    const rawLongtermPositions = calcLongtermPositions(longtermTxs, {});
    const usPositions = rawLongtermPositions.filter((p) => p.market === "US");
    const usSymbols = usPositions.map((p) => p.stockCode);

    // 과거 날짜 지정 시 Yahoo historical, 오늘은 실시간 현재가
    const usPrices = isHistorical
      ? await fetchYahooHistoricalClosePrices(usSymbols, targetDate)
      : await fetchYahooCurrentPrices(usSymbols);

    const longtermPositions = calcLongtermPositions(longtermTxs, usPrices);
    const usStockPositions = longtermPositions.filter((p) => p.market === "US" && p.currency === "USD");

    const usStatus = isHistorical
      ? { open: false, warning: null }
      : { open: status.usOpen, warning: status.usWarning };

    return NextResponse.json({
      market: "US",
      targetDate,
      status: usStatus,
      rates: { usdKrw: exchangeRates.usdKrw, cadKrw: exchangeRates.cadKrw },
      preview: {
        usStocksUsd:    Math.round(usStockPositions.reduce((s, p) => s + p.evalAmount, 0) * 100) / 100,
        usPrincipalUsd: Math.round(usStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0) * 100) / 100,
      },
    });
  } catch (err) {
    console.error("[closing-prices] 오류:", err);
    return NextResponse.json({ error: "가격 조회 실패" }, { status: 500 });
  }
}
