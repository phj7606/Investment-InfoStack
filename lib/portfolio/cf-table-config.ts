/**
 * Monthly CF 테이블 행 정의
 *
 * 엑셀 "Monthly CF" 시트 구조를 config-driven 방식으로 재현.
 * MonthlyCFView가 이 배열을 순서대로 렌더링하면 엑셀과 동일한 레이아웃이 나온다.
 */

import type { CFCategoryType } from "@/types/financial";

/**
 * 행 타입 — 각 행의 렌더링·계산 방식 결정
 *
 * input:               사용자가 셀 클릭 → 인라인 Input으로 값 입력
 * section-header:      카테고리 합계 행 (자동 계산, 볼드 표시)
 * calc-ytd:            YTD 누적합 (같은 name의 1월~해당 월 합산)
 * calc-installment-bal: Monthly Installment Balance = Cumulative - Cum Spent
 * calc-expenses-total: Income 제외 모든 지출 카테고리 합산
 * calc-net-cf:         Net Monthly CF = Income + Expenses Total
 * calc-account-ncf:   Account Monthly NCF = Net CF + Transfer + FX (Education Savings 제외)
 * calc-balance:        Account Balance (closing) = opening + Account Monthly NCF
 */
export type CFRowType =
  | "section-header"
  | "input"
  | "calc-ytd"
  | "calc-installment-bal"
  | "calc-expenses-total"
  | "calc-net-cf"
  | "calc-account-ncf"
  | "calc-balance";

export interface CFTableRowDef {
  /** 고유 키 — editingCell 상태 등 row 식별에 사용 */
  key: string;
  /** 테이블 첫 열에 표시할 영문 레이블 */
  label: string;
  /** 연결된 CF 카테고리 (계산 전용 행은 null) */
  category: CFCategoryType | null;
  /** MonthlyCFEntry.name — input 행은 DB 저장 이름, 계산 행은 "" */
  name: string;
  rowType: CFRowType;
  /**
   * 해당 행이 카테고리 section-header 합산에 포함되는지 여부
   * false인 행은 Expenses Total에도 포함되지 않음 (informational)
   */
  includeInCatTotal: boolean;
  /** 들여쓰기 레벨 (0=최상위, 1=하위, 2=세부하위) */
  indent: 0 | 1 | 2;
}

// ─────────────────────────────────────────────────────────────────
// 메인 CF 테이블 행 — Income + 4개 지출 카테고리 (순서 엑셀과 동일)
// ─────────────────────────────────────────────────────────────────

export const CF_TABLE_ROWS: CFTableRowDef[] = [
  // ── Income (row 3~7) ──────────────────────────────────────────
  {
    key: "income_header",
    label: "Income",
    category: "INCOME",
    name: "",
    rowType: "section-header",
    includeInCatTotal: false,
    indent: 0,
  },
  {
    key: "salary",
    label: "Salary",
    category: "INCOME",
    name: "Salary",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "interest",
    label: "Interest/dividend income",
    category: "INCOME",
    name: "Interest/dividend income",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "rental",
    label: "Rental/lease income",
    category: "INCOME",
    name: "Rental/lease income",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "income_others",
    label: "Others",
    category: "INCOME",
    name: "Others",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },

  // ── Fixed Expense (row 9~16) ──────────────────────────────────
  {
    key: "fixed_header",
    label: "Fixed Expense",
    category: "FIXED_EXPENSE",
    name: "",
    rowType: "section-header",
    includeInCatTotal: false,
    indent: 0,
  },
  {
    key: "insurance",
    label: "Insurance",
    category: "FIXED_EXPENSE",
    name: "Insurance",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "telecom",
    label: "Telecommunication",
    category: "FIXED_EXPENSE",
    name: "Telecommunication",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "installment",
    label: "Monthly Installment",
    category: "FIXED_EXPENSE",
    name: "Monthly Installment",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    // YTD 누적: Monthly Installment의 1월~해당 월 합산 (음수이므로 절대값 누적)
    key: "installment_cum",
    label: "Monthly Installment Cumulative",
    category: "FIXED_EXPENSE",
    name: "Monthly Installment",
    rowType: "calc-ytd",
    includeInCatTotal: false,
    indent: 2,
  },
  {
    // informational — Expenses Total에 포함 안 됨
    key: "installment_spent",
    label: "Monthly Installment Spent",
    category: "FIXED_EXPENSE",
    name: "Monthly Installment Spent",
    rowType: "input",
    includeInCatTotal: false,
    indent: 2,
  },
  {
    // YTD 누적: Monthly Installment Spent의 1월~해당 월 합산
    key: "installment_cum_spent",
    label: "Monthly Installment Cum Spent",
    category: "FIXED_EXPENSE",
    name: "Monthly Installment Spent",
    rowType: "calc-ytd",
    includeInCatTotal: false,
    indent: 2,
  },
  {
    // Balance = Cumulative - Cum Spent (절대값 기준)
    key: "installment_bal",
    label: "Monthly Installment Balance",
    category: "FIXED_EXPENSE",
    name: "",
    rowType: "calc-installment-bal",
    includeInCatTotal: false,
    indent: 2,
  },

  // ── Credit Card (row 17~20) ───────────────────────────────────
  {
    key: "cc_header",
    label: "Credit Card",
    category: "CREDIT_CARD",
    name: "",
    rowType: "section-header",
    includeInCatTotal: false,
    indent: 0,
  },
  {
    key: "samsung",
    label: "Samsung",
    category: "CREDIT_CARD",
    name: "Samsung",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "hana",
    label: "Hana",
    category: "CREDIT_CARD",
    name: "Hana",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "citi",
    label: "Citi",
    category: "CREDIT_CARD",
    name: "Citi",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },

  // ── Cash Expense (row 21~25) ──────────────────────────────────
  {
    key: "cash_header",
    label: "Cash",
    category: "CASH_EXPENSE",
    name: "",
    rowType: "section-header",
    includeInCatTotal: false,
    indent: 0,
  },
  {
    key: "cny",
    label: "CNY Exchange",
    category: "CASH_EXPENSE",
    name: "CNY Exchange",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "gift",
    label: "Cash-gift/Condolence",
    category: "CASH_EXPENSE",
    name: "Cash-gift/Condolence",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "tuition",
    label: "Tuition",
    category: "CASH_EXPENSE",
    name: "Tuition",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "cash_others",
    label: "Others",
    category: "CASH_EXPENSE",
    name: "Others",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },

  // ── Tax (row 26~29) ───────────────────────────────────────────
  {
    key: "tax_header",
    label: "Tax",
    category: "TAX",
    name: "",
    rowType: "section-header",
    includeInCatTotal: false,
    indent: 0,
  },
  {
    key: "re_rent",
    label: "Real estate - rent",
    category: "TAX",
    name: "Real estate - rent",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "re",
    label: "Real estate",
    category: "TAX",
    name: "Real estate",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "tax_investment",
    label: "Investment",
    category: "TAX",
    name: "Investment",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
];

// ─────────────────────────────────────────────────────────────────
// Account Transfer 섹션 — Net Monthly CF 계산 이후에 표시
// ─────────────────────────────────────────────────────────────────

export const CF_TRANSFER_ROWS: CFTableRowDef[] = [
  {
    // Account Monthly NCF에 포함 (row 35)
    key: "acct_transfer",
    label: "Account Transfer",
    category: "ACCOUNT_TRANSFER",
    name: "Account Transfer",
    rowType: "input",
    includeInCatTotal: true,
    indent: 0,
  },
  {
    // Account Monthly NCF에 포함 (row 36)
    key: "fx",
    label: "Foreign Exchange",
    category: "ACCOUNT_TRANSFER",
    name: "Foreign Exchange",
    rowType: "input",
    includeInCatTotal: true,
    indent: 0,
  },
  {
    // informational — Account Monthly NCF에 포함 안 됨 (row 37)
    key: "edu_savings",
    label: "Education Savings",
    category: "ACCOUNT_TRANSFER",
    name: "Education Savings",
    rowType: "input",
    includeInCatTotal: false,
    indent: 0,
  },
];
