/**
 * GET /api/portfolio/education/lt-positions
 *
 * Education 계좌 거래 이력 집계 → 현재 보유 포지션 계산 후 반환
 * calcPositions / calcLongtermSummary (longterm-calc) 재사용
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/educationTransactionsData";
import { calcPositions, calcLongtermSummary } from "@/lib/portfolio/longterm-calc";
import type { LongtermTransaction } from "@/types/portfolio";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const market = searchParams.get("market") as "KR" | "US" | null;

    let txs = await readTransactions();
    if (market) txs = txs.filter((t: LongtermTransaction) => t.market === market);

    // 포지션 계산 (현재가는 없는 상태 — 클라이언트에서 병합)
    const positions = calcPositions(txs);

    // KR/US 섹션 요약
    const krSummary = calcLongtermSummary(txs, positions, "KRW");
    const usSummary = calcLongtermSummary(txs, positions, "USD");

    return NextResponse.json({
      positions,
      krSummary,
      usSummary,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[education/lt-positions GET]", err);
    return NextResponse.json({ error: "포지션 조회 실패" }, { status: 500 });
  }
}
