// ETF 스크리너 통합 API Route
// GET /api/etf/screener?market=kr|us
//
// 응답: ScreenerResponse JSON (RS + 모멘텀 + MA 조인 결과)
// 캐시: 일 1회 (params.cache.historicalTTLSeconds = 86400초)

import { type NextRequest } from "next/server";
import { calcScreener } from "@/lib/etf/screener";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const marketParam = searchParams.get("market");

  if (marketParam !== "kr" && marketParam !== "us") {
    return Response.json(
      { error: "market 파라미터는 'kr' 또는 'us'이어야 합니다" },
      { status: 400 }
    );
  }

  try {
    const data = await calcScreener(marketParam);
    return Response.json({ data, source: "api" });
  } catch (error) {
    console.error(`스크리너 계산 오류 (market=${marketParam}):`, error);
    return Response.json(
      { error: "스크리너 데이터 계산에 실패했습니다" },
      { status: 500 }
    );
  }
}
