// 미국 주식 데이터 수집 — yahoo-finance2 (quote + quoteSummary) + Alpha Vantage 폴백
// quoteSummary로 ROE·영업이익률·부채비율·EV/EBITDA 등 재무 지표 수집
// quoteSummary 실패 또는 null 필드 시 Alpha Vantage COMPANY_OVERVIEW로 폴백

import yahooFinance from "yahoo-finance2";

export interface UsStockData {
  source: { price: "Yahoo Finance"; financials: "Yahoo Finance" | "Alpha Vantage" | "N/A" };
  currentPrice: number | null;
  priceChange: number | null;
  changeRate: number | null;         // 등락률 (%)
  marketCap: number | null;          // 시가총액 (USD)
  per: number | null;                // Trailing PER
  pbr: number | null;                // Price-to-Book
  high52w: number | null;
  low52w: number | null;
  revenue: number | null;            // TTM 매출 (USD)
  operatingIncome: number | null;    // TTM 영업이익 (USD)
  // 스크리너 필터 게이트 + SKILL Step 4 메트릭에 사용되는 파생 지표
  roe: number | null;                // Return on Equity (%)
  operatingMargin: number | null;    // 영업이익률 (%)
  debtToEquity: number | null;       // 부채비율 (D/E, 100배 단위)
  evToEbitda: number | null;         // EV/EBITDA (배)
  revenueGrowth: number | null;      // 매출 성장률 YoY (%)
  freeCashflowYield: number | null;  // FCF 수익률 = FCF / 시총 × 100 (%)
}

// ── Alpha Vantage COMPANY_OVERVIEW 폴백 ───────────────────────────────────
// quoteSummary에서 특정 필드가 null일 때 Alpha Vantage로 보완
// 무료 플랜: 분당 5회 제한 → quoteSummary 성공 필드는 재호출하지 않음

interface AlphaVantageOverview {
  ReturnOnEquityTTM?: string;    // "0.3456" (소수)
  OperatingMarginTTM?: string;   // "0.1234"
  DebtToEquityRatio?: string;    // "1.23"
  EVToEBITDA?: string;           // "12.34"
  RevenueGrowthYOY?: string;     // "0.15" (소수)
}

async function fetchAlphaVantageOverview(ticker: string): Promise<AlphaVantageOverview | null> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=COMPANY_OVERVIEW`
              + `&symbol=${ticker}&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    // Alpha Vantage는 오류 시 {"Information": "..."} 반환 — 필드 없으면 null
    if (!data.Symbol) return null;
    return data as AlphaVantageOverview;
  } catch {
    return null;
  }
}

// 소수 문자열 → % 변환 ("0.1234" → 12.3)
function toPercent(val: string | number | undefined | null): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return null;
  // Yahoo Finance는 이미 소수(0.15 = 15%), Alpha Vantage도 동일
  return Math.round(n * 1000) / 10;
}

function toNumber(val: string | number | undefined | null): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? null : n;
}

// ── 통합 수집 함수 ────────────────────────────────────────────────────────────

export async function fetchUsStockData(ticker: string): Promise<UsStockData> {
  const fallback: UsStockData = {
    source: { price: "Yahoo Finance", financials: "N/A" },
    currentPrice: null, priceChange: null, changeRate: null,
    marketCap: null, per: null, pbr: null,
    high52w: null, low52w: null,
    revenue: null, operatingIncome: null,
    roe: null, operatingMargin: null, debtToEquity: null,
    evToEbitda: null, revenueGrowth: null, freeCashflowYield: null,
  };

  try {
    // quote + quoteSummary 병렬 호출 — 한쪽 실패해도 나머지는 표시
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [quoteRes, summaryRes] = await Promise.allSettled([
      yahooFinance.quote(ticker) as Promise<any>,
      yahooFinance.quoteSummary(ticker, {
        modules: ["financialData", "defaultKeyStatistics"],
      }) as Promise<any>,
    ]);

    const quote  = quoteRes.status  === "fulfilled" ? quoteRes.value  : null;
    const summary = summaryRes.status === "fulfilled" ? summaryRes.value : null;

    const fd  = summary?.financialData ?? null;       // financialData 모듈
    const dks = summary?.defaultKeyStatistics ?? null; // defaultKeyStatistics 모듈

    // quoteSummary에서 수집한 재무 지표
    let roe             = toPercent(fd?.returnOnEquity);
    let operatingMargin = toPercent(fd?.operatingMargins);
    // debtToEquity: Yahoo는 실수(예: 1.23 = 123%) — 그대로 사용 (단위: %)
    let debtToEquity    = toNumber(fd?.debtToEquity);
    let evToEbitda      = toNumber(dks?.enterpriseToEbitda);
    let revenueGrowth   = toPercent(fd?.revenueGrowth);

    // FCF 수익률 = 잉여현금흐름 / 시가총액 × 100
    const freeCashflow  = toNumber(fd?.freeCashflow);
    const marketCapVal  = (quote?.marketCap as number | undefined) ?? null;
    const freeCashflowYield = freeCashflow !== null && marketCapVal !== null && marketCapVal !== 0
      ? Math.round((freeCashflow / marketCapVal) * 1000) / 10
      : null;

    // quoteSummary null 필드에 대해 Alpha Vantage 폴백
    const needsFallback = roe === null || operatingMargin === null || evToEbitda === null;
    if (needsFallback) {
      const av = await fetchAlphaVantageOverview(ticker);
      if (av) {
        if (roe === null)             roe             = toPercent(av.ReturnOnEquityTTM);
        if (operatingMargin === null) operatingMargin = toPercent(av.OperatingMarginTTM);
        if (debtToEquity === null)    debtToEquity    = toNumber(av.DebtToEquityRatio);
        if (evToEbitda === null)      evToEbitda      = toNumber(av.EVToEBITDA);
        if (revenueGrowth === null)   revenueGrowth   = toPercent(av.RevenueGrowthYOY);
      }
    }

    const financialsSource = fd || dks ? "Yahoo Finance" : (needsFallback ? "Alpha Vantage" : "N/A");

    return {
      source: { price: "Yahoo Finance", financials: financialsSource },
      currentPrice:  (quote?.regularMarketPrice as number | undefined)        ?? null,
      priceChange:   (quote?.regularMarketChange as number | undefined)        ?? null,
      changeRate:    (quote?.regularMarketChangePercent as number | undefined) ?? null,
      marketCap:     marketCapVal,
      per:           (quote?.trailingPE as number | undefined)                ?? null,
      pbr:           (quote?.priceToBook as number | undefined)               ?? null,
      high52w:       (quote?.fiftyTwoWeekHigh as number | undefined)          ?? null,
      low52w:        (quote?.fiftyTwoWeekLow as number | undefined)           ?? null,
      revenue:       toNumber(fd?.totalRevenue),
      operatingIncome: toNumber(fd?.operatingCashflow), // TTM 영업현금흐름 (operatingIncome 미노출 시 대체)
      roe,
      operatingMargin,
      debtToEquity,
      evToEbitda,
      revenueGrowth,
      freeCashflowYield,
    };
  } catch {
    return fallback;
  }
}
