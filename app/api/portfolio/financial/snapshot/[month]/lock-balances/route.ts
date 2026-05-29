/**
 * 자산관리 / 자산관리II 탭 종가·환율 확정 API
 *
 * POST /api/portfolio/financial/snapshot/2026-05/lock-balances
 * Body: { "market": "KR" | "US" | "II" | "FX", "targetDate": "YYYY-MM-DD", ... }
 *
 * KR / US / FX를 별도 호출로 각각 확정할 수 있다 (시차 대응).
 * FX: { market: "FX", usdKrw: number, cadKrw: number } — 환율만 저장
 * closing-prices GET으로 미리보기 → 사용자 확인 → 이 POST로 저장.
 */

import { NextRequest, NextResponse } from "next/server";
import { readSnapshots, writeSnapshots } from "../../route";
import { createDraftSnapshot } from "@/lib/portfolio/financial-calc";
import type { FinancialSnapshot } from "@/types/financial";
import { readTransactions as readLongtermTxs } from "@/lib/portfolio/longterm-store";
import { readTransactions as readShorttermTxs } from "@/lib/portfolio/shorttermData";
import { readTransactions as readPensionTxs } from "@/lib/portfolio/pension-store";
import { calcPensionPositions } from "@/lib/portfolio/pension-calc";
import { readTransactions as readEducationTxs } from "@/lib/portfolio/educationTransactionsData";
import { calcPositions as calcLongtermPositions } from "@/lib/portfolio/longterm-calc";
import { calcPositions as calcShorttermPositions } from "@/lib/portfolio/longterm-calc";
import { fetchNaverCurrentPrices, fetchNaverHistoricalClosePrices } from "@/lib/fetchers/naver";
import { fetchYahooCurrentPrices, fetchYahooHistoricalClosePrices } from "@/lib/fetchers/yahoo";
import { getNowKst } from "@/lib/portfolio/market-hours";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const body = await req.json().catch(() => ({}));
  const market: "KR" | "US" | "II" | "FX" = body.market ?? "KR";
  const targetDate: string = body.targetDate ?? getNowKst().isoDate;
  const kstToday = getNowKst().isoDate;
  const isHistorical = targetDate < kstToday;

  const snapshots = await readSnapshots();
  const idx = snapshots.findIndex((s) => s.month === month);

  if (idx !== -1 && snapshots[idx].status === "CONFIRMED") {
    return NextResponse.json({ error: "이미 확정된 월입니다" }, { status: 409 });
  }

  const base: FinancialSnapshot = idx !== -1 ? snapshots[idx] : createDraftSnapshot(month);
  const existing = base.lockedBalances ?? { lockedAt: new Date().toISOString() };
  const now = new Date().toISOString();

  try {
    if (market === "FX") {
      // ── 환율 확정 — 주가와 독립적으로 저장 ───────────
      const usdKrw: number = body.usdKrw;
      const cadKrw: number = body.cadKrw;

      if (!usdKrw || !cadKrw || usdKrw <= 0 || cadKrw <= 0) {
        return NextResponse.json({ error: "환율 값이 유효하지 않습니다 (usdKrw, cadKrw)" }, { status: 400 });
      }

      const updated: FinancialSnapshot = {
        ...base,
        lockedBalances: {
          ...existing,
          targetDate,
          usdKrw,
          cadKrw,
          fxLockedAt: now,
          lockedAt: now,
        },
      };

      if (idx !== -1) snapshots[idx] = updated; else snapshots.push(updated);
      await writeSnapshots(snapshots);

      return NextResponse.json({ ok: true, market: "FX", lockedBalances: updated.lockedBalances });
    }

    if (market === "KR") {
      // ── KR 종목 종가 확정 ──────────────────────────
      const [longtermTxs, shorttermTxs] = await Promise.all([
        readLongtermTxs(),
        readShorttermTxs(),
      ]);

      const rawPositions = calcLongtermPositions(longtermTxs, {});
      const rawShortPositions = calcShorttermPositions(shorttermTxs, {});

      const krPositions = rawPositions.filter((p) => p.market === "KR" && p.assetType !== "FUND");
      const krStocks = krPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
      const extraKrStocks = rawShortPositions
        .map((p) => ({ code: p.stockCode, name: p.stockName }))
        .filter((s) => !krStocks.some((k) => k.code === s.code));

      const allKrStocks = [...krStocks, ...extraKrStocks];
      const prices = isHistorical
        ? await fetchNaverHistoricalClosePrices(allKrStocks, targetDate)
        : await fetchNaverCurrentPrices(allKrStocks);

      const longtermPositions = calcLongtermPositions(longtermTxs, prices);
      const shorttermPositions = calcShorttermPositions(shorttermTxs, prices);

      const fundPositions = longtermPositions.filter((p) => p.assetType === "FUND" && p.currency === "KRW");
      const korStockPositions = longtermPositions.filter(
        (p) => p.market === "KR" && p.currency === "KRW" && p.assetType !== "FUND"
      );

      const updated: FinancialSnapshot = {
        ...base,
        lockedBalances: {
          ...existing,
          targetDate,
          fund:              Math.round(fundPositions.reduce((s, p) => s + p.evalAmount, 0)),
          fundPrincipal:     Math.round(fundPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
          fundRealizedPL:    Math.round(fundPositions.reduce((s, p) => s + p.totalRealizedPL, 0)),
          korStocks:         Math.round(korStockPositions.reduce((s, p) => s + p.evalAmount, 0)),
          korStocksPrincipal: Math.round(korStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
          korStocksRealizedPL: Math.round(korStockPositions.reduce((s, p) => s + p.totalRealizedPL, 0)),
          stockDepositKrw:   Math.round(shorttermPositions.reduce((s, p) => s + p.evalAmount, 0)),
          // 종목별 확정 종가 저장 — Performance 계산 시 Yahoo 재호출 없이 이 값을 사용
          krPrices: prices,
          krLockedAt: now,
          lockedAt: now,
        },
      };

      if (idx !== -1) snapshots[idx] = updated; else snapshots.push(updated);
      await writeSnapshots(snapshots);

      return NextResponse.json({ ok: true, market: "KR", lockedBalances: updated.lockedBalances });
    }

    if (market === "US") {
      // ── US 종목 종가 확정 ──────────────────────────
      const longtermTxs = await readLongtermTxs();
      const rawPositions = calcLongtermPositions(longtermTxs, {});
      const usSymbols = rawPositions.filter((p) => p.market === "US").map((p) => p.stockCode);

      const usPrices = isHistorical
        ? await fetchYahooHistoricalClosePrices(usSymbols, targetDate)
        : await fetchYahooCurrentPrices(usSymbols);
      const longtermPositions = calcLongtermPositions(longtermTxs, usPrices);
      const usStockPositions = longtermPositions.filter((p) => p.market === "US" && p.currency === "USD");

      const updated: FinancialSnapshot = {
        ...base,
        lockedBalances: {
          ...existing,
          targetDate,
          usStocksUsd:      Math.round(usStockPositions.reduce((s, p) => s + p.evalAmount, 0) * 100) / 100,
          usPrincipalUsd:   Math.round(usStockPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0) * 100) / 100,
          usRealizedPLUsd:  Math.round(usStockPositions.reduce((s, p) => s + p.totalRealizedPL, 0) * 100) / 100,
          // 종목별 확정 종가 저장 — Performance 계산 시 Yahoo 재호출 없이 이 값을 사용
          usPrices: usPrices,
          usLockedAt: now,
          lockedAt: now,
        },
      };

      if (idx !== -1) snapshots[idx] = updated; else snapshots.push(updated);
      await writeSnapshots(snapshots);

      return NextResponse.json({ ok: true, market: "US", lockedBalances: updated.lockedBalances });
    }

    // market === "II" — 자산관리II (Pension / Education / Short-term, 모두 KR)
    const [pensionTxs, educationTxs, shorttermTxs] = await Promise.all([
      readPensionTxs(),
      readEducationTxs(),
      readShorttermTxs(),
    ]);

    const rawPensionPositions   = calcPensionPositions(pensionTxs, {});
    const rawEducationPositions = calcShorttermPositions(educationTxs, {});
    const rawShorttermPositions = calcShorttermPositions(shorttermTxs, {});

    const pensionKrStocks = rawPensionPositions
      .filter((p) => /^\d{6}$/.test(p.stockCode))
      .map((p) => ({ code: p.stockCode, name: p.stockName }));
    const eduStocks   = rawEducationPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
    const shortStocks = rawShorttermPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));

    const allKrStocks = [...pensionKrStocks, ...eduStocks, ...shortStocks].filter(
      (s, i, arr) => arr.findIndex((x) => x.code === s.code) === i
    );

    const prices = isHistorical
      ? await fetchNaverHistoricalClosePrices(allKrStocks, targetDate)
      : await fetchNaverCurrentPrices(allKrStocks);

    const pensionPositions   = calcPensionPositions(pensionTxs, prices);
    const educationPositions = calcShorttermPositions(educationTxs, prices);
    const shorttermPositions = calcShorttermPositions(shorttermTxs, prices);

    const retirementPositions = pensionPositions.filter((p) => p.accountType === "RETIREMENT");
    const savingsPositions    = pensionPositions.filter((p) => p.accountType === "SAVINGS");
    const irpPositions        = pensionPositions.filter((p) => p.accountType === "IRP");

    const updated: FinancialSnapshot = {
      ...base,
      lockedBalances: {
        ...existing,
        targetDate,
        pensionFundBalance:      Math.round(retirementPositions.reduce((s, p) => s + p.evalAmount, 0)),
        pensionFundPrincipal:    Math.round(retirementPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
        pensionDepositBalance:   Math.round(savingsPositions.reduce((s, p) => s + p.evalAmount, 0)),
        pensionDepositPrincipal: Math.round(savingsPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
        irpBalance:    Math.round(irpPositions.reduce((s, p) => s + p.evalAmount, 0)),
        irpPrincipal:  Math.round(irpPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
        education1470Stock:     Math.round(educationPositions.reduce((s, p) => s + p.evalAmount, 0)),
        education1470Principal: Math.round(educationPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
        shorttermStockBalance: Math.round(shorttermPositions.reduce((s, p) => s + p.evalAmount, 0)),
        shorttermPrincipal:    Math.round(shorttermPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)),
        krLockedAt: now,
        lockedAt: now,
      },
    };

    if (idx !== -1) snapshots[idx] = updated; else snapshots.push(updated);
    await writeSnapshots(snapshots);

    return NextResponse.json({ ok: true, market: "II", lockedBalances: updated.lockedBalances });
  } catch (err) {
    console.error("[lock-balances] 오류:", err);
    return NextResponse.json({ error: "종가 확정 실패" }, { status: 500 });
  }
}
