/**
 * 중장기 포트폴리오 현재가 조회 서비스
 *
 * 역할:
 *   longterm/prices API 라우트와 동일한 캐시를 공유하여
 *   Positions 탭과 Performance 탭이 항상 같은 가격을 보여주도록 보장한다.
 *
 * 설계 원칙:
 *   - 캐시 키: longterm/prices 라우트와 동일한 형식 사용
 *     `portfolio-longterm-prices-v2-all-{sorted symbols}`
 *   - 캐시 TTL: params.priceTTLSeconds (기본 300초 = 5분)
 *   - Positions 탭이 캐시를 채우면 Performance 탭은 그것을 그대로 읽음
 *   - 중복 Naver/Yahoo API 호출 제거
 */

import { readCache, writeCache } from "@/lib/cache";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { fetchYahooCurrentPrices } from "@/lib/fetchers/yahoo";
import params from "@/config/params.json";

interface PriceCacheEntry {
  prices: Record<string, number>;
  fetchedAt: string;
  notFound: string[];
}

/**
 * longterm/prices 라우트와 동일한 캐시 키 생성
 * account 없이 전체 기준으로 고정 (Performance는 계좌 구분 없이 전체 포지션)
 */
function buildCacheKey(krCodes: string[], usSymbols: string[]): string {
  const allSymbols = [...usSymbols.sort(), ...krCodes.sort()];
  return `portfolio-longterm-prices-v2-all-${allSymbols.join("-")}`;
}

/**
 * 중장기 포트폴리오 현재가 조회
 *
 * Positions 탭(longterm/prices)과 동일한 캐시 키 사용 →
 * 두 탭 중 하나가 먼저 가격을 조회하면 나머지는 캐시를 재사용한다.
 *
 * @param krStocks  - KR 종목 { code, name }[] (FUND 제외)
 * @param usSymbols - US 종목 심볼 배열
 * @returns stockCode → 현재가 맵
 */
export async function getLongtermCurrentPrices(
  krStocks: { code: string; name: string }[],
  usSymbols: string[]
): Promise<Record<string, number>> {
  const krCodes = krStocks.map((s) => s.code);
  const cacheKey = buildCacheKey(krCodes, usSymbols);

  // longterm/prices 라우트가 이미 캐시를 채웠으면 그대로 재사용
  const cached = await readCache<PriceCacheEntry>(cacheKey);
  if (cached) return cached.prices;

  // 캐시 없음 → Naver(KR) + Yahoo(US) 병렬 조회
  const [krPrices, usPrices] = await Promise.all([
    krStocks.length > 0 ? fetchNaverCurrentPrices(krStocks) : Promise.resolve({}),
    usSymbols.length > 0 ? fetchYahooCurrentPrices(usSymbols) : Promise.resolve({}),
  ]);

  const prices: Record<string, number> = { ...krPrices, ...usPrices };

  const notFound = [
    ...krCodes.filter((c) => !(c in prices)),
    ...usSymbols.filter((s) => !(s in prices)),
  ];

  if (Object.keys(prices).length > 0) {
    await writeCache(cacheKey, { prices, fetchedAt: new Date().toISOString(), notFound }, params.cache.priceTTLSeconds);
  }

  return prices;
}
