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
export async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
  if (symbols.length === 0) return [];

  // returnArray: true 옵션으로 배열 반환 타입을 명시적으로 지정
  const quotes = await yahooFinance.quote(symbols, { returnArray: true });

  const now = new Date().toISOString();

  return quotes
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
 * 단일 심볼의 OHLCV 시계열 조회
 * auto_adjust=True 동작: 반환값은 수정 종가 기준 (yahoo-finance2 기본값)
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
  // period2 미지정 시 오늘 날짜를 기본값으로 설정
  // yahoo-finance2 내부 스키마 검증이 period2를 필수로 요구하기 때문
  const opts: { period1: Date; period2: Date; interval: string } = {
    period1: period1 instanceof Date ? period1 : new Date(period1),
    period2: period2
      ? period2 instanceof Date ? period2 : new Date(period2)
      : new Date(),
    interval: "1d",
  };

  const rows = await yahooFinance.historical(symbol, opts);

  return rows
    .filter((row) => row.close != null)
    .map((row) => ({
      // toISOString()으로 "YYYY-MM-DDT..." 형태에서 날짜 부분만 추출
      date: row.date.toISOString().slice(0, 10),
      open: row.open ?? row.close,
      high: row.high ?? row.close,
      low: row.low ?? row.close,
      close: row.close,
      volume: row.volume ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
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
