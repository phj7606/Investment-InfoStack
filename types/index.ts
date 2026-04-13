// 프로젝트 전반에서 재사용되는 공통 타입 정의

export interface NavItem {
  title: string;
  href: string;
  // 사이드바/모바일 메뉴에서 활성 상태 아이콘 표시용
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  external?: boolean;
}

export interface SiteConfig {
  name: string;
  description: string;
  url: string;
  ogImage: string;
  links: {
    twitter?: string;
    github?: string;
  };
}

export interface StatsCardData {
  title: string;
  value: string | number;
  // 이전 기간 대비 변화율 (양수: 증가, 음수: 감소)
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ComponentType<{ className?: string }>;
  description?: string;
}

export interface Feature {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
}

// ────────────────────────────────────────────────────────────────
// 투자 도메인 타입
// 실제 API 연동 시 이 타입들을 기반으로 데이터를 매핑한다
// ────────────────────────────────────────────────────────────────

/**
 * 시장 환경 상태
 * 극단 공포/탐욕 구간에서 역추세 진입을 판단하는 데 사용
 */
export type MarketRegime =
  | "extreme_fear"   // 극단적 공포: 저점 매수 구간 후보
  | "fear"           // 공포: 약세 심리 우세
  | "neutral"        // 중립: 방향성 불명확
  | "greed"          // 탐욕: 강세 심리 우세
  | "extreme_greed"; // 극단적 탐욕: 과열 구간, 차익실현 고려

/**
 * Fear & Greed 지수 스냅샷
 * KOSPI/KOSDAQ 또는 S&P500/NASDAQ 기준 지수값
 */
export interface FearGreedData {
  // 0~100 사이 지수값 (0: 극단 공포, 100: 극단 탐욕)
  value: number;
  regime: MarketRegime;
  // 전일 대비 변화량
  change: number;
  // 데이터 기준 시각 (ISO 8601)
  updatedAt: string;
}

/**
 * 개별 지수/ETF 가격 스냅샷
 * 상대강도 계산의 기초 데이터
 */
export interface TickerData {
  // 티커 심볼 (예: "005930", "AAPL", "XLK")
  symbol: string;
  // 종목명 또는 ETF명
  name: string;
  // 현재가 (원화 또는 달러)
  price: number;
  // 전일 대비 등락률 (%)
  changePercent: number;
  // 거래량
  volume?: number;
  // 마지막 업데이트 시각 (ISO 8601)
  updatedAt: string;
}

/**
 * 섹터/업종 상대강도 데이터
 * Mansfield RS 또는 변동성 조정 모멘텀 기반
 */
export interface SectorData {
  // 섹터명 (예: "Technology", "Energy", "반도체")
  name: string;
  // ETF 심볼 (예: "XLK", "XLE")
  symbol: string;
  // Mansfield RS 점수 (-100 ~ 100)
  mansFieldRS: number;
  // 4주 모멘텀 (%)
  momentum4w: number;
  // 52주 모멘텀 (%)
  momentum52w: number;
  // 순위 (1위가 최강)
  rank: number;
}

/**
 * 포트폴리오 보유 종목
 * 교체 신호 및 현황 관리에 사용
 */
export interface PortfolioPosition {
  symbol: string;
  name: string;
  // 보유 수량
  quantity: number;
  // 평균 매입가
  avgCost: number;
  // 현재가
  currentPrice: number;
  // 평가손익률 (%)
  returnPercent: number;
  // 포트폴리오 내 비중 (%)
  weight: number;
  // 교체 신호 발생 여부
  hasExitSignal: boolean;
}

/**
 * 시장 구분
 * 한국/미국 시장을 구분하여 데이터 소스를 분기할 때 사용
 */
export type MarketRegion = "KR" | "US" | "GLOBAL";

// ────────────────────────────────────────────────────────────────
// 변동성 조정 모멘텀 타입
// lib/indicators/momentum.ts에서 사용
// ────────────────────────────────────────────────────────────────

/**
 * 단일 종목의 변동성 조정 모멘텀 점수
 * 3개 기간(3M/6M/12M)의 Sharpe-like 점수를 포함한다
 */
export interface MomentumScore {
  // 3개 기간 평균 점수 (높을수록 강세)
  score: number;
  // 기간별 상세 점수 (디버깅 및 상세 뷰 표시용)
  periods: {
    m3:  number;  // 3개월(63 거래일) 변동성 조정 수익률
    m6:  number;  // 6개월(126 거래일) 변동성 조정 수익률
    m12: number;  // 12개월(252 거래일) 변동성 조정 수익률
  };
}

/**
 * 모멘텀 랭킹 결과 단일 항목
 * momentumRanking() 반환값의 원소 타입
 */
export interface RankedMomentum {
  // 티커 심볼 (예: "SMH", "069500.KS")
  symbol: string;
  // 순위 (1위가 최강, 1부터 시작)
  rank: number;
  // 안정화된 평균 모멘텀 점수
  score: number;
}

// ────────────────────────────────────────────────────────────────
// ETF 상대강도(RS) 랭킹 타입
// lib/etf/rs.ts에서 사용
// ────────────────────────────────────────────────────────────────

/**
 * ETF 단일 종목의 Mansfield RS 계산 결과
 * 랭킹 테이블 한 행에 해당하는 데이터
 */
export interface EtfRsResult {
  symbol: string;
  name: string;
  category: string;
  // Mansfield RS Raw (252일 MA 기준) — 장기 구조 강도, null이면 데이터 부족
  rsRaw: number | null;
  // Rolling Percentile (252일 기준, 0~100) — 장기 구조 보조 지표
  rsPercentile: number | null;
  // Mansfield RS Raw (63일 MA 기준) — 실질 순위 결정 지표, null이면 데이터 부족
  rsRaw63: number | null;
  // Rolling Percentile (63일 기준, 0~100) — 순위 결정 기준
  rsPercentile63: number | null;
  // 1위가 최강 (rsPercentile63 내림차순)
  rank: number;
  // RS Raw(252) 시계열 (최근 252일) — Sheet 차트 표시용, null이면 데이터 부족
  rsRawHistory: { date: string; value: number }[] | null;
  // RS Raw(63) 시계열 (최근 252일) — Sheet 차트 63일선 표시용
  rsRawHistory63: { date: string; value: number }[] | null;
  // RS 가속도 시계열 (RS63 - RS252) — 전략 4 모멘텀 가속도 시각화용
  rsAccelerationHistory: { date: string; value: number }[] | null;
}

/**
 * GET /api/etf/rs 응답 전체 구조
 */
export interface EtfRsResponse {
  market: "kr" | "us";
  rankings: EtfRsResult[];
  meta: {
    calculatedAt: string;
    // 벤치마크 심볼 (예: "^KS11", "SPY")
    benchmark: string;
    windowDays: number;
    dataStartDate: string;
    dataEndDate: string;
    totalSymbols: number;
    // RS 계산에 성공한 종목 수
    validSymbols: number;
  };
}

// ────────────────────────────────────────────────────────────────
// ETF 모멘텀 랭킹 타입
// lib/etf/momentum.ts에서 사용
// ────────────────────────────────────────────────────────────────

/**
 * ETF 단일 종목의 변동성 조정 모멘텀 결과
 * 모멘텀 바 차트 한 항목에 해당하는 데이터
 */
export interface EtfMomentumResult {
  symbol: string;
  name: string;
  category: string;
  // 1위가 최강 (score 내림차순)
  rank: number;
  // 3개 기간 평균 변동성 조정 모멘텀 점수
  score: number;
  // 기간별 상세 점수 (상세 뷰 토글용)
  periods: {
    m3: number;   // 3개월(63 거래일)
    m6: number;   // 6개월(126 거래일)
    m12: number;  // 12개월(252 거래일)
  };
}

/**
 * GET /api/etf/momentum 응답 전체 구조
 */
export interface EtfMomentumResponse {
  market: "kr" | "us";
  topRankings: EtfMomentumResult[];
  meta: {
    calculatedAt: string;
    topN: number;
    lookbackDays: number;
    dataStartDate: string;
    dataEndDate: string;
  };
}

// ────────────────────────────────────────────────────────────────
// 스크리너 통합 타입 (Phase 2)
// lib/etf/screener.ts에서 사용
// ────────────────────────────────────────────────────────────────

/**
 * 스크리너 통합 결과 — RS + 모멘텀 + MA 조인
 * EtfRsResult를 기반으로 모멘텀/MA 정보를 추가한 슈퍼셋
 */
export interface ScreenerResult {
  // ── RS 필드 ──
  symbol: string;
  name: string;
  category: string;
  rsRaw: number | null;
  rsPercentile: number | null;
  // RS 기준 순위 (rsPercentile 내림차순)
  rsRank: number;

  // ── 모멘텀 필드 (모멘텀 Top N 밖이면 null) ──
  momentumScore: number | null;
  momentumRank: number | null;
  momentumPeriods: {
    m3: number;
    m6: number;
    m12: number;
  } | null;

  // ── MA 필드 (최근 60일 가격 기반) ──
  // null = 데이터 부족 (60일 미만)
  aboveMa10: boolean | null;
  aboveMa20: boolean | null;
  aboveMa50: boolean | null;
  // MA 계산에 사용한 최근 종가
  currentPrice: number | null;
}

/**
 * GET /api/etf/screener 응답 전체 구조
 */
export interface ScreenerResponse {
  market: "kr" | "us";
  results: ScreenerResult[];
  meta: {
    calculatedAt: string;
    totalSymbols: number;
    // 모멘텀 데이터와 조인된 종목 수
    joinedWithMomentum: number;
    dataEndDate: string;
    benchmark: string;
  };
}

/**
 * 스크리너 클라이언트 필터 상태
 * ScreenerFilterPanel, ScreenerResultTable에서 공통 사용
 */
export interface ScreenerFilters {
  // RS Percentile 최솟값 (0~100)
  rsPercentileMin: number;
  // 모멘텀 Top N 이내 종목만 포함 (0 = 비활성)
  topNMomentum: number;
  // MA 필터 (true = 해당 MA 위에 있는 종목만)
  requireMa10: boolean;
  requireMa20: boolean;
  requireMa50: boolean;
  // 카테고리 필터 ("" = 전체)
  categoryFilter: string;
}

// ────────────────────────────────────────────────────────────────
// Fear & Greed Oscillator (KR) — 시계열 타입
// /api/market/fear-greed-kr 응답 구조
// ────────────────────────────────────────────────────────────────

/**
 * F&G 지수 시계열 단일 데이터 포인트
 * 7개 구성 요소 각각의 정규화 값(0~1)과 MACD 오실레이터 값을 포함
 */
export interface FearGreedHistoryPoint {
  // "YYYY-MM-DD" 형식 날짜
  date: string;
  // 최종 F&G 지수 (0~100, 0: 극단 공포, 100: 극단 탐욕)
  value: number;
  regime: MarketRegime;
  /**
   * 각 구성 요소의 정규화된 값 (0~1, 반전 적용 후)
   * null: 해당 날짜에 데이터 수집 실패 또는 롤링 윈도우 미충족
   */
  components: {
    momentum: number | null;       // KOSPI - SMA125 괴리율 → 정규화
    volatility: number | null;     // VKOSPI → 반전 정규화 (낮을수록 탐욕)
    creditSpread: number | null;   // BBB+ - AA- 스프레드 → 반전 정규화
    pcRatio: number | null;        // Put/Call 거래량 비율 → 반전 정규화
    adLine: number | null;         // (상승-하락) 20일 롤링합 → 정규화
    foreignNet: number | null;     // 외국인 순매수 20일 누적 → 정규화
    marginBalance: number | null;  // 신용잔고 20일 변화율 → 정규화
  };
  // F&G MACD Oscillator (Track 2 보조 패널)
  fgMacd: number | null;
  fgSignal: number | null;
  // fgMacd - fgSignal (바 차트 높이값, 양수: 탐욕 방향, 음수: 공포 방향)
  fgHistogram: number | null;
}

/**
 * GET /api/market/fear-greed-kr 응답 전체 구조
 */
export interface FearGreedKrResponse {
  // 가장 최신 스냅샷 (기존 FearGreedData 재사용)
  latest: FearGreedData;
  // 요청한 기간의 시계열 (오름차순 날짜 정렬)
  history: FearGreedHistoryPoint[];
  meta: {
    // 계산 완료 시각 (ISO 8601)
    calculatedAt: string;
    // 롤링 정규화 윈도우 (일, 기본 252)
    windowDays: number;
    // 히스토리 실제 시작일 (warmup 이후 첫 유효일)
    dataStartDate: string;
    // 히스토리 실제 종료일
    dataEndDate: string;
    // 실제 계산에 사용된 변수 목록 (데이터 수집 실패 변수 제외)
    variables: string[];
  };
}

// ────────────────────────────────────────────────────────────────
// 티커 설정 파일 타입 (Phase 3)
// config/tickers_kr_etf.json, config/tickers_us_etf_themes.json
// ────────────────────────────────────────────────────────────────

/** 한국 ETF 티커 항목 */
export interface KrTicker {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
}

/** 미국 ETF 티커 항목 */
export interface UsTicker {
  symbol: string;
  name: string;
  category: string;
}

// ────────────────────────────────────────────────────────────────
// Sector Flow Oscillator 타입
// lib/indicators/sectorFlow.ts, lib/etf/sectorFlow.ts에서 사용
// ────────────────────────────────────────────────────────────────

/**
 * KRX 업종별 수급 일별 원본 데이터 포인트
 * data.krx.co.kr에서 수집한 시가총액·순매수 데이터
 */
export interface SectorFlowDataPoint {
  // "YYYY-MM-DD" 형식 날짜
  date: string;
  // 기관 순매수 (원화, 음수 가능)
  instNet: number;
  // 외국인 순매수 (원화, 음수 가능)
  foreignNet: number;
  // 업종 시가총액 (원화)
  mktcap: number;
}

/**
 * Sector Flow Oscillator 계산 결과 시계열 단일 포인트
 * 워밍업 구간(warmupDays) 이후 유효한 값만 포함
 */
export interface SectorFlowOscillatorPoint {
  // "YYYY-MM-DD" 형식 날짜
  date: string;
  // MACD - Signal (바 차트 높이값, 양수: 수급 유입, 음수: 수급 유출)
  oscillator: number;
  // EMA12(Z-score) - EMA26(Z-score)
  macd: number;
  // MACD의 EMA9 (Signal 선)
  signal: number;
}

/**
 * 단일 업종의 Sector Flow Oscillator 최종 결과
 * 랭킹 테이블 한 행에 해당하는 데이터
 */
export interface SectorFlowResult {
  // KRX 업종 코드 (예: "G25", "G35")
  sectorCode: string;
  // 업종명 (예: "음식료품", "의약품")
  sectorName: string;
  // 가장 최신 oscillator 값
  oscillator: number;
  // 가장 최신 macd 값
  macd: number;
  // 가장 최신 signal 값
  signal: number;
  /**
   * 제로 크로스 신호
   * 'up': 직전 거래일 oscillator가 음수였다가 양수로 전환 (수급 유입 시작)
   * 'down': 직전 거래일 oscillator가 양수였다가 음수로 전환 (수급 유출 시작)
   * null: 전환 없음
   */
  zeroCross: "up" | "down" | null;
  // 1위가 최강 (oscillator 내림차순)
  rank: number;
  // 최근 시계열 (차트 표시용)
  history: SectorFlowOscillatorPoint[];
}

/**
 * GET /api/sector-flow 응답 전체 구조
 */
export interface SectorFlowResponse {
  // oscillator 내림차순 정렬된 업종 랭킹
  rankings: SectorFlowResult[];
  summary: {
    // oscillator > 0인 업종 비율 (0~1)
    positiveRatio: number;
    // 전체 업종 oscillator 중앙값
    median: number;
    // 90번째 백분위수
    p90: number;
    // 75번째 백분위수
    p75: number;
    // 25번째 백분위수
    p25: number;
    // 10번째 백분위수
    p10: number;
  };
  meta: {
    // 계산 완료 시각 (ISO 8601)
    calculatedAt: string;
    // 데이터 기준 시작일
    dataStartDate: string;
    // 데이터 기준 종료일
    dataEndDate: string;
    // 계산에 사용된 업종 수
    totalSectors: number;
  };
}
