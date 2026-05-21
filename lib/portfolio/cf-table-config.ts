/**
 * Monthly CF 테이블 행 정의 v2
 *
 * 주요 변경:
 *   - Account Transfer → Income 섹션 하단으로 이동
 *   - Monthly Installment 세부 계산 행 제거 (Cum/Spent/Balance)
 *   - Samsung 행 제거, Citi → Others
 *   - CF_TRANSFER_ROWS 비움 (FX/Education Savings 삭제)
 */

import type { CFCategoryType } from "@/types/financial";

/**
 * 행 타입
 *   input:          사용자가 셀 클릭 → 다이얼로그로 항목 관리
 *   section-header: 카테고리 합계 행 (자동 계산)
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
  key: string;
  label: string;
  category: CFCategoryType | null;
  name: string;
  rowType: CFRowType;
  /** 카테고리 section-header 합산 + Expenses Total에 포함 여부 */
  includeInCatTotal: boolean;
  indent: 0 | 1 | 2;
}

// ─────────────────────────────────────────────────────────────────
// 메인 CF 테이블 행
// ─────────────────────────────────────────────────────────────────

export const CF_TABLE_ROWS: CFTableRowDef[] = [
  // ── Income ──────────────────────────────────────────────────────
  // section-header 합계에 Account Transfer(ACCOUNT_TRANSFER 카테고리)도 포함됨
  // → MonthlyCFView의 getCellValue("section-header")에서 특별 처리
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
  {
    // 이전에는 별도 섹션 — Income 합산에 포함되도록 Income 하단으로 이동
    key: "acct_transfer",
    label: "Account Transfer",
    category: "ACCOUNT_TRANSFER",
    name: "Account Transfer",
    rowType: "input",
    includeInCatTotal: false, // getCatTotal("INCOME")에 자동 포함 안 됨 → 뷰에서 직접 처리
    indent: 1,
  },

  // ── Fixed Expense ────────────────────────────────────────────────
  // Monthly Installment 세부 계산 행(Cum/Spent/Balance) 제거
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

  // ── Credit Card ──────────────────────────────────────────────────
  // Samsung 제거, Citi → Others (name도 "Others"로 변경)
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
    key: "hana",
    label: "Hana",
    category: "CREDIT_CARD",
    name: "Hana",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },
  {
    key: "cc_others",
    label: "Others",
    category: "CREDIT_CARD",
    name: "Others",
    rowType: "input",
    includeInCatTotal: true,
    indent: 1,
  },

  // ── Cash Expense ─────────────────────────────────────────────────
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

  // ── Tax ──────────────────────────────────────────────────────────
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

/**
 * CF_TRANSFER_ROWS — 별도 섹션 행 목록
 * Account Transfer는 Income 섹션으로 이동, FX/Education Savings 삭제
 * → 빈 배열 유지 (타입 참조 호환성)
 */
export const CF_TRANSFER_ROWS: CFTableRowDef[] = [];
