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
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import type { LongtermTransaction } from "@/types/portfolio";

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
    const krStocks  = krPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
    const krCodes   = krStocks.map((s) => s.code);

    // 캐시 키 — 계좌+심볼 목록 기준
    const allSymbols = [...usSymbols.sort(), ...krCodes.sort()];
    const cacheKey = `portfolio-longterm-prices-v2-${account ?? "all"}-${allSymbols.join("-")}`;

    const cached = await readCache<{ prices: Record<string, number>; fetchedAt: string; notFound: string[] }>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, source: "cache" });
    }

    // 병렬로 KR(Naver, 코드 불일치 시 종목명으로 자동 검색) + US(Yahoo v8 chart) 조회
    const [krPrices, usPrices] = await Promise.all([
      fetchNaverCurrentPrices(krStocks),
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
