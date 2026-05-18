/**
 * GET /api/portfolio/longterm/prices
 *
 * 중장기 포트폴리오 보유 종목의 현재가를 조회.
 *
 * 데이터 소스:
 *   - KR 종목 (FUND 제외): Naver Finance m.stock.naver.com/api/stock/{code}/basic
 *   - US 종목: Yahoo Finance v8/finance/chart (meta.regularMarketPrice)
 *   - FUND 타입: 미지원 → 결과에서 제외 (notFound에 포함)
 *
 * Yahoo Finance v7/finance/quote (quote 배치 엔드포인트) 는 2024년부터 유료 인증 요구.
 * v8/finance/chart 엔드포인트는 curl 기반으로 인증 없이 접근 가능.
 *
 * 쿼리 파라미터:
 *   account?: 계좌번호 — 계좌 필터 (생략 시 전체)
 *
 * 응답:
 *   { prices: Record<string, number>, fetchedAt: string, notFound: string[] }
 *
 * 캐시: priceTTLSeconds (기본 300초 = 5분)
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/longterm-store";
import { calcPositions } from "@/lib/portfolio/longterm-calc";
import { fetchYahooCurrentPrices } from "@/lib/fetchers/yahoo";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import type { LongtermTransaction } from "@/types/portfolio";
import { execFile } from "child_process";

// ─────────────────────────────────────────
// KR 종목 코드 보정 맵
// 거래 데이터에 잘못 입력된 코드 → 실제 Naver Finance 코드로 매핑
// 결과는 원래 코드로 반환하여 UI와의 정합성 유지
// ─────────────────────────────────────────
const KR_CODE_ALIASES: Record<string, string> = {
  "005939": "005930", // 삼성전자 (005939 → 005930 오기 보정)
};

// ─────────────────────────────────────────
// Naver Finance 현재가 조회 (KR 종목)
// ─────────────────────────────────────────

/**
 * Naver Finance 모바일 API에서 KR 종목 현재가 병렬 조회
 * 엔드포인트: https://m.stock.naver.com/api/stock/{code}/basic
 * closePrice 필드는 쉼표 포함 문자열 (예: "281,000")
 */
async function fetchNaverCurrentPrices(
  stockCodes: string[]
): Promise<Record<string, number>> {
  if (stockCodes.length === 0) return {};

  const entries = await Promise.all(
    stockCodes.map(async (code) => {
      try {
        // 보정 맵이 있으면 실제 코드로 조회하고, 결과는 원래 코드로 반환
        const queryCode = KR_CODE_ALIASES[code] ?? code;
        const price = await fetchNaverPriceViaCurl(queryCode);
        if (price != null && queryCode !== code) {
          console.log(`[naver] 코드 보정 적용: ${code} → ${queryCode} (${price})`);
        }
        return [code, price] as [string, number | null];
      } catch {
        return [code, null] as [string, number | null];
      }
    })
  );

  return Object.fromEntries(
    entries.filter(([, price]) => price != null) as [string, number][]
  );
}

/**
 * curl 서브프로세스로 Naver Finance 현재가 조회
 * Node.js fetch 대신 curl 사용 — 일부 환경에서 Naver API 접근 안정성 향상
 */
function fetchNaverPriceViaCurl(stockCode: string): Promise<number | null> {
  return new Promise((resolve) => {
    const url = `https://m.stock.naver.com/api/stock/${stockCode}/basic`;

    execFile(
      "curl",
      [
        "-s",
        "--max-time", "10",
        "-H", "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "-H", "Accept: application/json",
        "-H", "Referer: https://m.stock.naver.com/",
        url,
      ],
      { maxBuffer: 512 * 1024 },
      (error, stdout) => {
        if (error || !stdout.trim().startsWith("{")) {
          resolve(null);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          // closePrice: "281,000" 형태 → 쉼표 제거 후 정수 파싱
          const raw = data?.closePrice ?? data?.stockPrice;
          if (!raw) { resolve(null); return; }
          const price = parseInt(String(raw).replace(/,/g, ""), 10);
          resolve(!isNaN(price) && price > 0 ? price : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// ─────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get("account");

    // 거래 내역 → 현재 보유 포지션 계산
    let txs = readTransactions();
    if (account) txs = txs.filter((t: LongtermTransaction) => t.accountNo === account);
    const positions = calcPositions(txs);

    // US / KR / FUND 분리
    // FUND는 Naver/Yahoo 모두 미지원이므로 조회 스킵
    const usPositions   = positions.filter((p) => p.market === "US");
    const krPositions   = positions.filter((p) => p.market === "KR" && p.assetType !== "FUND");
    const fundPositions = positions.filter((p) => p.assetType === "FUND");

    const usSymbols = usPositions.map((p) => p.stockCode);
    const krCodes   = krPositions.map((p) => p.stockCode);

    // 캐시 키 — 계좌+심볼 목록 기준
    const allSymbols = [...usSymbols.sort(), ...krCodes.sort()];
    const cacheKey = `portfolio-longterm-prices-v2-${account ?? "all"}-${allSymbols.join("-")}`;

    const cached = await readCache<{ prices: Record<string, number>; fetchedAt: string; notFound: string[] }>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, source: "cache" });
    }

    // 병렬로 KR(Naver) + US(Yahoo v8 chart) 조회
    const [krPrices, usPrices] = await Promise.all([
      fetchNaverCurrentPrices(krCodes),
      fetchYahooCurrentPrices(usSymbols),
    ]);

    const prices: Record<string, number> = { ...krPrices, ...usPrices };

    // 조회 실패 심볼 수집
    const notFound: string[] = [
      // FUND는 구조적으로 미지원
      ...fundPositions.map((p) => p.stockCode),
      // KR 조회 실패
      ...krCodes.filter((c) => !(c in prices)),
      // US 조회 실패
      ...usSymbols.filter((s) => !(s in prices)),
    ];

    const result = {
      prices,
      fetchedAt: new Date().toISOString(),
      notFound: [...new Set(notFound)], // 중복 제거
    };

    // 조회 성공 심볼이 1개라도 있으면 캐시 저장
    if (Object.keys(prices).length > 0) {
      await writeCache(cacheKey, result, params.cache.priceTTLSeconds);
    }

    console.log(`[longterm/prices] KR ${Object.keys(krPrices).length}/${krCodes.length}, US ${Object.keys(usPrices).length}/${usSymbols.length} 조회 완료`);

    return NextResponse.json({ ...result, source: "api" });
  } catch (err) {
    console.error("[longterm/prices GET]", err);
    return NextResponse.json({ error: "현재가 조회 실패" }, { status: 500 });
  }
}
