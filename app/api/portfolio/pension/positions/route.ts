/**
 * GET /api/portfolio/pension/positions
 *
 * 거래 이력으로부터 현재 포지션을 계산하여 반환.
 * 포지션을 직접 저장하지 않으므로 GET 전용 엔드포인트.
 *
 * 응답:
 * - positions: 모든 계좌 포지션 (accountType 필드로 구분)
 * - retirementSummary / savingsSummary / irpSummary: 계좌별 요약
 */

import { NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/pension-store";
import {
  calcPensionPositions,
  calcPensionAccountSummary,
  enrichTransactionsFromHistory,
} from "@/lib/portfolio/pension-calc";

export async function GET() {
  // 전체 이력 enrichment 후 포지션 계산 — stored realizedPL 오염 방어
  const transactions = enrichTransactionsFromHistory(await readTransactions());
  const positions    = calcPensionPositions(transactions);

  const retirementSummary = calcPensionAccountSummary(positions, transactions, "RETIREMENT");
  const savingsSummary    = calcPensionAccountSummary(positions, transactions, "SAVINGS");
  const irpSummary        = calcPensionAccountSummary(positions, transactions, "IRP");

  return NextResponse.json({
    positions,
    retirementSummary,
    savingsSummary,
    irpSummary,
    fetchedAt: new Date().toISOString(),
  });
}
