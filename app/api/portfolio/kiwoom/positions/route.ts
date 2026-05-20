/**
 * GET /api/portfolio/kiwoom/positions
 *
 * 키움 REST API에서 보유 포지션을 조회한다.
 * - 캐시 TTL 5분 (장중 데이터 실시간성 확보)
 * - KIWOOM_ACCOUNT_NO 환경 변수 기반 계좌 자동 선택
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchPositions } from "@/lib/fetchers/kiwoom";
import type { KiwoomAccountType } from "@/lib/fetchers/kiwoom";
import { readCache, writeCache } from "@/lib/cache";
import type { PositionsApiResponse } from "@/types/portfolio";

// 보유 포지션 캐시 TTL (초) — 장중 실시간성 확보
const POSITIONS_TTL_SEC = 5 * 60;

export async function GET(req: NextRequest) {
  try {
    // 계좌 유형 파라미터 (기본값: SHORTTERM)
    const accountType = (
      req.nextUrl.searchParams.get("account") ?? "SHORTTERM"
    ).toUpperCase() as KiwoomAccountType;

    const validTypes: KiwoomAccountType[] = ["SHORTTERM", "EDUCATION", "LONGTERM"];
    if (!validTypes.includes(accountType)) {
      return NextResponse.json(
        { error: `지원하지 않는 계좌 유형: ${accountType}` },
        { status: 400 }
      );
    }

    // 환경 변수 사전 확인 (계좌번호)
    const accountNoKey = `KIWOOM_${accountType}_ACCOUNT_NO`;
    if (!process.env[accountNoKey]) {
      return NextResponse.json(
        { error: `${accountNoKey} 환경 변수가 설정되지 않았습니다.` },
        { status: 500 }
      );
    }

    // 계좌 유형별 캐시 키
    const cacheKey = `portfolio-positions-${accountType}`;
    const cached = await readCache<PositionsApiResponse>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // 키움 API 조회 (계좌번호는 fetcher 내부에서 환경 변수로 자동 조회)
    const positions = await fetchPositions(accountType);
    const response: PositionsApiResponse = {
      positions,
      fetchedAt: new Date().toISOString(),
    };

    await writeCache(cacheKey, response, POSITIONS_TTL_SEC);
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[positions] 오류:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
