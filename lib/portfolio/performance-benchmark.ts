/**
 * 포트폴리오 성과 분석 — 벤치마크 데이터 수집 모듈
 *
 * 역할: KOSPI / S&P500 / NASDAQ 월별 수익률 데이터 제공
 *
 * 설계:
 * - fetchYahooHistory()를 재사용하여 일별 OHLCV 조회
 * - 월별로 그룹화 후 각 월의 마지막 영업일 종가 선택
 * - Dec 2025 종가를 기준(index = 0%)으로 누적 수익률 계산
 * - 개별 심볼 실패 시 빈 배열 fallback → 전체 API 실패 차단
 */

import { fetchYahooHistory } from "@/lib/fetchers/yahoo";
import type { BenchmarkMonthPoint } from "@/types/portfolio";

// ─────────────────────────────────────────
// 상수
// ─────────────────────────────────────────

/** 벤치마크 심볼 */
const SYMBOLS = {
  KOSPI:   "^KS11",
  SP500:   "^GSPC",
  NASDAQ:  "^IXIC",
} as const;

/**
 * 데이터 조회 시작일 — Dec 2025 기준점을 포함해야 하므로 Dec 2025 초부터
 * Dec 2025 종가(마지막 영업일)를 기준으로 누적 수익률을 계산
 */
const FETCH_START = "2025-12-01";

// ─────────────────────────────────────────
// 핵심 계산
// ─────────────────────────────────────────

/**
 * 일별 OHLCV 배열을 월별 마지막 영업일 종가로 집계
 *
 * @param bars - fetchYahooHistory() 반환값 (날짜 오름차순)
 * @returns { [period: "YYYY-MM"]: number } 맵
 */
function groupByMonthLastClose(
  bars: { date: string; close: number }[]
): Map<string, number> {
  const monthMap = new Map<string, number>();

  for (const bar of bars) {
    const period = bar.date.slice(0, 7); // "YYYY-MM"
    // 날짜 오름차순이므로 마지막으로 덮어쓰면 월의 마지막 영업일 종가가 됨
    monthMap.set(period, bar.close);
  }

  return monthMap;
}

/**
 * 월별 종가 맵을 BenchmarkMonthPoint[] 배열로 변환
 *
 * @param monthMap  - period → 종가 맵
 * @param decClose  - Dec 2025 마지막 영업일 종가 (기준점)
 * @param startPeriod - 포함할 첫 번째 period ("2026-01")
 * @returns BenchmarkMonthPoint[] (Jan 2026부터 현재까지)
 */
function buildBenchmarkPoints(
  monthMap: Map<string, number>,
  decClose: number,
  startPeriod: string
): BenchmarkMonthPoint[] {
  if (decClose <= 0) return [];

  // 포함 대상 period만 필터 (Dec 2025 제외, Jan 2026부터)
  const periods = Array.from(monthMap.keys())
    .filter((p) => p >= startPeriod)
    .sort();

  const points: BenchmarkMonthPoint[] = [];
  let prevClose = decClose; // 전월말 종가 (첫 달은 Dec 2025)

  for (const period of periods) {
    const close = monthMap.get(period) ?? 0;
    if (close <= 0) {
      prevClose = close > 0 ? close : prevClose;
      continue;
    }

    // 전월 대비 수익률 (MoM%)
    const momReturnPct = prevClose > 0
      ? ((close - prevClose) / prevClose) * 100
      : 0;

    // 누적 수익률 (Dec 2025 기준, Dec 2025 = 0%)
    const cumReturnPct = ((close - decClose) / decClose) * 100;

    points.push({
      period,
      momReturnPct: Math.round(momReturnPct * 100) / 100,
      cumReturnPct: Math.round(cumReturnPct * 100) / 100,
    });

    prevClose = close;
  }

  return points;
}

// ─────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────

/**
 * 단일 벤치마크 심볼의 월별 수익률 데이터 조회
 *
 * @param symbol      - Yahoo Finance 심볼 (예: "^KS11")
 * @param startPeriod - 반환할 첫 번째 period (예: "2026-01")
 * @returns BenchmarkMonthPoint[] 또는 빈 배열 (조회 실패 시)
 */
export async function fetchBenchmarkMonthlyReturns(
  symbol: string,
  startPeriod: string = "2026-01"
): Promise<BenchmarkMonthPoint[]> {
  try {
    const bars = await fetchYahooHistory(symbol, FETCH_START);

    if (bars.length === 0) {
      console.warn(`[benchmark] 데이터 없음: ${symbol}`);
      return [];
    }

    const monthMap = groupByMonthLastClose(bars);

    // Dec 2025 종가 추출 (기준점)
    const decClose = monthMap.get("2025-12") ?? 0;
    if (decClose <= 0) {
      console.warn(`[benchmark] Dec 2025 종가 없음: ${symbol}`);
      return [];
    }

    return buildBenchmarkPoints(monthMap, decClose, startPeriod);
  } catch (err) {
    // 개별 실패 시 빈 배열 반환 — 전체 API 실패 차단
    console.warn(`[benchmark] 조회 실패: ${symbol}`, err);
    return [];
  }
}

export interface AllBenchmarks {
  kospi:  BenchmarkMonthPoint[];
  sp500:  BenchmarkMonthPoint[];
  nasdaq: BenchmarkMonthPoint[];
}

/**
 * KOSPI / S&P500 / NASDAQ 3개 벤치마크를 병렬 조회
 *
 * 개별 실패 시 빈 배열 fallback — 일부 실패해도 나머지 데이터는 표시
 */
export async function fetchAllBenchmarks(
  startPeriod: string = "2026-01"
): Promise<AllBenchmarks> {
  const [kospi, sp500, nasdaq] = await Promise.all([
    fetchBenchmarkMonthlyReturns(SYMBOLS.KOSPI, startPeriod),
    fetchBenchmarkMonthlyReturns(SYMBOLS.SP500, startPeriod),
    fetchBenchmarkMonthlyReturns(SYMBOLS.NASDAQ, startPeriod),
  ]);

  return { kospi, sp500, nasdaq };
}
