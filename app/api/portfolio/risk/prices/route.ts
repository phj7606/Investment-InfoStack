/**
 * GET /api/portfolio/risk/prices?codes=005930,AAPL
 *
 * 리스크 관리 포지션 사이징 테이블용 현재가 조회 API.
 * 코드 형식으로 KR/US 자동 판별:
 *   - 전체 숫자 → KR (Naver Finance)
 *     · 6자리 미만: 앞에 0 패딩 → "58470" → "058470"
 *     · 6자리 초과: 앞 0 제거 → "0058470" → "058470"
 *     · 정규화 후 원본 코드 키로 결과 반환 (포지션 매핑 유지)
 *   - 숫자+영문 혼합 → US (Yahoo Finance v8 chart)
 *
 * 쿼리 파라미터:
 *   codes: 쉼표 구분 종목코드/심볼 (최대 10개)
 *
 * 응답:
 *   { prices: Record<string, number>, fetchedAt: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { fetchYahooCurrentPrices } from "@/lib/fetchers/yahoo";

/**
 * KR 종목코드 정규화
 * 전체 숫자이면 KR로 판별하고 6자리로 정규화
 * - "0058470" → "058470" (앞 0 제거 후 6자리)
 * - "58470"   → "058470" (0 패딩)
 * - "005930"  → "005930" (정상)
 */
function normalizeKrCode(code: string): string {
  const stripped = code.replace(/^0+/, "") || "0"; // 모두 0이면 "0" 유지
  return stripped.padStart(6, "0");
}

export async function GET(req: NextRequest) {
  try {
    const codesParam = new URL(req.url).searchParams.get("codes") ?? "";
    if (!codesParam.trim()) {
      return NextResponse.json({ prices: {}, fetchedAt: new Date().toISOString() });
    }

    // 코드 파싱 및 중복 제거 (제한 없음)
    const codes = [...new Set(
      codesParam.split(",").map((c) => c.trim()).filter(Boolean)
    )];

    // KR/US 판별:
    //   KR — 정확히 6자리이고 숫자를 1개 이상 포함 (예: "091160", "0023A0", "0038A0")
    //        KRX는 순수 숫자뿐 아니라 영문+숫자 혼합 6자리 코드도 사용함
    //   US — 그 외 (순수 영문 티커: "TSLA", "SPY" 등)
    const isKrCode = (c: string) => c.length === 6 && /[0-9]/.test(c);
    const krRaw   = codes.filter(isKrCode);
    const usCodes = codes.filter((c) => !isKrCode(c));

    // KR 코드 정규화: 원본 → 정규화 코드 매핑 (결과를 원본 키로 되돌리기 위해)
    const krNormMap: Record<string, string> = {};  // normalizedCode → originalCode
    const krNormCodes: string[] = [];
    for (const orig of krRaw) {
      const norm = normalizeKrCode(orig);
      if (norm !== orig) {
        console.log(`[risk/prices] KR 코드 정규화: "${orig}" → "${norm}"`);
      }
      krNormMap[norm] = orig;
      krNormCodes.push(norm);
    }

    // KR(Naver) + US(Yahoo) 병렬 조회
    const [krPricesRaw, usPrices] = await Promise.all([
      krNormCodes.length > 0
        ? fetchNaverCurrentPrices(krNormCodes.map((c) => ({ code: c, name: c })))
        : Promise.resolve({} as Record<string, number>),
      usCodes.length > 0
        ? fetchYahooCurrentPrices(usCodes)
        : Promise.resolve({} as Record<string, number>),
    ]);

    // 정규화 코드 키를 원본 코드 키로 복원 (포지션 stockCode와 매핑 일치)
    const krPrices: Record<string, number> = {};
    for (const [norm, price] of Object.entries(krPricesRaw)) {
      const orig = krNormMap[norm] ?? norm;
      krPrices[orig] = price;
    }

    const prices: Record<string, number> = { ...krPrices, ...usPrices };

    console.log(
      `[risk/prices] KR ${Object.keys(krPrices).length}/${krNormCodes.length}` +
      `, US ${Object.keys(usPrices).length}/${usCodes.length} 조회 완료`
    );

    return NextResponse.json({
      prices,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[risk/prices GET]", err);
    return NextResponse.json({ error: "현재가 조회 실패" }, { status: 500 });
  }
}
