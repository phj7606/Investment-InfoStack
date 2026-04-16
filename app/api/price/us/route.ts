// GET /api/price/us?symbols=SPY,QQQ,XLK
// 미국 ETF/지수 현재가 스냅샷 반환
// 캐시 전략: 장중 5분(300초) TTL로 Yahoo Finance API 호출 횟수 제한

import { NextRequest } from "next/server";
import { fetchYahooQuotes } from "@/lib/fetchers/yahoo";
import { readCache, writeCache } from "@/lib/cache";
import type { YahooQuote } from "@/lib/fetchers/yahoo";
import params from "@/config/params.json";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return Response.json(
      { error: "symbols 파라미터가 필요합니다. 예: ?symbols=SPY,QQQ,XLK" },
      { status: 400 }
    );
  }

  // 쉼표 구분 심볼 파싱 + 빈 값 제거 + 대문자 정규화
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (symbols.length === 0) {
    return Response.json(
      { error: "유효한 심볼이 없습니다" },
      { status: 400 }
    );
  }

  // 심볼 목록을 정렬하여 캐시 키 일관성 확보
  const cacheKey = `price-us-${symbols.sort().join("-")}`;

  // 캐시 확인 — 유효 캐시가 있으면 즉시 반환
  const cached = await readCache<YahooQuote[]>(cacheKey);
  if (cached) {
    return Response.json({ data: cached, source: "cache" });
  }

  // 캐시 미스 — Yahoo Finance API 호출
  const data = await fetchYahooQuotes(symbols);

  // 결과 캐싱 (params.json의 TTL 사용)
  await writeCache(cacheKey, data, params.cache.priceTTLSeconds);

  return Response.json({ data, source: "api" });
}
