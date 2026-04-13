// GET /api/market/bond-rate
// GET /api/market/bond-rate?startDate=20240101&endDate=20250327&type=spread
// 한국은행 국고채 금리 시계열 반환
// type=spread 시 5Y/10Y 스프레드 반환 (F&G Oscillator BondDiff 구성요소)
// 캐시 전략: 1시간 TTL (일 1회 갱신으로 충분)

import { NextRequest } from "next/server";
import { fetchBondRate, fetchBondSpread } from "@/lib/fetchers/ecos";
import { readCache, writeCache } from "@/lib/cache";
import type { EcosBondRatePoint } from "@/lib/fetchers/ecos";
import params from "@/config/params.json";

// 기본 조회 기간: 최근 2년
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

  return { startDate: fmt(start), endDate: fmt(end) };
}

export async function GET(request: NextRequest) {
  // ECOS API 키 없으면 즉시 오류 반환 (서버 시작 후 첫 요청 시 발견)
  if (!process.env.ECOS_API_KEY) {
    return Response.json(
      {
        error: "ECOS_API_KEY 환경변수가 설정되지 않았습니다. .env.local 파일을 확인하세요.",
        hint: "https://ecos.bok.or.kr에서 API 키를 발급받으세요.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const defaults = getDefaultDateRange();
  const startDate = searchParams.get("startDate") ?? defaults.startDate;
  const endDate = searchParams.get("endDate") ?? defaults.endDate;
  // type=spread: 5Y/10Y 스프레드 반환, 그 외: 3년 국고채 단일 시계열
  const type = searchParams.get("type") ?? "3y";

  const cacheKey = `bond-rate-${type}-${startDate}-${endDate}`;

  if (type === "spread") {
    // 5Y/10Y 스프레드 조회
    type SpreadData = Awaited<ReturnType<typeof fetchBondSpread>>;
    const cached = await readCache<SpreadData>(cacheKey);
    if (cached) {
      return Response.json({
        data: cached,
        meta: { type: "spread", startDate, endDate },
        source: "cache",
      });
    }

    const data = await fetchBondSpread(startDate, endDate);
    await writeCache(cacheKey, data, params.cache.bondRateTTLSeconds);

    return Response.json({
      data,
      meta: { type: "spread", startDate, endDate },
      source: "api",
    });
  }

  // 기본: 3년 국고채 단일 시계열
  const cached = await readCache<EcosBondRatePoint[]>(cacheKey);
  if (cached) {
    return Response.json({
      data: cached,
      meta: {
        statCode: params.ecos.bondRateStatCode,
        itemCode: params.ecos.bondRate3YItemCode,
        itemName: "국고채(3년)",
        startDate,
        endDate,
      },
      source: "cache",
    });
  }

  const data = await fetchBondRate(startDate, endDate);

  if (data.length === 0) {
    return Response.json(
      { error: "해당 기간의 금리 데이터가 없습니다.", startDate, endDate },
      { status: 404 }
    );
  }

  await writeCache(cacheKey, data, params.cache.bondRateTTLSeconds);

  return Response.json({
    data,
    meta: {
      statCode: params.ecos.bondRateStatCode,
      itemCode: params.ecos.bondRate3YItemCode,
      itemName: "국고채(3년)",
      startDate,
      endDate,
    },
    source: "api",
  });
}
