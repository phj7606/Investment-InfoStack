// 주가 성과 분석 API Route
// 종목 + 벤치마크의 히스토리컬 데이터를 수집하고 서버사이드에서 성과 지표를 계산해 반환
// 한국 주식: 네이버 금융 차트 API → fallback Yahoo .KS/.KQ → 벤치마크 ^KS11 (Yahoo, 안정적)
// 미국 주식: Yahoo Finance 직접 → 벤치마크 ^GSPC (S&P500) + ^IXIC (NASDAQ)

import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, searchYahooTicker } from "@/lib/fetchers/yahoo";
import { fetchNaverStockHistory, fetchKospiHistory, searchNaverFinanceTickers, NaverStockResult } from "@/lib/fetchers/krx";
import { readCache, writeCache } from "@/lib/cache";

// 캐시 TTL: 1시간 (성과 데이터는 장중에도 크게 바뀌지 않음)
const CACHE_TTL = 3600;

// ─── 응답 타입 정의 ──────────────────────────────────────────────────────────

/** 일별 차트 데이터 포인트 (정규화 가격 / 누적수익률 / MDD) */
export interface DailyBar {
  date: string;
  /** 정규화 가격: 시작일=100 기준 */
  stockNorm: number;
  bench1Norm: number;
  bench2Norm?: number;
  /** 누적 수익률 (%) */
  stockReturn: number;
  bench1Return: number;
  bench2Return?: number;
  /** MDD 시계열: 각 날짜의 고점 대비 낙폭 (%) */
  stockMdd: number;
  bench1Mdd: number;
  bench2Mdd?: number;
}

/** 월별 기하수익률 (월초→월말 가격 변화율, %) */
export interface MonthlyBar {
  month: string; // "YYYY-MM"
  stockReturn: number;
  bench1Return: number;
  bench2Return?: number;
}

/** 단일 자산의 성과 요약 지표 */
export interface AssetMetrics {
  label: string;
  /** 연환산 복합수익률 (%) */
  cagr: number;
  /** 전체 기간 총수익률 (%) */
  totalReturn: number;
  /** 연환산 변동성 (%) */
  volatility: number;
  /** 최대 낙폭 (%, 음수) */
  mdd: number;
  /** 샤프 비율 (무위험금리 0% 가정) */
  sharpe: number;
  /** 소르티노 비율 (하방 변동성 기준) */
  sortino: number;
  /** 칼마 비율 = CAGR / |MDD| */
  calmar: number;
  /** 베타 — bench1 대비 (종목에만 해당) */
  beta?: number;
  /** 피어슨 상관계수 — bench1 대비 (종목에만 해당) */
  correlation?: number;
  /** 양의 월간수익률 비율 (%) */
  winRate: number;
}

export interface StockPerformanceResult {
  ticker: string;
  exchange: string;
  /** 기업명 (Yahoo Finance 검색으로 자동 추출, 없으면 undefined) */
  companyName?: string;
  labels: {
    stock: string;  // ticker 또는 "ticker (기업명)" 형태
    bench1: string;
    bench2?: string;
  };
  daily: DailyBar[];
  monthly: MonthlyBar[];
  metrics: {
    stock: AssetMetrics;
    bench1: AssetMetrics;
    bench2?: AssetMetrics;
  };
}

// ─── 계산 헬퍼 ───────────────────────────────────────────────────────────────

/** MDD 시계열 계산: 각 날짜의 rolling high 대비 낙폭 (%) */
function calcMddSeries(prices: number[]): number[] {
  const result: number[] = [];
  let peak = prices[0];
  for (const p of prices) {
    if (p > peak) peak = p;
    // peak가 0이면 0 처리
    result.push(peak > 0 ? ((p - peak) / peak) * 100 : 0);
  }
  return result;
}

/**
 * 월별 수익률 계산: 전월 마지막 거래일 종가 → 당월 마지막 거래일 종가 기준 (%)
 * 첫 번째 월은 분석 시작일(데이터 첫 번째 가격) 대비
 *
 * 이전 방식(당월 첫 거래일 → 당월 마지막 거래일)은 월 경계 갭(전월 말↔당월 초 가격 차이)을
 * 누락하므로 월별 수익률 합산이 전체 수익률과 일치하지 않는 문제가 있었음
 */
function calcMonthlyReturns(
  dates: string[],
  prices: number[]
): { month: string; return: number }[] {
  // 각 월의 마지막 거래일 가격 추출 (날짜 오름차순이므로 덮어쓸 때마다 최신값으로 갱신)
  const monthEndMap = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) {
    monthEndMap.set(dates[i].slice(0, 7), prices[i]);
  }

  const months = Array.from(monthEndMap.entries()).sort(([a], [b]) => a.localeCompare(b));

  return months.map(([month, endPrice], i) => {
    // 첫 번째 월: 분석 시작가(첫 데이터 포인트) 대비
    // 이후 월: 전월 마지막 거래일 종가 대비
    const prevPrice = i === 0 ? prices[0] : months[i - 1][1];
    return {
      month,
      return: prevPrice > 0 ? ((endPrice / prevPrice - 1) * 100) : 0,
    };
  });
}

/** 두 수익률 시리즈의 피어슨 상관계수 */
function calcCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    varA += da * da;
    varB += db * db;
  }

  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? num / denom : 0;
}

/** 베타 계산: cov(stock, bench) / var(bench) */
function calcBeta(stockReturns: number[], benchReturns: number[]): number {
  const n = Math.min(stockReturns.length, benchReturns.length);
  if (n < 2) return 1;

  const meanBench = benchReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanStock = stockReturns.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let cov = 0, varBench = 0;
  for (let i = 0; i < n; i++) {
    cov += (stockReturns[i] - meanStock) * (benchReturns[i] - meanBench);
    varBench += (benchReturns[i] - meanBench) ** 2;
  }

  return varBench > 0 ? cov / varBench : 1;
}

/**
 * 단일 자산 성과 지표 계산
 * @param label - 자산명 (표시용)
 * @param prices - 일별 종가 배열 (오름차순)
 * @param dates - 날짜 배열 (YYYY-MM-DD)
 * @param benchPrices - 벤치마크 가격 (beta/correlation 계산용, undefined면 건너뜀)
 */
function calcAssetMetrics(
  label: string,
  prices: number[],
  dates: string[],
  benchPrices?: number[]
): AssetMetrics {
  const n = prices.length;

  // 데이터 불충분 시 기본값 반환
  if (n < 5) {
    return { label, cagr: 0, totalReturn: 0, volatility: 0, mdd: 0, sharpe: 0, sortino: 0, calmar: 0, winRate: 0 };
  }

  // 총수익률 (%)
  const totalReturn = (prices[n - 1] / prices[0] - 1) * 100;

  // CAGR: 캘린더 기준 연환산 (실제 날짜 차이 사용)
  const startDate = new Date(dates[0]);
  const endDate = new Date(dates[n - 1]);
  const calendarDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  const years = Math.max(calendarDays / 365.25, 1 / 12); // 최소 1개월
  const cagr = (Math.pow(prices[n - 1] / prices[0], 1 / years) - 1) * 100;

  // 일별 단순 수익률 (일반 계산용)
  const simpleReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    simpleReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  // 연환산 변동성: 로그 수익률 기반 (통계적으로 더 정확)
  const logReturns = simpleReturns.map((r) => Math.log(1 + r));
  const meanLog = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const logVariance = logReturns.reduce((s, v) => s + (v - meanLog) ** 2, 0) / (logReturns.length - 1);
  const volatility = Math.sqrt(logVariance * 252) * 100;

  // MDD (최대 낙폭, %)
  const mddSeries = calcMddSeries(prices);
  const mdd = Math.min(...mddSeries); // 음수값

  // 샤프 비율: CAGR / 연환산 변동성 (무위험금리 0% 가정)
  const sharpe = volatility > 0 ? cagr / volatility : 0;

  // 소르티노 비율: CAGR / 하방 변동성 (음의 일별 수익률만 사용)
  const negReturns = simpleReturns.filter((r) => r < 0);
  const downsideVol =
    negReturns.length > 0
      ? Math.sqrt((negReturns.reduce((s, r) => s + r * r, 0) / negReturns.length) * 252) * 100
      : 0.0001; // 0 나누기 방지
  const sortino = downsideVol > 0 ? cagr / downsideVol : 0;

  // 칼마 비율: CAGR / |MDD|
  const calmar = mdd !== 0 ? cagr / Math.abs(mdd) : 0;

  // 베타 & 상관계수 (벤치마크 제공 시)
  let beta: number | undefined;
  let correlation: number | undefined;
  if (benchPrices && benchPrices.length >= 2) {
    const benchReturns: number[] = [];
    for (let i = 1; i < Math.min(n, benchPrices.length); i++) {
      benchReturns.push((benchPrices[i] - benchPrices[i - 1]) / benchPrices[i - 1]);
    }
    beta = calcBeta(simpleReturns, benchReturns);
    correlation = calcCorrelation(simpleReturns, benchReturns);
  }

  // 월 승률: 양의 월간수익률 비율 (%)
  const monthlyRets = calcMonthlyReturns(dates, prices);
  const positiveMonths = monthlyRets.filter((m) => m.return > 0).length;
  const winRate = monthlyRets.length > 0 ? (positiveMonths / monthlyRets.length) * 100 : 0;

  return { label, cagr, totalReturn, volatility, mdd, sharpe, sortino, calmar, beta, correlation, winRate };
}

/** 날짜 + 종가를 가진 최소 바 인터페이스 (YahooHistoricalBar / KrxStockHistoryBar 모두 호환) */
interface PriceBar {
  date: string;
  close: number;
}

/** 날짜 교집합(inner join)으로 정렬된 배열 생성 */
function innerJoin(
  stock: PriceBar[],
  bench1: PriceBar[],
  bench2?: PriceBar[]
): { date: string; stockClose: number; bench1Close: number; bench2Close?: number }[] {
  const bench1Map = new Map(bench1.map((b) => [b.date, b.close]));
  const bench2Map = bench2 ? new Map(bench2.map((b) => [b.date, b.close])) : null;

  return stock
    .filter((s) => {
      // bench1에 날짜가 있고, bench2가 있으면 bench2에도 날짜가 있어야 함
      if (!bench1Map.has(s.date)) return false;
      if (bench2Map && !bench2Map.has(s.date)) return false;
      return true;
    })
    .map((s) => ({
      date: s.date,
      stockClose: s.close,
      bench1Close: bench1Map.get(s.date)!,
      bench2Close: bench2Map ? bench2Map.get(s.date) : undefined,
    }));
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, startDate, endDate } = body as {
      ticker: string;
      startDate: string;
      endDate: string;
    };
    // exchange는 자동 감지로 변경될 수 있으므로 let 사용
    let exchange = (body as { exchange: "KRX" | "NYSE" | "NASDAQ" }).exchange;

    if (!ticker || !exchange || !startDate || !endDate) {
      return NextResponse.json({ error: "ticker, exchange, startDate, endDate는 필수입니다." }, { status: 400 });
    }

    const inputRaw = ticker.trim();

    // ── 티커 심볼 확정 (기업명 입력 시 검색으로 티커 변환) ─────────────────
    // ASCII 문자(영문+숫자+기호)만이면 티커로 간주, 한글 등 포함이면 기업명 검색
    const looksLikeTicker = /^[A-Za-z0-9.\-^]+$/.test(inputRaw);
    // 한국어 문자 포함 여부: Naver 금융 검색 사용 여부 결정
    const containsKorean = /[\uAC00-\uD7A3]/.test(inputRaw);

    let resolvedTicker = inputRaw.toUpperCase();
    let companyName: string | undefined;

    if (!looksLikeTicker) {
      // 기업명 입력 처리
      // 한국어 쿼리 → 네이버 금융 자동완성 (Yahoo Finance보다 신뢰성 높음)
      // 영문 쿼리 → Yahoo Finance 검색 (기존 방식)
      let found: { ticker: string; name: string; foundExchange: "KRX" | "NYSE" | "NASDAQ" } | null = null;

      if (containsKorean) {
        // 한국어 기업명 → 네이버 금융에서 KRX 종목 코드 검색
        const naverResults = await searchNaverFinanceTickers(inputRaw);
        if (naverResults.length > 0) {
          const first = naverResults[0];
          found = {
            ticker: first.code,
            name: first.name,
            foundExchange: "KRX",
          };
        }
      }

      if (!found) {
        // 영문 기업명이거나 Naver 검색 실패 → Yahoo Finance로 fallback
        // 지정된 거래소 우선 시도 → 전체 거래소 순서로 확장
        const searchOrder: ("KRX" | "NYSE" | "NASDAQ")[] = [
          exchange,
          ...( ["KRX", "NYSE", "NASDAQ"] as const ).filter((e) => e !== exchange),
        ];

        for (const ex of searchOrder) {
          const yahooFound = await searchYahooTicker(inputRaw, ex);
          if (yahooFound) {
            found = {
              ticker: yahooFound.symbol.replace(/\.(KS|KQ)$/, ""),
              name: yahooFound.name,
              foundExchange: ex,
            };
            break;
          }
        }
      }

      if (!found) {
        return NextResponse.json(
          { error: `"${inputRaw}"에 해당하는 종목을 찾을 수 없습니다. 티커 심볼로 입력해보세요.` },
          { status: 404 }
        );
      }

      // 자동 감지된 거래소로 교체
      exchange = found.foundExchange;
      resolvedTicker = found.ticker;
      companyName = found.name;
    }

    // ── 벤치마크 심볼 결정 (exchange 확정 후) ───────────────────────────────
    const isKr = exchange === "KRX";
    const bench1Symbol = isKr ? "^KS11" : "^GSPC"; // KOSPI or S&P500
    const bench2Symbol = isKr ? null : "^IXIC";    // null(KR) or NASDAQ
    const bench1Label = isKr ? "KOSPI" : "S&P 500";
    const bench2Label = isKr ? undefined : "NASDAQ";

    // 캐시 키: 확정된 티커 기준 (기업명 입력이라도 티커로 캐시)
    const cacheKey = `stock-perf-${resolvedTicker}-${exchange}-${startDate}-${endDate}`;
    const cached = await readCache<StockPerformanceResult>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // ── 병렬 데이터 수집 ────────────────────────────────────────────────────
    // 한국 주식: 네이버 금융 fchart API (Yahoo Finance 차단 문제 해결)
    // KOSPI 벤치마크: Naver istock.nhn → KRX API → Yahoo 3단 fallback (2Y/5Y도 지원)
    // 미국 주식: Yahoo Finance 유지
    const bench1Promise = isKr
      // fetchKospiHistory: Naver fchart 우선, KRX fallback, Yahoo fallback (try-catch 처리됨)
      ? fetchKospiHistory(startDate, endDate).then((bars) =>
          bars.map((b) => ({ date: b.date, close: b.closePrice }))
        )
      : fetchYahooHistory(bench1Symbol, startDate, endDate);

    // KRX 종목은 NaverStockResult({ bars, name? })를 반환하므로 분리 처리
    // 미국 주식은 YahooHistoricalBar[] 그대로 반환 — PriceBar 인터페이스와 호환
    let naverResult: NaverStockResult | null = null;

    let [stockRawOrResult, bench1Raw, bench2Raw] = await Promise.all([
      isKr
        ? fetchNaverStockHistory(resolvedTicker, startDate, endDate)
        : fetchYahooHistory(resolvedTicker, startDate, endDate),
      bench1Promise,
      bench2Symbol ? fetchYahooHistory(bench2Symbol, startDate, endDate) : Promise.resolve(null),
    ]);

    // KRX: NaverStockResult에서 bars 분리 및 기업명 추출
    let stockRaw: PriceBar[];
    if (isKr) {
      naverResult = stockRawOrResult as NaverStockResult;
      stockRaw = naverResult.bars;
      // 티커 직접 입력(기업명 검색 없이 진입)한 경우 Naver XML에서 기업명 추출
      if (!companyName && naverResult.name) {
        companyName = naverResult.name;
      }
    } else {
      stockRaw = stockRawOrResult as PriceBar[];
    }

    // 미국 주식: 티커로 데이터를 못 찾으면 Yahoo 검색으로 한 번 더 시도
    if (!isKr && stockRaw.length === 0 && looksLikeTicker) {
      const found = await searchYahooTicker(inputRaw, exchange);
      if (found) {
        const searchedTicker = found.symbol.replace(/\.(KS|KQ)$/, "");
        const retryData = await fetchYahooHistory(searchedTicker, startDate, endDate);
        if (retryData.length > 0) {
          stockRaw = retryData;
          resolvedTicker = searchedTicker;
          companyName = found.name;
        }
      }
    }

    if (stockRaw.length === 0) {
      return NextResponse.json(
        { error: `종목 데이터를 찾을 수 없습니다: "${inputRaw}" (${exchange}). 티커 심볼을 확인해 주세요.` },
        { status: 404 }
      );
    }

    if (bench1Raw.length === 0) {
      return NextResponse.json(
        { error: `벤치마크(${bench1Label}) 데이터를 가져오지 못했습니다.` },
        { status: 500 }
      );
    }

    // ── 날짜 교집합 정렬 ─────────────────────────────────────────────────────
    const aligned = innerJoin(stockRaw, bench1Raw, bench2Raw ?? undefined);

    if (aligned.length < 5) {
      return NextResponse.json(
        { error: "기간 내 유효한 거래일이 충분하지 않습니다. 기간을 늘려주세요." },
        { status: 400 }
      );
    }

    const dates = aligned.map((d) => d.date);
    const stockPrices = aligned.map((d) => d.stockClose);
    const bench1Prices = aligned.map((d) => d.bench1Close);
    const bench2Prices = aligned.some((d) => d.bench2Close != null)
      ? (aligned.map((d) => d.bench2Close!) as number[])
      : undefined;

    // ── 시계열 계산 ──────────────────────────────────────────────────────────
    const stockNormBase = stockPrices[0];
    const bench1NormBase = bench1Prices[0];
    const bench2NormBase = bench2Prices ? bench2Prices[0] : undefined;

    const stockMddSeries = calcMddSeries(stockPrices);
    const bench1MddSeries = calcMddSeries(bench1Prices);
    const bench2MddSeries = bench2Prices ? calcMddSeries(bench2Prices) : undefined;

    const daily: DailyBar[] = aligned.map((row, i) => {
      const stockNorm = (row.stockClose / stockNormBase) * 100;
      const bench1Norm = (row.bench1Close / bench1NormBase) * 100;
      const bench2Norm = bench2NormBase && row.bench2Close != null
        ? (row.bench2Close / bench2NormBase) * 100
        : undefined;

      return {
        date: row.date,
        stockNorm,
        bench1Norm,
        bench2Norm,
        stockReturn: stockNorm - 100,
        bench1Return: bench1Norm - 100,
        bench2Return: bench2Norm != null ? bench2Norm - 100 : undefined,
        stockMdd: stockMddSeries[i],
        bench1Mdd: bench1MddSeries[i],
        bench2Mdd: bench2MddSeries ? bench2MddSeries[i] : undefined,
      };
    });

    // ── 월별 기하수익률 ──────────────────────────────────────────────────────
    const stockMonthly = calcMonthlyReturns(dates, stockPrices);
    const bench1Monthly = calcMonthlyReturns(dates, bench1Prices);
    const bench2Monthly = bench2Prices ? calcMonthlyReturns(dates, bench2Prices) : [];

    // 공통 월 기준으로 정렬 (stock 기준)
    const monthly: MonthlyBar[] = stockMonthly.map((sm) => {
      const b1 = bench1Monthly.find((m) => m.month === sm.month);
      const b2 = bench2Monthly.find((m) => m.month === sm.month);
      return {
        month: sm.month,
        stockReturn: sm.return,
        bench1Return: b1 ? b1.return : 0,
        bench2Return: b2 ? b2.return : undefined,
      };
    });

    // ── 성과 요약 지표 ───────────────────────────────────────────────────────
    const stockMetrics = calcAssetMetrics(resolvedTicker, stockPrices, dates, bench1Prices);
    const bench1Metrics = calcAssetMetrics(bench1Label, bench1Prices, dates);
    const bench2Metrics = bench2Prices
      ? calcAssetMetrics(bench2Label!, bench2Prices, dates)
      : undefined;

    // ── 월 승률을 이미 계산된 monthly 데이터에서 재추출 (일관성 보장) ────────
    const stockPositiveMonths = stockMonthly.filter((m) => m.return > 0).length;
    stockMetrics.winRate = stockMonthly.length > 0
      ? (stockPositiveMonths / stockMonthly.length) * 100
      : 0;

    // 차트 레이블: 기업명 있으면 "TICKER (기업명)" 형태로 표시
    const stockLabel = companyName
      ? `${resolvedTicker} (${companyName})`
      : resolvedTicker;

    const result: StockPerformanceResult = {
      ticker: resolvedTicker,
      exchange,
      companyName,
      labels: { stock: stockLabel, bench1: bench1Label, bench2: bench2Label },
      daily,
      monthly,
      metrics: {
        stock: stockMetrics,
        bench1: bench1Metrics,
        bench2: bench2Metrics,
      },
    };

    // 캐시 저장
    await writeCache(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[stock-performance] 오류:", err);
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    return NextResponse.json({ error: `데이터 수집 중 오류: ${message}` }, { status: 500 });
  }
}
