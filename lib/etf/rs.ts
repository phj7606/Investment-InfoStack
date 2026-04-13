// ETF Mansfield RS 랭킹 계산 서버 함수
// 서버 전용 모듈 — RSC 페이지 및 API Route에서만 import
//
// 데이터 흐름:
//   tickers JSON → Yahoo 히스토리 병렬 수집 → 날짜 정렬 → mansfieldRS() → rollingPercentileRank() → 캐시

import {
  fetchYahooHistory,
  toYahooKrSymbol,
  type YahooHistoricalBar,
} from "@/lib/fetchers/yahoo";
import { mansfieldRS, rollingPercentileRank } from "@/lib/indicators/utils";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import krTickers from "@/config/tickers_kr_etf.json";
import usTickers from "@/config/tickers_us_etf_themes.json";
import type { EtfRsResult, EtfRsResponse } from "@/types";

// 한국 ETF 벤치마크: KOSPI 지수
const KR_BENCHMARK = "^KS11";
// 미국 ETF 벤치마크: S&P 500 추종 SPY
const US_BENCHMARK = "SPY";

/** tickers JSON 배열의 공통 형식 */
interface TickerEntry {
  symbol: string;
  name: string;
  exchange?: string;
  category: string;
}

/**
 * 날짜-가격 맵 기반 시계열 정렬
 * 벤치마크 날짜 배열을 기준으로 ETF 가격을 교집합 날짜에 맞춘다.
 * 동일 인덱스 = 동일 날짜 보장 → mansfieldRS()에 전달 가능
 *
 * @param benchBars - 벤치마크 OHLCV 시계열
 * @param etfBars   - ETF OHLCV 시계열
 * @returns { dates, benchPrices, etfPrices } 교집합 정렬 결과
 */
function alignToDateMap(
  benchBars: YahooHistoricalBar[],
  etfBars: YahooHistoricalBar[]
): { dates: string[]; benchPrices: number[]; etfPrices: number[] } {
  // ETF 날짜→종가 맵 구성 (O(1) 검색)
  const etfMap = new Map<string, number>(etfBars.map((b) => [b.date, b.close]));

  const dates: string[] = [];
  const benchPrices: number[] = [];
  const etfPrices: number[] = [];

  for (const bar of benchBars) {
    const etfClose = etfMap.get(bar.date);
    // 벤치마크 날짜에 ETF 데이터가 없으면 해당 날짜 제외
    if (etfClose === undefined) continue;
    dates.push(bar.date);
    benchPrices.push(bar.close);
    etfPrices.push(etfClose);
  }

  return { dates, benchPrices, etfPrices };
}

/**
 * 특정 시장의 ETF Mansfield RS 랭킹을 계산하고 캐시한다
 *
 * - 수집 기간: 오늘 기준 756일 전 (MA warmup 252 + Percentile warmup 252 + 여유 252)
 * - 벤치마크 날짜 기준으로 교집합 정렬 후 RS 계산
 * - rsPercentile 기준 내림차순으로 순위 매김 (null은 최하위)
 *
 * @param market - "kr" (한국) 또는 "us" (미국)
 */
export async function calcEtfRs(market: "kr" | "us"): Promise<EtfRsResponse> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  // v3: rsAccelerationHistory 필드 추가로 캐시 무효화
  const cacheKey = `etf-rs-v3-${market}-${todayStr}`;

  // 캐시 히트 시 즉시 반환
  const cached = await readCache<EtfRsResponse>(cacheKey);
  if (cached) return cached;

  // 756일 전부터 수집 (252×3 — warmup 여유 포함)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 756);

  const benchmark = market === "kr" ? KR_BENCHMARK : US_BENCHMARK;
  const tickers: TickerEntry[] = market === "kr"
    ? (krTickers as TickerEntry[])
    : (usTickers as TickerEntry[]);

  // 벤치마크 + 모든 ETF 히스토리를 병렬 수집
  // Promise.allSettled: 개별 실패가 전체 계산을 막지 않도록
  const benchResultPromise = fetchYahooHistory(benchmark, startDate);
  const etfResultPromises = tickers.map((t) => {
    const yahooSymbol = market === "kr"
      ? toYahooKrSymbol(t.symbol, (t.exchange ?? "KS") as "KS" | "KQ")
      : t.symbol;
    return fetchYahooHistory(yahooSymbol, startDate);
  });

  const [benchResult, ...etfResults] = await Promise.allSettled([
    benchResultPromise,
    ...etfResultPromises,
  ]);

  if (benchResult.status === "rejected") {
    throw new Error(`벤치마크(${benchmark}) 데이터 수집 실패: ${benchResult.reason}`);
  }

  const benchBars = benchResult.value;
  if (benchBars.length === 0) {
    throw new Error(`벤치마크(${benchmark}) 데이터가 없습니다`);
  }

  const dataStartDate = benchBars[0].date;
  const dataEndDate = benchBars[benchBars.length - 1].date;

  // 각 ETF의 RS 계산
  const results: EtfRsResult[] = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const etfResult = etfResults[i];

    if (etfResult.status === "rejected" || etfResult.value.length === 0) {
      // 데이터 수집 실패 → rsRaw/rsPercentile null로 포함 (랭킹 최하위)
      results.push({ symbol: ticker.symbol, name: ticker.name, category: ticker.category, rsRaw: null, rsPercentile: null, rsRaw63: null, rsPercentile63: null, rank: 0, rsRawHistory: null, rsRawHistory63: null, rsAccelerationHistory: null });
      continue;
    }

    // 날짜 교집합 정렬
    const { dates, benchPrices, etfPrices } = alignToDateMap(benchBars, etfResult.value);
    if (benchPrices.length < params.indicators.mansfieldPeriodDays + 50) {
      // 최소 데이터 미충족
      results.push({ symbol: ticker.symbol, name: ticker.name, category: ticker.category, rsRaw: null, rsPercentile: null, rsRaw63: null, rsPercentile63: null, rank: 0, rsRawHistory: null, rsRawHistory63: null, rsAccelerationHistory: null });
      continue;
    }

    // Mansfield RS Raw 계산 — 252일(장기 구조) + 63일(단기 가속도)
    const rsRawSeries    = mansfieldRS(etfPrices, benchPrices, params.indicators.mansfieldPeriodDays);
    const rsRawSeries63  = mansfieldRS(etfPrices, benchPrices, 63);

    // 최신 RS Raw 값 — 각 시리즈에서 마지막 유효값 추출
    let latestRsRaw: number | null = null;
    for (let j = rsRawSeries.length - 1; j >= 0; j--) {
      if (rsRawSeries[j] !== null) { latestRsRaw = rsRawSeries[j]; break; }
    }
    let latestRsRaw63: number | null = null;
    for (let j = rsRawSeries63.length - 1; j >= 0; j--) {
      if (rsRawSeries63[j] !== null) { latestRsRaw63 = rsRawSeries63[j]; break; }
    }

    // Rolling Percentile 계산 — 252일(장기), 63일(단기)
    const validRsRaw = rsRawSeries.filter((v): v is number => v !== null);
    let latestRsPercentile: number | null = null;
    if (validRsRaw.length >= params.indicators.mansfieldPeriodDays) {
      const pctSeries = rollingPercentileRank(validRsRaw, params.indicators.mansfieldPeriodDays);
      for (let j = pctSeries.length - 1; j >= 0; j--) {
        if (pctSeries[j] !== null) { latestRsPercentile = pctSeries[j]; break; }
      }
    }
    const validRsRaw63 = rsRawSeries63.filter((v): v is number => v !== null);
    let latestRsPercentile63: number | null = null;
    if (validRsRaw63.length >= 63) {
      const pctSeries63 = rollingPercentileRank(validRsRaw63, 63);
      for (let j = pctSeries63.length - 1; j >= 0; j--) {
        if (pctSeries63[j] !== null) { latestRsPercentile63 = pctSeries63[j]; break; }
      }
    }

    // RS Raw 시계열 최근 252일치 수집 (Sheet 차트 표시용)
    // rsRawSeries에서 유효값만 날짜와 함께 역순 순회하여 최근 252개 추출
    const RS_HISTORY_WINDOW = 252;
    const rsRawHistory: { date: string; value: number }[] = [];
    for (let j = rsRawSeries.length - 1; j >= 0 && rsRawHistory.length < RS_HISTORY_WINDOW; j--) {
      const v = rsRawSeries[j];
      if (v !== null) {
        rsRawHistory.unshift({ date: dates[j], value: parseFloat(v.toFixed(2)) });
      }
    }

    // RS Raw(63) 시계열 최근 252일치 수집
    const rsRawHistory63: { date: string; value: number }[] = [];
    for (let j = rsRawSeries63.length - 1; j >= 0 && rsRawHistory63.length < RS_HISTORY_WINDOW; j--) {
      const v = rsRawSeries63[j];
      if (v !== null) {
        rsRawHistory63.unshift({ date: dates[j], value: parseFloat(v.toFixed(2)) });
      }
    }

    // RS 가속도 시계열 (RS63 - RS252) — 전략 4: 모멘텀 가속/감속 판단
    // 두 시리즈가 동일 인덱스에서 같은 날짜를 공유하므로 직접 차이 계산
    const rsAccelerationHistory: { date: string; value: number }[] = [];
    for (let j = rsRawSeries.length - 1; j >= 0 && rsAccelerationHistory.length < RS_HISTORY_WINDOW; j--) {
      const v252 = rsRawSeries[j];
      const v63  = rsRawSeries63[j];
      // 두 값 모두 유효할 때만 포함
      if (v252 !== null && v63 !== null) {
        rsAccelerationHistory.unshift({ date: dates[j], value: parseFloat((v63 - v252).toFixed(2)) });
      }
    }

    results.push({
      symbol: ticker.symbol,
      name: ticker.name,
      category: ticker.category,
      rsRaw: latestRsRaw !== null ? parseFloat(latestRsRaw.toFixed(4)) : null,
      rsPercentile: latestRsPercentile !== null ? parseFloat(latestRsPercentile.toFixed(2)) : null,
      rsRaw63: latestRsRaw63 !== null ? parseFloat(latestRsRaw63.toFixed(4)) : null,
      rsPercentile63: latestRsPercentile63 !== null ? parseFloat(latestRsPercentile63.toFixed(2)) : null,
      rank: 0, // 정렬 후 할당
      rsRawHistory: rsRawHistory.length > 0 ? rsRawHistory : null,
      rsRawHistory63: rsRawHistory63.length > 0 ? rsRawHistory63 : null,
      rsAccelerationHistory: rsAccelerationHistory.length > 0 ? rsAccelerationHistory : null,
    });
  }

  // rsPercentile63(단기 실질 순위) 내림차순 정렬 — null은 최하위
  // rsPercentile63이 없으면 rsPercentile(장기)으로 fallback
  results.sort((a, b) => {
    const aVal = a.rsPercentile63 ?? a.rsPercentile;
    const bVal = b.rsPercentile63 ?? b.rsPercentile;
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    return bVal - aVal;
  });

  // 순위 할당 (1위부터)
  results.forEach((r, idx) => { r.rank = idx + 1; });

  const validCount = results.filter((r) => r.rsPercentile !== null).length;

  const response: EtfRsResponse = {
    market,
    rankings: results,
    meta: {
      calculatedAt: new Date().toISOString(),
      benchmark,
      windowDays: params.indicators.mansfieldPeriodDays,
      dataStartDate,
      dataEndDate,
      totalSymbols: tickers.length,
      validSymbols: validCount,
    },
  };

  await writeCache(cacheKey, response, params.cache.historicalTTLSeconds);
  return response;
}
