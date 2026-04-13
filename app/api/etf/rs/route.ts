// ETF Mansfield RS 랭킹 API Route
// GET /api/etf/rs?market=kr|us
//
// 쿼리 파라미터:
//   market: "kr" (한국 ETF, 기본값) | "us" (미국 ETF)
//
// 응답: EtfRsResponse JSON
// 캐시: 일 1회 (params.cache.historicalTTLSeconds = 86400초)

import { type NextRequest } from "next/server";
import { calcEtfRs } from "@/lib/etf/rs";

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
    const data = await calcEtfRs(marketParam);
    return Response.json({ data, source: "api" });
  } catch (error) {
    console.error(`ETF RS 계산 오류 (market=${marketParam}):`, error);
    return Response.json(
      { error: "ETF RS 데이터 계산에 실패했습니다" },
      { status: 500 }
    );
  }
}
