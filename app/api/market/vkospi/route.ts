// GET /api/market/vkospi
// GET /api/market/vkospi?date=20250327
// V-KOSPI (변동성지수) 현재값 반환
// Fear & Greed Oscillator 한국의 Volatility 구성요소로 사용

import { NextRequest } from "next/server";
import { fetchVKospi, getLatestBusinessDay } from "@/lib/fetchers/krx";
import { readCache, writeCache } from "@/lib/cache";
import type { VKospiSnapshot } from "@/lib/fetchers/krx";
import params from "@/config/params.json";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? getLatestBusinessDay();

  const cacheKey = `vkospi-${date}`;

  const cached = await readCache<VKospiSnapshot>(cacheKey);
  if (cached) {
    return Response.json({ data: cached, source: "cache" });
  }

  const data = await fetchVKospi(date);

  if (!data) {
    return Response.json(
      { error: `${date} 날짜의 V-KOSPI 데이터를 찾을 수 없습니다.` },
      { status: 404 }
    );
  }

  await writeCache(cacheKey, data, params.cache.indexTTLSeconds);

  return Response.json({ data, source: "api" });
}
