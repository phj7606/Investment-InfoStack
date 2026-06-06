/**
 * POST /api/portfolio/financial/snapshot/repair
 * Dec-2025~Apr-2026 confirmedPortfolio의 education/shortterm 값 복원
 * 로컬 백업(data/financial-snapshots.json) 기준 정상값으로 덮어쓰기
 */

import { NextResponse } from "next/server";
import { readSnapshots, writeSnapshots } from "../route";

// Total Balance 단일값만 저장 (deposit/stock 분리 없음)
const RESTORE_DATA: Record<string, {
  eduTotalBalance: number;
  stTotalBalance: number;
  // Jan confirm 시점에 stockDepositByAccount/lockedBalances 미설정으로 cp.stockDepositKrw=0이 된 월만 지정
  stockDepositKrw?: number;
}> = {
  "2025-12": { eduTotalBalance: 27851177, stTotalBalance: 9766802  },
  "2026-01": { eduTotalBalance: 30637399, stTotalBalance: 13220933, stockDepositKrw: 201042544 },
  "2026-02": { eduTotalBalance: 40938360, stTotalBalance: 33015122 },
  "2026-03": { eduTotalBalance: 29068114, stTotalBalance: 28324183 },
  "2026-04": { eduTotalBalance: 33312951, stTotalBalance: 33909411 },
};

export async function POST() {
  const snapshots = await readSnapshots();
  let count = 0;

  for (const snap of snapshots) {
    const restore = RESTORE_DATA[snap.month];
    if (!restore || snap.status !== "CONFIRMED" || !snap.confirmedPortfolio) continue;

    snap.confirmedPortfolio = {
      ...snap.confirmedPortfolio,
      // Total Balance만 복원 — deposit/stock 분리 없이 stock 필드에 단일값 저장
      education1470Deposit:  0,
      education1470Stock:    restore.eduTotalBalance,
      education1470Principal: 0,
      shorttermStockBalance: restore.stTotalBalance,
      shorttermDeposit:      0,
      shorttermPrincipal:    0,
      // stockDepositKrw가 지정된 월만 덮어씀 (미지정 월은 기존값 유지)
      ...(restore.stockDepositKrw != null && { stockDepositKrw: restore.stockDepositKrw }),
    };
    snap.updatedAt = new Date().toISOString();
    count++;
  }

  await writeSnapshots(snapshots);
  return NextResponse.json({ ok: true, restored: count, months: Object.keys(RESTORE_DATA) });
}
