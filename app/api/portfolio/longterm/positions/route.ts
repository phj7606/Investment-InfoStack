/**
 * GET /api/portfolio/longterm/positions
 *
 * 거래 이력 집계 → 현재 보유 포지션 계산 후 반환
 *
 * 쿼리 파라미터:
 *   account?: 계좌 필터
 *   market?:  "KR" | "US"
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/longterm-store";
import { calcPositions, calcLongtermSummary } from "@/lib/portfolio/longterm-calc";
import type { LongtermTransaction } from "@/types/portfolio";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get("account");
    const market = searchParams.get("market") as "KR" | "US" | null;

    let txs = readTransactions();
    if (account) txs = txs.filter((t: LongtermTransaction) => t.accountNo === account);
    if (market) txs = txs.filter((t: LongtermTransaction) => t.market === market);

    // 포지션 계산 (현재가는 없는 상태 — 클라이언트에서 localStorage 현재가 병합)
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
    console.error("[longterm/positions GET]", err);
    return NextResponse.json({ error: "포지션 조회 실패" }, { status: 500 });
  }
}
