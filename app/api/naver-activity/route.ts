// Naver 활동성 지표 API 엔드포인트
//
// GET /api/naver-activity?ticker=005930
// KR 종목 전용 — Naver 활동성 API(rpt=4)에서 회전율 수집
// Checkpoint2Client의 CCC 차트에서 사용

import { NextRequest, NextResponse } from "next/server";
import { fetchNaverActivity } from "@/lib/fundamental-screening/naver-activity";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker 파라미터가 필요합니다. 예: ?ticker=005930" },
      { status: 400 }
    );
  }

  try {
    const result = await fetchNaverActivity(ticker.trim().toUpperCase());
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[naver-activity] 오류:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
