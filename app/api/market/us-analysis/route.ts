// GET /api/market/us-analysis?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// 미국 시장 분석 5개 차트용 집계 API
// Yahoo Finance: ^GSPC(S&P500), ^IXIC(NASDAQ), ^VIX, ^VVIX, ^SDEX(S&P500 Downside Risk)
// FRED: BAMLH0A0HYM2(HY Spread)
//
// 모든 데이터는 Yahoo 거래일 기준으로 정렬하고
// FRED 데이터는 forward-fill로 거래일 기준 맞춤

import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory } from "@/lib/fetchers/yahoo";
import { fetchFredSeries, type FredDataPoint } from "@/lib/fetchers/fred";
import type { UsAnalysisBar, UsAnalysisResponse } from "@/types/market-analysis";

// 날짜 파라미터를 동적으로 처리하므로 정적 캐시 비활성화
export const dynamic = "force-dynamic";

/**
 * FRED 데이터를 Yahoo 거래일 기준으로 forward-fill 정렬한다.
 * FRED 데이터는 주말/공휴일을 제외하지 않아 Yahoo 거래일과 날짜가 맞지 않는 경우가 있다.
 * 직전 유효 값으로 빈 날짜를 채운다.
 */
function alignFredToTradingDays(
  tradingDates: string[],
  fredData: FredDataPoint[]
): Map<string, number> {
  const fredMap = new Map(fredData.map((d) => [d.date, d.value]));
  const result = new Map<string, number>();
  let lastValue: number | undefined;

  for (const date of tradingDates) {
    const fredValue = fredMap.get(date);
    if (fredValue !== undefined) lastValue = fredValue;
    if (lastValue !== undefined) result.set(date, lastValue);
  }

  return result;
}

/** "YYYY-MM-DD" 문자열로 Date 생성 (UTC 기준, 시간대 이슈 방지) */
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** 오늘 날짜 "YYYY-MM-DD" 반환 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const endDate = searchParams.get("endDate") ?? todayStr();
  // 기본 조회 기간: 1년
  const defaultStart = new Date(parseDate(endDate).getTime() - 365 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);
  const startDate = searchParams.get("startDate") ?? defaultStart;

  // 6개 시리즈 병렬 수집 — 일부 실패해도 나머지 데이터 반환
  // ^SDEX: Yahoo Finance의 S&P 500 Downside Risk Index (FRED SDEX 시리즈 없음)
  const [spxResult, nasdaqResult, vixResult, vvixResult, sdexResult, hyResult] =
    await Promise.allSettled([
      fetchYahooHistory("^GSPC", parseDate(startDate), parseDate(endDate)),
      fetchYahooHistory("^IXIC", parseDate(startDate), parseDate(endDate)),
      fetchYahooHistory("^VIX", parseDate(startDate), parseDate(endDate)),
      fetchYahooHistory("^VVIX", parseDate(startDate), parseDate(endDate)),
      fetchYahooHistory("^SDEX", parseDate(startDate), parseDate(endDate)),
      fetchFredSeries("BAMLH0A0HYM2", startDate, endDate),
    ]);

  // Yahoo 거래일을 기준 날짜로 사용 (S&P500이 가장 안정적)
  const spxBars =
    spxResult.status === "fulfilled" ? spxResult.value : [];
  const tradingDates = spxBars.map((b) => b.date);

  // Yahoo 데이터 Map 변환 (날짜 → 종가)
  const nasdaqMap = new Map(
    (nasdaqResult.status === "fulfilled" ? nasdaqResult.value : []).map((b) => [
      b.date,
      b.close,
    ])
  );
  const vixMap = new Map(
    (vixResult.status === "fulfilled" ? vixResult.value : []).map((b) => [
      b.date,
      b.close,
    ])
  );
  const vvixMap = new Map(
    (vvixResult.status === "fulfilled" ? vvixResult.value : []).map((b) => [
      b.date,
      b.close,
    ])
  );
  // ^SDEX는 Yahoo Finance에서 직접 수집 — FRED 방식 불필요
  const sdexMap = new Map(
    (sdexResult.status === "fulfilled" ? sdexResult.value : []).map((b) => [
      b.date,
      b.close,
    ])
  );

  // FRED 데이터 → 거래일 forward-fill 정렬 (주말 공백 처리)
  const hyAligned = alignFredToTradingDays(
    tradingDates,
    hyResult.status === "fulfilled" ? hyResult.value : []
  );

  // 통합 데이터 배열 구성
  const data: UsAnalysisBar[] = tradingDates.map((date, idx) => ({
    date,
    spx: spxBars[idx]?.close,
    nasdaq: nasdaqMap.get(date),
    vix: vixMap.get(date),
    vvix: vvixMap.get(date),
    sdex: sdexMap.get(date),
    hySpread: hyAligned.get(date),
  }));

  const response: UsAnalysisResponse = {
    data,
    meta: {
      startDate: data[0]?.date ?? startDate,
      endDate: data[data.length - 1]?.date ?? endDate,
      count: data.length,
    },
  };

  return NextResponse.json(response);
}
