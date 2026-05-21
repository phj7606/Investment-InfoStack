// 재무현황 통합 대시보드 도메인 타입 정의
// 월별 현금흐름(Monthly CF) / 자산관리(Asset Management) / 재무제표(Financial Statement) 공통

// ─────────────────────────────────────────
// 환율
// ─────────────────────────────────────────

/** 월말 기준 환율 — 재무 스냅샷 확정 시 고정 저장 */
export interface ExchangeRates {
  usdKrw: number;        // 1 USD = N KRW
  cadKrw: number;        // 1 CAD = N KRW
  recordedAt?: string;   // 기록 시각 (ISO 8601)
}

// ─────────────────────────────────────────
// Monthly CF (월별 현금흐름)
// ─────────────────────────────────────────

/**
 * 현금흐름 카테고리 — 엑셀 Monthly CF 시트 구조에 맞게 업데이트
 * - INCOME: 수입 (급여, 이자/배당, 임대수익 등) → amount 양수
 * - FIXED_EXPENSE: 고정지출 (보험, 통신, 월부금 등) → amount 음수
 * - CREDIT_CARD: 신용카드 청구 (삼성/하나/씨티 구분) → amount 음수
 * - CASH_EXPENSE: 현금지출 (위안화 환전, 축의금, 학원비 등) → amount 음수
 * - TAX: 세금·공과금 → amount 음수
 * - ACCOUNT_TRANSFER: 계좌 이체 (외환, 교육저축 등) → amount 음수 또는 이체금액
 */
export type CFCategoryType =
  | "INCOME"
  | "FIXED_EXPENSE"
  | "CREDIT_CARD"
  | "CASH_EXPENSE"
  | "TAX"
  | "ACCOUNT_TRANSFER";

/** 카테고리 한글 레이블 맵 */
export const CF_CATEGORY_LABELS: Record<CFCategoryType, string> = {
  INCOME: "수입",
  FIXED_EXPENSE: "고정지출",
  CREDIT_CARD: "신용카드",
  CASH_EXPENSE: "현금지출",
  TAX: "세금·공과금",
  ACCOUNT_TRANSFER: "계좌이체",
};

/** 월별 현금흐름 항목 1건 — monthly-cf.json 배열 원소 */
export interface MonthlyCFEntry {
  id: string;             // UUID
  category: CFCategoryType;
  subcategory?: string;   // 세부 분류 (신용카드 카드사명, 현금지출 항목 등)
  name: string;           // 항목명 (급여, 관리비, 삼성카드 등)
  month: string;          // "2026-05"
  amount: number;         // 수입=양수, 지출=음수 (KRW 기준)
  note?: string;
  createdAt: string;      // ISO 8601
}

/** 월별 CF 집계 결과 — UI 표시용 */
export interface MonthlyCFSummary {
  month: string;
  totalIncome: number;
  totalExpense: number;    // 고정지출+신용카드+현금지출+세금 합계 (절대값)
  totalTransfer: number;  // 계좌이체 합계 (절대값)
  netCF: number;           // totalIncome - totalExpense - totalTransfer
  savingsRate: number;     // (totalIncome - totalExpense) / totalIncome (0~1)
  byCategory: Record<CFCategoryType, number>; // 카테고리별 합계
}

// ─────────────────────────────────────────
// Financial Snapshot (월별 재무 스냅샷)
// ─────────────────────────────────────────

/**
 * 월별 재무 스냅샷 — financial-snapshots.json 배열 원소
 *
 * DRAFT: 현재 월, 수정 가능. 포트폴리오 값은 API 실시간 조회.
 * CONFIRMED: 확정 완료, 수정 불가. 포트폴리오 값은 confirmedPortfolio에 고정 저장.
 *
 * 엑셀 FS-May 2026 시트 구조에 맞게 재설계:
 * - 정기예금, 부채 세분화, 부동산, 가상자산, 캐나다연금, 2805 중기 계좌 포함
 */
export interface FinancialSnapshot {
  id: string;
  month: string;             // "2026-05"
  status: "DRAFT" | "CONFIRMED";

  /** 적용 환율 — DRAFT: 사용자 최근 입력값, CONFIRMED: 확정 시 고정 */
  exchangeRates: ExchangeRates;

  // ── 정기예금 (수동 입력) ───────────────────────────────
  /** 정기예금 KRW (현재 550,000,000) */
  fixedDepositKrw: number;
  /** 외화 정기예금 USD */
  fixedDepositUsd: number;

  // ── 외화 예금 (현금성 자산, 수동 입력) ────────────────
  /** 외화 예금 USD — 정기예금과 별도인 외화 보통예금 */
  cashForeignUsd?: number;
  /** 외화 예금 CAD */
  cashForeignCad?: number;

  // ── 계좌별 주식 예수금 (수동 입력) ─────────────────────
  /** Value Investment 계좌별 예수금: 4802 / 1635 / 1402 */
  stockDepositByAccount?: {
    "4802"?: { krw: number; usd: number };
    "1635"?: { krw: number; usd: number };
    "1402"?: { krw: number; usd: number };
  };

  // ── Fund 월별 직접입력 항목 ───────────────────────────
  /**
   * 엑셀 Asset Management FUND 섹션: 직접 입력 필드
   * Balance는 confirmedPortfolio.fundBalance 에 저장,
   * 거래 내역(Bid/Ask/Fixed P/L)만 여기에 저장
   */
  fundMonthly?: {
    principal: number;  // 이번달 시작 원금 (이전달 Balance 이월)
    bid: number;        // 이번달 매수
    askBv: number;      // 이번달 매도 장부가
    fixedPnl: number;   // 이번달 실현손익
    balance: number;    // 이번달 잔액
  };

  // ── 부채 세분화 (수동 입력) ───────────────────────────
  /** 임차보증금 (현재 1,300,000,000) — 주요 부채 항목 */
  leaseDeposit: number;
  /** 개인차입금 (현재 146,930,000) */
  privateLoan: number;
  /** 주택담보대출 */
  mortgageLoan: number;

  // ── 비유동 자산 (수동 입력) ───────────────────────────
  /** 부동산 (현재 1,668,000,000) */
  realEstate: number;

  // ── 기타 자산 ─────────────────────────────────────────
  /** 기타 자산 목록 (KRW) */
  otherAssets: { name: string; amount: number }[];

  // ── 가상자산 세분화 ───────────────────────────────────
  /**
   * 교육자금 가상자산 — 거래소별 잔액/원금 수동 입력
   * 추후 거래소 API 연동 시 자동화 예정
   */
  crypto: {
    upbit: { balance: number; principal: number };     // KRW
    korbit: { balance: number; principal: number };    // KRW
    binance: { balance: number; principal: number };   // USD
  };

  // ── 캐나다 연금 RESP/RRSP ─────────────────────────────
  /**
   * 캐나다 연금 — 투자 활동 없이 월 수수료만 발생하는 단순 계좌
   * 별도 트랜잭션 파일 없이 월별 잔액만 스냅샷에 기록
   */
  canadianPension: {
    balanceCad: number;      // 월말 잔액 (CAD)
    monthlyFeeCad: number;   // 이번 달 차감된 수수료 (CAD)
    note?: string;
  };

  // ── 2805 중기 계좌 (수동 입력) ───────────────────────
  /**
   * 2805 중기 계좌 — 적립식 납입 계좌
   * 엑셀 Edu/Pension Others 시트 '2805 Mid-term Account' 섹션 기반
   */
  midterm2805: {
    cumInstallment: number;  // 누적 납입액
    cumSpent: number;        // 누적 사용액
    balance: number;         // 현재 잔액
  };

  // ── 자산관리 II 월별 직접입력 ─────────────────────────
  /** 교육 계좌(1470) 예수금 · 주식잔액 월별 직접입력 */
  educationMonthly?: {
    deposit: number;
    stockBalance?: number;  // currentPrice=0일 때 수동 입력 (엑셀 Row 21)
  };

  /** Short-term 계좌(2805) 예수금 · 주식잔액 월별 직접입력 */
  shorttermMonthly?: {
    deposit: number;
    stockBalance?: number;  // currentPrice=0일 때 수동 입력 (엑셀 Row 53)
  };

  /** 연금 계좌 월별 직접입력 — 자동계산 대신 실제 잔액 입력 시 사용 */
  pensionMonthly?: {
    fundBalance?: number;       // 퇴직연금 잔액 (엑셀 Row 28)
    fundPrincipal?: number;     // 퇴직연금 원금 (엑셀 Row 33)
    depositBalance?: number;    // 연금저축 잔액 (엑셀 Row 29)
    depositPrincipal?: number;  // 연금저축 원금 (엑셀 Row 34)
    irpBalance?: number;        // IRP 잔액 (엑셀 Row 30)
    irpPrincipal?: number;      // IRP 원금 (엑셀 Row 35)
  };

  /**
   * 확정 시 고정 저장되는 포트폴리오 스냅샷 (KRW 환산)
   * CONFIRMED 상태에서만 채워짐 — 과거 월 재무제표 재현에 사용
   *
   * 엑셀 Asset Management 시트의 FUND/KOR Stocks/US Stocks 분리 구조 반영
   */
  confirmedPortfolio?: {
    // Asset Management — 자산 유형별 분리
    fundBalance: number;              // 펀드 평가액 (KRW)
    fundPrincipal: number;            // 펀드 원금 (KRW)
    fundCumPnl: number;               // 펀드 누적손익 (KRW)
    // Fund 월별 거래 내역 (직접 입력 → confirm 시 스냅샷에 저장)
    fundBid?: number;                 // 이번달 펀드 매수
    fundAskBv?: number;               // 이번달 펀드 매도 장부가
    fundFixedPnl?: number;            // 이번달 펀드 실현손익
    fundCumFixedPnl?: number;         // 펀드 누적 실현손익
    korStocksBalance: number;         // 국내주식 평가액 (KRW)
    korStocksPrincipal: number;       // 국내주식 원금 (KRW)
    korStocksCumPnl: number;          // 국내주식 누적손익 (KRW)
    // KOR Stocks 월별 거래 내역 (포트폴리오에서 자동 집계 → confirm 시 저장)
    korStocksBid?: number;            // 이번달 국내주식 매수
    korStocksAskBv?: number;          // 이번달 국내주식 매도 장부가
    korStocksFixedPnl?: number;       // 이번달 국내주식 실현손익
    korStocksCumFixedPnl?: number;    // 국내주식 누적 실현손익
    usStocksBalanceUsd: number;       // 미국주식 평가액 (USD)
    usStocksPrincipalUsd: number;     // 미국주식 원금 (USD)
    usStocksCumPnlUsd: number;        // 미국주식 누적손익 (USD)
    usStocksBalanceKrw: number;       // 미국주식 평가액 KRW 환산 (× usdKrw)
    // US Stocks 월별 거래 내역 (USD)
    usStocksBidUsd?: number;          // 이번달 미국주식 매수
    usStocksAskBvUsd?: number;        // 이번달 미국주식 매도 장부가
    usStocksFixedPnlUsd?: number;     // 이번달 미국주식 실현손익
    usStocksCumFixedPnlUsd?: number;  // 미국주식 누적 실현손익
    stockDepositKrw: number;          // 주식계좌 예수금 KRW
    stockDepositUsd: number;          // 주식계좌 예수금 USD
    /** 계좌별 예수금 세부 내역 (4802/1635/1402) */
    stockDepositByAccount?: {
      "4802"?: { krw: number; usd: number };
      "1635"?: { krw: number; usd: number };
      "1402"?: { krw: number; usd: number };
    };
    // Pension — 계좌별 분리
    pensionFundBalance: number;       // 연금펀드 평가액
    pensionFundPrincipal: number;     // 연금펀드 원금
    pensionDepositBalance: number;    // 연금예금 평가액
    pensionDepositPrincipal: number;  // 연금예금 원금
    irpBalance: number;               // IRP 평가액
    irpPrincipal: number;             // IRP 원금
    // Education 1470
    education1470Deposit: number;     // 1470 교육계좌 예금
    education1470Stock: number;       // 1470 교육계좌 주식
    education1470Principal: number;   // 1470 교육계좌 원금
    // Short-term Account (2805) — confirm 시 live positions에서 스냅샷
    shorttermStockBalance?: number;   // 주식 평가액 KRW
    shorttermPrincipal?: number;      // 원금 KRW
    shorttermDeposit?: number;        // 해당 월 수동입력 예수금
    // 이전 버전 호환 (합산값)
    canadianPensionKrw: number;       // 캐나다 연금 KRW 환산
  };

  confirmedAt?: string;  // 확정 시각 (ISO 8601)
  updatedAt: string;     // 최종 수정 시각 (ISO 8601)
}

// ─────────────────────────────────────────
// 재무제표 집계 결과 (UI 표시용)
// ─────────────────────────────────────────

/** 자산 항목 행 — 재무제표 자산 섹션 각 줄 */
export interface AssetLineItem {
  label: string;
  amountKrw: number;
  currency?: "KRW" | "USD" | "CAD";   // 원화 환산 전 통화 (표시용)
  originalAmount?: number;             // 원화 환산 전 금액 (표시용)
  exchangeRate?: number;               // 적용 환율 (표시용)
  isSubItem?: boolean;                 // 들여쓰기 표시
}

/**
 * 재무제표 집계 결과 — 엑셀 FS-May 2026 시트 구조에 맞게 재설계
 * CURRENT ASSET / NON-CURRENT ASSET / INVESTMENT ASSET 분리
 */
export interface FinancialStatementData {
  month: string;
  status: "DRAFT" | "CONFIRMED";
  exchangeRates: ExchangeRates;

  // 자산 섹션 (엑셀 대차대조표 구조)
  assets: {
    // 유동자산 CURRENT ASSET
    currentAsset: {
      cashEquivalent: number;           // 현금 및 현금성 자산
      foreignDepositUsd: number;        // 외화예금 USD (KRW 환산)
      foreignDepositCad: number;        // 외화예금 CAD (KRW 환산)
      fixedDepositUsd: number;          // 외화 정기예금 USD (KRW 환산)
      fixedDepositKrw: number;          // 정기예금 KRW
      total: number;                    // 유동자산 합계
    };
    // 비유동자산 NON-CURRENT ASSET
    nonCurrentAsset: {
      realEstate: number;               // 부동산
      total: number;                    // 비유동자산 합계
    };
    // 투자자산 INVESTMENT ASSET
    investmentAsset: {
      korStocks: number;                // 국내 유가증권 KRW
      fund: number;                     // 펀드/파생상품 KRW
      stockDepositKrw: number;          // 주식계좌 예수금 KRW
      usStocksKrw: number;              // 미국주식/ETF KRW 환산
      usStocksDepositKrw: number;       // 미국주식 예수금 KRW 환산
      total: number;                    // 투자자산 합계
    };
    // 연금·교육자산
    pensionKrw: number;                 // 연금 합계 KRW
    educationKrw: number;               // 교육저축 합계 KRW

    totalAssets: number;                // 총자산 합계

    // 이전 버전 호환 (AssetManagement 뷰용)
    investmentPortfolio: AssetLineItem[];
    pension: AssetLineItem[];
    education: AssetLineItem;
    shortterm: AssetLineItem;
    digitalAssets: AssetLineItem;
    cash: AssetLineItem;
    otherAssets: AssetLineItem[];
  };

  // 부채 섹션
  liabilities: {
    // 유동부채
    currentLiability: number;           // 유동부채 합계 (신용한도 등)
    // 비유동부채
    privateLoan: number;                // 개인차입금
    leaseDeposit: number;               // 임차보증금
    nonCurrentLiabilityTotal: number;   // 비유동부채 합계
    totalDebt: number;                  // 총부채 합계
  };

  // 순자산
  netWorth: number;

  // 자산관리 섹션 (Net Debt/Surplus 계산)
  assetManagement: {
    // 투자 총계
    fundKrw: number;
    korStocksKrw: number;
    usStocksKrw: number;                // USD × usdKrw
    usStocksUsd: number;                // USD 원본
    stockDepositKrw: number;
    stockDepositUsd: number;            // USD 원본
    investmentTotal: number;            // 투자 합계 KRW

    // 현금·예금
    fixedDepositKrw: number;
    cashEquivalent: number;
    cashTotal: number;                  // 현금성 자산 합계

    // Asset Total = investmentTotal + cashTotal
    assetTotal: number;

    // 부채 분석
    leaseDeposit: number;               // 임차보증금 (음수로 계산)
    netDebtSurplus: number;             // Asset Total - Lease Deposit
    lessDepositReimbursement: number;   // 보증금 반환 후 잔액
    excessDeficit: number;              // 초과/부족
  };
}

// ─────────────────────────────────────────
// Asset Management 연간 테이블 타입
// ─────────────────────────────────────────

/**
 * 자산관리 연간 테이블의 단일 컬럼(월) 데이터
 * 엑셀 Asset Management 시트의 각 월 컬럼에 대응
 */
export interface AssetManagementSectionData {
  principal: number;     // 원금
  bid: number;           // 이번달 매수
  askBv: number;         // 이번달 매도 장부가
  fixedPnl: number;      // 이번달 실현손익
  cumFixedPnl: number;   // 누적 실현손익
  /** YTD 누적 매수액 — Jan~현재 SUM(bid). 엑셀 Q14=SUM(E14:P14) */
  cumBid: number;
  /** YTD 누적 매도 장부가 — Jan~현재 SUM(askBv). 엑셀 Q15=SUM(E15:P15) */
  cumAskBv: number;
  balance: number;       // 잔액 (평가액)
  monthlyPnl: number;    // 월간 손익
  cumPnl: number;        // 누적 손익
  pct: number;           // 월간 수익률 (소수, 0.05=5%)
  cumPct: number;        // YTD 누적 수익률 (소수)
}

export interface AssetManagementColumnData {
  month: string;           // "2026-01" 또는 "2025-12" (baseline)
  isBaseline: boolean;     // 전년도 12월 기준 컬럼 여부
  isDraft: boolean;        // DRAFT 상태 (현재 월)
  hasData: boolean;        // 해당 월 스냅샷 존재 여부
  usdKrw: number;          // 적용 환율 (하위 호환)
  /** 월별 확정/실시간 환율 — 환율 섹션 행 표시용 */
  exchangeRates: {
    usdKrw: number;        // 1 USD = N KRW
    cadKrw: number;        // 1 CAD = N KRW
  };

  // ── 투자 섹션 ──────────────────────────────
  fund: AssetManagementSectionData;
  korStocks: AssetManagementSectionData;
  /** Fund + KOR Stocks 합산 */
  krwTotal: AssetManagementSectionData;
  /** USD 기준 */
  usStocks: AssetManagementSectionData;

  // ── 예수금 섹션 ────────────────────────────
  stockDepositKrw: number;
  stockDepositUsd: number;
  /** 계좌별 예수금 세부 내역 (4802/1635/1402) — 없으면 총계만 표시 */
  stockDepositByAccount?: {
    "4802"?: { krw: number; usd: number };
    "1635"?: { krw: number; usd: number };
    "1402"?: { krw: number; usd: number };
  };

  // ── Cash & Equivalent 섹션 ────────────────
  cashForeignUsd: number;
  cashForeignCad: number;
  fixedDepositKrw: number;
  fixedDepositUsd: number;
  /** Net Debt/Surplus = Asset Total - Lease Deposit */
  netDebtSurplus: number;

  // ── Summary 섹션 ──────────────────────────
  investmentTotal: number;
  cashTotal: number;
  assetTotal: number;
  leaseDeposit: number;
}

// ─────────────────────────────────────────
// 자산관리 II 연간 테이블 타입 (Edu, Pension Others 시트)
// ─────────────────────────────────────────

/**
 * 자산관리 II 연간 테이블 단일 컬럼 데이터
 * 엑셀 "Edu, Pension Others" 시트 각 월 컬럼에 대응
 * 섹션 행 순서: Principal → Balance → P/L (엑셀 동일)
 */
export interface AssetManagementIIColumnData {
  month: string;
  isBaseline: boolean;
  isDraft: boolean;
  hasData: boolean;
  usdKrw: number;
  cadKrw: number;

  // (1) Digital Asset — 수동 입력 (snap.crypto)
  digitalAsset: {
    upbitBalance: number;         // Upbit 잔액 KRW
    upbitPrincipal: number;       // Upbit 원금 KRW
    korbitBalance: number;        // Korbit 잔액 KRW
    korbitPrincipal: number;      // Korbit 원금 KRW
    binanceBalanceUsd: number;    // Binance 잔액 USD
    binancePrincipalUsd: number;  // Binance 원금 USD
    totalKrw: number;             // 총 잔액 KRW 환산
    totalPrincipalKrw: number;    // 총 원금 KRW 환산
    pnlKrw: number;               // 총 손익 KRW
    pnlPct: number;               // 총 수익률
  };

  // (2) Education 1470 — stock/principal: live/confirmed, deposit: 수동입력
  education: {
    deposit: number;       // 예수금 (educationMonthly.deposit)
    stockBalance: number;  // 주식 평가액 (live-data / confirmedPortfolio)
    balance: number;       // 총 잔액 = deposit + stockBalance
    principal: number;     // 원금
    pnl: number;           // 손익 = balance - principal
    pnlPct: number;        // 수익률
  };

  // (3) Pension — live/confirmed
  pension: {
    pensionFundBalance: number;     pensionFundPrincipal: number;    pensionFundPnl: number;
    pensionDepositBalance: number;  pensionDepositPrincipal: number;  pensionDepositPnl: number;
    irpBalance: number;             irpPrincipal: number;            irpPnl: number;
    totalBalance: number;
    totalPrincipal: number;
    totalPnl: number;
    totalPnlPct: number;
  };

  // (4) RESP/RRSP Canada — snap.canadianPension
  respRrsp: {
    balanceCad: number;
    balanceKrw: number;
  };

  // (5) Short-term Account (2805) — stock/principal: live/confirmed, deposit: 수동입력
  shortterm: {
    deposit: number;       // 예수금 (shorttermMonthly.deposit)
    stockBalance: number;  // 주식 평가액 (live-data / confirmedPortfolio)
    balance: number;       // 총 잔액 = deposit + stockBalance
    principal: number;     // 원금
    pnl: number;           // 손익 = balance - principal
    pnlPct: number;        // 수익률
  };
}

// ─────────────────────────────────────────
// Live Portfolio Data (실시간 포트폴리오 데이터)
// ─────────────────────────────────────────

/**
 * /api/portfolio/financial/live-data 응답 타입
 * DRAFT 상태에서 실시간 포트폴리오 현황을 표시하기 위한 집계 데이터
 *
 * 엑셀 Asset Management 시트의 FUND/KOR Stocks/US Stocks 구조 반영
 */
export interface LivePortfolioData {
  // ── Asset Management ─────────────────────
  /** 펀드 (assetType === "FUND") */
  fund: {
    balance: number;          // KRW 평가액
    principal: number;        // KRW 원금
    cumulativePnl: number;    // 누적손익 (실현 + 미실현)
    unrealizedPnl: number;    // 미실현 손익
    pnlRate: number;          // 수익률 (소수, 0.05 = 5%)
  };
  /** 국내주식 (market === "KR", assetType === "STOCK" | "ETF") */
  korStocks: {
    balance: number;
    principal: number;
    cumulativePnl: number;
    unrealizedPnl: number;
    pnlRate: number;
  };
  /** 미국주식 (market === "US") */
  usStocks: {
    balanceUsd: number;       // USD 평가액
    principalUsd: number;     // USD 원금
    cumulativePnlUsd: number; // USD 누적손익
    unrealizedPnlUsd: number; // USD 미실현 손익
    pnlRateUsd: number;       // USD 수익률
    balanceKrw: number;       // KRW 환산 (× usdKrw)
  };
  /** 주식계좌 예수금 */
  stockDepositKrw: number;
  stockDepositUsd: number;

  // ── Pension ───────────────────────────────
  pensionFund: { balance: number; principal: number; pnl: number };
  pensionDeposit: { balance: number; principal: number; pnl: number };
  irp: { balance: number; principal: number; pnl: number };

  // ── Education 1470 ────────────────────────
  education1470: {
    deposit: number;
    stock: number;
    principal: number;
    pnl: number;
  };

  // Short-term Account 포지션 집계 (자산관리 II 표시용)
  shortterm: {
    stockBalance: number;  // evalAmount 합계 KRW
    principal: number;     // avgPrice × quantity 합계 KRW
  };

  /** 조회 시점의 현재 환율 — DRAFT 월 자산관리 II 계산에 사용 (스냅샷 초기화 환율 대체) */
  currentRates: {
    usdKrw: number;
    cadKrw: number;
  };

  /**
   * 당월 거래 집계 — DRAFT 자산관리 테이블의 Bid / Ask(BV) / Fixed P/L 산출용
   * Value Investment Account(4802/1635/1402) 실제 거래 내역 기반
   */
  monthlyTxSummary?: {
    fund:      { bid: number; askBv: number; fixedPnl: number };
    korStocks: { bid: number; askBv: number; fixedPnl: number };
    usStocks:  { bid: number; askBv: number; fixedPnl: number };  // USD
  };

  /** 데이터 조회 시각 */
  fetchedAt: string;
}

// ─────────────────────────────────────────
// 트랜잭션 월별 집계 타입 (자산관리 연간 테이블용)
// ─────────────────────────────────────────

/** 월별 트랜잭션 집계 — CONFIRMED 월 Bid/Ask(BV)/Fixed P/L 산출 */
export interface TxMonthlySummary {
  bid: number;
  askBv: number;
  fixedPnl: number;
}

/** 월 → 섹션별 트랜잭션 집계 맵 */
export interface TxSummaryByMonth {
  [month: string]: {
    fund:      TxMonthlySummary;
    korStocks: TxMonthlySummary;
    usStocks:  TxMonthlySummary;
  };
}

// ─────────────────────────────────────────
// API 요청/응답 타입
// ─────────────────────────────────────────

/** POST /api/portfolio/financial/monthly-cf 요청 */
export interface CreateMonthlyCFRequest {
  category: CFCategoryType;
  subcategory?: string;
  name: string;
  month: string;
  amount: number;
  note?: string;
}

/**
 * POST /api/portfolio/financial/snapshot/[month]/confirm 요청
 * 엑셀 FS 구조에 맞게 세분화된 부채/자산 정보 포함
 */
export interface ConfirmSnapshotRequest {
  usdKrw: number;
  cadKrw: number;
  // 현금·예금
  fixedDepositKrw: number;
  fixedDepositUsd: number;
  // 부채
  leaseDeposit: number;
  privateLoan: number;
  mortgageLoan: number;
  // 비유동자산
  realEstate: number;
  // 가상자산
  crypto: {
    upbit: { balance: number; principal: number };
    korbit: { balance: number; principal: number };
    binance: { balance: number; principal: number };
  };
  // 캐나다 연금
  canadianPension: {
    balanceCad: number;
    monthlyFeeCad: number;
    note?: string;
  };
  // 2805 중기 계좌
  midterm2805: {
    cumInstallment: number;
    cumSpent: number;
    balance: number;
  };
  otherAssets: { name: string; amount: number }[];
}

/**
 * PUT /api/portfolio/financial/snapshot/[month] 요청 (DRAFT 수정)
 * 스냅샷 수동 입력 필드 부분 업데이트
 */
export interface UpdateSnapshotRequest {
  exchangeRates?: Partial<ExchangeRates>;
  // 현금·예금
  fixedDepositKrw?: number;
  fixedDepositUsd?: number;
  // 외화 예금 (현금성 자산)
  cashForeignUsd?: number;
  cashForeignCad?: number;
  // Fund 월별 직접입력
  fundMonthly?: {
    principal: number;
    bid: number;
    askBv: number;
    fixedPnl: number;
    balance: number;
  };
  // 주식예수금 직접입력
  stockDepositKrw?: number;
  stockDepositUsd?: number;
  /** 계좌별 예수금 세부 입력 (4802/1635/1402) */
  stockDepositByAccount?: {
    "4802"?: { krw: number; usd: number };
    "1635"?: { krw: number; usd: number };
    "1402"?: { krw: number; usd: number };
  };
  // 부채
  leaseDeposit?: number;
  privateLoan?: number;
  mortgageLoan?: number;
  // 비유동자산
  realEstate?: number;
  // 가상자산
  crypto?: {
    upbit: { balance: number; principal: number };
    korbit: { balance: number; principal: number };
    binance: { balance: number; principal: number };
  };
  // 캐나다 연금
  canadianPension?: {
    balanceCad: number;
    monthlyFeeCad: number;
    note?: string;
  };
  // 2805 중기 계좌
  midterm2805?: {
    cumInstallment: number;
    cumSpent: number;
    balance: number;
  };
  // 자산관리 II 월별 직접입력
  educationMonthly?: { deposit: number; stockBalance?: number };
  shorttermMonthly?: { deposit: number; stockBalance?: number };
  pensionMonthly?: {
    fundBalance?: number;
    fundPrincipal?: number;
    depositBalance?: number;
    depositPrincipal?: number;
    irpBalance?: number;
    irpPrincipal?: number;
  };
  otherAssets?: { name: string; amount: number }[];
}
