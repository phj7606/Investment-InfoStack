/**
 * GET /api/portfolio/education/lt-prices
 *
 * Education 계좌 보유 종목의 현재가 조회 (Longterm prices 패턴 동일)
 * - KR 종목: Naver Finance
 * - US 종목: Yahoo Finance v8/finance/chart
 * - FUND: 미지원
 * - 캐시: 5분 TTL
 */

import { NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/educationTransactionsData";
import { calcPositions } from "@/lib/portfolio/longterm-calc";
import { fetchYahooCurrentPrices } from "@/lib/fetchers/yahoo";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";

export async function GET() {
  try {
    const txs       = await readTransactions();
    const positions = calcPositions(txs);

    // US / KR / FUND 분리
    const usPositions   = positions.filter((p) => p.market === "US");
    const krPositions   = positions.filter((p) => p.market === "KR" && p.assetType !== "FUND");
    const fundPositions = positions.filter((p) => p.assetType === "FUND");

    const usSymbols = usPositions.map((p) => p.stockCode);
    const krStocks  = krPositions.map((p) => ({ code: p.stockCode, name: p.stockName }));
    const krCodes   = krStocks.map((s) => s.code);

    // 캐시 키 — 심볼 목록 기준 (education 계좌 전용 prefix)
    const allSymbols = [...usSymbols.sort(), ...krCodes.sort()];
    const cacheKey   = `portfolio-education-prices-v1-${allSymbols.join("-")}`;

    const cached = await readCache<{ prices: Record<string, number>; fetchedAt: string; notFound: string[] }>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, source: "cache" });
    }

    // KR(Naver) + US(Yahoo v8) 병렬 조회
    const [krPrices, usPrices] = await Promise.all([
      fetchNaverCurrentPrices(krStocks),
      fetchYahooCurrentPrices(usSymbols),
    ]);

    const prices: Record<string, number> = { ...krPrices, ...usPrices };

    const notFound: string[] = [
      ...fundPositions.map((p) => p.stockCode),
      ...krCodes.filter((c) => !(c in prices)),
      ...usSymbols.filter((s) => !(s in prices)),
    ];

    const result = {
      prices,
      fetchedAt: new Date().toISOString(),
      notFound: [...new Set(notFound)],
    };

    if (Object.keys(prices).length > 0) {
      await writeCache(cacheKey, result, params.cache.priceTTLSeconds);
    }

    console.log(`[education/lt-prices] KR ${Object.keys(krPrices).length}/${krCodes.length}, US ${Object.keys(usPrices).length}/${usSymbols.length} 조회 완료`);

    return NextResponse.json({ ...result, source: "api" });
  } catch (err) {
    console.error("[education/lt-prices GET]", err);
    return NextResponse.json({ error: "현재가 조회 실패" }, { status: 500 });
  }
}
