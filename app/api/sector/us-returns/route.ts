// GET /api/sector/us-returns
// 미국 테마 ETF 40개 수익률(1M/3M/12M) + RS Raw 반환
// calcUsSectorReturns()에서 계산 + 일 1회 파일 캐시

import { NextResponse } from "next/server";
import { calcUsSectorReturns } from "@/lib/etf/us-sector-returns";

export async function GET() {
  try {
    const data = await calcUsSectorReturns();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[/api/sector/us-returns] 계산 오류:", error);
    return NextResponse.json(
      { error: "미국 섹터 데이터 계산 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
