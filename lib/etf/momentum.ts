// ETF 변동성 조정 모멘텀 랭킹 계산 서버 함수
// 서버 전용 모듈 — RSC 페이지 및 API Route에서만 import
//
// 데이터 흐름:
//   tickers JSON → Yahoo 히스토리 병렬 수집 → momentumRanking() → name/category enrichment → 캐시

import {
  fetchYahooHistory,
  toYahooKrSymbol,
  type YahooHistoricalBar,
} from "@/lib/fetchers/yahoo";
import { momentumRanking } from "@/lib/indicators/momentum";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import krTickers from "@/config/tickers_kr_etf.json";
import usTickers from "@/config/tickers_us_etf_themes.json";
import type { EtfMomentumResult, EtfMomentumResponse } from "@/types";

/** tickers JSON 배열의 공통 형식 */
interface TickerEntry {
  symbol: string;
  name: string;
  exchange?: string;
  category: string;
}

/**
 * 특정 시장의 ETF 변동성 조정 모멘텀 랭킹을 계산하고 캐시한다
 *
 * - 수집 기간: 오늘 기준 756일 전 (252×3 — warmup 여유 포함)
 * - momentumRanking()의 lookbackDays 안정화 사용 (기본: 10일)
 * - topN만 반환 (기본: 15종)
 *
 * @param market - "kr" (한국) 또는 "us" (미국)
 */
export async function calcEtfMomentum(market: "kr" | "us"): Promise<EtfMomentumResponse> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cacheKey = `etf-momentum-${market}-${todayStr}`;

  // 캐시 히트 시 즉시 반환
  const cached = await readCache<EtfMomentumResponse>(cacheKey);
  if (cached) return cached;

  // 756일 전부터 수집 (252일 모멘텀 + warmup 여유)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 756);

  const tickers: TickerEntry[] = market === "kr"
    ? (krTickers as TickerEntry[])
    : (usTickers as TickerEntry[]);

  // name/category 조회용 맵 구성
  const tickerMeta = new Map<string, { name: string; category: string }>(
    tickers.map((t) => [t.symbol, { name: t.name, category: t.category }])
  );

  // 모든 ETF 히스토리 병렬 수집
  const etfResultPromises = tickers.map((t) => {
    const yahooSymbol = market === "kr"
      ? toYahooKrSymbol(t.symbol, (t.exchange ?? "KS") as "KS" | "KQ")
      : t.symbol;
    return fetchYahooHistory(yahooSymbol, startDate).then(
      (bars) => ({ symbol: t.symbol, bars }),
      // 실패 시 빈 배열로 처리 — momentumRanking에서 자동 제외
      (): { symbol: string; bars: YahooHistoricalBar[] } => ({ symbol: t.symbol, bars: [] })
    );
  });

  const etfResults = await Promise.all(etfResultPromises);

  // symbol → 종가 배열 맵 구성 (momentumRanking 입력 형식)
  const pricesMap: Record<string, number[]> = {};
  let dataStartDate = todayStr;
  let dataEndDate = "2000-01-01";

  for (const { symbol, bars } of etfResults) {
    if (bars.length < 253) continue; // 12M 모멘텀 최소 요건
    pricesMap[symbol] = bars.map((b) => b.close);

    // 전체 데이터 범위 트래킹
    if (bars[0].date < dataStartDate) dataStartDate = bars[0].date;
    if (bars[bars.length - 1].date > dataEndDate) dataEndDate = bars[bars.length - 1].date;
  }

  const topN = params.momentum.topN;
  const lookbackDays = params.momentum.lookbackDays;

  // 모멘텀 랭킹 계산 (lib/indicators/momentum.ts 재사용)
  const ranked = momentumRanking(pricesMap, topN, lookbackDays);

  // symbol → name/category enrichment
  const topRankings: EtfMomentumResult[] = ranked.map((r) => {
    // momentumScore의 최신 상세 periods 값을 별도 계산
    // momentumRanking은 lookbackDays 평균 score만 반환하므로
    // 상세 뷰용 periods는 마지막 시점 단일 계산으로 보완
    const prices = pricesMap[r.symbol];
    const meta = tickerMeta.get(r.symbol) ?? { name: r.symbol, category: "unknown" };

    // 마지막 시점의 기간별 점수를 직접 계산 (상세 표시용)
    let m3 = 0, m6 = 0, m12 = 0;
    if (prices && prices.length >= 253) {
      const calcPeriod = (period: number): number => {
        if (prices.length < period + 1) return 0;
        const last = prices[prices.length - 1];
        const base = prices[prices.length - 1 - period];
        if (base === 0) return 0;
        const ret = (last - base) / base;
        const slice = prices.slice(prices.length - period - 1);
        const logRets: number[] = [];
        for (let i = 1; i < slice.length; i++) {
          if (slice[i - 1] > 0 && slice[i] > 0) {
            logRets.push(Math.log(slice[i] / slice[i - 1]));
          }
        }
        if (logRets.length === 0) return 0;
        const avg = logRets.reduce((s, v) => s + v, 0) / logRets.length;
        const variance = logRets.reduce((s, v) => s + (v - avg) ** 2, 0) / logRets.length;
        const vol = Math.sqrt(variance) * Math.sqrt(252);
        if (vol === 0) return 0;
        return ret / vol;
      };
      m3  = parseFloat(calcPeriod(63).toFixed(4));
      m6  = parseFloat(calcPeriod(126).toFixed(4));
      m12 = parseFloat(calcPeriod(252).toFixed(4));
    }

    return {
      symbol: r.symbol,
      name: meta.name,
      category: meta.category,
      rank: r.rank,
      score: parseFloat(r.score.toFixed(4)),
      periods: { m3, m6, m12 },
    };
  });

  const response: EtfMomentumResponse = {
    market,
    topRankings,
    meta: {
      calculatedAt: new Date().toISOString(),
      topN,
      lookbackDays,
      dataStartDate,
      dataEndDate,
    },
  };

  await writeCache(cacheKey, response, params.cache.historicalTTLSeconds);
  return response;
}
