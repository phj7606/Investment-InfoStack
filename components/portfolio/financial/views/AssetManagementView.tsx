"use client";

/**
 * 자산관리 연간 테이블 뷰
 *
 * 엑셀 Asset Management 시트를 웹으로 구현:
 * - 컬럼: Dec-{year-1}(기준값) | Jan~Dec {year} | YTD
 * - 섹션: FUND | KOR Stocks | US Stocks(USD) | Stock Deposit | Cash & Equivalent | Summary
 * - 모든 컬럼(CONFIRMED 포함) 헤더에 편집 버튼 — MonthlyInputDialog 오픈
 * - Fund 편집: DRAFT 컬럼에만 표시 (Balance, Bid, Ask BV, Fixed P/L)
 * - Net Debt/Surplus: Cash 섹션에서 제거, Summary 섹션에만 존재
 */

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil, RefreshCw, Copy, Lock } from "lucide-react";
import { RateCell } from "@/components/portfolio/financial/RateCell";
import { buildAssetManagementYearlyData, currentMonth } from "@/lib/portfolio/financial-calc";
import type {
  FinancialSnapshot,
  LivePortfolioData,
  AssetManagementColumnData,
  AssetManagementSectionData,
  UpdateSnapshotRequest,
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
  /** 환율 수정 콜백 — DRAFT 월 환율 셀 인라인 편집 */
  onRateSave?: (field: "usdKrw" | "cadKrw", value: number) => Promise<void>;
  /** 실시간 환율 갱신 콜백 (yfinance) */
  onRateRefresh?: () => Promise<void>;
  /** 실시간 갱신 로딩 상태 */
  rateRefreshing?: boolean;
}

// ─────────────────────────────────────────
// 포맷 유틸 — 전체 수치 표시
// ─────────────────────────────────────────

/** KRW 금액: 쉼표 구분, 접미사 없음 (예: 1,482,352,065) */
function fmtKrw(v: number): string {
  if (v === 0) return "–";
  const neg = v < 0;
  const abs = Math.abs(v);
  const str = abs.toLocaleString("ko-KR");
  return neg ? `−${str}` : str;
}

/** USD 금액: $ 접두사, 소수점 없음 (예: $131,426) */
function fmtUsd(v: number): string {
  if (v === 0) return "–";
  const neg = v < 0;
  const abs = Math.abs(v);
  const str = "$" + abs.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return neg ? `−${str.slice(1)}` : str;
}

/** 수익률 포맷 */
function fmtPct(v: number): string {
  if (v === 0) return "–";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

/** P/L 색상 클래스 */
function plClass(v: number): string {
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  if (v < 0) return "text-red-600 dark:text-red-400";
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
// 섹션 행 그룹 렌더러 (FUND / KOR Stocks / US Stocks)
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
// Fund 직접입력 다이얼로그 (Principal 필드 제거)
// ─────────────────────────────────────────

interface FundInputDialogProps {
  open: boolean;
  month: string;
  snapshot: FinancialSnapshot;
  onClose: () => void;
  onSave: () => void;
}

function FundInputDialog({ open, month, snapshot, onClose, onSave }: FundInputDialogProps) {
  const fm = snapshot.fundMonthly;
  // Principal 필드 제거 — Balance, Bid, Ask BV, Fixed P/L만 입력
  const [bid, setBid] = useState(String(fm?.bid ?? 0));
  const [askBv, setAskBv] = useState(String(fm?.askBv ?? 0));
  const [fixedPnl, setFixedPnl] = useState(String(fm?.fixedPnl ?? 0));
  const [balance, setBalance] = useState(String(fm?.balance ?? 0));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: UpdateSnapshotRequest = {
        fundMonthly: {
          // principal은 이전 값 또는 0 유지 (UI에서 입력 불필요)
          principal: fm?.principal ?? 0,
          bid: Number(bid) || 0,
          askBv: Number(askBv) || 0,
          fixedPnl: Number(fixedPnl) || 0,
          balance: Number(balance) || 0,
        },
      };
      const res = await fetch(`/api/portfolio/financial/snapshot/${month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>FUND 직접입력 — {month}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {[
            { label: "Balance (잔액)", value: balance, set: setBalance },
            { label: "Bid (매수)", value: bid, set: setBid },
            { label: "Ask BV (매도 장부가)", value: askBv, set: setAskBv },
            { label: "Fixed P/L (실현손익)", value: fixedPnl, set: setFixedPnl },
          ].map(({ label, value, set }) => (
            <div key={label} className="grid grid-cols-2 items-center gap-2">
              <Label className="text-xs text-right text-muted-foreground">{label}</Label>
              <Input
                type="number"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────
// Monthly Input 다이얼로그 — 모든 월의 Stock Deposit + Cash 입력
// CONFIRMED 월 포함 편집 가능
// ─────────────────────────────────────────

const DEPOSIT_ACCOUNTS = ["4802", "1635", "1402"] as const;
type DepositAccount = typeof DEPOSIT_ACCOUNTS[number];

interface MonthlyInputDialogProps {
  open: boolean;
  month: string;
  snapshot: FinancialSnapshot | null;      // 해당 월 스냅샷 (없으면 null)
  prevSnapshot: FinancialSnapshot | null;  // 전월 스냅샷 (없으면 null)
  onClose: () => void;
  onSave: () => void;
}

function MonthlyInputDialog({
  open,
  month,
  snapshot,
  prevSnapshot,
  onClose,
  onSave,
}: MonthlyInputDialogProps) {
  const byAccount = snapshot?.stockDepositByAccount;

  // 계좌별 예수금 초기값
  const [values, setValues] = useState<Record<DepositAccount, { krw: string; usd: string }>>({
    "4802": { krw: String(byAccount?.["4802"]?.krw ?? 0), usd: String(byAccount?.["4802"]?.usd ?? 0) },
    "1635": { krw: String(byAccount?.["1635"]?.krw ?? 0), usd: String(byAccount?.["1635"]?.usd ?? 0) },
    "1402": { krw: String(byAccount?.["1402"]?.krw ?? 0), usd: String(byAccount?.["1402"]?.usd ?? 0) },
  });

  // Cash & Equivalent 초기값
  const [cashForeignUsd, setCashForeignUsd] = useState(String(snapshot?.cashForeignUsd ?? 0));
  const [cashForeignCad, setCashForeignCad] = useState(String(snapshot?.cashForeignCad ?? 0));
  const [fixedDepositKrw, setFixedDepositKrw] = useState(String(snapshot?.fixedDepositKrw ?? 0));
  const [fixedDepositUsd, setFixedDepositUsd] = useState(String(snapshot?.fixedDepositUsd ?? 0));
  const [saving, setSaving] = useState(false);

  const setField = (acc: DepositAccount, field: "krw" | "usd", val: string) => {
    setValues((prev) => ({ ...prev, [acc]: { ...prev[acc], [field]: val } }));
  };

  /**
   * 전월 동일 버튼 — prevSnapshot 값을 현재 입력 필드에 복사
   * stockDepositByAccount + cashForeignUsd/Cad + fixedDepositKrw/Usd 복사
   */
  const handleCopyPrev = () => {
    if (!prevSnapshot) return;
    const prev = prevSnapshot.stockDepositByAccount;
    setValues({
      "4802": { krw: String(prev?.["4802"]?.krw ?? 0), usd: String(prev?.["4802"]?.usd ?? 0) },
      "1635": { krw: String(prev?.["1635"]?.krw ?? 0), usd: String(prev?.["1635"]?.usd ?? 0) },
      "1402": { krw: String(prev?.["1402"]?.krw ?? 0), usd: String(prev?.["1402"]?.usd ?? 0) },
    });
    setCashForeignUsd(String(prevSnapshot.cashForeignUsd ?? 0));
    setCashForeignCad(String(prevSnapshot.cashForeignCad ?? 0));
    setFixedDepositKrw(String(prevSnapshot.fixedDepositKrw ?? 0));
    setFixedDepositUsd(String(prevSnapshot.fixedDepositUsd ?? 0));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 계좌별 합산 → 전체 예수금 총계
      const totalKrw = DEPOSIT_ACCOUNTS.reduce((s, a) => s + (Number(values[a].krw) || 0), 0);
      const totalUsd = DEPOSIT_ACCOUNTS.reduce((s, a) => s + (Number(values[a].usd) || 0), 0);

      const body: UpdateSnapshotRequest = {
        stockDepositKrw: totalKrw,
        stockDepositUsd: totalUsd,
        stockDepositByAccount: {
          "4802": { krw: Number(values["4802"].krw) || 0, usd: Number(values["4802"].usd) || 0 },
          "1635": { krw: Number(values["1635"].krw) || 0, usd: Number(values["1635"].usd) || 0 },
          "1402": { krw: Number(values["1402"].krw) || 0, usd: Number(values["1402"].usd) || 0 },
        },
        cashForeignUsd: Number(cashForeignUsd) || 0,
        cashForeignCad: Number(cashForeignCad) || 0,
        fixedDepositKrw: Number(fixedDepositKrw) || 0,
        fixedDepositUsd: Number(fixedDepositUsd) || 0,
      };

      const res = await fetch(`/api/portfolio/financial/snapshot/${month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // 합산 미리보기
  const totalKrw = DEPOSIT_ACCOUNTS.reduce((s, a) => s + (Number(values[a].krw) || 0), 0);
  const totalUsd = DEPOSIT_ACCOUNTS.reduce((s, a) => s + (Number(values[a].usd) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>월별 입력 — {month}</span>
            {/* 전월 동일 버튼 — prevSnapshot이 있을 때만 활성화 */}
            {prevSnapshot && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={handleCopyPrev}
              >
                <Copy className="w-3 h-3" />
                전월과 동일
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Stock Deposit 섹션 */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">Stock Deposit</p>
          {DEPOSIT_ACCOUNTS.map((acc) => (
            <div key={acc} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">계좌 {acc}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">KRW</Label>
                  <Input
                    type="number"
                    value={values[acc].krw}
                    onChange={(e) => setField(acc, "krw", e.target.value)}
                    className="h-7 text-xs"
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">USD ($)</Label>
                  <Input
                    type="number"
                    value={values[acc].usd}
                    onChange={(e) => setField(acc, "usd", e.target.value)}
                    className="h-7 text-xs"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          ))}
          {/* 합계 미리보기 */}
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium">합계: </span>
            KRW {totalKrw.toLocaleString("ko-KR")} &nbsp;|&nbsp;
            USD ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {/* Cash & Equivalent 섹션 */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">Cash &amp; Equivalent</p>
          {[
            { label: "Foreign deposit (USD)", value: cashForeignUsd, set: setCashForeignUsd },
            { label: "Foreign deposit (CAD)", value: cashForeignCad, set: setCashForeignCad },
            { label: "Fixed deposit (KRW)", value: fixedDepositKrw, set: setFixedDepositKrw },
            { label: "Fixed deposit (USD)", value: fixedDepositUsd, set: setFixedDepositUsd },
          ].map(({ label, value, set }) => (
            <div key={label} className="grid grid-cols-2 items-center gap-2">
              <Label className="text-xs text-right text-muted-foreground">{label}</Label>
              <Input
                type="number"
                value={value}
                onChange={(e) => set(e.target.value)}
                className="h-7 text-xs"
                placeholder="0"
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  onRateSave,
  onRateRefresh,
  rateRefreshing = false,
}: AssetManagementViewProps) {
  const curMonthStr = currentMonth();
  const curYear = Number(curMonthStr.split("-")[0]);
  const [selectedYear, setSelectedYear] = useState(curYear);

  // 다이얼로그 상태 — Fund: DRAFT 전용, Monthly: 모든 월
  const [fundDialogMonth, setFundDialogMonth] = useState<string | null>(null);
  const [monthlyDialogMonth, setMonthlyDialogMonth] = useState<string | null>(null);

  // txSummaries를 buildAssetManagementYearlyData에 전달
  const yearData = buildAssetManagementYearlyData(snapshots, liveData, selectedYear, txSummaries);
  const baselineCol = yearData[0];      // Dec-{year-1}
  const monthCols = yearData.slice(1);  // Jan~Dec

  const handleSaved = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  // 전체 컬럼 배열 (baseline 포함)
  const allCols = [baselineCol, ...monthCols];

  /**
   * 특정 월의 스냅샷 조회 (MonthlyInputDialog에 전달)
   * 없으면 null 반환 — 다이얼로그 내에서 신규 생성
   */
  const getSnapshotForMonth = (month: string): FinancialSnapshot | null =>
    snapshots.find((s) => s.month === month) ?? null;

  /**
   * 전월 스냅샷 조회 — "전월과 동일" 버튼 기능용
   * month = "2026-05" → 전월 = "2026-04"
   */
  const getPrevSnapshot = (month: string): FinancialSnapshot | null => {
    const [y, m] = month.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1); // m-1(0-indexed) - 1 = m-2
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    return snapshots.find((s) => s.month === prevMonth) ?? null;
  };

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
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs gap-1">
          <RefreshCw className="w-3 h-3" />새로고침
        </Button>
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
                    {col.hasData && (
                      <div className="flex items-center gap-1">
                        {col.isDraft && (
                          <Badge variant="outline" className="text-[9px] py-0 px-1 text-amber-600 border-amber-400">
                            DRAFT
                          </Badge>
                        )}
                        {/* Fund 직접입력 버튼 — 모든 유효 컬럼 (CONFIRMED 포함) */}
                        <button
                          onClick={() => setFundDialogMonth(col.month)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Fund 직접입력"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                        {/* 월별 입력 버튼 — 모든 유효 컬럼 (Stock Deposit / Cash) */}
                        <button
                          onClick={() => setMonthlyDialogMonth(col.month)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Stock Deposit / Cash 입력"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      </div>
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
                {/* ── FUND 섹션 — Balance·Bid·Ask(BV)·Fixed P/L만 직접입력 (노란색) ── */}
                <SectionRows
                  label="FUND"
                  columns={allCols}
                  getData={(col) => col.fund}
                  manualInputKeys={new Set<SectionRowKey>(["balance", "bid", "askBv", "fixedPnl"])}
                />

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

                {/* ── Stock Deposit 섹션 (계좌별) ──────────── */}
                {/* 헤더 편집 버튼 제거 — 각 컬럼 헤더에서 per-month 편집 */}
                <tr className="bg-muted/60 border-t-2 border-border">
                  <td
                    colSpan={allCols.length + 2}
                    className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-muted/60"
                  >
                    Stock Deposit
                  </td>
                </tr>

                {/* 계좌별 KRW 행 — 직접입력 (노란색 하이라이트) */}
                {DEPOSIT_ACCOUNTS.map((acc) => (
                  <SimpleRow
                    key={`${acc}-krw`}
                    label={`${acc} (KRW)`}
                    cols={allCols}
                    getValue={(c) => {
                      const byAcc = (c as AssetManagementColumnData & {
                        stockDepositByAccount?: Record<string, { krw: number; usd: number }>;
                      }).stockDepositByAccount;
                      return byAcc?.[acc]?.krw ?? 0;
                    }}
                    isManualInput
                  />
                ))}
                {/* 계좌별 USD 행 — 직접입력 (노란색 하이라이트) */}
                {DEPOSIT_ACCOUNTS.map((acc) => (
                  <SimpleRow
                    key={`${acc}-usd`}
                    label={`${acc} (USD)`}
                    cols={allCols}
                    getValue={(c) => {
                      const byAcc = (c as AssetManagementColumnData & {
                        stockDepositByAccount?: Record<string, { krw: number; usd: number }>;
                      }).stockDepositByAccount;
                      return byAcc?.[acc]?.usd ?? 0;
                    }}
                    isUsd
                    isManualInput
                  />
                ))}
                {/* 합계 행 */}
                <SimpleRow
                  label="Total (KRW)"
                  cols={allCols}
                  getValue={(c) => c.stockDepositKrw}
                  isBold
                />
                <SimpleRow
                  label="Total (USD)"
                  cols={allCols}
                  getValue={(c) => c.stockDepositUsd}
                  isUsd
                  isBold
                />

                {/* ── Cash & Equivalent 섹션 ───────────────── */}
                {/* Net Debt/Surplus 행 제거 — Summary 섹션에만 존재 */}
                <tr className="bg-muted/60 border-t-2 border-border">
                  <td
                    colSpan={allCols.length + 2}
                    className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-muted/60"
                  >
                    Cash and Equivalent
                  </td>
                </tr>
                {/* Cash 전체 행 — 직접입력 (노란색 하이라이트) */}
                <SimpleRow
                  label="Foreign deposit (USD)"
                  cols={allCols}
                  getValue={(c) => c.cashForeignUsd}
                  isUsd
                  isManualInput
                />
                <SimpleRow
                  label="Foreign deposit (CAD)"
                  cols={allCols}
                  getValue={(c) => c.cashForeignCad}
                  isUsd
                  isManualInput
                />
                <SimpleRow
                  label="Fixed deposit (KRW)"
                  cols={allCols}
                  getValue={(c) => c.fixedDepositKrw}
                  isManualInput
                />
                <SimpleRow
                  label="Fixed deposit (USD)"
                  cols={allCols}
                  getValue={(c) => c.fixedDepositUsd}
                  isUsd
                  isManualInput
                />

                {/* ── Summary 섹션 — Net Debt/Surplus 여기에만 존재 ── */}
                <tr className="bg-muted/60 border-t-2 border-border">
                  <td
                    colSpan={allCols.length + 2}
                    className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-muted/60"
                  >
                    Summary
                  </td>
                </tr>
                {[
                  { label: "Investment Total", key: "investmentTotal" as const },
                  { label: "Cash and Equivalent Total", key: "cashTotal" as const },
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
                        /* tabular-nums만 적용 — font-mono 제거 */
                        <td key={col.month} className={`px-2 py-1 text-right text-xs tabular-nums ${cls}`}>
                          {col.hasData
                            ? isDebt
                              ? `−${fmtKrw(Math.abs(v))}`
                              : fmtKrw(v)
                            : "–"}
                        </td>
                      );
                    })}
                    {/* YTD: Summary 섹션은 YTD 계산 미지원 — 공란 */}
                    <td className="px-2 py-1 text-right text-xs text-muted-foreground/40">–</td>
                  </tr>
                ))}

                {/* ── 환율 섹션 — 엑셀 Asset Management 87/88행 대응 ── */}
                <tr className="bg-muted/60 border-t-2 border-border">
                  <td
                    colSpan={allCols.length + 2}
                    className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-muted/60"
                  >
                    <div className="flex items-center justify-between pr-2">
                      <span>Exchange Rates</span>
                      {/* DRAFT 월 존재 시 실시간 갱신 버튼 표시 */}
                      {allCols.some((c) => c.isDraft) && onRateRefresh && (
                        <button
                          onClick={onRateRefresh}
                          disabled={rateRefreshing}
                          className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          title="yfinance에서 실시간 환율 가져오기"
                        >
                          <RefreshCw className={`w-3 h-3 ${rateRefreshing ? "animate-spin" : ""}`} />
                          {rateRefreshing ? "조회 중…" : "실시간 갱신"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {[
                  { label: "USD/KRW", key: "usdKrw" as const },
                  { label: "CAD/KRW", key: "cadKrw" as const },
                ].map(({ label, key }) => {
                  // YTD 위치: 마지막 유효 컬럼의 환율 표시
                  const lastCol = [...monthCols].reverse().find((c) => c.hasData);
                  // 환율 행 — 직접입력 (DRAFT: RateCell, CONFIRMED: 읽기 전용) → 노란색 하이라이트
                  return (
                    <tr key={key} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="sticky left-0 px-3 py-1 text-xs text-muted-foreground bg-background whitespace-nowrap">
                        {label}
                      </td>
                      {allCols.map((col) => {
                        if (!col.hasData) {
                          return (
                            <td key={col.month} className="px-2 py-1 text-right text-xs text-muted-foreground/40 bg-yellow-50/60 dark:bg-yellow-950/20">
                              –
                            </td>
                          );
                        }
                        // DRAFT 월: 인라인 편집 가능 (RateCell compact 모드)
                        if (col.isDraft && onRateSave) {
                          return (
                            <td key={col.month} className="px-1 py-0.5 bg-yellow-50/60 dark:bg-yellow-950/20">
                              <RateCell
                                value={col.exchangeRates[key]}
                                onSave={(v) => onRateSave(key, v)}
                                compact
                              />
                            </td>
                          );
                        }
                        // CONFIRMED 월: 읽기 전용 + 잠금 아이콘
                        return (
                          <td
                            key={col.month}
                            className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground bg-yellow-50/60 dark:bg-yellow-950/20"
                          >
                            <span className="inline-flex items-center justify-end gap-1">
                              {col.exchangeRates[key].toLocaleString("ko-KR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              <Lock className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                            </span>
                          </td>
                        );
                      })}
                      {/* YTD 컬럼 — 마지막 유효 월의 환율 (읽기 전용) */}
                      <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground bg-yellow-50/60 dark:bg-yellow-950/20">
                        {lastCol
                          ? lastCol.exchangeRates[key].toLocaleString("ko-KR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : "–"}
                      </td>
                    </tr>
                  );
                })}
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

      {/* Fund 직접입력 다이얼로그 — 전기간 */}
      {fundDialogMonth && (() => {
        const snap = getSnapshotForMonth(fundDialogMonth);
        if (!snap) return null;
        return (
          <FundInputDialog
            open={!!fundDialogMonth}
            month={fundDialogMonth}
            snapshot={snap}
            onClose={() => setFundDialogMonth(null)}
            onSave={handleSaved}
          />
        );
      })()}

      {/* Monthly 입력 다이얼로그 — 모든 월 (CONFIRMED 포함) */}
      {monthlyDialogMonth && (
        <MonthlyInputDialog
          open={!!monthlyDialogMonth}
          month={monthlyDialogMonth}
          snapshot={getSnapshotForMonth(monthlyDialogMonth)}
          prevSnapshot={getPrevSnapshot(monthlyDialogMonth)}
          onClose={() => setMonthlyDialogMonth(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
