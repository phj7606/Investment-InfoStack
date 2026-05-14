// 재무 스크리닝 공용 타입 — 서버/클라이언트 양쪽에서 import 가능

// ─────────────────────────────────────────────────────────────────
// DART / Alpha Vantage 원시 계정 항목
// KR: DART account_nm + sj_div + 연도별 금액
// US: Alpha Vantage 계정명(영문) + sj_div + 연도별 금액 (백만달러)
// ─────────────────────────────────────────────────────────────────

export interface RawDartItem {
  account_nm: string;         // 계정명 (예: "매출액", "Total Revenue")
  account_id?: string;        // DART 계정 고유코드 (KR 전용)
  sj_div?: string;            // "IS" | "BS" | "CF" | "CIS" | "SCE"
  ord?: number;               // DART 원본 표시 순서 (KR: fnlttSinglAcntAll.ord)
  level?: number;             // 계층 깊이: 0=대분류(총계/헤더), 1=중분류, 2=세목
  amounts: {
    year: string;             // "2024"
    value: number | null;     // 억원(KR) 또는 백만달러(US)
  }[];
}

// ─────────────────────────────────────────────────────────────────
// 재무제표 패키지 — rawItems만 포함 (서버 매핑 없음)
// ─────────────────────────────────────────────────────────────────

export interface FinancialStatements {
  ticker: string;
  exchange: string;
  companyName?: string;                   // 기업명 — FnGuide title 자동 추출 또는 사용자 입력
  currency: string;                       // "KRW" | "USD"
  unit: string;                           // "억원" | "백만달러"
  dataSource: string;                     // "FnGuide" | "Alpha Vantage"
  rawItems: RawDartItem[];                // 연간 계정 항목 (기본 표시 + Claude 분석용)
  quarterlyItems?: RawDartItem[];         // 분기 계정 항목 (FnGuide KR 전용, UI 탭 전환)
  ratioItems?: RawDartItem[];             // 연간 재무비율 (SVD_FinanceRatio.asp, sj_div="RATIO")
  quarterlyRatioItems?: RawDartItem[];    // 분기 재무비율 (KR 전용)
  cachedAt?: string;                      // 캐시 저장 시각 (ISO 8601)
  dataFrom?: "cache" | "api";             // 데이터 출처
}

// ─────────────────────────────────────────────────────────────────
// Naver 활동성 지표 — CCC 계산용 회전율 데이터
// navercomp.wisereport.co.kr rpt=4 응답 기반
// KR 종목 전용, 연간 데이터만 제공
// ─────────────────────────────────────────────────────────────────

export interface NaverActivityRow {
  year: string;                       // "2024"
  receivableTurnover: number | null;  // 매출채권회전율 — DSO = 365 / 이 값
  inventoryTurnover: number | null;   // 재고자산회전율 — DIO = 365 / 이 값
  payableTurnover: number | null;     // 매입채무회전율 — DPO = 365 / 이 값
}

export interface NaverActivityResult {
  ticker: string;
  rows: NaverActivityRow[];  // 연도별 회전율 (오름차순 정렬)
}
