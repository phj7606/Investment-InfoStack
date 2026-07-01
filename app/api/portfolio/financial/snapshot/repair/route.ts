/**
 * POST /api/portfolio/financial/snapshot/repair
 * confirmedPortfolio의 education/shortterm 값 복원
 *
 * legacy 모드(2025-12~2026-04): stock 단일값만, deposit/principal 0으로 초기화
 * partial 모드(2026-06~): 지정된 필드만 덮어쓰고 나머지는 기존값 유지
 */

import { NextResponse } from "next/server";
import { readSnapshots, writeSnapshots } from "../route";

type LegacyEntry = {
  eduTotalBalance: number;
  stTotalBalance: number;
  stockDepositKrw?: number;
};

type PartialEntry = {
  education1470Stock?: number;
  education1470Principal?: number;
  education1470Deposit?: number;
  shorttermStockBalance?: number;
  shorttermPrincipal?: number;
  shorttermDeposit?: number;
  stockDepositKrw?: number;
};

// II 종가확정 전 confirm으로 0이 된 구버전 월 (deposit/principal 분리 안 됨)
const LEGACY_DATA: Record<string, LegacyEntry> = {
  "2025-12": { eduTotalBalance: 27851177, stTotalBalance: 9766802  },
  "2026-01": { eduTotalBalance: 30637399, stTotalBalance: 13220933, stockDepositKrw: 201042544 },
  "2026-02": { eduTotalBalance: 40938360, stTotalBalance: 33015122 },
  "2026-03": { eduTotalBalance: 29068114, stTotalBalance: 28324183 },
  "2026-04": { eduTotalBalance: 33312951, stTotalBalance: 33909411 },
};

// II 종가확정 없이 confirm 시 0으로 저장된 월 — lockedBalances 기준으로 복원
const PARTIAL_DATA: Record<string, PartialEntry> = {
  "2026-06": {
    education1470Stock:    25835500,
    education1470Principal: 11959900,
    education1470Deposit:  14270073,
    shorttermStockBalance: 34394700,
    shorttermPrincipal:    23686532,
    shorttermDeposit:      58454,
  },
};

export async function POST() {
  const snapshots = await readSnapshots();
  let count = 0;

  for (const snap of snapshots) {
    if (snap.status !== "CONFIRMED" || !snap.confirmedPortfolio) continue;

    const legacy = LEGACY_DATA[snap.month];
    if (legacy) {
      snap.confirmedPortfolio = {
        ...snap.confirmedPortfolio,
        education1470Deposit:   0,
        education1470Stock:     legacy.eduTotalBalance,
        education1470Principal: 0,
        shorttermStockBalance:  legacy.stTotalBalance,
        shorttermDeposit:       0,
        shorttermPrincipal:     0,
        ...(legacy.stockDepositKrw != null && { stockDepositKrw: legacy.stockDepositKrw }),
      };
      snap.updatedAt = new Date().toISOString();
      count++;
      continue;
    }

    const partial = PARTIAL_DATA[snap.month];
    if (partial) {
      snap.confirmedPortfolio = {
        ...snap.confirmedPortfolio,
        ...(partial.education1470Stock     != null && { education1470Stock:     partial.education1470Stock }),
        ...(partial.education1470Principal != null && { education1470Principal: partial.education1470Principal }),
        ...(partial.education1470Deposit   != null && { education1470Deposit:   partial.education1470Deposit }),
        ...(partial.shorttermStockBalance  != null && { shorttermStockBalance:  partial.shorttermStockBalance }),
        ...(partial.shorttermPrincipal     != null && { shorttermPrincipal:     partial.shorttermPrincipal }),
        ...(partial.shorttermDeposit       != null && { shorttermDeposit:       partial.shorttermDeposit }),
        ...(partial.stockDepositKrw        != null && { stockDepositKrw:        partial.stockDepositKrw }),
      };
      snap.updatedAt = new Date().toISOString();
      count++;
    }
  }

  await writeSnapshots(snapshots);
  return NextResponse.json({
    ok: true,
    restored: count,
    months: [...Object.keys(LEGACY_DATA), ...Object.keys(PARTIAL_DATA)],
  });
}
