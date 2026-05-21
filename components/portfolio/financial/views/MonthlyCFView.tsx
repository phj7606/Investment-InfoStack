"use client";

/**
 * Monthly CF (현금흐름) 탭 v2 — 엑셀 "Monthly CF" 시트와 동일한 테이블
 *
 * 핵심 특징:
 *   1. 모든 sub-item row 항상 표시 (다이얼로그 없이 테이블에 노출)
 *   2. 영문 레이블 (엑셀과 동일)
 *   3. 셀 클릭 → 다이얼로그에서 해당 셀의 여러 항목 관리
 *      (같은 [category, name, month]에 여러 항목 추가 가능)
 *   4. 셀에는 해당 항목들의 합산값 표시
 *   5. 연도 선택 버튼 (자산관리와 동일 패턴)
 *   6. Import Jan–Apr 버튼으로 엑셀에서 일괄 가져오기
 *
 * 계산 행 목록 (읽기 전용):
 *   section-header:     카테고리 합계
 *   YTD Cumulative:     Monthly Installment / Spent 누적합
 *   Installment Balance: Cumulative - Cum Spent
 *   Expenses Total:     모든 지출 카테고리 합산
 *   Net Monthly CF:     Income + Expenses Total
 *   Account Monthly NCF: Net CF + Transfer + FX (Education Savings 제외)
 *   Account Balance:    opening + NCF (연쇄 계산)
 */

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Upload, RefreshCw } from "lucide-react";
import { MonthlyCFSubItemDialog } from "../MonthlyCFSubItemDialog";
import type { MonthlyCFEntry, MonthlyCFBalance, CFCategoryType } from "@/types/financial";
import {
  CF_TABLE_ROWS,
  CF_TRANSFER_ROWS,
  type CFTableRowDef,
} from "@/lib/portfolio/cf-table-config";

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface MonthlyCFViewProps {
  /** 전체 CF 항목 (연도 필터 없이 모두 전달) */
  entries: MonthlyCFEntry[];
  /** 월별 계좌 opening 잔액 맵 */
  balances: MonthlyCFBalance;
  /** 기본 표시 연도 */
  year: number;
  /** 데이터 재조회 콜백 */
  onRefresh: () => void;
  /** 계좌 잔액 저장 콜백 */
  onBalanceUpdate: (month: string, amount: number) => Promise<void>;
  /** 계좌 잔액 삭제(자동계산 복귀) 콜백 */
  onBalanceDelete: (month: string) => Promise<void>;
}

// ─────────────────────────────────────────
// 다이얼로그 열린 상태 타입
// ─────────────────────────────────────────

interface OpenDialog {
  rowDef: CFTableRowDef;
  month: string;
}

// ─────────────────────────────────────────
// Account Balance 인라인 편집 상태
// ─────────────────────────────────────────

interface BalanceEditState {
  month: string;
  value: string;
}

// ─────────────────────────────────────────
// 월 레이블 헬퍼
// ─────────────────────────────────────────

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function monthLabel(monthStr: string): string {
  const mo = parseInt(monthStr.split("-")[1]) - 1;
  return MONTH_LABELS[mo] ?? monthStr;
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function MonthlyCFView({
  entries,
  balances,
  year,
  onRefresh,
  onBalanceUpdate,
}: MonthlyCFViewProps) {
  const curYear = new Date().getFullYear();

  // ── 연도 선택 ─────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState(year);

  // ── 표시할 월 목록 (Jan ~ 해당 연도 현재월) ──────────────────
  const months = useMemo(() => {
    const now = new Date();
    const endMonth =
      now.getFullYear() === selectedYear ? now.getMonth() + 1 : 12;
    return Array.from({ length: endMonth }, (_, i) =>
      `${selectedYear}-${String(i + 1).padStart(2, "0")}`
    );
  }, [selectedYear]);

  // ── 다이얼로그 상태 ───────────────────────────────────────────
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);

  // ── Account Balance 인라인 편집 상태 ─────────────────────────
  const [balanceEdit, setBalanceEdit] = useState<BalanceEditState | null>(null);
  const [balanceSaving, setBalanceSaving] = useState(false);

  // ── Import 상태 ───────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // ── entries → 빠른 조회 맵 { "CAT|name|month": MonthlyCFEntry[] } ─
  // 같은 [category, name, month]에 여러 항목이 존재할 수 있으므로 배열로 관리
  const entryMap = useMemo(() => {
    const map = new Map<string, MonthlyCFEntry[]>();
    for (const e of entries) {
      const key = `${e.category}|${e.name}|${e.month}`;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [entries]);

  /** 특정 [category, name, month]의 모든 항목 조회 */
  const getEntries = useCallback(
    (category: string, name: string, month: string): MonthlyCFEntry[] => {
      return entryMap.get(`${category}|${name}|${month}`) ?? [];
    },
    [entryMap]
  );

  /** 특정 [category, name, month]의 합산 amount */
  const getAmount = useCallback(
    (category: string, name: string, month: string): number => {
      return getEntries(category, name, month).reduce((s, e) => s + e.amount, 0);
    },
    [getEntries]
  );

  // ── 계산 함수들 ───────────────────────────────────────────────

  /** section-header: 해당 카테고리 includeInCatTotal=true 행 합산 */
  const getCatTotal = useCallback(
    (category: CFCategoryType, month: string): number => {
      const allRows = [...CF_TABLE_ROWS, ...CF_TRANSFER_ROWS];
      return allRows
        .filter(
          (r) => r.category === category && r.rowType === "input" && r.includeInCatTotal
        )
        .reduce((sum, r) => sum + getAmount(category, r.name, month), 0);
    },
    [getAmount]
  );

  /** calc-ytd: 해당 연도 1월~해당 월까지 누적합 */
  const getYTD = useCallback(
    (rowDef: CFTableRowDef, month: string): number => {
      if (!rowDef.category) return 0;
      const [yr, mo] = month.split("-");
      const moNum = parseInt(mo);
      let total = 0;
      for (let m = 1; m <= moNum; m++) {
        const mStr = `${yr}-${String(m).padStart(2, "0")}`;
        total += getAmount(rowDef.category, rowDef.name, mStr);
      }
      return total;
    },
    [getAmount]
  );

  /** Monthly Installment Balance = Cumulative - Cum Spent */
  const getInstallmentBalance = useCallback(
    (month: string): number => {
      const [yr, mo] = month.split("-");
      const moNum = parseInt(mo);
      let cumInstallment = 0;
      let cumSpent = 0;
      for (let m = 1; m <= moNum; m++) {
        const mStr = `${yr}-${String(m).padStart(2, "0")}`;
        cumInstallment += getAmount("FIXED_EXPENSE", "Monthly Installment", mStr);
        cumSpent += getAmount("FIXED_EXPENSE", "Monthly Installment Spent", mStr);
      }
      // 지출은 음수 → Balance = Cumulative - CumSpent (음수 - 음수)
      return cumInstallment - cumSpent;
    },
    [getAmount]
  );

  /**
   * Expenses Total — 모든 지출 카테고리의 includeInCatTotal=true 행 합산
   * Monthly Installment Spent 등 informational 행 제외
   */
  const getExpensesTotal = useCallback(
    (month: string): number => {
      const expenseCats = ["FIXED_EXPENSE", "CREDIT_CARD", "CASH_EXPENSE", "TAX"] as const;
      return expenseCats.reduce((sum, cat) => {
        return (
          sum +
          CF_TABLE_ROWS.filter(
            (r) => r.category === cat && r.rowType === "input" && r.includeInCatTotal
          ).reduce((s, r) => s + getAmount(cat, r.name, month), 0)
        );
      }, 0);
    },
    [getAmount]
  );

  /** Net Monthly CF = Income + Expenses Total (지출 음수 포함) */
  const getNetCF = useCallback(
    (month: string): number => {
      return getCatTotal("INCOME", month) + getExpensesTotal(month);
    },
    [getCatTotal, getExpensesTotal]
  );

  /**
   * Account Monthly NCF = Net CF + Account Transfer + Foreign Exchange
   * Education Savings 제외 (informational)
   */
  const getAccountNCF = useCallback(
    (month: string): number => {
      return (
        getNetCF(month) +
        getAmount("ACCOUNT_TRANSFER", "Account Transfer", month) +
        getAmount("ACCOUNT_TRANSFER", "Foreign Exchange", month)
      );
    },
    [getNetCF, getAmount]
  );

  /**
   * Account Balance (closing) = opening + Account Monthly NCF
   * 전월 closing이 당월 opening으로 자동 연쇄
   */
  const getClosingBalance = useCallback(
    (month: string): number => {
      return getOpeningBalance(month) + getAccountNCF(month);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getAccountNCF, balances, months]
  );

  const getOpeningBalance = useCallback(
    (month: string): number => {
      if (balances[month] !== undefined) return balances[month];
      const [yr, mo] = month.split("-");
      const prevMo = parseInt(mo) - 1;
      if (prevMo <= 0) return 0;
      const prevMonth = `${yr}-${String(prevMo).padStart(2, "0")}`;
      return getClosingBalance(prevMonth);
    },
    [balances, getClosingBalance]
  );

  /** rowType별 셀 값 계산 */
  const getCellValue = useCallback(
    (rowDef: CFTableRowDef, month: string): number => {
      switch (rowDef.rowType) {
        case "section-header":
          return rowDef.category ? getCatTotal(rowDef.category, month) : 0;
        case "input":
          return rowDef.category ? getAmount(rowDef.category, rowDef.name, month) : 0;
        case "calc-ytd":
          return getYTD(rowDef, month);
        case "calc-installment-bal":
          return getInstallmentBalance(month);
        default:
          return 0;
      }
    },
    [getCatTotal, getAmount, getYTD, getInstallmentBalance]
  );

  // ── 다이얼로그 콜백 ───────────────────────────────────────────

  const handleAdd = useCallback(
    async (params: {
      category: CFCategoryType;
      name: string;
      month: string;
      amount: number;
      note?: string;
    }) => {
      await fetch("/api/portfolio/financial/monthly-cf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      onRefresh();
    },
    [onRefresh]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/portfolio/financial/monthly-cf?id=${id}`, {
        method: "DELETE",
      });
      onRefresh();
    },
    [onRefresh]
  );

  // ── Account Balance 인라인 편집 ───────────────────────────────

  const startBalanceEdit = (month: string) => {
    const current = balances[month];
    setBalanceEdit({
      month,
      value: current !== undefined ? String(current) : "",
    });
  };

  const confirmBalanceEdit = async () => {
    if (!balanceEdit || balanceSaving) return;
    const raw = parseFloat(balanceEdit.value.replace(/,/g, ""));
    if (!isNaN(raw)) {
      setBalanceSaving(true);
      try {
        await onBalanceUpdate(balanceEdit.month, raw);
        onRefresh();
      } finally {
        setBalanceSaving(false);
      }
    }
    setBalanceEdit(null);
  };

  // ── Excel Import ──────────────────────────────────────────────

  const handleImport = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch(
        "/api/portfolio/financial/monthly-cf/import-excel?overwrite=false",
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        setImportMsg(`오류: ${data.error}`);
      } else {
        setImportMsg(
          `완료 — 신규: ${data.imported}건, 스킵: ${data.skipped}건`
        );
        onRefresh();
      }
    } catch (e) {
      setImportMsg(`요청 실패: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  // ── 표시 포맷 ────────────────────────────────────────────────

  function fmtAbs(val: number): string {
    if (val === 0 || isNaN(val)) return "—";
    return Math.abs(val).toLocaleString();
  }

  function fmtSigned(val: number): string {
    if (val === 0 || isNaN(val)) return "—";
    return val > 0 ? `+${val.toLocaleString()}` : val.toLocaleString();
  }

  function cellColor(val: number, isIncomeRow: boolean): string {
    if (val === 0 || isNaN(val)) return "text-muted-foreground";
    if (isIncomeRow) return val >= 0 ? "text-emerald-600" : "text-red-500";
    return val < 0 ? "text-red-500" : "text-emerald-600";
  }

  // ── 행 렌더링 ────────────────────────────────────────────────

  function renderRow(rowDef: CFTableRowDef) {
    const isHeader = rowDef.rowType === "section-header";
    const isInput = rowDef.rowType === "input";
    const isCalc = !isInput && !isHeader;
    const isIncome = rowDef.category === "INCOME";

    const indentCls = rowDef.indent === 1 ? "pl-4" : rowDef.indent === 2 ? "pl-8" : "";
    const bgCls = isHeader ? "bg-muted/50" : isCalc ? "bg-muted/20" : "";
    const weightCls = isHeader ? "font-semibold" : isCalc ? "font-medium" : "";
    const szCls = rowDef.indent >= 2 ? "text-xs" : "text-sm";
    const borderCls = isHeader ? "border-t-2 border-border" : "border-t border-border/30";

    // Total 컬럼 값
    const totalVal =
      rowDef.rowType === "calc-ytd" || rowDef.rowType === "calc-installment-bal"
        ? NaN
        : months.reduce((s, m) => s + getCellValue(rowDef, m), 0);

    return (
      <tr key={rowDef.key} className={`${borderCls} ${bgCls}`}>
        {/* 레이블 */}
        <td
          className={`sticky left-0 z-10 bg-inherit px-3 py-1.5 whitespace-nowrap ${szCls} ${weightCls} ${indentCls} ${bgCls || "bg-card"}`}
        >
          {rowDef.label}
        </td>

        {/* 월별 셀 */}
        {months.map((month) => {
          const val = getCellValue(rowDef, month);
          const clickable = isInput && rowDef.category;

          return (
            <td
              key={month}
              onClick={() => {
                if (clickable)
                  setOpenDialog({ rowDef, month });
              }}
              className={`px-3 py-1.5 text-right tabular-nums ${szCls}
                ${cellColor(val, isIncome)}
                ${clickable ? "cursor-pointer hover:bg-muted/60" : ""}
              `}
            >
              {/* input 행: 절대값, 계산 행: 부호 포함 */}
              {isInput ? fmtAbs(val) : isHeader ? fmtAbs(val) : fmtSigned(val)}
            </td>
          );
        })}

        {/* Total */}
        <td className={`px-3 py-1.5 text-right tabular-nums ${szCls} text-muted-foreground`}>
          {isNaN(totalVal) ? "—" : isInput ? fmtAbs(totalVal) : fmtSigned(totalVal)}
        </td>
      </tr>
    );
  }

  /** 계산 전용 요약 행 (Expenses Total / Net CF / Account NCF) */
  function renderSummaryRow(opts: {
    key: string;
    label: string;
    getValue: (month: string) => number;
    bold?: boolean;
    borderTop?: boolean;
    showTotal?: boolean;
  }) {
    const { key, label, getValue, bold = false, borderTop = false, showTotal = true } = opts;
    return (
      <tr key={key} className={`${borderTop ? "border-t-2 border-border" : "border-t border-border/30"} bg-muted/50`}>
        <td className={`sticky left-0 z-10 bg-muted/50 px-3 py-1.5 whitespace-nowrap text-sm ${bold ? "font-bold" : "font-semibold"}`}>
          {label}
        </td>
        {months.map((month) => {
          const val = getValue(month);
          return (
            <td
              key={month}
              className={`px-3 py-1.5 text-right tabular-nums text-sm ${cellColor(val, true)}`}
            >
              {fmtSigned(val)}
            </td>
          );
        })}
        <td className="px-3 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
          {showTotal
            ? fmtSigned(months.reduce((s, m) => s + getValue(m), 0))
            : "—"}
        </td>
      </tr>
    );
  }

  /** Account Balance (opening/closing) 행 */
  function renderBalanceRow(type: "prev" | "close") {
    const label = type === "prev" ? "Account Balance (prev)" : "Account Balance";
    const getVal = type === "prev" ? getOpeningBalance : getClosingBalance;
    const rowKey = type === "prev" ? "balance_prev" : "balance_close";

    return (
      <tr
        key={rowKey}
        className="border-t-2 border-border bg-blue-50/40 dark:bg-blue-950/20"
      >
        <td className="sticky left-0 z-10 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-1.5 whitespace-nowrap text-sm font-bold">
          {label}
        </td>
        {months.map((month) => {
          const isEditing = balanceEdit?.month === month && type === "prev";
          const val = getVal(month);
          const isManual = type === "prev" && balances[month] !== undefined;

          return (
            <td
              key={month}
              onClick={() => type === "prev" && !isEditing && startBalanceEdit(month)}
              className={`px-3 py-1.5 text-right tabular-nums text-sm
                ${type === "prev" ? "cursor-pointer hover:bg-muted/60" : ""}
                ${val >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-500"}
                ${isManual ? "underline decoration-dotted" : ""}
              `}
            >
              {isEditing ? (
                <div className="flex items-center justify-end gap-1">
                  <Input
                    autoFocus
                    value={balanceEdit.value}
                    onChange={(e) =>
                      setBalanceEdit((prev) =>
                        prev ? { ...prev, value: e.target.value } : null
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmBalanceEdit();
                      if (e.key === "Escape") setBalanceEdit(null);
                    }}
                    className="h-6 w-24 text-xs px-1 py-0 text-right"
                    type="number"
                    disabled={balanceSaving}
                  />
                  <button onClick={confirmBalanceEdit} disabled={balanceSaving} className="text-emerald-600">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setBalanceEdit(null)} className="text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : val !== 0 ? val.toLocaleString() : "—"}
            </td>
          );
        })}
        <td className="px-3 py-1.5 text-right text-sm text-muted-foreground">—</td>
      </tr>
    );
  }

  // ── 다이얼로그에 전달할 entries ───────────────────────────────

  const dialogEntries = openDialog
    ? getEntries(
        openDialog.rowDef.category!,
        openDialog.rowDef.name,
        openDialog.month
      )
    : [];

  // ── 렌더링 ────────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Monthly Cashflow</CardTitle>
              {/* 연도 선택 버튼 */}
              <div className="flex gap-1">
                {[curYear - 1, curYear].map((y) => (
                  <Button
                    key={y}
                    variant={selectedYear === y ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-3"
                    onClick={() => setSelectedYear(y)}
                  >
                    {y}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {importMsg && (
                <span className="text-xs text-muted-foreground">{importMsg}</span>
              )}
              <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 gap-1 text-xs">
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImport}
                disabled={importing}
                className="h-7 gap-1 text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                {importing ? "Importing..." : "Import Jan–Apr"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              {/* 헤더 */}
              <thead>
                <tr className="border-b-2 border-border bg-muted/60">
                  <th className="sticky left-0 z-20 bg-muted/60 px-3 py-2 text-left text-xs font-semibold whitespace-nowrap min-w-[220px]">
                    Category
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap min-w-[100px]"
                    >
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-xs font-semibold whitespace-nowrap">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* Account Balance (opening) */}
                {renderBalanceRow("prev")}

                {/* Income + 지출 카테고리 모든 행 */}
                {CF_TABLE_ROWS.map((rowDef) => renderRow(rowDef))}

                {/* Expenses Total */}
                {renderSummaryRow({
                  key: "expenses_total",
                  label: "Expenses Total",
                  getValue: getExpensesTotal,
                  bold: true,
                  borderTop: true,
                })}

                {/* Net Monthly CF */}
                {renderSummaryRow({
                  key: "net_cf",
                  label: "Net Monthly CF",
                  getValue: getNetCF,
                  bold: true,
                })}

                {/* Account Transfer 섹션 헤더 */}
                <tr className="border-t-2 border-border">
                  <td
                    colSpan={months.length + 2}
                    className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-muted/20"
                  >
                    Account Transfer
                  </td>
                </tr>
                {CF_TRANSFER_ROWS.map((rowDef) => renderRow(rowDef))}

                {/* Account Monthly NCF */}
                {renderSummaryRow({
                  key: "account_ncf",
                  label: "Account Monthly NCF",
                  getValue: getAccountNCF,
                  bold: true,
                  borderTop: true,
                })}

                {/* Account Balance (closing) */}
                {renderBalanceRow("close")}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── 세부항목 다이얼로그 ─────────────────────────────────── */}
      {openDialog && (
        <MonthlyCFSubItemDialog
          open={!!openDialog}
          onClose={() => setOpenDialog(null)}
          label={openDialog.rowDef.label}
          category={openDialog.rowDef.category!}
          name={openDialog.rowDef.name}
          month={openDialog.month}
          entries={dialogEntries}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
