/**
 * GET /api/portfolio/longterm/performance
 *
 * SELL 거래 기반 성과 분석 데이터 반환
 * 현재가 불필요 — 거래 이력만으로 계산
 *
 * 쿼리 파라미터:
 *   account?: 계좌 필터
 *   currency: "KRW" | "USD" (기본값 "KRW")
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/longterm-store";
import {
  toStockPerformances,
  buildMonthlyPL,
} from "@/lib/portfolio/longterm-calc";
import { calcPerformanceSummary } from "@/lib/portfolio/performance";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get("account");
    const currency = (searchParams.get("currency") ?? "KRW") as "KRW" | "USD";

    let txs = readTransactions();
    if (account) txs = txs.filter((t) => t.accountNo === account);

    // SELL 거래 → StockPerformance 변환 (기존 performance.ts 재사용)
    const stockPerfs = toStockPerformances(txs, currency);
    const summary = calcPerformanceSummary(stockPerfs);

    // 월별 실현손익 (히트맵·벤치마크 비교용)
    const monthlyPL = buildMonthlyPL(txs, currency);

    return NextResponse.json({
      summary,
      monthlyPL,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[longterm/performance GET]", err);
    return NextResponse.json({ error: "성과 조회 실패" }, { status: 500 });
  }
}
