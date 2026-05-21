"use client";

/**
 * Monthly CF (현금흐름) 탭 v3
 *
 * 레이아웃:
 *   Account Balance (prev)
 *   Income (합계 = INCOME 합 + Account Transfer)
 *     Salary / Interest / Rental / Others / Account Transfer
 *   Fixed Expense (합계)
 *     Insurance / Telecommunication / Monthly Installment
 *   Credit Card (합계)
 *     Hana / Others
 *   Cash (합계)
 *     CNY Exchange / Cash-gift / Tuition / Others
 *   Tax (합계)
 *     Real estate - rent / Real estate / Investment
 *   Expenses Total  ← 양수·붉은색
 *   Account Balance  ← prev + Income - Expenses Total
 *
 * 색상 규칙:
 *   - Income 섹션(INCOME + Account Transfer): 녹색/적색
 *   - 나머지 숫자: 검정 (text-foreground)
 *   - Expenses Total: 항상 붉은색 ("+" 부호)
 *   - Account Balance 행: 파란색 (특수 행)
 */

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Upload, RefreshCw } from "lucide-react";
import { MonthlyCFSubItemDialog } from "../MonthlyCFSubItemDialog";
import type { MonthlyCFEntry, MonthlyCFBalance, CFCategoryType } from "@/types/financial";
import { CF_TABLE_ROWS, type CFTableRowDef } from "@/lib/portfolio/cf-table-config";

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface MonthlyCFViewProps {
  entries: MonthlyCFEntry[];
  balances: MonthlyCFBalance;
  year: number;
  onRefresh: () => void;
  onBalanceUpdate: (month: string, amount: number) => Promise<void>;
  onBalanceDelete: (month: string) => Promise<void>;
}

// ─────────────────────────────────────────
// 다이얼로그 열린 상태
// ─────────────────────────────────────────

interface OpenDialog {
  rowDef: CFTableRowDef;
  month: string;
}

// ─────────────────────────────────────────
// Account Balance 인라인 편집
// ─────────────────────────────────────────

interface BalanceEdit {
  month: string;
  value: string;
}

// ─────────────────────────────────────────
// 월 레이블
// ─────────────────────────────────────────

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];
function monthLabel(m: string) {
  return MONTH_LABELS[parseInt(m.split("-")[1]) - 1] ?? m;
}

// ─────────────────────────────────────────
// Income 섹션으로 이동한 Account Transfer 키
// ─────────────────────────────────────────
const ACCT_TRANSFER_KEY = "acct_transfer";
const ACCT_TRANSFER_NAME = "Account Transfer";

// ─────────────────────────────────────────
// 색상 헬퍼
// ─────────────────────────────────────────

/** Income 섹션에 속하는 행인지 (색상 결정용) */
function isIncomeStyling(rowDef: CFTableRowDef): boolean {
  return (
    rowDef.category === "INCOME" ||
    rowDef.key === ACCT_TRANSFER_KEY
  );
}

/** 셀 색상 — Income: 녹/적, 나머지: 검정 */
function incomeColor(val: number): string {
  if (val === 0 || isNaN(val)) return "text-muted-foreground";
  return val >= 0 ? "text-emerald-600" : "text-red-500";
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

  // ── 연도 선택 ──────────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState(year);

  // ── 표시 월 목록 ───────────────────────────────────────────────
  const months = useMemo(() => {
    const now = new Date();
    const end = now.getFullYear() === selectedYear ? now.getMonth() + 1 : 12;
    return Array.from({ length: end }, (_, i) =>
      `${selectedYear}-${String(i + 1).padStart(2, "0")}`
    );
  }, [selectedYear]);

  // ── 다이얼로그 상태 ────────────────────────────────────────────
  const [openDialog, setOpenDialog] = useState<OpenDialog | null>(null);

  // ── Balance 인라인 편집 ────────────────────────────────────────
  const [balEdit, setBalEdit] = useState<BalanceEdit | null>(null);
  const [balSaving, setBalSaving] = useState(false);

  // ── Import 상태 ────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // ── entry 맵 { "CAT|name|month": MonthlyCFEntry[] } ───────────
  const entryMap = useMemo(() => {
    const map = new Map<string, MonthlyCFEntry[]>();
    for (const e of entries) {
      const k = `${e.category}|${e.name}|${e.month}`;
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [entries]);

  const getEntries = useCallback(
    (cat: string, name: string, month: string) =>
      entryMap.get(`${cat}|${name}|${month}`) ?? [],
    [entryMap]
  );

  const getAmount = useCallback(
    (cat: string, name: string, month: string): number =>
      getEntries(cat, name, month).reduce((s, e) => s + e.amount, 0),
    [getEntries]
  );

  // ── 계산 ──────────────────────────────────────────────────────

  /** INCOME 카테고리 합산 (Account Transfer 미포함) */
  const getIncomeCatTotal = useCallback(
    (month: string): number =>
      CF_TABLE_ROWS.filter(
        (r) => r.category === "INCOME" && r.rowType === "input" && r.includeInCatTotal
      ).reduce((s, r) => s + getAmount("INCOME", r.name, month), 0),
    [getAmount]
  );

  /** Account Transfer 금액 */
  const getTransferAmount = useCallback(
    (month: string): number =>
      getAmount("ACCOUNT_TRANSFER", ACCT_TRANSFER_NAME, month),
    [getAmount]
  );

  /** Income 합계 = INCOME rows + Account Transfer */
  const getIncomeTotal = useCallback(
    (month: string): number =>
      getIncomeCatTotal(month) + getTransferAmount(month),
    [getIncomeCatTotal, getTransferAmount]
  );

  /** 카테고리 합계 (section-header 표시용) */
  const getCatTotal = useCallback(
    (category: CFCategoryType, month: string): number =>
      CF_TABLE_ROWS.filter(
        (r) => r.category === category && r.rowType === "input" && r.includeInCatTotal
      ).reduce((s, r) => s + getAmount(category, r.name, month), 0),
    [getAmount]
  );

  /**
   * Expenses Total = Fixed Expense + Credit Card + Cash + Tax 각 섹션 합계
   * getCatTotal을 직접 합산 → 섹션 헤더 값의 합과 동일
   * 결과는 음수 (내부 표현), 표시 시 절대값으로 변환
   */
  const getExpensesTotal = useCallback(
    (month: string): number => {
      const expCats = ["FIXED_EXPENSE", "CREDIT_CARD", "CASH_EXPENSE", "TAX"] as const;
      return expCats.reduce((sum, cat) => sum + getCatTotal(cat, month), 0);
    },
    [getCatTotal]
  );

  /**
   * Account Balance (closing) = prev + Income - abs(Expenses Total)
   * = prev + Income + Expenses (음수)  ← 부호 처리 동일
   */
  const getClosingBalance = useCallback(
    (month: string): number =>
      getOpeningBalance(month) + getIncomeTotal(month) + getExpensesTotal(month),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getIncomeTotal, getExpensesTotal, balances, months]
  );

  const getOpeningBalance = useCallback(
    (month: string): number => {
      if (balances[month] !== undefined) return balances[month];
      const [yr, mo] = month.split("-");
      const prev = parseInt(mo) - 1;
      if (prev <= 0) return 0;
      return getClosingBalance(`${yr}-${String(prev).padStart(2, "0")}`);
    },
    [balances, getClosingBalance]
  );

  /** rowType별 셀 값 */
  const getCellValue = useCallback(
    (rowDef: CFTableRowDef, month: string): number => {
      if (rowDef.rowType === "section-header") {
        if (!rowDef.category) return 0;
        // Income 헤더: INCOME 합 + Account Transfer 포함
        if (rowDef.category === "INCOME") return getIncomeTotal(month);
        return getCatTotal(rowDef.category, month);
      }
      if (rowDef.rowType === "input" && rowDef.category) {
        return getAmount(rowDef.category, rowDef.name, month);
      }
      return 0;
    },
    [getIncomeTotal, getCatTotal, getAmount]
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

  const handleUpdate = useCallback(
    async (id: string, amount: number, note?: string) => {
      await fetch(`/api/portfolio/financial/monthly-cf?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note }),
      });
      onRefresh();
    },
    [onRefresh]
  );

  // ── Account Balance 편집 ──────────────────────────────────────

  const startBalEdit = (month: string) => {
    const cur = balances[month];
    setBalEdit({ month, value: cur !== undefined ? String(cur) : "" });
  };

  const confirmBalEdit = async () => {
    if (!balEdit || balSaving) return;
    const num = parseFloat(balEdit.value.replace(/,/g, ""));
    if (!isNaN(num)) {
      setBalSaving(true);
      try {
        await onBalanceUpdate(balEdit.month, num);
        onRefresh();
      } finally {
        setBalSaving(false);
      }
    }
    setBalEdit(null);
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
      setImportMsg(
        res.ok
          ? `완료 — 신규: ${data.imported}건, 스킵: ${data.skipped}건`
          : `오류: ${data.error}`
      );
      if (res.ok) onRefresh();
    } catch (e) {
      setImportMsg(`요청 실패: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  // ── 포맷 ─────────────────────────────────────────────────────

  /** 절대값 표시 (지출 행: 음수 저장 → 양수 표시) */
  function fmtAbs(val: number): string {
    if (val === 0 || isNaN(val)) return "—";
    return Math.abs(val).toLocaleString();
  }

  /** Expenses Total: 절대값 (부호 없음) */
  function fmtExpTotal(val: number): string {
    if (val === 0 || isNaN(val)) return "—";
    return Math.abs(val).toLocaleString();
  }

  /** Income 셀: "+" 없이 숫자만, 음수일 때만 "-" */
  function fmtSigned(val: number): string {
    if (val === 0 || isNaN(val)) return "—";
    return val.toLocaleString();
  }

  // ── 행 렌더링 ────────────────────────────────────────────────

  function renderRow(rowDef: CFTableRowDef) {
    const isHeader = rowDef.rowType === "section-header";
    const isInput = rowDef.rowType === "input";
    const incomeStyled = isIncomeStyling(rowDef);

    const indentCls = rowDef.indent === 1 ? "pl-5" : rowDef.indent === 2 ? "pl-9" : "";
    const bgCls = isHeader ? "bg-muted/50" : "";
    const weightCls = isHeader ? "font-semibold" : "";
    const borderCls = isHeader ? "border-t-2 border-border" : "border-t border-border/30";

    // Total 컬럼 합산
    const totalVal = months.reduce((s, m) => s + getCellValue(rowDef, m), 0);

    return (
      <tr key={rowDef.key} className={`${borderCls} ${bgCls}`}>
        {/* 레이블 */}
        <td
          className={`sticky left-0 z-10 bg-inherit px-3 py-1.5 whitespace-nowrap text-sm ${weightCls} ${indentCls} ${bgCls || "bg-card"}`}
        >
          {rowDef.label}
        </td>

        {/* 월별 셀 */}
        {months.map((month) => {
          const val = getCellValue(rowDef, month);

          // 색상 결정
          let colorCls: string;
          if (isHeader && rowDef.category === "INCOME") {
            // Income header: 값이 있으면 녹색
            colorCls = val === 0 ? "text-muted-foreground" : incomeColor(val);
          } else if (incomeStyled) {
            colorCls = incomeColor(val);
          } else {
            // 지출 섹션: 검정 (값 있으면), 없으면 회색
            colorCls = val === 0 ? "text-muted-foreground" : "text-foreground";
          }

          return (
            <td
              key={month}
              onClick={() => isInput && rowDef.category && setOpenDialog({ rowDef, month })}
              className={`px-3 py-1.5 text-right tabular-nums text-sm
                ${colorCls}
                ${isInput && rowDef.category ? "cursor-pointer hover:bg-muted/60" : ""}
              `}
            >
              {/* Income/Account Transfer: 부호 포함, 지출 섹션(헤더 포함): 절대값 (부호 없음) */}
              {incomeStyled ? fmtSigned(val) : fmtAbs(val)}
            </td>
          );
        })}

        {/* Total 컬럼 */}
        <td className={`px-3 py-1.5 text-right tabular-nums text-sm ${
          incomeStyled
            ? totalVal === 0 ? "text-muted-foreground" : incomeColor(totalVal)
            : totalVal === 0 ? "text-muted-foreground" : "text-foreground"
        }`}>
          {incomeStyled ? fmtSigned(totalVal) : fmtAbs(totalVal)}
        </td>
      </tr>
    );
  }

  /** Expenses Total 행 — 양수, 붉은색 */
  function renderExpensesTotal() {
    const totalYTD = months.reduce((s, m) => s + getExpensesTotal(m), 0);
    return (
      <tr className="border-t-2 border-border bg-muted/50">
        <td className="sticky left-0 z-10 bg-muted/50 px-3 py-1.5 whitespace-nowrap text-sm font-bold">
          Expenses Total
        </td>
        {months.map((month) => {
          const val = getExpensesTotal(month);
          return (
            <td key={month} className={`px-3 py-1.5 text-right tabular-nums text-sm font-semibold ${val !== 0 ? "text-red-500" : "text-muted-foreground"}`}>
              {fmtExpTotal(val)}
            </td>
          );
        })}
        <td className={`px-3 py-1.5 text-right tabular-nums text-sm font-semibold ${totalYTD !== 0 ? "text-red-500" : "text-muted-foreground"}`}>
          {fmtExpTotal(totalYTD)}
        </td>
      </tr>
    );
  }

  /** Account Balance (opening/closing) 행 */
  function renderBalanceRow(type: "prev" | "close") {
    const label =
      type === "prev" ? "Account Balance (prev)" : "Account Balance";
    const getVal = type === "prev" ? getOpeningBalance : getClosingBalance;

    return (
      <tr
        key={type === "prev" ? "balance_prev" : "balance_close"}
        className="border-t-2 border-border bg-blue-50/40 dark:bg-blue-950/20"
      >
        <td className="sticky left-0 z-10 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-1.5 whitespace-nowrap text-sm font-bold">
          {label}
        </td>
        {months.map((month) => {
          const isEditing = balEdit?.month === month && type === "prev";
          const val = getVal(month);
          const isManual = type === "prev" && balances[month] !== undefined;

          return (
            <td
              key={month}
              onClick={() => type === "prev" && !isEditing && startBalEdit(month)}
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
                    value={balEdit.value}
                    onChange={(e) =>
                      setBalEdit((prev) => prev ? { ...prev, value: e.target.value } : null)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmBalEdit();
                      if (e.key === "Escape") setBalEdit(null);
                    }}
                    className="h-6 w-24 text-xs px-1 py-0 text-right"
                    type="number"
                    disabled={balSaving}
                  />
                  <button onClick={confirmBalEdit} disabled={balSaving} className="text-emerald-600">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setBalEdit(null)} className="text-muted-foreground">
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

  // ── 다이얼로그 entries ────────────────────────────────────────

  const dialogEntries = openDialog
    ? getEntries(openDialog.rowDef.category!, openDialog.rowDef.name, openDialog.month)
    : [];

  // ── 렌더링 ───────────────────────────────────────────────────

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">Monthly Cashflow</CardTitle>
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
                {/* Account Balance (prev) */}
                {renderBalanceRow("prev")}

                {/* 모든 CF 행 (Income 포함 acct_transfer, 지출 카테고리) */}
                {CF_TABLE_ROWS.map((rowDef) => renderRow(rowDef))}

                {/* Expenses Total */}
                {renderExpensesTotal()}

                {/* Account Balance (closing) */}
                {renderBalanceRow("close")}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 세부항목 다이얼로그 */}
      {openDialog && (
        <MonthlyCFSubItemDialog
          open
          onClose={() => setOpenDialog(null)}
          label={openDialog.rowDef.label}
          category={openDialog.rowDef.category!}
          name={openDialog.rowDef.name}
          month={openDialog.month}
          entries={dialogEntries}
          onAdd={handleAdd}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
