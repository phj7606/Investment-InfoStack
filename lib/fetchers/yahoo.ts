// Yahoo Finance 데이터 수집 클라이언트
// 서버 전용 모듈 — Next.js Route Handler에서만 import
// yahoo-finance2 패키지를 사용하여 현재가 스냅샷 및 OHLCV 시계열을 가져온다
// auto_adjust=true 동작: yahooFinance.historical()는 기본적으로 분할/배당 조정가를 반환

// yahoo-finance2 v3부터 클래스 기반 API로 변경됨
// require(".default")는 YahooFinance 클래스 자체를 반환하므로 인스턴스를 생성해야 한다
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require("yahoo-finance2").default as new () => {
  quote: (symbols: string[], opts?: { returnArray: true }) => Promise<Array<{
    symbol: string;
    shortName?: string;
    longName?: string;
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    regularMarketVolume?: number;
    currency?: string;
  }>>;
  historical: (
    symbol: string,
    opts: { period1: Date; period2?: Date; interval?: string }
  ) => Promise<Array<{
    date: Date;
    open?: number;
    high?: number;
    low?: number;
    close: number;
    volume?: number;
  }>>;
  // chart() — historical()의 내부 구현체. null close row에서 에러를 던지지 않으므로 직접 사용
  chart: (
    symbol: string,
    opts: { period1: Date; period2?: Date; interval?: string }
  ) => Promise<{
    meta: {
      regularMarketPrice?: number;
      regularMarketTime?: Date;
      chartPreviousClose?: number;
    };
    quotes: Array<{
      date: Date;
      open?: number | null;
      high?: number | null;
      low?: number | null;
      close?: number | null;
      adjclose?: number | null;
      volume?: number | null;
    }>;
  }>;
  // 기업명 또는 키워드로 종목 검색 — 티커 자동 완성에 사용
  search: (query: string, opts?: { newsCount?: number; quotesCount?: number }) => Promise<{
    quotes: Array<{
      symbol: string;
      shortname?: string;
      longname?: string;
      // "Equity" | "ETF" | "MUTUALFUND" | "INDEX" 등
      typeDisp?: string;
      // 거래소 표시명 (예: "NYSE", "NasdaqGS", "KSE")
      exchDisp?: string;
    }>;
  }>;
};

// 모듈 수준 싱글톤 인스턴스 (매 호출마다 재생성 방지)
const yahooFinance = new YahooFinanceClass();

/** 단일 종목 현재가 스냅샷 */
export interface YahooQuote {
  symbol: string;
  name: string;
  price: number;
  // 전일 대비 등락률 (%)
  changePercent: number;
  volume: number;
  currency: string;
  // 데이터 기준 시각 (ISO 8601)
  updatedAt: string;
}

/** OHLCV 일간 시계열 데이터 포인트 */
export interface YahooHistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  // 수정 종가 (분할/배당 조정 완료)
  close: number;
  volume: number;
}

/**
 * 복수 심볼의 현재가를 일괄 조회 (단일 요청)
 * @param symbols - 티커 심볼 배열 (예: ["SPY", "QQQ", "XLK"])
 * @returns YahooQuote 배열 — 조회 실패한 심볼은 결과에서 제외
 */
/**
 * Yahoo Finance v7 quote API를 fetch로 호출 (curl 대체)
 * fetchYahooQuotes 의 fallback — yahoo-finance2 라이브러리가 실패할 때 사용
 */
async function fetchYahooQuotesViaCurl(symbols: string[]): Promise<YahooQuote[]> {
  const symbolsParam = encodeURIComponent(symbols.join(","));
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsParam}&fields=regularMarketPrice,regularMarketChangePercent,regularMarketVolume,shortName,currency`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Yahoo quote HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith("{")) {
    throw new Error(`Yahoo quote 응답이 JSON이 아님: ${text.slice(0, 80)}`);
  }

  const data = JSON.parse(text);
  const results: Array<{
    symbol: string;
    shortName?: string;
    longName?: string;
    regularMarketPrice?: number;
    regularMarketChangePercent?: number;
    regularMarketVolume?: number;
    currency?: string;
  }> = data?.quoteResponse?.result ?? [];

  const now = new Date().toISOString();
  return results
    .filter((q) => q.regularMarketPrice != null)
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortName ?? q.longName ?? q.symbol,
      price: q.regularMarketPrice ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      volume: q.regularMarketVolume ?? 0,
      currency: q.currency ?? "USD",
      updatedAt: now,
    }));
}

/**
 * 복수 심볼의 현재가를 일괄 조회 (단일 요청)
 *
 * 우선순위:
 *   1. yahoo-finance2 라이브러리 — 정상 환경
 *   2. curl 서브프로세스 — Node.js HTTP가 TLS 핑거프린팅으로 차단될 때
 *
 * @param symbols - 티커 심볼 배열 (예: ["SPY", "QQQ", "069500.KS"])
 * @returns YahooQuote 배열 — 조회 실패한 심볼은 결과에서 제외
 */
export async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  if (symbols.length === 0) return [];

  // 1. yahoo-finance2 라이브러리 우선 시도
  try {
    const quotes = await yahooFinance.quote(symbols, { returnArray: true });
    const now = new Date().toISOString();
    const result = quotes
      .filter((q) => q.regularMarketPrice != null)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName ?? q.longName ?? q.symbol,
        price: q.regularMarketPrice ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        volume: q.regularMarketVolume ?? 0,
        currency: q.currency ?? "USD",
        updatedAt: now,
      }));
    if (result.length > 0) return result;
  } catch {
    // 라이브러리 실패 시 curl fallback으로 진행
  }

  // 2. curl 서브프로세스 fallback (TLS 차단 우회)
  return fetchYahooQuotesViaCurl(symbols);
}

/**
 * Yahoo Finance v8 chart API를 fetch로 호출 (curl 대체)
 *
 * Vercel 서버리스 환경 호환 — curl 서브프로세스 의존성 제거
 * Node.js 내장 fetch 사용 (Node.js 18+ 기본 제공)
 */
async function fetchYahooHistoryViaCurl(
  symbol: string,
  period1Date: Date,
  period2Date: Date
): Promise<YahooHistoricalBar[]> {
  const p1 = Math.floor(period1Date.getTime() / 1000);
  const p2 = Math.floor(period2Date.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${p2}&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Yahoo history HTTP ${res.status}`);
  const text = await res.text();

  // 응답이 JSON인지 확인 (HTML 오류 페이지 걸러내기)
  if (!text.trim().startsWith("{")) {
    throw new Error(`fetch 응답이 JSON이 아님: ${text.slice(0, 80)}`);
  }

  const data = JSON.parse(text);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("curl Yahoo API: result 없음");

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  // adjclose 배열이 있으면 수정 종가 사용 (배당/분할 조정), 없으면 일반 종가
  const adjCloses: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? quote.close ?? [];
  // Yahoo Finance CDN settlement window 동안 최근 종가가 null일 수 있음 → meta fallback
  const metaPrice: number | undefined = data?.chart?.result?.[0]?.meta?.regularMarketPrice;

  const bars: YahooHistoricalBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const rawClose = adjCloses[i] ?? quote.close?.[i];
    // 마지막 row이고 close null이면 meta 종가 사용
    const close = rawClose ?? (i === timestamps.length - 1 ? metaPrice : undefined);
    if (close == null || close <= 0) continue;
    const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    bars.push({
      date,
      open:   quote.open?.[i]   ?? close,
      high:   quote.high?.[i]   ?? close,
      low:    quote.low?.[i]    ?? close,
      close,
      volume: quote.volume?.[i] ?? 0,
    });
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 단일 심볼의 OHLCV 시계열 조회
 * auto_adjust=True 동작: 반환값은 수정 종가 기준 (yahoo-finance2 기본값)
 *
 * 우선순위:
 *   1. yahoo-finance2 라이브러리 (query2 서버) — 정상 환경에서 사용
 *   2. curl 서브프로세스 (query1 서버) — Node.js HTTP가 TLS 핑거프린팅으로 차단될 때
 *      curl은 OpenSSL TLS 구현체 사용 → Yahoo Finance 차단 우회 가능
 *
 * @param symbol  - 티커 심볼
 * @param period1 - 시작일 (Date 또는 "YYYY-MM-DD")
 * @param period2 - 종료일 (기본값: 오늘)
 * @returns YahooHistoricalBar 배열 (날짜 오름차순)
 */
export async function fetchYahooHistory(
  symbol: string,
  period1: Date | string,
  period2?: Date | string
): Promise<YahooHistoricalBar[]> {
  const period1Date = period1 instanceof Date ? period1 : new Date(period1);
  // period2를 하루 뒤 자정 UTC로 설정: "2026-06-16" → 2026-06-17T00:00:00Z
  // Yahoo Finance chart API는 period2를 exclusive upper bound로 처리하므로
  // endDate 당일 데이터(마켓 클로즈 타임스탬프)가 누락되지 않도록 +1일 버퍼 적용
  const period2Date = (() => {
    if (!period2) return new Date();
    const d = period2 instanceof Date ? new Date(period2) : new Date(period2);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  })();

  // 1. yahoo-finance2 라이브러리 chart() 직접 사용
  // historical()은 deprecated이며 null close row에서 에러 throw → chart()로 교체
  // Yahoo Finance CDN은 최근 종가를 배포하는 동안 quotes[].close를 null로 반환할 수 있음
  // meta.regularMarketPrice에는 이미 확정된 종가가 있으므로 마지막 row에 한해 fallback 사용
  try {
    const chartResult = await yahooFinance.chart(symbol, {
      period1: period1Date,
      period2: period2Date,
      interval: "1d",
    });

    const metaPrice = chartResult.meta?.regularMarketPrice;
    const quotes = chartResult.quotes ?? [];

    const bars = quotes
      .map((q, i) => {
        const close = q.close ?? (i === quotes.length - 1 ? metaPrice : undefined);
        if (close == null || close <= 0) return null;
        return {
          date: (q.date as Date).toISOString().slice(0, 10),
          open:   q.open   ?? close,
          high:   q.high   ?? close,
          low:    q.low    ?? close,
          close,
          volume: q.volume ?? 0,
        };
      })
      .filter((b): b is YahooHistoricalBar => b !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (bars.length > 0) return bars;
  } catch {
    // chart() 실패 시 fetch fallback으로 진행
  }

  // 2. curl 서브프로세스 fallback
  // Node.js HTTP 클라이언트가 Yahoo Finance TLS 핑거프린팅 차단에 걸릴 때 사용
  try {
    const bars = await fetchYahooHistoryViaCurl(symbol, period1Date, period2Date);
    if (bars.length > 0) {
      console.log(`[yahoo] curl fallback 성공: ${symbol} (${bars.length}건)`);
      return bars;
    }
  } catch (err) {
    console.warn(`[yahoo] curl fallback 실패: ${symbol}`, err);
  }

  return [];
}

/**
 * KRX 6자리 심볼을 Yahoo Finance 형식으로 변환
 * 기본적으로 KRX(유가증권시장) 상장 → ".KS" 접미사 사용
 * KOSDAQ 상장 ETF는 tickers JSON의 exchange 필드를 참조하여 분기
 *
 * @param krxSymbol - KRX 종목 코드 (예: "069500")
 * @param exchange  - "KS" (KRX/유가증권) | "KQ" (KOSDAQ)
 */
export function toYahooKrSymbol(
  krxSymbol: string,
  exchange: "KS" | "KQ" = "KS"
): string {
  return `${krxSymbol}.${exchange}`;
}

/**
 * Yahoo Finance v8/finance/chart API로 단일 심볼의 현재가 조회 (fetch 사용)
 *
 * v7/finance/quote (401 차단) 대신 v8/chart 의 meta.regularMarketPrice 필드 사용.
 * Vercel 서버리스 환경 호환 — curl 대신 Node.js 내장 fetch 사용
 *
 * @param symbol - 티커 심볼 (예: "TSLA", "SOXX")
 * @returns 현재가 (없으면 null)
 */
async function fetchYahooCurrentPriceViaCurl(symbol: string): Promise<number | null> {
  // range=5d로 최근 데이터 포함 요청, meta.regularMarketPrice로 실시간 가격 접근
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null;
    const data = JSON.parse(text);
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    // meta.regularMarketPrice = 현재 시세 (장중이면 실시간, 장 마감 후엔 종가)
    const price = result.meta?.regularMarketPrice ?? result.meta?.chartPreviousClose;
    return price != null && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * 특정 날짜의 US 종목 종가를 Yahoo Finance에서 조회
 *
 * targetDate 이하 가장 최근 영업일 종가를 반환 (주말/휴장일 자동 처리)
 *
 * @param symbols - 티커 배열 (예: ["TSLA", "SOXX"])
 * @param targetDate - "YYYY-MM-DD" 형식
 * @returns { [symbol]: closePrice }
 */
export async function fetchYahooHistoricalClosePrices(
  symbols: string[],
  targetDate: string
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  // targetDate 5일 전부터 조회 (주말/휴장일 포함)
  const period1 = new Date(targetDate);
  period1.setDate(period1.getDate() - 5);
  const period2 = new Date(targetDate);
  period2.setDate(period2.getDate() + 2); // 종료일 inclusive

  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      const bars = await fetchYahooHistory(symbol, period1, period2);
      // targetDate 이하 가장 최근 bar 선택
      const bar = bars.filter((b) => b.date <= targetDate).pop();
      return [symbol, bar?.close ?? null] as [string, number | null];
    })
  );

  return Object.fromEntries(
    entries.filter((e): e is [string, number] => e[1] != null)
  );
}

/**
 * 복수 US 심볼의 현재가를 Yahoo Finance v8 chart API로 병렬 조회
 * v7/finance/quote 대체용 — v8/chart는 인증 불필요
 *
 * @param symbols - 티커 배열 (예: ["TSLA", "SOXX", "NVDA"])
 * @returns { [symbol]: price } — 조회 실패 심볼은 포함 안 됨
 */
export async function fetchYahooCurrentPrices(
  symbols: string[]
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const price = await fetchYahooCurrentPriceViaCurl(symbol);
        return [symbol, price] as [string, number | null];
      } catch {
        return [symbol, null] as [string, number | null];
      }
    })
  );

  return Object.fromEntries(
    entries.filter(([, price]) => price != null) as [string, number][]
  );
}

/** Yahoo Finance HTTP 검색 결과 단일 항목 */
interface YahooSearchQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;  // "EQUITY" | "ETF" | "INDEX" 등
  typeDisp?: string;
  exchDisp?: string;
}

/**
 * Yahoo Finance 검색 API에 직접 HTTP 요청 (yahoo-finance2 라이브러리 우회)
 * yahoo-finance2의 schema validation이 한국어 응답에서 오류를 발생시키는 경우를 방지하기 위해
 * 직접 fetch를 사용한다.
 */
async function fetchYahooSearch(query: string): Promise<YahooSearchQuote[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&lang=en`;
  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo Finance가 일반 브라우저 요청처럼 인식하도록
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
      },
      // 5초 타임아웃
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // 응답 구조: { finance: { result: [{ quotes: [...] }] } }
    // 또는 직접: { quotes: [...] }
    return (
      data?.finance?.result?.[0]?.quotes ??
      data?.quotes ??
      []
    );
  } catch {
    return [];
  }
}

/**
 * 기업명 또는 키워드로 Yahoo Finance에서 티커 심볼을 검색
 *
 * @param query    - 검색어 (기업명 또는 티커, 예: "삼성전자", "Apple", "AAPL")
 * @param exchange - 거래소 ("KRX" | "NYSE" | "NASDAQ")
 * @returns { symbol, name } 또는 null (검색 결과 없음)
 */
export async function searchYahooTicker(
  query: string,
  exchange: "KRX" | "NYSE" | "NASDAQ"
): Promise<{ symbol: string; name: string } | null> {
  // yahoo-finance2 라이브러리 대신 직접 HTTP fetch 사용
  // → schema validation 오류 없이 안정적으로 동작
  const quotes = await fetchYahooSearch(query);

  if (exchange === "KRX") {
    // 한국 주식: .KS (유가증권) 또는 .KQ (KOSDAQ) 접미사 우선
    const krQuote =
      quotes.find((q) => q.symbol?.endsWith(".KS")) ??
      quotes.find((q) => q.symbol?.endsWith(".KQ"));

    if (krQuote) {
      return {
        symbol: krQuote.symbol,
        name: krQuote.shortname ?? krQuote.longname ?? krQuote.symbol,
      };
    }
  } else {
    // 미국 주식: 점(.)이 없는 순수 티커 + EQUITY 타입
    const targetExchanges =
      exchange === "NASDAQ"
        ? ["NasdaqGS", "NasdaqCM", "Nasdaq", "NASDAQ"]
        : ["NYSE", "NYSEArca", "New York"];

    // EQUITY + ETF 모두 허용 — INDEX, MUTUALFUND 등은 제외
    const isTradeableType = (q: YahooSearchQuote) =>
      q.quoteType === "EQUITY" || q.quoteType === "ETF";

    const usQuote =
      // 거래소 완전 일치
      quotes.find(
        (q) =>
          !q.symbol?.includes(".") &&
          isTradeableType(q) &&
          targetExchanges.some((ex) => q.exchDisp?.includes(ex))
      ) ??
      // 거래소 불문, EQUITY/ETF 타입 + 순수 티커
      quotes.find((q) => !q.symbol?.includes(".") && isTradeableType(q));

    if (usQuote) {
      return {
        symbol: usQuote.symbol,
        name: usQuote.shortname ?? usQuote.longname ?? usQuote.symbol,
      };
    }
  }

  return null;
}
