/**
 * GET /api/portfolio/kiwoom/trades?account=TREND&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * 키움 REST API에서 거래 이력을 조회하고 성과를 계산하여 반환한다.
 * - account: 계좌 유형 (TREND | LONGTERM | MIDTERM, 기본값 TREND)
 * - 계좌번호는 fetcher 내부에서 환경 변수로 자동 조회
 *
 * 응답:
 *   trades            — 전체 체결 내역 (매수+매도)
 *   stockPerformances — 매도 완료 거래의 종목별 성과
 *   summary           — 계좌 전체 성과 요약 (승률·손익비·EV·Equity Curve·MDD 등)
 *   fetchedAt         — 조회 시각 (ISO 8601)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchTrades } from "@/lib/fetchers/kiwoom";
import type { KiwoomAccountType } from "@/lib/fetchers/kiwoom";
import { readCache, writeCache } from "@/lib/cache";
import {
  calcStockPerformances,
  calcPerformanceSummary,
} from "@/lib/portfolio/performance";
import type { TradesApiResponse } from "@/types/portfolio";

// 거래 이력 캐시 TTL (초) — 장 마감 후에는 하루 동안 유지
const TRADES_TTL_SEC = 30 * 60;

export async function GET(req: NextRequest) {
  try {
    // 계좌 유형 파라미터 (기본값: TREND)
    const accountType = (
      req.nextUrl.searchParams.get("account") ?? "TREND"
    ).toUpperCase() as KiwoomAccountType;

    const validTypes: KiwoomAccountType[] = ["TREND", "LONGTERM", "MIDTERM"];
    if (!validTypes.includes(accountType)) {
      return NextResponse.json(
        { error: `지원하지 않는 계좌 유형: ${accountType}` },
        { status: 400 }
      );
    }

    // 환경 변수 사전 확인 (계좌번호)
    const accountNoKey = `KIWOOM_${accountType}_ACCOUNT_NO`;
    if (!process.env[accountNoKey]) {
      return NextResponse.json(
        { error: `${accountNoKey} 환경 변수가 설정되지 않았습니다.` },
        { status: 500 }
      );
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("startDate") ?? `${new Date().getFullYear()}-01-01`;
    const endDate = searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);

    // 날짜 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { error: "날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식을 사용하세요." },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: "startDate가 endDate보다 늦을 수 없습니다." },
        { status: 400 }
      );
    }

    // 캐시 키에 계좌 유형·날짜 범위 포함 (다른 기간·계좌 요청 시 별도 캐시)
    const cacheKey = `portfolio-trades-${accountType}-${startDate}-${endDate}`;
    const cached = await readCache<TradesApiResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // 키움 API 거래 이력 조회 (계좌번호는 fetcher 내부에서 환경 변수로 자동 조회)
    const trades = await fetchTrades(accountType, startDate, endDate);

    // 성과 계산
    const stockPerformances = calcStockPerformances(trades);
    const summary = calcPerformanceSummary(stockPerformances);

    const response: TradesApiResponse = {
      trades,
      stockPerformances,
      summary,
      fetchedAt: new Date().toISOString(),
    };

    // 캐시 저장
    await writeCache(cacheKey, response, TRADES_TTL_SEC);

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[trades] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
