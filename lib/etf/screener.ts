// ETF 스크리너 통합 서버 함수
// 서버 전용 모듈 — RSC 페이지 및 API Route에서만 import
//
// 데이터 흐름:
//   calcEtfRs(market)       → RS 전체 종목
//   calcEtfMomentum(market) → 모멘텀 Top N
//   calcMaFlags(tickers)    → 최근 60일 가격으로 MA10/20/50 위/아래 계산
//   joinScreenerData(...)   → 세 데이터를 symbol 기준으로 조인 → ScreenerResult[]

import {
  fetchYahooHistory,
  toYahooKrSymbol,
  type YahooHistoricalBar,
} from "@/lib/fetchers/yahoo";
import { sma } from "@/lib/indicators/utils";
import { readCache, writeCache } from "@/lib/cache";
import { calcEtfRs } from "@/lib/etf/rs";
import { calcEtfMomentum } from "@/lib/etf/momentum";
import params from "@/config/params.json";
import krTickers from "@/config/tickers_kr_etf.json";
import usTickers from "@/config/tickers_us_etf_themes.json";
import type {
  EtfRsResponse,
  EtfMomentumResponse,
  ScreenerResult,
  ScreenerResponse,
} from "@/types";

/** tickers JSON 공통 형식 */
interface TickerEntry {
  symbol: string;
  name: string;
  exchange?: string;
  category: string;
}

/** 종목별 MA 위/아래 여부 + 현재가 */
interface MaFlags {
  aboveMa10: boolean | null;   // null = 데이터 부족
  aboveMa20: boolean | null;
  aboveMa50: boolean | null;
  currentPrice: number | null;
}

// ────────────────────────────────────────────────────────────────
// 내부 헬퍼 함수
// ────────────────────────────────────────────────────────────────

/**
 * MA10/20/50 위/아래 여부를 계산하여 심볼 → MaFlags 맵으로 반환
 * 최근 60일 가격만 필요 — RS용 756일보다 훨씬 가벼움
 */
async function calcMaFlags(
  tickers: TickerEntry[],
  market: "kr" | "us"
): Promise<Map<string, MaFlags>> {
  const startDate = new Date();
  // 50일 MA + 여유 10일 = 60일
  startDate.setDate(startDate.getDate() - 60);

  // 모든 종목 60일 가격 병렬 수집
  const promises = tickers.map((t) => {
    const yahooSymbol = market === "kr"
      ? toYahooKrSymbol(t.symbol, (t.exchange ?? "KS") as "KS" | "KQ")
      : t.symbol;
    return fetchYahooHistory(yahooSymbol, startDate).then(
      (bars): { symbol: string; bars: YahooHistoricalBar[] } => ({ symbol: t.symbol, bars }),
      (): { symbol: string; bars: YahooHistoricalBar[] } => ({ symbol: t.symbol, bars: [] })
    );
  });

  const results = await Promise.all(promises);
  const flagsMap = new Map<string, MaFlags>();

  for (const { symbol, bars } of results) {
    if (bars.length === 0) {
      flagsMap.set(symbol, { aboveMa10: null, aboveMa20: null, aboveMa50: null, currentPrice: null });
      continue;
    }

    const prices = bars.map((b) => b.close);
    const currentPrice = prices[prices.length - 1];

    // sma()는 배열 전체에 대한 이동평균 시리즈를 반환 — 마지막 값이 최신 MA
    const ma10Series = sma(prices, 10);
    const ma20Series = sma(prices, 20);
    const ma50Series = sma(prices, 50);

    const latestMa10 = ma10Series[ma10Series.length - 1];
    const latestMa20 = ma20Series[ma20Series.length - 1];
    const latestMa50 = ma50Series[ma50Series.length - 1];

    flagsMap.set(symbol, {
      aboveMa10: latestMa10 !== null ? currentPrice > latestMa10 : null,
      aboveMa20: latestMa20 !== null ? currentPrice > latestMa20 : null,
      aboveMa50: latestMa50 !== null ? currentPrice > latestMa50 : null,
      currentPrice,
    });
  }

  return flagsMap;
}

// ────────────────────────────────────────────────────────────────
// 순수 조인 함수 (단위 테스트용 export)
// ────────────────────────────────────────────────────────────────

/**
 * RS 응답 + 모멘텀 응답 + MA 플래그를 symbol 기준으로 조인
 * HTTP 호출이 없는 순수 함수 — 단위 테스트 가능
 *
 * @param rsResponse       - calcEtfRs() 반환값
 * @param momentumResponse - calcEtfMomentum() 반환값
 * @param maFlagsMap       - symbol → MaFlags 맵
 * @returns ScreenerResult[] (RS 순위 기준 정렬 유지)
 */
export function joinScreenerData(
  rsResponse: EtfRsResponse,
  momentumResponse: EtfMomentumResponse,
  maFlagsMap: Map<string, MaFlags>
): ScreenerResult[] {
  // 모멘텀 데이터 빠른 조회용 맵 구성
  const momentumMap = new Map(
    momentumResponse.topRankings.map((r) => [r.symbol, r])
  );

  return rsResponse.rankings.map((rs) => {
    const momentum = momentumMap.get(rs.symbol);
    const ma = maFlagsMap.get(rs.symbol);

    return {
      // RS 필드
      symbol: rs.symbol,
      name: rs.name,
      category: rs.category,
      rsRaw: rs.rsRaw,
      rsPercentile: rs.rsPercentile,
      rsRank: rs.rank,

      // 모멘텀 필드 — Top N 밖이면 null
      momentumScore: momentum?.score ?? null,
      momentumRank: momentum?.rank ?? null,
      momentumPeriods: momentum
        ? { m3: momentum.periods.m3, m6: momentum.periods.m6, m12: momentum.periods.m12 }
        : null,

      // MA 필드
      aboveMa10: ma?.aboveMa10 ?? null,
      aboveMa20: ma?.aboveMa20 ?? null,
      aboveMa50: ma?.aboveMa50 ?? null,
      currentPrice: ma?.currentPrice ?? null,
    };
  });
}

// ────────────────────────────────────────────────────────────────
// 메인 서버 함수
// ────────────────────────────────────────────────────────────────

/**
 * 특정 시장의 ETF 스크리너 통합 결과를 계산하고 캐시한다
 *
 * - calcEtfRs + calcEtfMomentum 병렬 호출 (각각 자체 캐시 사용)
 * - calcMaFlags로 MA10/20/50 위/아래 계산 (60일 경량 수집)
 * - joinScreenerData로 세 데이터 조인 → ScreenerResult[]
 * - 결과를 별도 캐시 키로 저장 (86400초 TTL)
 *
 * @param market - "kr" 또는 "us"
 */
export async function calcScreener(market: "kr" | "us"): Promise<ScreenerResponse> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cacheKey = `screener-${market}-${todayStr}`;

  // 캐시 히트 시 즉시 반환
  const cached = await readCache<ScreenerResponse>(cacheKey);
  if (cached) return cached;

  const tickers: TickerEntry[] = market === "kr"
    ? (krTickers as TickerEntry[])
    : (usTickers as TickerEntry[]);

  // RS + 모멘텀 + MA 플래그 병렬 수집
  // RS/모멘텀은 각자 캐시가 있어 실제로는 캐시 히트가 대부분
  const [rsResult, momentumResult, maFlagsMap] = await Promise.all([
    calcEtfRs(market),
    calcEtfMomentum(market),
    calcMaFlags(tickers, market),
  ]);

  // 세 데이터를 조인
  const results = joinScreenerData(rsResult, momentumResult, maFlagsMap);

  const joinedCount = results.filter((r) => r.momentumRank !== null).length;
  const dataEndDate = rsResult.meta.dataEndDate;

  const response: ScreenerResponse = {
    market,
    results,
    meta: {
      calculatedAt: new Date().toISOString(),
      totalSymbols: tickers.length,
      joinedWithMomentum: joinedCount,
      dataEndDate,
      benchmark: rsResult.meta.benchmark,
    },
  };

  await writeCache(cacheKey, response, params.cache.historicalTTLSeconds);
  return response;
}
