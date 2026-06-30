"use client";

/**
 * 자산관리 연간 테이블 뷰
 *
 * 섹션: KOR Stocks | US Stocks(USD) | Summary
 * Stock Deposit / Cash & Equivalent / Exchange Rates → Deposit & FX 페이지로 이동
 */

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckSquare } from "lucide-react";
import { LockPricesDialog } from "./LockPricesDialog";
import { buildAssetManagementYearlyData, currentMonth } from "@/lib/portfolio/financial-calc";
import type {
  FinancialSnapshot,
  LivePortfolioData,
  AssetManagementColumnData,
  AssetManagementSectionData,
  TxSummaryByMonth,
} from "@/types/financial";

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface AssetManagementViewProps {
  snapshots: FinancialSnapshot[];
  liveData: LivePortfolioData | null;
  liveLoading: boolean;
  onRefresh: () => void;
  txSummaries?: TxSummaryByMonth;
}

// ─────────────────────────────────────────
// 포맷 유틸 — 전체 수치 표시
// ─────────────────────────────────────────

/** KRW 금액: 쉼표 구분, 음수는 괄호 표기 (예: 1,482,352,065 / (1,234)) */
function fmtKrw(v: number): string {
  if (v === 0) return "–";
  const abs = Math.abs(Math.round(v));
  const str = abs.toLocaleString("ko-KR");
  return v < 0 ? `(${str})` : str;
}

/** USD 금액: $ 접두사, 소수점 없음, 음수는 괄호 표기 (예: $131,426 / ($1,234)) */
function fmtUsd(v: number): string {
  if (v === 0) return "–";
  const abs = Math.abs(v);
  const str = "$" + abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return v < 0 ? `(${str})` : str;
}

/** 수익률 포맷 */
function fmtPct(v: number): string {
  if (v === 0) return "–";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

/** P/L 색상 클래스 */
function plClass(v: number): string {
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  if (v < 0) return "text-red-500 dark:text-red-400";
  return "text-muted-foreground";
}

/** 월 레이블 포맷: "2025-12" → "Dec-25", "2026-01" → "Jan" */
function fmtMonthLabel(month: string, isBaseline: boolean): string {
  const [y, m] = month.split("-").map(Number);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (isBaseline) return `${MON[m - 1]}-${String(y).slice(2)}`;
  return MON[m - 1];
}

// ─────────────────────────────────────────
// 섹션 행 정의
// ─────────────────────────────────────────

type SectionRowKey =
  | "principal"
  | "bid"
  | "askBv"
  | "fixedPnl"
  | "cumFixedPnl"
  | "balance"
  | "monthlyPnl"
  | "cumPnl"
  | "pct";

const SECTION_ROWS: { key: SectionRowKey; label: string; isPnl?: boolean; isPct?: boolean }[] = [
  { key: "principal", label: "Principal" },
  { key: "bid", label: "Bid" },
  { key: "askBv", label: "Ask (BV)" },
  { key: "fixedPnl", label: "Fixed P/L", isPnl: true },
  { key: "cumFixedPnl", label: "Cum Fixed P/L", isPnl: true },
  { key: "balance", label: "Balance" },
  { key: "monthlyPnl", label: "Monthly P/L", isPnl: true },
  { key: "cumPnl", label: "Cum P/L", isPnl: true },
  { key: "pct", label: "Monthly P/L %", isPct: true },
];

// ─────────────────────────────────────────
// 단일 데이터 셀
// ─────────────────────────────────────────

function DataCell({
  value,
  isPnl,
  isPct,
  isUsd = false,
  noData = false,
  isManualInput = false,
}: {
  value: number;
  isPnl?: boolean;
  isPct?: boolean;
  isUsd?: boolean;
  noData?: boolean;
  /** 직접입력 필드 여부 — 옅은 노란색 배경 하이라이트 */
  isManualInput?: boolean;
}) {
  // 직접입력 필드 배경: 자동계산(live data)과 시각적으로 구분
  const bgClass = isManualInput ? "bg-yellow-50/60 dark:bg-yellow-950/20" : "";

  if (noData) return <td className={`px-2 py-1 text-right text-xs text-muted-foreground/40 ${bgClass}`}>–</td>;

  const colorClass = isPnl || isPct ? plClass(value) : "";
  let display: string;
  if (isPct) display = fmtPct(value);
  else if (isUsd) display = fmtUsd(value);
  else display = fmtKrw(value);

  return (
    /* tabular-nums만 적용 — font-mono 제거 (UI 기본 폰트 유지) */
    <td className={`px-2 py-1 text-right text-xs tabular-nums ${colorClass} ${bgClass}`}>
      {display}
    </td>
  );
}

// ─────────────────────────────────────────
// 섹션 행 그룹 렌더러 (KOR Stocks / US Stocks)
// ─────────────────────────────────────────

function SectionRows({
  label,
  columns,
  getData,
  isUsd = false,
  manualInputKeys,
}: {
  label: string;
  columns: AssetManagementColumnData[];
  getData: (col: AssetManagementColumnData) => AssetManagementSectionData;
  isUsd?: boolean;
  /** 직접입력 행 키 집합 — 해당 행의 데이터 셀만 노란색 하이라이트 (항목 열 제외) */
  manualInputKeys?: ReadonlySet<SectionRowKey>;
}) {
  return (
    <>
      {/* 섹션 헤더 행 */}
      <tr className="bg-muted/60 border-t-2 border-border">
        <td
          colSpan={columns.length + 2}
          className="px-3 py-1.5 text-xs font-semibold text-foreground sticky left-0 bg-muted/60"
        >
          {label}
        </td>
      </tr>

      {/* 데이터 행 */}
      {SECTION_ROWS.map((row) => {
        // 직접입력 여부: manualInputKeys에 이 행의 key가 포함된 경우만
        const isManual = manualInputKeys?.has(row.key) ?? false;
        return (
          <tr key={row.key} className="border-b border-border/30 hover:bg-muted/20">
            {/* 항목 레이블 — sticky left, 하이라이트 제외 */}
            <td className="sticky left-0 px-3 py-1 text-xs text-muted-foreground bg-background whitespace-nowrap min-w-[130px]">
              {row.label}
            </td>

            {/* 데이터 컬럼 */}
            {columns.map((col) => {
              if (!col.hasData) {
                return (
                  <DataCell key={col.month} value={0} noData isManualInput={isManual} />
                );
              }
              const d = getData(col);
              const v = d[row.key];
              return (
                <DataCell
                  key={col.month}
                  value={v}
                  isPnl={row.isPnl}
                  isPct={row.isPct}
                  isUsd={isUsd}
                  isManualInput={isManual}
                />
              );
            })}

            {/* YTD 컬럼 */}
            <YtdCell
              columns={columns}
              getData={getData}
              rowKey={row.key}
              isPnl={row.isPnl}
              isPct={row.isPct}
              isUsd={isUsd}
            />
          </tr>
        );
      })}
    </>
  );
}

/** YTD 셀: 마지막 유효 컬럼의 cumPnl/cumPct 표시 */
function YtdCell({
  columns,
  getData,
  rowKey,
  isPnl,
  isPct,
  isUsd,
}: {
  columns: AssetManagementColumnData[];
  getData: (col: AssetManagementColumnData) => AssetManagementSectionData;
  rowKey: SectionRowKey;
  isPnl?: boolean;
  isPct?: boolean;
  isUsd?: boolean;
}) {
  // baseline 제외한 마지막 유효 컬럼
  const lastNonBaseline = [...columns]
    .reverse()
    .find((c) => c.hasData && !c.isBaseline);

  if (!lastNonBaseline) {
    return <td className="px-2 py-1 text-right text-xs text-muted-foreground">–</td>;
  }

  const d = getData(lastNonBaseline);

  // YTD 컬럼은 엑셀 Q열 수식에 맞게 누적값 사용:
  //   Principal = DecBalance + cumBid - cumAskBv  (Q13 = D[balance] + SUM(Bid) - SUM(AskBv))
  //   Bid / AskBv / Fixed P/L = Jan~현재 누적합  (SUM(E:P))
  //   Cum P/L % 는 calc에서 분모 수정으로 처리 (DecBalance + cumBid)
  let value: number;
  if (rowKey === "cumPnl") {
    value = d.cumPnl;
  } else if (rowKey === "pct") {
    value = d.cumPct;
  } else if (rowKey === "bid") {
    // YTD Bid = Jan~현재 누적 매수액
    value = d.cumBid;
  } else if (rowKey === "askBv") {
    // YTD Ask(BV) = Jan~현재 누적 매도장부가
    value = d.cumAskBv;
  } else if (rowKey === "fixedPnl") {
    // YTD Fixed P/L = Jan~현재 누적 실현손익 (cumFixedPnl 재사용)
    value = d.cumFixedPnl;
  } else if (rowKey === "principal") {
    // YTD Principal = DecBalance + cumBid - cumAskBv
    // isBaseline 컬럼은 항상 첫 번째 원소 — 배열 복사 없이 단순 find
    const baselineCol = columns.find((c) => c.isBaseline);
    const baseBalance = baselineCol ? getData(baselineCol).balance : 0;
    value = baseBalance + d.cumBid - d.cumAskBv;
  } else {
    value = d[rowKey];
  }

  return (
    <DataCell value={value} isPnl={isPnl} isPct={isPct} isUsd={isUsd} />
  );
}

// ─────────────────────────────────────────
// 단순 수치 행 (Stock Deposit / Cash)
// ─────────────────────────────────────────

function SimpleRow({
  label,
  cols,
  getValue,
  isUsd = false,
  isPnl = false,
  isBold = false,
  isManualInput = false,
}: {
  label: string;
  cols: AssetManagementColumnData[];
  getValue: (c: AssetManagementColumnData) => number;
  isUsd?: boolean;
  isPnl?: boolean;
  isBold?: boolean;
  /** 직접입력 행 여부 — 노란색 하이라이트 적용 */
  isManualInput?: boolean;
}) {
  const lastNonBaseline = [...cols].reverse().find((c) => c.hasData && !c.isBaseline);
  const fmt = isUsd ? fmtUsd : fmtKrw;
  // 직접입력 행: 데이터 셀만 노란색 (항목 열 제외)
  const cellBg = isManualInput ? "bg-yellow-50/60 dark:bg-yellow-950/20" : "";

  return (
    <tr className={`border-b border-border/30 hover:bg-muted/20 ${isBold ? "font-semibold" : ""}`}>
      <td className="sticky left-0 px-3 py-1 text-xs text-muted-foreground bg-background whitespace-nowrap">
        {label}
      </td>
      {cols.map((col) => {
        if (!col.hasData)
          return (
            <td key={col.month} className={`px-2 py-1 text-right text-xs text-muted-foreground/40 ${cellBg}`}>
              –
            </td>
          );
        const v = getValue(col);
        const cls = isPnl ? plClass(v) : "";
        return (
          /* tabular-nums만 적용 — font-mono 제거 */
          <td key={col.month} className={`px-2 py-1 text-right text-xs tabular-nums ${cls} ${cellBg}`}>
            {fmt(v)}
          </td>
        );
      })}
      {/* YTD: Stock Deposit / Cash 섹션은 YTD 계산 미지원 — 공란 */}
      <td className={`px-2 py-1 text-right text-xs text-muted-foreground/40 ${cellBg}`}>–</td>
    </tr>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function AssetManagementView({
  snapshots,
  liveData,
  liveLoading,
  onRefresh,
  txSummaries,
}: AssetManagementViewProps) {
  const curMonthStr = currentMonth();
  const curYear = Number(curMonthStr.split("-")[0]);
  const [selectedYear, setSelectedYear] = useState(curYear);

  // 종가 확정 다이얼로그
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  // 잠금 대상 월: 가장 오래된 DRAFT 스냅샷 우선
  // currentMonth()로 고정하면 이전 달이 미확정일 때 잘못된 달이 잠기는 버그 발생
  const lockTargetMonth = snapshots
    .filter((s) => s.status === "DRAFT")
    .sort((a, b) => a.month.localeCompare(b.month))[0]?.month ?? curMonthStr;

  // txSummaries를 buildAssetManagementYearlyData에 전달
  const yearData = buildAssetManagementYearlyData(snapshots, liveData, selectedYear, txSummaries);
  const baselineCol = yearData[0];      // Dec-{year-1}
  const monthCols = yearData.slice(1);  // Jan~Dec

  const handleSaved = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  // 전체 컬럼 배열 (baseline 포함)
  const allCols = [baselineCol, ...monthCols];

  return (
    <div className="space-y-4">
      {/* 헤더: 연도 선택 + 새로고침 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">자산관리</span>
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
          {liveLoading && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400 animate-pulse">
              실시간 로드 중…
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* DRAFT 월이 있을 때만 종가 확정 버튼 표시 */}
          {yearData.some((c) => c.isDraft) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-amber-400 text-amber-700 hover:bg-amber-50"
              onClick={() => setLockDialogOpen(true)}
            >
              <CheckSquare className="w-3 h-3" />종가 확정
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs gap-1">
            <RefreshCw className="w-3 h-3" />새로고침
          </Button>
        </div>
      </div>

      {/* 테이블 컨테이너 — 수평 스크롤 */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          {/* 컬럼 헤더 */}
          <thead>
            <tr className="bg-muted/80 border-b-2 border-border">
              {/* 행 레이블 컬럼 */}
              <th className="sticky left-0 px-3 py-2 text-left text-xs font-medium text-muted-foreground bg-muted/80 min-w-[130px]">
                항목
              </th>

              {/* baseline 컬럼 — 편집 버튼 없음 (연간 기준값) */}
              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground min-w-[110px] bg-muted/40">
                {fmtMonthLabel(baselineCol.month, true)}
              </th>

              {/* 월별 컬럼 — 모든 월에 편집 버튼 */}
              {monthCols.map((col) => (
                <th
                  key={col.month}
                  className={`px-2 py-2 text-right text-xs font-medium min-w-[110px] ${
                    col.isDraft ? "text-amber-600" : "text-muted-foreground"
                  }`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span>{fmtMonthLabel(col.month, false)}</span>
                    {col.hasData && col.isDraft && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-600 border-amber-400">
                        DRAFT
                      </Badge>
                    )}
                  </div>
                </th>
              ))}

              {/* YTD 컬럼 */}
              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground min-w-[110px] bg-muted/40">
                YTD
              </th>
            </tr>
          </thead>

          <tbody>
            {liveLoading && yearData.every((c) => !c.isDraft) ? (
              <tr>
                <td colSpan={allCols.length + 2} className="p-4">
                  <div className="space-y-1">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {/* ── KOR Stocks 섹션 ──────────────────────── */}
                <SectionRows
                  label="KOR Stocks"
                  columns={allCols}
                  getData={(col) => col.korStocks}
                />

                {/* ── US Stocks (USD) 섹션 ─────────────────── */}
                <SectionRows
                  label="US Stocks (USD)"
                  columns={allCols}
                  getData={(col) => col.usStocks}
                  isUsd
                />


                {/* ── Summary 섹션 ─────────────────────────────────── */}
                <tr className="bg-muted/60 border-t-2 border-border">
                  <td
                    colSpan={allCols.length + 2}
                    className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-muted/60"
                  >
                    Summary
                  </td>
                </tr>

                {/* Investment Total — 굵은 합계 행 */}
                <tr className="border-b border-border/30 font-semibold hover:bg-muted/20">
                  <td className="sticky left-0 px-3 py-1 text-xs text-foreground bg-background whitespace-nowrap">
                    Investment Total
                  </td>
                  {allCols.map((col) => (
                    <td key={col.month} className="px-2 py-1 text-right text-xs tabular-nums">
                      {col.hasData ? fmtKrw(col.investmentTotal) : "–"}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right text-xs text-muted-foreground/40">–</td>
                </tr>

                {/* Investment Total 세부항목 — 들여쓰기 서브행 */}
                {[
                  {
                    label: "FUND/Derivatives",
                    getValue: (c: AssetManagementColumnData) => c.fund.balance,
                  },
                  {
                    label: "KRW Stocks",
                    getValue: (c: AssetManagementColumnData) => c.krwStocksBalance,
                  },
                  {
                    label: "US Stocks (KRW)",
                    getValue: (c: AssetManagementColumnData) => c.usStocksBalanceKrw,
                  },
                  {
                    label: "KRW Stocks Deposit",
                    getValue: (c: AssetManagementColumnData) => c.stockDepositKrw,
                  },
                  {
                    label: "US Stocks Deposit (KRW)",
                    getValue: (c: AssetManagementColumnData) => c.stockDepositUsdKrw,
                  },
                ].map(({ label, getValue }) => (
                  <tr key={label} className="border-b border-border/20 hover:bg-muted/10">
                    {/* 들여쓰기로 계층 표시 */}
                    <td className="sticky left-0 px-3 py-0.5 text-[11px] text-muted-foreground bg-background whitespace-nowrap pl-7">
                      {label}
                    </td>
                    {allCols.map((col) => (
                      <td key={col.month} className="px-2 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                        {col.hasData ? fmtKrw(getValue(col)) : "–"}
                      </td>
                    ))}
                    <td className="px-2 py-0.5 text-right text-[11px] text-muted-foreground/40">–</td>
                  </tr>
                ))}

                {/* Currency Deposit / Asset Total / Lease Deposit / Net Debt/Surplus */}
                {[
                  { label: "Currency Deposit", key: "cashTotal" as const },
                  { label: "Asset Total", key: "assetTotal" as const },
                  { label: "Lease Deposit", key: "leaseDeposit" as const, isDebt: true },
                  { label: "Net Debt/Surplus", key: "netDebtSurplus" as const, isPnl: true },
                ].map(({ label, key, isDebt, isPnl }) => (
                  <tr key={key} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="sticky left-0 px-3 py-1 text-xs text-muted-foreground bg-background whitespace-nowrap">
                      {label}
                    </td>
                    {allCols.map((col) => {
                      const v = col[key];
                      const cls = isPnl ? plClass(v) : isDebt ? "text-red-600 dark:text-red-400" : "";
                      return (
                        <td key={col.month} className={`px-2 py-1 text-right text-xs tabular-nums ${cls}`}>
                          {col.hasData
                            ? isDebt
                              ? `(${fmtKrw(v)})`
                              : fmtKrw(v)
                            : "–"}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right text-xs text-muted-foreground/40">–</td>
                  </tr>
                ))}

              </>
            )}
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>• KRW: 전체 수치 (원)</span>
        <span>• US Stocks: USD 기준 수치</span>
        <span>• YTD: Jan 기준 누적 수익률</span>
        <span className="text-amber-600">• DRAFT: 현재 월 (실시간)</span>
        {/* 직접입력 필드 범례 */}
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-300/60" />
          직접입력 필드
        </span>
      </div>

      {/* 종가 확정 다이얼로그 */}
      <LockPricesDialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        month={lockTargetMonth}
        mode="I"
        onLocked={handleSaved}
      />
    </div>
  );
}
