/**
 * 월말 확정 API — DRAFT 스냅샷을 CONFIRMED로 잠금
 *
 * POST /api/portfolio/financial/snapshot/2026-05/confirm
 *
 * 처리 순서:
 * 1. 포트폴리오 계산 함수 직접 호출 → FUND / KOR Stocks / US Stocks 분리 집계
 * 2. Pension 계좌별(RETIREMENT/SAVINGS/IRP) 집계
 * 3. Education 1470 집계
 * 4. 요청 body의 환율 적용 → confirmedPortfolio 저장 + CONFIRMED 전환
 *
 * 엑셀 Asset Management 시트 구조 반영:
 * - FUND / KOR Stocks / US Stocks 별도 저장 → AssetManagementView 과거 재현용
 * - Pension (퇴직연금/연금저축/IRP) 별도 저장
 * - Education 1470 별도 저장
 */

import { NextRequest, NextResponse } from "next/server";
import type { ConfirmSnapshotRequest, FinancialSnapshot } from "@/types/financial";
import { readSnapshots, writeSnapshots } from "../../route";
import { createDraftSnapshot } from "@/lib/portfolio/financial-calc";

// 포트폴리오 계산 모듈 직접 참조
import { readTransactions as readLongtermTxs } from "@/lib/portfolio/longterm-store";
import { readTransactions as readPensionTxs } from "@/lib/portfolio/pension-store";
import { calcPositions as calcLongtermPositions } from "@/lib/portfolio/longterm-calc";
import { calcPensionPositions } from "@/lib/portfolio/pension-calc";
import { readAccountData as readEducationData } from "@/lib/portfolio/educationData";
import { readTransactions as readShorttermTxs } from "@/lib/portfolio/shorttermData";
import { calcPositions as calcShorttermPositions } from "@/lib/portfolio/longterm-calc";

// POST — 월말 확정 처리
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const body = (await req.json()) as ConfirmSnapshotRequest;

  // ── 1. 입력 검증 ──────────────────────────────────────────
  if (!body.usdKrw || !body.cadKrw || body.usdKrw <= 0 || body.cadKrw <= 0) {
    return NextResponse.json({ error: "환율 값이 유효하지 않습니다 (usdKrw, cadKrw)" }, { status: 400 });
  }

  const snapshots = await readSnapshots();
  const idx = snapshots.findIndex((s) => s.month === month);

  // 이미 확정된 월이면 중단
  if (idx !== -1 && snapshots[idx].status === "CONFIRMED") {
    return NextResponse.json({ error: "이미 확정된 월입니다" }, { status: 409 });
  }

  // ── 2. 포트폴리오 포지션 일괄 계산 ───────────────────────
  // Longterm — 현재가 없으면 avgCost 기준 evalAmount 사용
  const longtermTxs = await readLongtermTxs();
  const longtermPositions = calcLongtermPositions(longtermTxs, {});

  // FUND 집계 (assetType === "FUND", KRW)
  const fundPositions = longtermPositions.filter((p) => p.assetType === "FUND" && p.currency === "KRW");
  const fundBalance = Math.round(fundPositions.reduce((s, p) => s + p.evalAmount, 0));
  const fundPrincipal = Math.round(fundPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
  const fundUnrealizedPnl = fundPositions.reduce((s, p) => s + p.evalPL, 0);
  const fundRealizedPnl = fundPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
  const fundCumPnl = Math.round(fundUnrealizedPnl + fundRealizedPnl);

  // KOR Stocks 집계 (KR, STOCK/ETF, KRW)
  const korPositions = longtermPositions.filter(
    (p) => p.market === "KR" && p.currency === "KRW" && (p.assetType === "STOCK" || p.assetType === "ETF")
  );
  const korStocksBalance = Math.round(korPositions.reduce((s, p) => s + p.evalAmount, 0));
  const korStocksPrincipal = Math.round(korPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
  const korUnrealizedPnl = korPositions.reduce((s, p) => s + p.evalPL, 0);
  const korRealizedPnl = korPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
  const korStocksCumPnl = Math.round(korUnrealizedPnl + korRealizedPnl);

  // US Stocks 집계 (USD)
  const usPositions = longtermPositions.filter((p) => p.market === "US" && p.currency === "USD");
  const usStocksBalanceUsd = Math.round(usPositions.reduce((s, p) => s + p.evalAmount, 0) * 100) / 100;
  const usStocksPrincipalUsd = Math.round(usPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0) * 100) / 100;
  const usUnrealizedPnlUsd = usPositions.reduce((s, p) => s + p.evalPL, 0);
  const usRealizedPnlUsd = usPositions.reduce((s, p) => s + p.totalRealizedPL, 0);
  const usStocksCumPnlUsd = Math.round((usUnrealizedPnlUsd + usRealizedPnlUsd) * 100) / 100;
  const usStocksBalanceKrw = Math.round(usStocksBalanceUsd * body.usdKrw);

  // Stock Deposit (주식계좌 예수금) — Shortterm 계좌
  // LongtermTransaction 기반으로 포지션 계산 (현재가 없으면 avgCost 기준 evalAmount)
  const shorttermTxs = await readShorttermTxs();
  const shorttermPositions = calcShorttermPositions(shorttermTxs);
  const stockDepositKrw = Math.round(
    shorttermPositions.reduce((s, p) => s + p.evalAmount, 0)
  );

  // 자산관리 II용 Shortterm 포지션 집계 (stockBalance + principal 분리)
  const shorttermStockBalance = Math.round(
    shorttermPositions.reduce((s, p) => s + p.evalAmount, 0)
  );
  const shorttermPrincipal = Math.round(
    shorttermPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0)
  );

  // ── 3. Pension 계좌별 집계 ────────────────────────────────
  // DRAFT 스냅샷에 pensionMonthly 수동 입력값이 있으면 그 값을 우선 사용 (실제 잔액 반영)
  const draftSnap = idx !== -1 ? snapshots[idx] : null;
  const pm = draftSnap?.pensionMonthly;

  let pensionFundBalance: number;
  let pensionFundPrincipal: number;
  let pensionDepositBalance: number;
  let pensionDepositPrincipal: number;
  let irpBalance: number;
  let irpPrincipal: number;

  if (pm?.fundBalance != null || pm?.fundPrincipal != null || pm?.depositBalance != null ||
      pm?.depositPrincipal != null || pm?.irpBalance != null || pm?.irpPrincipal != null) {
    // pensionMonthly 수동 입력값 사용 (일부만 있어도 나머지는 live calc로 보완)
    const pensionTxs = await readPensionTxs();
    const pensionPositions = calcPensionPositions(pensionTxs, {});
    const retirementPositions = pensionPositions.filter((p) => p.accountType === "RETIREMENT");
    const savingsPositions = pensionPositions.filter((p) => p.accountType === "SAVINGS");
    const irpPositions = pensionPositions.filter((p) => p.accountType === "IRP");

    pensionFundBalance = pm.fundBalance ?? Math.round(retirementPositions.reduce((s, p) => s + p.evalAmount, 0));
    pensionFundPrincipal = pm.fundPrincipal ?? Math.round(retirementPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
    pensionDepositBalance = pm.depositBalance ?? Math.round(savingsPositions.reduce((s, p) => s + p.evalAmount, 0));
    pensionDepositPrincipal = pm.depositPrincipal ?? Math.round(savingsPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
    irpBalance = pm.irpBalance ?? Math.round(irpPositions.reduce((s, p) => s + p.evalAmount, 0));
    irpPrincipal = pm.irpPrincipal ?? Math.round(irpPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
  } else {
    // 수동 입력 없으면 거래내역 기반 자동 계산
    const pensionTxs = await readPensionTxs();
    const pensionPositions = calcPensionPositions(pensionTxs, {});
    const retirementPositions = pensionPositions.filter((p) => p.accountType === "RETIREMENT");
    const savingsPositions = pensionPositions.filter((p) => p.accountType === "SAVINGS");
    const irpPositions = pensionPositions.filter((p) => p.accountType === "IRP");

    pensionFundBalance = Math.round(retirementPositions.reduce((s, p) => s + p.evalAmount, 0));
    pensionFundPrincipal = Math.round(retirementPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
    pensionDepositBalance = Math.round(savingsPositions.reduce((s, p) => s + p.evalAmount, 0));
    pensionDepositPrincipal = Math.round(savingsPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
    irpBalance = Math.round(irpPositions.reduce((s, p) => s + p.evalAmount, 0));
    irpPrincipal = Math.round(irpPositions.reduce((s, p) => s + p.avgCost * p.quantity, 0));
  }

  // 캐나다 연금 KRW 환산
  const canadianPensionKrw = Math.round(body.canadianPension.balanceCad * body.cadKrw);

  // ── 4. Education 1470 집계 ────────────────────────────────
  const educationData = await readEducationData();
  const education1470StockLive = Math.round(
    educationData.positions.reduce(
      (s, p) => s + (p.currentPrice > 0 ? p.currentPrice : p.avgPrice) * p.quantity,
      0
    )
  );
  // educationMonthly.stockBalance 수동 입력값이 있으면 우선 사용 (currentPrice=0 문제 우회)
  const education1470Stock = draftSnap?.educationMonthly?.stockBalance ?? education1470StockLive;
  const education1470Principal = Math.round(
    educationData.positions.reduce((s, p) => s + p.avgPrice * p.quantity, 0)
  );

  // ── 5. 스냅샷 구성 및 저장 ───────────────────────────────
  const base: FinancialSnapshot =
    idx !== -1
      ? snapshots[idx]
      : createDraftSnapshot(month);

  const confirmed: FinancialSnapshot = {
    ...base,
    status: "CONFIRMED",
    exchangeRates: {
      usdKrw: body.usdKrw,
      cadKrw: body.cadKrw,
      recordedAt: new Date().toISOString(),
    },
    // 현금·예금
    fixedDepositKrw: body.fixedDepositKrw,
    fixedDepositUsd: body.fixedDepositUsd,
    // 부채
    leaseDeposit: body.leaseDeposit,
    privateLoan: body.privateLoan,
    mortgageLoan: body.mortgageLoan,
    // 비유동자산
    realEstate: body.realEstate,
    // 가상자산
    crypto: body.crypto,
    // 캐나다 연금
    canadianPension: body.canadianPension,
    // 2805 중기 계좌
    midterm2805: body.midterm2805,
    // 기타자산
    otherAssets: body.otherAssets,
    // 포트폴리오 스냅샷 — 엑셀 Asset Management 구조에 맞게 세분화
    confirmedPortfolio: {
      // Asset Management
      fundBalance,
      fundPrincipal,
      fundCumPnl,
      korStocksBalance,
      korStocksPrincipal,
      korStocksCumPnl,
      usStocksBalanceUsd,
      usStocksPrincipalUsd,
      usStocksCumPnlUsd,
      usStocksBalanceKrw,
      stockDepositKrw,
      stockDepositUsd: 0,
      // Pension
      pensionFundBalance,
      pensionFundPrincipal,
      pensionDepositBalance,
      pensionDepositPrincipal,
      irpBalance,
      irpPrincipal,
      // Education 1470
      education1470Deposit: base.educationMonthly?.deposit ?? 0,
      education1470Stock,
      education1470Principal,
      // Short-term Account (2805) — 자산관리 II 표시용
      shorttermStockBalance,
      shorttermPrincipal,
      shorttermDeposit: base.shorttermMonthly?.deposit ?? 0,
      // 이전 버전 호환
      canadianPensionKrw,
    },
    confirmedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (idx !== -1) {
    snapshots[idx] = confirmed;
  } else {
    snapshots.push(confirmed);
  }
  await writeSnapshots(snapshots);

  return NextResponse.json({ snapshot: confirmed });
}
