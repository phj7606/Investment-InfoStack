/**
 * Financial Snapshot [month] API — 단일 월 스냅샷 조회 및 수정
 *
 * GET /api/portfolio/financial/snapshot/2026-05   → 해당 월 스냅샷
 * PUT /api/portfolio/financial/snapshot/2026-05   → DRAFT 스냅샷 수정 (현금/부채/환율 등)
 */

import { NextRequest, NextResponse } from "next/server";
import type { UpdateSnapshotRequest } from "@/types/financial";
import { readSnapshots, writeSnapshots } from "../route";
import { createDraftSnapshot } from "@/lib/portfolio/financial-calc";
import { fetchExchangeRates } from "@/lib/fetchers/exchange-rate";

// GET — 단일 월 스냅샷 조회 (없으면 DRAFT 기본값 반환)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const snapshots = await readSnapshots();
  const found = snapshots.find((s) => s.month === month);

  if (!found) {
    // 해당 월 스냅샷이 없으면 실시간 환율로 초기화한 DRAFT 반환 (저장은 하지 않음)
    const rates = await fetchExchangeRates();
    return NextResponse.json({
      snapshot: createDraftSnapshot(month, rates),
      exists: false,
    });
  }

  return NextResponse.json({ snapshot: found, exists: true });
}

// PUT — DRAFT 스냅샷 필드 수정
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params;
  const body = (await req.json()) as UpdateSnapshotRequest;

  const snapshots = await readSnapshots();
  const idx = snapshots.findIndex((s) => s.month === month);

  if (idx === -1) {
    // 스냅샷이 없으면 실시간 환율로 신규 DRAFT 생성 후 업데이트
    const rates = await fetchExchangeRates();
    const draft = createDraftSnapshot(month, rates);
    const updated = mergeSnapshotUpdate(draft, body);
    snapshots.push(updated);
    await writeSnapshots(snapshots);
    return NextResponse.json({ snapshot: updated });
  }

  if (snapshots[idx].status === "CONFIRMED") {
    // CONFIRMED 스냅샷이라도 수동 입력 필드(예수금, 현금, 환율)는 업데이트 허용
    // 투자 포지션(confirmedPortfolio)은 변경 불가
    const ALLOWED_MANUAL_FIELDS: (keyof UpdateSnapshotRequest)[] = [
      "exchangeRates",
      "fixedDepositKrw", "fixedDepositUsd",
      "cashForeignUsd", "cashForeignCad",
      "stockDepositKrw", "stockDepositUsd", "stockDepositByAccount",
      "fundMonthly",
    ];
    const requestedFields = Object.keys(body) as (keyof UpdateSnapshotRequest)[];
    const hasLockedField = requestedFields.some((f) => !ALLOWED_MANUAL_FIELDS.includes(f));
    if (hasLockedField) {
      return NextResponse.json({ error: "확정된 스냅샷의 투자 포지션은 수정할 수 없습니다" }, { status: 403 });
    }
  }

  const updated = mergeSnapshotUpdate(snapshots[idx], body);
  snapshots[idx] = updated;
  await writeSnapshots(snapshots);

  return NextResponse.json({ snapshot: updated });
}

/** 기존 스냅샷에 업데이트 필드 병합 — 엑셀 구조 세분화 필드 포함 */
function mergeSnapshotUpdate(
  snapshot: ReturnType<typeof createDraftSnapshot>,
  body: UpdateSnapshotRequest
) {
  return {
    ...snapshot,
    exchangeRates: body.exchangeRates
      ? { ...snapshot.exchangeRates, ...body.exchangeRates }
      : snapshot.exchangeRates,
    // 현금·예금
    fixedDepositKrw: body.fixedDepositKrw ?? snapshot.fixedDepositKrw,
    fixedDepositUsd: body.fixedDepositUsd ?? snapshot.fixedDepositUsd,
    // 외화 예금 (현금성 자산)
    cashForeignUsd: body.cashForeignUsd ?? snapshot.cashForeignUsd ?? 0,
    cashForeignCad: body.cashForeignCad ?? snapshot.cashForeignCad ?? 0,
    // Fund 월별 직접입력
    fundMonthly: body.fundMonthly ?? snapshot.fundMonthly,
    // 부채
    leaseDeposit: body.leaseDeposit ?? snapshot.leaseDeposit,
    privateLoan: body.privateLoan ?? snapshot.privateLoan,
    mortgageLoan: body.mortgageLoan ?? snapshot.mortgageLoan,
    // 비유동자산
    realEstate: body.realEstate ?? snapshot.realEstate,
    // 가상자산
    crypto: body.crypto ?? snapshot.crypto,
    // 캐나다 연금
    canadianPension: body.canadianPension ?? snapshot.canadianPension,
    // 2805 중기 계좌
    midterm2805: body.midterm2805 ?? snapshot.midterm2805,
    // 주식예수금 — 합계 직접입력 및 계좌별 세부 내역
    // stockDepositKrw/Usd: Edit 다이얼로그에서 직접 입력 시 저장됨 (byAccount 없을 때 fallback)
    stockDepositKrw: body.stockDepositKrw ?? snapshot.stockDepositKrw,
    stockDepositUsd: body.stockDepositUsd ?? snapshot.stockDepositUsd,
    stockDepositByAccount: body.stockDepositByAccount ?? snapshot.stockDepositByAccount,
    // 자산관리 II 월별 직접입력 (교육, 연금, 단기)
    educationMonthly: body.educationMonthly
      ? { ...snapshot.educationMonthly, ...body.educationMonthly }
      : snapshot.educationMonthly,
    shorttermMonthly: body.shorttermMonthly
      ? { ...snapshot.shorttermMonthly, ...body.shorttermMonthly }
      : snapshot.shorttermMonthly,
    pensionMonthly: body.pensionMonthly
      ? { ...snapshot.pensionMonthly, ...body.pensionMonthly }
      : snapshot.pensionMonthly,
    // 기타자산
    otherAssets: body.otherAssets ?? snapshot.otherAssets,
    updatedAt: new Date().toISOString(),
  };
}
