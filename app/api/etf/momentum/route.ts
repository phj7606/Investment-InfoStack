// ETF 변동성 조정 모멘텀 랭킹 API Route
// GET /api/etf/momentum?market=kr|us
//
// 쿼리 파라미터:
//   market: "kr" (한국 ETF, 기본값) | "us" (미국 ETF)
//
// 응답: EtfMomentumResponse JSON
// 캐시: 일 1회 (params.cache.historicalTTLSeconds = 86400초)

import { type NextRequest } from "next/server";
import { calcEtfMomentum } from "@/lib/etf/momentum";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const marketParam = searchParams.get("market");

  // market 파라미터 유효성 검사 — 허용값: "kr" | "us"
  if (marketParam !== "kr" && marketParam !== "us") {
    return Response.json(
      { error: "market 파라미터는 'kr' 또는 'us'이어야 합니다" },
      { status: 400 }
    );
  }

  try {
    const data = await calcEtfMomentum(marketParam);
    return Response.json({ data, source: "api" });
  } catch (error) {
    console.error(`ETF 모멘텀 계산 오류 (market=${marketParam}):`, error);
    return Response.json(
      { error: "ETF 모멘텀 데이터 계산에 실패했습니다" },
      { status: 500 }
    );
  }
}
