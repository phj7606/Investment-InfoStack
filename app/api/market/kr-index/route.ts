// GET /api/market/kr-index
// GET /api/market/kr-index?date=20250327
// KOSPI / KOSDAQ 지수 현재가 반환
// 캐시 전략: 장중 60초 TTL (빠른 갱신 필요)

import { NextRequest } from "next/server";
import { fetchKrxIndices, getLatestBusinessDay } from "@/lib/fetchers/krx";
import { readCache, writeCache } from "@/lib/cache";
import type { KrxIndexSnapshot } from "@/lib/fetchers/krx";
import params from "@/config/params.json";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? getLatestBusinessDay();

  const cacheKey = `kr-index-${date}`;

  const cached = await readCache<KrxIndexSnapshot[]>(cacheKey);
  if (cached) {
    return Response.json({ data: cached, source: "cache" });
  }

  const data = await fetchKrxIndices(date);

  if (data.length === 0) {
    return Response.json(
      { error: `${date} 날짜의 지수 데이터를 찾을 수 없습니다. 영업일인지 확인하세요.` },
      { status: 404 }
    );
  }

  await writeCache(cacheKey, data, params.cache.indexTTLSeconds);

  return Response.json({ data, source: "api" });
}
