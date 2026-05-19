// 포트폴리오 관리 도메인 타입 정의
// 키움 REST API 응답 → 앱 내부 타입으로 정규화하여 사용

// ─────────────────────────────────────────
// 키움 API 원시 응답 타입
// ─────────────────────────────────────────

/** 키움 REST API 토큰 캐시 */
export interface KiwoomTokenCache {
  accessToken: string;
  expiresAt: string; // ISO 8601
}

/** 키움 REST API 보유 포지션 원시 응답 (opw00004 기반) */
export interface KiwoomRawPosition {
  종목코드: string;
  종목명: string;
  보유수량: string;
  매입단가: string;   // 평균 매수단가
  현재가: string;
  평가금액: string;
  평가손익: string;
  수익률: string;     // 소수점 포함 문자열 ex) "-8.09"
}

/** 키움 REST API 거래 내역 원시 응답 (opw00018 기반) */
export interface KiwoomRawTrade {
  주문일: string;     // YYYYMMDD
  종목코드: string;
  종목명: string;
  매매구분: string;   // "매수" | "매도"
  체결수량: string;
  체결단가: string;
  체결금액: string;
  손익: string;       // 매도 시에만 존재, 빈 문자열이면 0
  수익률: string;     // 매도 시에만 존재
}

// ─────────────────────────────────────────
// 앱 내부 정규화 타입
// ─────────────────────────────────────────

/** 보유 포지션 (정규화된 숫자 타입) */
export interface KiwoomPosition {
  stockCode: string;      // 종목 코드 (6자리)
  stockName: string;      // 종목명
  quantity: number;       // 보유 수량
  avgPrice: number;       // 평균 매수단가 (원)
  currentPrice: number;   // 현재가 (원)
  evalAmount: number;     // 평가금액 (원)
  profitLoss: number;     // 평가손익 (원, 음수 가능)
  profitLossPct: number;  // 수익률 (%, 소수점 2자리)
}

/** 체결 거래 내역 */
export interface Trade {
  date: string;               // 체결일 (YYYY-MM-DD)
  stockCode: string;
  stockName: string;
  tradeType: "BUY" | "SELL";
  quantity: number;
  price: number;              // 체결단가 (원)
  amount: number;             // 체결금액 (원)
  profitLoss: number | null;  // 매도 시 손익 (원), 매수는 null
  profitLossPct: number | null; // 매도 시 수익률 (%), 매수는 null
}

/** 종목별 완료 성과 (매도 1건 = 1 StockPerformance) */
export interface StockPerformance {
  stockCode: string;
  stockName: string;
  exitDate: string;         // 매도일 (YYYY-MM-DD) — Equity Curve 날짜 기준
  holdingDays: number;      // 보유 일수 (매수일~매도일)
  profitLoss: number;       // 손익 (원)
  profitLossPct: number;    // 수익률 (%)
  result: "WIN" | "LOSS";   // WIN: profitLossPct > 0, LOSS: ≤ 0
}

/** 계좌 전체 성과 요약 */
export interface PerformanceSummary {
  totalTrades: number;
  winCount: number;
  lossCount: number;

  /** 승률 (0~1). 거래 없으면 0 */
  winRate: number;

  /**
   * 손익비 (Profit Factor).
   * = 총 수익 합계 / |총 손실 합계|
   * 손실 없으면 Infinity (표시 "∞")
   */
  profitFactor: number;

  /** 평균 수익률 (WIN 거래만, %). 승리 없으면 0 */
  avgWinPct: number;

  /** 평균 손실률 (LOSS 거래만, 양수로 표현). 손실 없으면 0 */
  avgLossPct: number;

  /**
   * 기대값 EV (%).
   * = winRate × avgWinPct - (1 - winRate) × avgLossPct
   */
  expectedValue: number;

  /** 최대 연속 손실 횟수 */
  maxConsecutiveLoss: number;

  /** 전체 기간 누적 손익 (원) */
  cumulativeProfitLoss: number;

  /**
   * 최대 낙폭 MDD (%, 음수).
   * Equity Curve 기준. 거래 없으면 0
   */
  mdd: number;

  /** Equity Curve 시계열 (날짜 오름차순) */
  equityCurve: EquityCurvePoint[];

  /** 월별 수익률 (히트맵용) */
  monthlyReturns: MonthlyReturn[];
}

/** Equity Curve 시계열 포인트 */
export interface EquityCurvePoint {
  date: string;      // YYYY-MM-DD
  value: number;     // 해당 날짜까지의 누적 손익 (원)
}

/** 월별 수익률 히트맵 데이터 */
export interface MonthlyReturn {
  year: number;
  month: number;     // 1~12
  returnPct: number; // 해당 월 수익률 (%)
  profitLoss: number; // 해당 월 손익 합계 (원)
}

// ─────────────────────────────────────────
// 리스크 관리 설정
// ─────────────────────────────────────────

/**
 * 리스크 관리 설정 (사용자가 UI에서 직접 입력 → localStorage 저장)
 * Excel "Risk Management Account I" 시트 기반
 *
 * 주요 계산식:
 *   riskAmount        = totalCapital × multipleR
 *   oneTimeInvestment = totalCapital / (unit + 1)
 *   tenLosingStreak   = (1 - winRate)^10
 */
export interface RiskManagementConfig {
  /** 총 투자 원금 (원) */
  totalCapital: number;

  /**
   * Multiple R — 종목당 손실 허용 비율 (0~1).
   * 예) 0.02 = 2% (계좌 대비 종목당 최대 손실)
   */
  multipleR: number;

  /**
   * Cutoff — 종목당 손절 기준 비율 (0~1).
   * 예) 0.08 = 8% (Target profit = 3R)
   */
  cutoff: number;

  /** 시장 상태 — 거시 환경 판단 (1~5) */
  marketStatus: 1 | 2 | 3 | 4 | 5;

  /** 현재 시장 — 현재 세션 판단 (1~5) */
  currentMarket: 1 | 2 | 3 | 4 | 5;

  /**
   * Unit — 승률 기반 투자 단위 수.
   * oneTimeInvestment = totalCapital / (unit + 1)
   */
  unit: number;

  /** Unit Investment — 현재 실제 투자 단위 수 */
  unitInvestment: number;
}

/** localStorage 키 상수 (v2: 구 phaseAllocation 구조와 분리) */
export const RISK_MANAGEMENT_STORAGE_KEY = "portfolio-risk-management-config-v2";

/** 리스크 관리 설정 기본값 */
export const DEFAULT_RISK_CONFIG: RiskManagementConfig = {
  totalCapital: 0,
  multipleR: 0.02,
  cutoff: 0.08,
  marketStatus: 3,
  currentMarket: 3,
  unit: 3,
  unitInvestment: 3,
};

// ─────────────────────────────────────────
// 중장기 투자 계좌 타입
// ─────────────────────────────────────────

/**
 * 중장기 투자 거래 내역 (종목별 독립 관리 단위)
 *
 * 설계 원칙:
 * - KR/US 완전 분리: currency 필드로 구분, 절대 혼산하지 않음
 * - 부분 매도 지원: SELL 저장 시 realizedPL/avgCostAtSell 자동 계산 후 저장
 * - 성과 평가: SELL 거래 날짜 기준 월별/일별 집계 (전체·부분 매도 모두 동일 처리)
 */
export interface LongtermTransaction {
  id: string;                            // crypto.randomUUID()
  date: string;                          // YYYY-MM-DD
  accountNo: "4802" | "1635" | "1402" | "8654";
  market: "KR" | "US";
  assetType: "STOCK" | "FUND" | "ETF";
  tradeType: "BUY" | "SELL" | "DIVIDEND";
  stockCode: string;
  stockName: string;
  quantity: number;
  price: number;                         // 거래 단가 (KR=원화, US=USD)
  currency: "KRW" | "USD";
  amount: number;                        // 거래금액 (price × quantity)
  fee?: number;
  // SELL 저장 시 자동 계산
  realizedPL?: number;                   // (매도단가 - 평균매입단가) × 수량
  realizedPLPct?: number;               // 실현 수익률 %
  avgCostAtSell?: number;               // 매도 시점의 가중평균단가 (기록용)
  memo?: string;
}

/** 현재 보유 포지션 (거래 이력 집계 결과) */
export interface LongtermPosition {
  stockCode: string;
  stockName: string;
  market: "KR" | "US";
  assetType: "STOCK" | "FUND" | "ETF";
  accountNo: string;
  quantity: number;                      // 현재 잔여 수량
  avgCost: number;                       // 가중평균단가 (BUY 기준 누적)
  currentPrice?: number;                // 수동 입력 또는 향후 API
  currency: "KRW" | "USD";
  evalAmount: number;                    // currentPrice × quantity (현재가 없으면 avgCost 기준)
  evalPL: number;                        // evalAmount - avgCost × quantity
  evalPLPct: number;                     // evalPL / (avgCost × quantity) × 100
  totalRealizedPL: number;               // 이 종목의 누적 실현손익 합계
  targetWeight?: number;                // 리밸런싱 목표 비중 (0~1)
  currentWeight: number;                // 전체 포트폴리오 내 현재 비중
}

/** 리밸런싱 목표 비중 설정 (localStorage 저장) */
export interface RebalancingTarget {
  stockCode: string;
  stockName: string;
  targetWeight: number;                  // 0~1
}

/** localStorage 키 상수 */
export const LONGTERM_REBALANCING_KEY = "portfolio-longterm-rebalancing-v1";
export const LONGTERM_CURRENT_PRICES_KEY = "portfolio-longterm-prices-v1";

// ─────────────────────────────────────────
// API 응답 타입
// ─────────────────────────────────────────

export interface PositionsApiResponse {
  positions: KiwoomPosition[];
  fetchedAt: string; // ISO 8601
}

export interface TradesApiResponse {
  trades: Trade[];
  stockPerformances: StockPerformance[];
  summary: PerformanceSummary;
  fetchedAt: string; // ISO 8601
}

// ─────────────────────────────────────────
// 포트폴리오 성과 분석 타입 (Phase 10)
// ─────────────────────────────────────────

/** 단일 월 성과 포인트 — 엑셀(Jan~Apr) 또는 API(May+) 기반 */
export interface PerformanceMonthPoint {
  /** "YYYY-MM" 형식 */
  period: string;
  /** 월말 평가잔고 (KRW 또는 USD) */
  balance: number;
  /** 전월 대비 수익률 % (Modified Dietz 기반) */
  momPct: number;
  /** 누적 손익 (KRW 또는 USD) */
  cumPL: number;
  /** 누적 수익률 % */
  cumPct: number;
  /** 데이터 소스: "excel" = Jan~Apr 엑셀, "api" = May+ 동적 계산 */
  source: "excel" | "api";
}

/** 벤치마크 월별 성과 포인트 (Dec 2025 종가 기준 누적) */
export interface BenchmarkMonthPoint {
  /** "YYYY-MM" 형식 */
  period: string;
  /** 전월말 대비 수익률 % */
  momReturnPct: number;
  /** 누적 수익률 % (Dec 2025 종가 = 기준점 0%) */
  cumReturnPct: number;
}

/** 종목별 성과 포인트 — 엑셀에서 파싱하여 테이블 표시용 */
export interface StockMonthPerformance {
  /** 종목명 */
  stockName: string;
  /** KR: 6자리 종목코드, US: 심볼 */
  ticker: string;
  /** "KR" | "US" */
  market: "KR" | "US";
  /** 계좌번호 (엑셀 col 3 기준) */
  accountNo: string;
  /** 월별 성과: period → PerformanceMonthPoint */
  months: PerformanceMonthPoint[];
  /** 현재 전량 매도 완료 여부 */
  fullyExited: boolean;
}

/** /api/portfolio/performance GET 응답 루트 타입 */
export interface PortfolioPerformanceResponse {
  kr: {
    /** KR 포트폴리오 월별 합산 성과 (전체) */
    months: PerformanceMonthPoint[];
    /** KR 계좌별 월별 성과 { "4802": [...], "1635": [...], "1402": [...] } */
    byAccount: Record<string, PerformanceMonthPoint[]>;
    /** KOSPI 벤치마크 */
    benchmark: BenchmarkMonthPoint[];
    /** KR 종목별 상세 성과 (엑셀 기반 Jan~Apr, accountNo 포함) */
    stocks: StockMonthPerformance[];
  };
  us: {
    /** US 포트폴리오 월별 합산 성과 (전체) */
    months: PerformanceMonthPoint[];
    /** US 계좌별 월별 성과 { "4802": [...], "1635": [...] } */
    byAccount: Record<string, PerformanceMonthPoint[]>;
    benchmarks: {
      sp500: BenchmarkMonthPoint[];
      nasdaq: BenchmarkMonthPoint[];
    };
    /** US 종목별 상세 성과 (엑셀 기반 Jan~Apr, accountNo 포함) */
    stocks: StockMonthPerformance[];
  };
  fetchedAt: string;
}
