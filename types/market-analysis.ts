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

/** 날짜 범위 컨트롤 상태 */
export type PeriodLabel = "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "custom";

export interface DateRange {
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;    // "YYYY-MM-DD"
  period: PeriodLabel;
}
