// GET /api/market/ai-infra
// Neocloud 3사 주가 시계열 조회 + 정규화 (첫 거래일 = 100)
// - CoreWeave (CRWV): IPO 2025-03-28
// - Nebius Group (NBIS): NASDAQ 상장
// - Iris Energy (IREN): NASDAQ 상장
//
// 각 심볼의 IPO 이전 날짜는 undefined 처리 → recharts에서 자동 누락
// 정규화 기준: 조회 범위 내 각 심볼의 첫 번째 유효 종가

import { NextRequest } from "next/server";
import { fetchYahooHistory } from "@/lib/fetchers/yahoo";
import type { AiInfraBar } from "@/types/market-analysis";

export const dynamic = "force-dynamic";

/** 기본 1년 기간 시작일 계산 */
function defaultStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate") ?? defaultStartDate();
  const endDate = searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);

  // 3종목 병렬 수집 — 한 종목 실패 시 나머지는 정상 표시
  const [crwvRes, nbisRes, irenRes] = await Promise.allSettled([
    fetchYahooHistory("CRWV", startDate, endDate),
    fetchYahooHistory("NBIS", startDate, endDate),
    fetchYahooHistory("IREN", startDate, endDate),
  ]);

  const crwvData = crwvRes.status === "fulfilled" ? crwvRes.value : [];
  const nbisData = nbisRes.status === "fulfilled" ? nbisRes.value : [];
  const irenData = irenRes.status === "fulfilled" ? irenRes.value : [];

  // 날짜 → 종가 맵 (O(1) 조회)
  const crwvMap = new Map(crwvData.map((d) => [d.date, d.close]));
  const nbisMap = new Map(nbisData.map((d) => [d.date, d.close]));
  const irenMap = new Map(irenData.map((d) => [d.date, d.close]));

  // 정규화 기준: 각 시리즈의 첫 번째 유효 종가 = 100
  const crwvBase = crwvData[0]?.close ?? null;
  const nbisBase = nbisData[0]?.close ?? null;
  const irenBase = irenData[0]?.close ?? null;

  // 3종목 날짜 유니온 (거래일 합집합, 오름차순 정렬)
  const allDates = [
    ...new Set([
      ...crwvData.map((d) => d.date),
      ...nbisData.map((d) => d.date),
      ...irenData.map((d) => d.date),
    ]),
  ].sort();

  const data: AiInfraBar[] = allDates.map((date) => {
    const crwvRaw = crwvMap.get(date);
    const nbisRaw = nbisMap.get(date);
    const irenRaw = irenMap.get(date);

    return {
      date,
      // 정규화: 기준가 없으면 undefined (IPO 이전 등)
      crwv: crwvRaw != null && crwvBase ? (crwvRaw / crwvBase) * 100 : undefined,
      nbis: nbisRaw != null && nbisBase ? (nbisRaw / nbisBase) * 100 : undefined,
      iren: irenRaw != null && irenBase ? (irenRaw / irenBase) * 100 : undefined,
      crwvRaw,
      nbisRaw,
      irenRaw,
    };
  });

  return Response.json({
    data,
    meta: {
      startDate,
      endDate,
      count: data.length,
      bases: { crwv: crwvBase, nbis: nbisBase, iren: irenBase },
    },
  });
}
