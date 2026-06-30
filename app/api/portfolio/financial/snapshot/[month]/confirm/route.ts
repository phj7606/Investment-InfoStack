/**
 * 월말 확정 API — DRAFT 스냅샷을 CONFIRMED로 잠금
 *
 * POST /api/portfolio/financial/snapshot/2026-05/confirm
 *
 * 사전 조건: lock-balances API로 KR/US 종가확정이 완료되어 있어야 함.
 * lockedBalances 없으면 400 에러 반환.
 *
 * [자산관리 탭]
 *   snap.lockedBalances 값을 그대로 사용 (재계산 없음)
 *   cumPnl = (balance - principal) + locked.realizedPL (lock 시점 실현손익 스냅샷)
 *
 * [자산관리II 탭]
 *   우선순위: pensionMonthly/educationMonthly/shorttermMonthly 수동 입력값
 *            → lock-balances "II" 확정값 (lockedBalances)
 *            → Naver 현재가 실시간 재계산 (fallback — 두 값이 모두 없을 때만)
 *
 * [Deposit 탭]
 *   stockDepositUsd: stockDepositByAccount의 USD 합산 사용
 *   (확정 시 0으로 초기화되는 버그 수정)
 */

import { NextRequest, NextResponse } from "next/server";
import type { ConfirmSnapshotRequest, FinancialSnapshot } from "@/types/financial";
import { readSnapshots, writeSnapshots } from "../../route";
import { createDraftSnapshot } from "@/lib/portfolio/financial-calc";

// DELETE — 월말 확정 취소 (CONFIRMED → DRAFT 복원)
// confirmedPortfolio·confirmedAt 제거, lockedBalances·DRAFT 입력값 보존
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const snapshots = await readSnapshots();
  const idx = snapshots.findIndex((s) => s.month === month);

  if (idx === -1) {
    return NextResponse.json({ error: "해당 월 스냅샷이 없습니다" }, { status: 404 });
  }
  if (snapshots[idx].status !== "CONFIRMED") {
    return NextResponse.json({ error: "확정 상태가 아닙니다" }, { status: 400 });
  }

  // confirmedPortfolio·confirmedAt 제거, 나머지 DRAFT 필드 보존
  const { confirmedPortfolio: _cp, confirmedAt: _ca, ...rest } = snapshots[idx] as FinancialSnapshot & {
    confirmedPortfolio?: unknown; confirmedAt?: unknown;
  };
  snapshots[idx] = { ...rest, status: "DRAFT", updatedAt: new Date().toISOString() } as FinancialSnapshot;

  await writeSnapshots(snapshots);
  return NextResponse.json({ ok: true, month, status: "DRAFT" });
}

import { readTransactions as readLongtermTxs } from "@/lib/portfolio/longterm-store";
import { readTransactions as readPensionTxs } from "@/lib/portfolio/pension-store";
import { readTransactions as readEducationTxs } from "@/lib/portfolio/educationTransactionsData";
import { readTransactions as readShorttermTxs } from "@/lib/portfolio/shorttermData";
import { calcPositions as calcShorttermPositions } from "@/lib/portfolio/longterm-calc";
import { calcPensionPositions } from "@/lib/portfolio/pension-calc";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";

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

  if (idx !== -1 && snapshots[idx].status === "CONFIRMED") {
    return NextResponse.json({ error: "이미 확정된 월입니다" }, { status: 409 });
  }

  const draftSnap = idx !== -1 ? snapshots[idx] : null;

  // ── 2. 종가확정 여부 검증 ────────────────────────────────
  // 종가확정(lock-balances) 없이 월말확정하면 confirm 시점의 현재가로 계산되어
  // 전월 마지막 거래일 종가와 불일치 발생 → 반드시 사전 종가확정 필요
  if (!draftSnap?.lockedBalances) {
    return NextResponse.json(
      { error: "종가확정을 먼저 진행해주세요. (자산관리 탭 → KR / US 종가확정 버튼)" },
      { status: 400 }
    );
  }

  // ── 3. 자산관리 탭 잔액 확정 ─────────────────────────────
  // lockedBalances의 종가 확정값 그대로 사용 (재계산 없음)
  const locked = draftSnap.lockedBalances;

  // locked.fund가 없으면 사용자가 자산관리 탭에 직접 입력한 값 사용
  const fundBalance = locked.fund ?? draftSnap?.fundMonthly?.balance ?? 0;
  const fundPrincipal = locked.fundPrincipal ?? 0;
  const korStocksBalance = locked.korStocks ?? 0;
  const korStocksPrincipal = locked.korStocksPrincipal ?? 0;
  const usStocksBalanceUsd = locked.usStocksUsd ?? 0;
  const usStocksPrincipalUsd = locked.usPrincipalUsd ?? 0;
  // DRAFT path와 동일하게 stockDepositByAccount KRW 합산 (locked.stockDepositKrw는 shortterm 주식평가액으로 별개)
  const stockDepositKrw = Object.values(draftSnap.stockDepositByAccount ?? {})
    .reduce((s, a) => s + (a?.krw ?? 0), 0)
    || locked.stockDepositKrw
    || 0;

  // cumPnl = 미실현손익(balance - principal) + lock 시점 실현손익 스냅샷
  // locked.realizedPL을 사용하면 lock 이후 거래가 끼어드는 문제를 방지할 수 있음
  const fundCumPnl = Math.round(
    (fundBalance - fundPrincipal) + (locked.fundRealizedPL ?? 0)
  );
  const korStocksCumPnl = Math.round(
    (korStocksBalance - korStocksPrincipal) + (locked.korStocksRealizedPL ?? 0)
  );
  const usStocksCumPnlUsd = Math.round(
    ((usStocksBalanceUsd - usStocksPrincipalUsd) + (locked.usRealizedPLUsd ?? 0)) * 100
  ) / 100;

  const usStocksBalanceKrw = Math.round(usStocksBalanceUsd * body.usdKrw);

  // [Bug fix] USD 예수금: stockDepositByAccount의 USD 합산
  // 기존 코드에서 stockDepositUsd: 0 으로 하드코딩되어 US Stock Deposit이 누락됨
  const stockDepositUsd = Object.values(draftSnap.stockDepositByAccount ?? {})
    .reduce((s, a) => s + (a?.usd ?? 0), 0);

  // ── 4. Pension 집계 ───────────────────────────────────────
  // 수동입력 필드 없음 — Education/Short-term과 동일한 패턴 적용
  // 원금: 거래 avgCost 기반 (시세 무관)
  // 잔액: II lock 확정값 → Naver 재계산
  let pensionFundBalance: number;
  let pensionFundPrincipal: number;
  let pensionDepositBalance: number;
  let pensionDepositPrincipal: number;
  let irpBalance: number;
  let irpPrincipal: number;

  {
    const pensionTxs = await readPensionTxs();
    const rawPensionPos = calcPensionPositions(pensionTxs, {});
    const retirementRaw = rawPensionPos.filter((p) => p.accountType === "RETIREMENT");
    const savingsRaw = rawPensionPos.filter((p) => p.accountType === "SAVINGS");
    const irpRaw = rawPensionPos.filter((p) => p.accountType === "IRP");

    // 원금: Education/Short-term과 동일하게 거래 avgCost만 사용 (수동입력 없음)
    pensionFundPrincipal    = Math.round(retirementRaw.reduce((s, p) => s + p.avgCost * p.quantity, 0));
    pensionDepositPrincipal = Math.round(savingsRaw.reduce((s, p) => s + p.avgCost * p.quantity, 0));
    irpPrincipal            = Math.round(irpRaw.reduce((s, p) => s + p.avgCost * p.quantity, 0));

    // 잔액: II lock 확정값 → Naver 재계산 (수동입력 없음)
    const needNaverFund    = locked.pensionFundBalance    == null;
    const needNaverDeposit = locked.pensionDepositBalance == null;
    const needNaverIrp     = locked.irpBalance            == null;

    let retirementPos: ReturnType<typeof calcPensionPositions> = [];
    let savingsPos:    ReturnType<typeof calcPensionPositions> = [];
    let irpPos:        ReturnType<typeof calcPensionPositions> = [];

    if (needNaverFund || needNaverDeposit || needNaverIrp) {
      // KR ETF 코드는 6자리 숫자 또는 숫자+대문자 혼합 (예: 0023A0, 0131V0)
      // 순수 숫자 필터(\d{6})는 알파벳 포함 코드를 제외시키므로 영숫자 6자리로 확장
      const pensionKrStocks = rawPensionPos
        .filter((p) => /^[0-9A-Z]{6}$/i.test(p.stockCode))
        .map((p) => ({ code: p.stockCode, name: p.stockName }));

      let pensionPrices: Record<string, number> = {};
      if (pensionKrStocks.length > 0) {
        pensionPrices = await fetchNaverCurrentPrices(pensionKrStocks);
      }

      const pensionPositions = calcPensionPositions(pensionTxs, pensionPrices);
      retirementPos = pensionPositions.filter((p) => p.accountType === "RETIREMENT");
      savingsPos    = pensionPositions.filter((p) => p.accountType === "SAVINGS");
      irpPos        = pensionPositions.filter((p) => p.accountType === "IRP");
    }

    pensionFundBalance    = locked.pensionFundBalance
      ?? Math.round(retirementPos.reduce((s, p) => s + p.evalAmount, 0));
    pensionDepositBalance = locked.pensionDepositBalance
      ?? Math.round(savingsPos.reduce((s, p) => s + p.evalAmount, 0));
    irpBalance            = locked.irpBalance
      ?? Math.round(irpPos.reduce((s, p) => s + p.evalAmount, 0));
  }

  // 캐나다 연금 KRW 환산
  const canadianPensionKrw = Math.round(body.canadianPension.balanceCad * body.cadKrw);

  // ── 5. Education 1470 집계 ────────────────────────────────
  // 우선순위: educationMonthly 수동입력 → lockedBalances "II" 확정값 → Naver 재계산
  let education1470Stock: number;
  let education1470Principal: number;

  {
    const em = draftSnap?.educationMonthly;
    const educationTxs = await readEducationTxs();
    const rawEduPos = calcShorttermPositions(educationTxs, {});

    education1470Principal = Math.round(rawEduPos.reduce((s, p) => s + p.avgCost * p.quantity, 0));

    if (em?.stockBalance != null) {
      // 수동입력 우선
      education1470Stock = em.stockBalance;
    } else if (locked.education1470Stock != null) {
      // lock-balances "II" 확정값
      education1470Stock = locked.education1470Stock;
    } else {
      // 둘 다 없으면 Naver 실시간 fetch
      const eduKrStocks = rawEduPos.map((p) => ({ code: p.stockCode, name: p.stockName }));
      let eduPrices: Record<string, number> = {};
      if (eduKrStocks.length > 0) {
        eduPrices = await fetchNaverCurrentPrices(eduKrStocks);
      }
      const eduPositions = calcShorttermPositions(educationTxs, eduPrices);
      education1470Stock = Math.round(eduPositions.reduce((s, p) => s + p.evalAmount, 0));
    }
  }

  // ── 6. Short-term (자산관리II) 집계 ──────────────────────
  // 우선순위: shorttermMonthly 수동입력 → lockedBalances "II" 확정값 → KR lock stockDepositKrw
  const sm = draftSnap?.shorttermMonthly;
  const shorttermStockBalance =
    sm?.stockBalance ?? locked.shorttermStockBalance ?? stockDepositKrw;
  const shorttermDeposit = sm?.deposit ?? 0;

  // shorttermPrincipal: avgCost 기반 — 가격과 무관하므로 별도 계산
  let shorttermPrincipal = 0;
  {
    const shorttermTxs = await readShorttermTxs();
    const rawPos = calcShorttermPositions(shorttermTxs, {});
    shorttermPrincipal = Math.round(rawPos.reduce((s, p) => s + p.avgCost * p.quantity, 0));
  }

  // ── 7. KOR/US 당월 Bid/AskBV/FixedPnL 확정 ─────────────
  // confirm 시점에 거래내역을 고정 저장해 이후 데이터 변경 영향 차단
  const longtermTxs = await readLongtermTxs();
  const monthTxs = longtermTxs.filter((t) => t.date.startsWith(month));

  const korTxs = monthTxs.filter(
    (t) => t.market === "KR" && t.currency === "KRW" && t.assetType !== "FUND"
  );
  const korStocksBid      = Math.round(korTxs.filter((t) => t.tradeType === "BUY").reduce((s, t) => s + t.amount, 0));
  const korStocksAskBv    = Math.round(korTxs.filter((t) => t.tradeType === "SELL").reduce((s, t) => s + (t.avgCostAtSell ?? 0) * t.quantity, 0));
  const korStocksFixedPnl = Math.round(korTxs.filter((t) => t.tradeType === "SELL").reduce((s, t) => s + (t.realizedPL ?? 0), 0));

  const usTxs = monthTxs.filter((t) => t.market === "US" && t.currency === "USD");
  const usStocksBidUsd      = usTxs.filter((t) => t.tradeType === "BUY").reduce((s, t) => s + t.amount, 0);
  const usStocksAskBvUsd    = usTxs.filter((t) => t.tradeType === "SELL").reduce((s, t) => s + (t.avgCostAtSell ?? 0) * t.quantity, 0);
  const usStocksFixedPnlUsd = usTxs.filter((t) => t.tradeType === "SELL").reduce((s, t) => s + (t.realizedPL ?? 0), 0);

  // ── 8. 스냅샷 구성 및 저장 ───────────────────────────────
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
      korStocksBid,
      korStocksAskBv,
      korStocksFixedPnl,
      usStocksBalanceUsd,
      usStocksPrincipalUsd,
      usStocksCumPnlUsd,
      usStocksBidUsd,
      usStocksAskBvUsd,
      usStocksFixedPnlUsd,
      usStocksBalanceKrw,
      stockDepositKrw,
      stockDepositUsd,
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
      shorttermDeposit,
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

  // 다음 달 DRAFT가 이전 달 미확정 상태에서 생성된 경우 이월값 업데이트
  // lockedBalances가 없으면 종가확정 전 → 사용자가 아직 수치를 입력하지 않은 상태
  // → 이번 달 CONFIRMED 값을 기반으로 이월 필드(예금·부채·부동산 등)를 교정
  const [cy, cm] = month.split("-").map(Number);
  const nextMonthStr =
    cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, "0")}`;
  const nextIdx = snapshots.findIndex((s) => s.month === nextMonthStr);
  if (
    nextIdx !== -1 &&
    snapshots[nextIdx].status === "DRAFT" &&
    !snapshots[nextIdx].lockedBalances
  ) {
    snapshots[nextIdx] = {
      ...snapshots[nextIdx],
      fixedDepositKrw: confirmed.fixedDepositKrw,
      fixedDepositUsd: confirmed.fixedDepositUsd,
      leaseDeposit: confirmed.leaseDeposit,
      privateLoan: confirmed.privateLoan,
      mortgageLoan: confirmed.mortgageLoan,
      realEstate: confirmed.realEstate,
      otherAssets: [...confirmed.otherAssets],
      canadianPension: { ...confirmed.canadianPension },
      exchangeRates: { ...confirmed.exchangeRates },
      updatedAt: new Date().toISOString(),
    };
  }

  await writeSnapshots(snapshots);

  return NextResponse.json({ snapshot: confirmed });
}
