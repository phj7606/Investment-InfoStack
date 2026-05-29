// 실시간/과거 환율 수집 클라이언트
// 서버 전용 모듈 — Next.js Route Handler에서만 import
// yahoo-finance2 패키지를 사용하여 USD/KRW, CAD/KRW 환율을 가져온다
// Yahoo Finance 환율 티커: KRW=X (USD/KRW), CADKRW=X (CAD/KRW)

// fetchYahooHistory는 yahoo.ts에 있으며, exchange-rate.ts를 import하지 않아 순환 참조 없음
import { fetchYahooHistory } from "@/lib/fetchers/yahoo";

// yahoo-finance2 v3 클래스 기반 API
// 주의: v3에서 quote() 단일 심볼 호출 방식 사용 (배열 + returnArray 옵션은 유효하지 않음)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YahooFinanceClass = require("yahoo-finance2").default as new () => {
  quote: (symbol: string) => Promise<{
    symbol: string;
    regularMarketPrice?: number;
    currency?: string;
  }>;
};

const yahooFinance = new YahooFinanceClass();

export interface ExchangeRateResult {
  usdKrw: number;    // 1 USD = N KRW
  cadKrw: number;    // 1 CAD = N KRW
  fetchedAt: string; // ISO 8601 조회 시각
}

// 환율 조회 실패 시 폴백으로 사용할 최근 안정 환율
// 실제 배포 환경에서 yahoo-finance2 타임아웃 시 차선책으로만 사용
const FALLBACK_RATES: Omit<ExchangeRateResult, "fetchedAt"> = {
  usdKrw: 1475.27,
  cadKrw: 1086.59,
};

/**
 * Yahoo Finance에서 USD/KRW, CAD/KRW 실시간 환율을 조회한다.
 *
 * - 단일 심볼 quote() 두 번 호출 (병렬) — v3 API에서 배열+returnArray 옵션 불가
 * - 조회 실패 시 FALLBACK_RATES를 반환하고 콘솔에 경고를 출력한다.
 * - regularMarketPrice가 없거나 비정상(≤0)이면 폴백을 적용한다.
 */
export async function fetchExchangeRates(): Promise<ExchangeRateResult> {
  const fetchedAt = new Date().toISOString();

  try {
    // 두 심볼을 병렬 조회 (KRW=X: USD/KRW, CADKRW=X: CAD/KRW)
    const [usdQuote, cadQuote] = await Promise.all([
      yahooFinance.quote("KRW=X"),
      yahooFinance.quote("CADKRW=X"),
    ]);

    const usdKrw = usdQuote?.regularMarketPrice && usdQuote.regularMarketPrice > 0
      ? Math.round(usdQuote.regularMarketPrice * 100) / 100
      : FALLBACK_RATES.usdKrw;

    const cadKrw = cadQuote?.regularMarketPrice && cadQuote.regularMarketPrice > 0
      ? Math.round(cadQuote.regularMarketPrice * 100) / 100
      : FALLBACK_RATES.cadKrw;

    return { usdKrw, cadKrw, fetchedAt };
  } catch (err) {
    // yahoo-finance2 네트워크 오류 시 폴백 환율 반환
    console.warn("[fetchExchangeRates] 환율 조회 실패, 폴백 사용:", err);
    return { ...FALLBACK_RATES, fetchedAt };
  }
}

/**
 * 특정 날짜의 USD/KRW, CAD/KRW 환율을 Yahoo Finance history에서 조회
 *
 * targetDate 이하 가장 최근 영업일 환율 반환 (주말/공휴일 자동 처리)
 * 조회 실패 시 FALLBACK_RATES 반환
 *
 * @param targetDate - "YYYY-MM-DD" 형식
 */
export async function fetchHistoricalExchangeRates(
  targetDate: string
): Promise<ExchangeRateResult> {
  const fetchedAt = new Date().toISOString();

  // targetDate 5일 전부터 조회 (주말/공휴일 포함)
  const period1 = new Date(targetDate);
  period1.setDate(period1.getDate() - 5);
  const period2 = new Date(targetDate);
  period2.setDate(period2.getDate() + 2);

  try {
    const [usdBars, cadBars] = await Promise.all([
      fetchYahooHistory("KRW=X", period1, period2),
      fetchYahooHistory("CADKRW=X", period1, period2),
    ]);

    // targetDate 이하 가장 최근 bar 선택
    const usdBar = usdBars.filter((b) => b.date <= targetDate).pop();
    const cadBar = cadBars.filter((b) => b.date <= targetDate).pop();

    const usdKrw = usdBar?.close && usdBar.close > 0
      ? Math.round(usdBar.close * 100) / 100
      : FALLBACK_RATES.usdKrw;

    const cadKrw = cadBar?.close && cadBar.close > 0
      ? Math.round(cadBar.close * 100) / 100
      : FALLBACK_RATES.cadKrw;

    if (!usdBar) console.warn(`[fetchHistoricalExchangeRates] USD/KRW 없음 (${targetDate}), 폴백 사용`);
    if (!cadBar) console.warn(`[fetchHistoricalExchangeRates] CAD/KRW 없음 (${targetDate}), 폴백 사용`);

    return { usdKrw, cadKrw, fetchedAt };
  } catch (err) {
    console.warn("[fetchHistoricalExchangeRates] 조회 실패, 폴백 사용:", err);
    return { ...FALLBACK_RATES, fetchedAt };
  }
}
