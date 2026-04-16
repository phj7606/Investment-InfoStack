// GET /api/sector/kr-returns
// 한국 섹터 대표 ETF 수익률(1M/3M/12M) + RS Percentile 반환
// calcKrSectorReturns()에서 계산 + 일 1회 파일 캐시

import { NextResponse } from "next/server";
import { calcKrSectorReturns } from "@/lib/etf/sector-returns";

export async function GET() {
  try {
    const data = await calcKrSectorReturns();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("[/api/sector/kr-returns] 계산 오류:", error);
    return NextResponse.json(
      { error: "섹터 데이터 계산 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
