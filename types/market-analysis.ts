// 시장 분석 탭 — 미국 시장 5개 동기화 차트 타입 정의

/** 하루치 시장 데이터 포인트 (undefined = 해당 날짜에 데이터 없음) */
export interface UsAnalysisBar {
  /** 거래일 "YYYY-MM-DD" */
  date: string;
  /** S&P 500 종가 */
  spx?: number;
  /** NASDAQ 종가 */
  nasdaq?: number;
  /** CBOE VIX 지수 */
  vix?: number;
  /** CBOE VVIX 지수 (VIX의 변동성) */
  vvix?: number;
  /** FRED SDEX — S&P 500 Downside Risk Index */
  sdex?: number;
  /** ICE BofA US High Yield Option-Adjusted Spread (%) */
  hySpread?: number;
  /**
   * VVIX/VIX 비율 — 클라이언트에서 계산 후 주입
   * vvix / vix, 결측 시 undefined
   */
  vvixVixRatio?: number;
  /** SOFR (Secured Overnight Financing Rate, %) — FRED SOFR */
  sofr?: number;
  /** US 10-Year Treasury Yield (%) — FRED DGS10 */
  ust10y?: number;
  /** FED Funds Target Rate Upper Bound (%) — FRED DFEDTARU, 계단형 */
  fedFundsRate?: number;
  /** ICE BofA MOVE Index (채권 변동성) — Yahoo ^MOVE */
  moveIndex?: number;
  /** US 2-Year Treasury Yield (%) — FRED DGS2 */
  ust2y?: number;
  /** 10-Year Breakeven Inflation Rate (%) — FRED T10YIE (시장 내재 인플레이션 기대치) */
  breakeven10y?: number;
  /**
   * 10Y 실질 수익률 (%) — 클라이언트에서 계산 후 주입
   * realYield10y = ust10y - breakeven10y (Fisher 방정식 근사)
   */
  realYield10y?: number;
}

/** /api/market/us-analysis 응답 구조 */
export interface UsAnalysisResponse {
  data: UsAnalysisBar[];
  meta: {
    startDate: string;
    endDate: string;
    count: number;
  };
}

/** AI 인프라 투자 — Neocloud 주가 비교 데이터 포인트 */
export interface AiInfraBar {
  /** 거래일 "YYYY-MM-DD" */
  date: string;
  /** CoreWeave 정규화 주가 (첫 거래일 = 100) */
  crwv?: number;
  /** Nebius Group 정규화 주가 */
  nbis?: number;
  /** Iris Energy 정규화 주가 */
  iren?: number;
  /** CoreWeave 원가격 (tooltip 표시용) */
  crwvRaw?: number;
  /** Nebius Group 원가격 */
  nbisRaw?: number;
  /** Iris Energy 원가격 */
  irenRaw?: number;
}

/** /api/market/ai-infra 응답 구조 */
export interface AiInfraResponse {
  data: AiInfraBar[];
  meta: { startDate: string; endDate: string; count: number };
}

/** AI 인프라 뉴스 아이템 (Alpha Vantage + Yahoo 통합) */
export interface AiInfraNewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;              // Unix timestamp (초)
  summary?: string;
  relatedTickers?: string[];
  sentiment?: "Bullish" | "Bearish" | "Neutral";
  source: "alphavantage" | "yahoo";
}

/** 날짜 범위 컨트롤 상태 */
export type PeriodLabel = "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "custom";

export interface DateRange {
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;    // "YYYY-MM-DD"
  period: PeriodLabel;
}
