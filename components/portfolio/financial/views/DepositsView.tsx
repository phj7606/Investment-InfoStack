"use client";

/**
 * Deposit & FX 관리 페이지 뷰
 *
 * 섹션 구성 (연간 테이블):
 * - Exchange Rates: USD/KRW, CAD/KRW
 * - Stock Deposit: 4802/1635/1402 (KRW/USD) + 2805 + 1470 + 연금(RETIREMENT/SAVINGS/IRP)
 * - Currency Deposit: Foreign deposit USD/CAD, Fixed deposit KRW/USD
 * - Lease Deposit: 임차보증금
 */

import { useState, useCallback, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ClipboardPen, RefreshCw, Copy, Lock } from "lucide-react";
import { RateCell } from "@/components/portfolio/financial/RateCell";
import { FormattedInput } from "@/components/portfolio/financial/FormattedInput";
import { buildDepositsYearlyData, currentMonth } from "@/lib/portfolio/financial-calc";
import type {
  FinancialSnapshot,
  DepositsColumnData,
  UpdateSnapshotRequest,
} from "@/types/financial";

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface DepositsViewProps {
  snapshots: FinancialSnapshot[];
  onRefresh: () => void;
  /** 환율 수정 콜백 — DRAFT 월 환율 셀 인라인 편집 */
  onRateSave?: (field: "usdKrw" | "cadKrw", value: number) => Promise<void>;
  /** 실시간 환율 갱신 콜백 */
  onRateRefresh?: () => Promise<void>;
  rateRefreshing?: boolean;
}

// ─────────────────────────────────────────
// 포맷 유틸
// ─────────────────────────────────────────

function fmtKrw(v: number): string {
  if (v === 0) return "–";
  const abs = Math.abs(Math.round(v));
  const str = abs.toLocaleString("ko-KR");
  return v < 0 ? `(${str})` : str;
}

function fmtUsd(v: number): string {
  if (v === 0) return "–";
  const abs = Math.abs(v);
  const str = "$" + abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `(${str})` : str;
}

function fmtMonthLabel(month: string, isBaseline: boolean): string {
  const [y, m] = month.split("-").map(Number);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (isBaseline) return `${MON[m - 1]}-${String(y).slice(2)}`;
  return MON[m - 1];
}

// ─────────────────────────────────────────
// 단순 수치 행
// ─────────────────────────────────────────

function SimpleRow({
  label,
  cols,
  getValue,
  isUsd = false,
  isBold = false,
  isManualInput = false,
  isDebt = false,
}: {
  label: string;
  cols: DepositsColumnData[];
  getValue: (c: DepositsColumnData) => number;
  isUsd?: boolean;
  isBold?: boolean;
  isManualInput?: boolean;
  isDebt?: boolean;
}) {
  const fmt = isUsd ? fmtUsd : fmtKrw;
  const cellBg = isManualInput ? "bg-yellow-50/60 dark:bg-yellow-950/20" : "";
  const debtCls = isDebt ? "text-red-600 dark:text-red-400" : "";

  return (
    <tr className={`border-b border-border/30 hover:bg-muted/20 ${isBold ? "font-semibold" : ""}`}>
      <td className="sticky left-0 px-3 py-1 text-xs text-muted-foreground bg-background whitespace-nowrap">
        {label}
      </td>
      {cols.map((col) => {
        if (!col.hasData) {
          return (
            <td key={col.month} className={`px-2 py-1 text-right text-xs text-muted-foreground/40 ${cellBg}`}>–</td>
          );
        }
        const v = getValue(col);
        return (
          <td key={col.month} className={`px-2 py-1 text-right text-xs tabular-nums ${debtCls} ${cellBg}`}>
            {isDebt && v > 0 ? `−${fmtKrw(v)}` : fmt(v)}
          </td>
        );
      })}
      {/* YTD: 단순 값 행은 YTD 미지원 */}
      <td className={`px-2 py-1 text-right text-xs text-muted-foreground/40 ${cellBg}`}>–</td>
    </tr>
  );
}

// ─────────────────────────────────────────
// 섹션 헤더 행
// ─────────────────────────────────────────

function SectionHeader({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-muted/60 border-t-2 border-border">
      <td
        colSpan={colCount + 2}
        className="px-3 py-1.5 text-xs font-semibold text-foreground sticky left-0 bg-muted/60"
      >
        {label}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────
// 다이얼로그 내 숫자 입력 행 — 모듈 레벨에 정의해야 포커스 유지
// ─────────────────────────────────────────

function NumRow({
  label,
  value,
  set,
  redLabel = false,
  isUsd = false,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
  redLabel?: boolean;
  isUsd?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 items-center gap-2">
      <Label className={`text-xs text-right ${redLabel ? "text-red-600" : "text-muted-foreground"}`}>
        {label}
      </Label>
      <FormattedInput value={value} onChange={set} isUsd={isUsd} />
    </div>
  );
}

// ─────────────────────────────────────────
// 입력 다이얼로그
// ─────────────────────────────────────────

interface InputDialogProps {
  open: boolean;
  month: string;
  snapshot: FinancialSnapshot | null;
  prevSnapshot: FinancialSnapshot | null;
  onClose: () => void;
  onSave: () => void;
}

function DepositsInputDialog({
  open,
  month,
  snapshot,
  prevSnapshot,
  onClose,
  onSave,
}: InputDialogProps) {
  const byAcc = snapshot?.stockDepositByAccount;
  const pcd = snapshot?.pensionCashDeposit;

  // Value Investment Account 예수금 (4802/1635/1402)
  const [dep4802Krw, setDep4802Krw] = useState(String(byAcc?.["4802"]?.krw ?? 0));
  const [dep4802Usd, setDep4802Usd] = useState(String(byAcc?.["4802"]?.usd ?? 0));
  const [dep1635Krw, setDep1635Krw] = useState(String(byAcc?.["1635"]?.krw ?? 0));
  const [dep1635Usd, setDep1635Usd] = useState(String(byAcc?.["1635"]?.usd ?? 0));
  const [dep1402Krw, setDep1402Krw] = useState(String(byAcc?.["1402"]?.krw ?? 0));
  const [dep1402Usd, setDep1402Usd] = useState(String(byAcc?.["1402"]?.usd ?? 0));

  // 단기/교육 예수금
  const [shortterm2805, setShortterm2805] = useState(
    String(snapshot?.shorttermMonthly?.deposit ?? 0)
  );
  const [education1470, setEducation1470] = useState(
    String(snapshot?.educationMonthly?.deposit ?? 0)
  );

  // 연금 예수금
  const [pensionRetirement, setPensionRetirement] = useState(String(pcd?.RETIREMENT ?? 0));
  const [pensionSavings, setPensionSavings] = useState(String(pcd?.SAVINGS ?? 0));
  const [pensionIrp, setPensionIrp] = useState(String(pcd?.IRP ?? 0));

  // Currency Deposit
  const [cashForeignUsd, setCashForeignUsd] = useState(String(snapshot?.cashForeignUsd ?? 0));
  const [cashForeignCad, setCashForeignCad] = useState(String(snapshot?.cashForeignCad ?? 0));
  const [fixedDepositKrw, setFixedDepositKrw] = useState(String(snapshot?.fixedDepositKrw ?? 0));
  const [fixedDepositUsd, setFixedDepositUsd] = useState(String(snapshot?.fixedDepositUsd ?? 0));

  // Lease Deposit
  const [leaseDeposit, setLeaseDeposit] = useState(String(snapshot?.leaseDeposit ?? 0));

  // Digital Asset Principal — Deposit & FX 페이지에서 관리 (자산관리 II에서 이관)
  const [upbitPrincipal, setUpbitPrincipal] = useState(String(snapshot?.crypto?.upbit?.principal ?? 0));
  const [korbitPrincipal, setKorbitPrincipal] = useState(String(snapshot?.crypto?.korbit?.principal ?? 0));
  const [binancePrincipalUsd, setBinancePrincipalUsd] = useState(String(snapshot?.crypto?.binance?.principal ?? 0));

  // RESP/RRSP — Deposit & FX 페이지에서 관리 (자산관리 II에서 이관)
  const [respRrspBalanceCad, setRespRrspBalanceCad] = useState(String(snapshot?.canadianPension?.balanceCad ?? 0));

  const [saving, setSaving] = useState(false);

  const handleCopyPrev = () => {
    if (!prevSnapshot) return;
    const prev = prevSnapshot.stockDepositByAccount;
    const prevPcd = prevSnapshot.pensionCashDeposit;
    setDep4802Krw(String(prev?.["4802"]?.krw ?? 0));
    setDep4802Usd(String(prev?.["4802"]?.usd ?? 0));
    setDep1635Krw(String(prev?.["1635"]?.krw ?? 0));
    setDep1635Usd(String(prev?.["1635"]?.usd ?? 0));
    setDep1402Krw(String(prev?.["1402"]?.krw ?? 0));
    setDep1402Usd(String(prev?.["1402"]?.usd ?? 0));
    setShortterm2805(String(prevSnapshot.shorttermMonthly?.deposit ?? 0));
    setEducation1470(String(prevSnapshot.educationMonthly?.deposit ?? 0));
    setPensionRetirement(String(prevPcd?.RETIREMENT ?? 0));
    setPensionSavings(String(prevPcd?.SAVINGS ?? 0));
    setPensionIrp(String(prevPcd?.IRP ?? 0));
    setCashForeignUsd(String(prevSnapshot.cashForeignUsd ?? 0));
    setCashForeignCad(String(prevSnapshot.cashForeignCad ?? 0));
    setFixedDepositKrw(String(prevSnapshot.fixedDepositKrw ?? 0));
    setFixedDepositUsd(String(prevSnapshot.fixedDepositUsd ?? 0));
    setLeaseDeposit(String(prevSnapshot.leaseDeposit ?? 0));
    // Digital Asset Principal — 전월 원가도 복사
    setUpbitPrincipal(String(prevSnapshot.crypto?.upbit?.principal ?? 0));
    setKorbitPrincipal(String(prevSnapshot.crypto?.korbit?.principal ?? 0));
    setBinancePrincipalUsd(String(prevSnapshot.crypto?.binance?.principal ?? 0));
    // RESP/RRSP — 전월 잔액도 복사
    setRespRrspBalanceCad(String(prevSnapshot.canadianPension?.balanceCad ?? 0));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const totalKrw =
        (Number(dep4802Krw) || 0) + (Number(dep1635Krw) || 0) + (Number(dep1402Krw) || 0);
      const totalUsd =
        (Number(dep4802Usd) || 0) + (Number(dep1635Usd) || 0) + (Number(dep1402Usd) || 0);

      const isConfirmed = snapshot?.status === "CONFIRMED";

      const body: UpdateSnapshotRequest = {
        stockDepositKrw: totalKrw,
        stockDepositUsd: totalUsd,
        stockDepositByAccount: {
          "4802": { krw: Number(dep4802Krw) || 0, usd: Number(dep4802Usd) || 0 },
          "1635": { krw: Number(dep1635Krw) || 0, usd: Number(dep1635Usd) || 0 },
          "1402": { krw: Number(dep1402Krw) || 0, usd: Number(dep1402Usd) || 0 },
        },
        shorttermMonthly: {
          ...(snapshot?.shorttermMonthly ?? { stockBalance: 0, accountTransfer: 0 }),
          deposit: Number(shortterm2805) || 0,
        },
        educationMonthly: {
          ...(snapshot?.educationMonthly ?? { stockBalance: 0, accountTransfer: 0 }),
          deposit: Number(education1470) || 0,
        },
        pensionCashDeposit: {
          RETIREMENT: Number(pensionRetirement) || 0,
          SAVINGS: Number(pensionSavings) || 0,
          IRP: Number(pensionIrp) || 0,
        },
        cashForeignUsd: Number(cashForeignUsd) || 0,
        cashForeignCad: Number(cashForeignCad) || 0,
        fixedDepositKrw: Number(fixedDepositKrw) || 0,
        fixedDepositUsd: Number(fixedDepositUsd) || 0,
        leaseDeposit: Number(leaseDeposit) || 0,
        // CONFIRMED 월은 투자 포지션 데이터(crypto, canadianPension) 수정 불가
        ...(!isConfirmed && {
          crypto: {
            upbit: { balance: snapshot?.crypto?.upbit?.balance ?? 0, principal: Number(upbitPrincipal) || 0 },
            korbit: { balance: snapshot?.crypto?.korbit?.balance ?? 0, principal: Number(korbitPrincipal) || 0 },
            binance: { balance: snapshot?.crypto?.binance?.balance ?? 0, principal: Number(binancePrincipalUsd) || 0 },
          },
          canadianPension: {
            balanceCad: Number(respRrspBalanceCad) || 0,
            monthlyFeeCad: snapshot?.canadianPension?.monthlyFeeCad ?? 0,
          },
        }),
      };

      const res = await fetch(`/api/portfolio/financial/snapshot/${month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.error("[DepositsInputDialog]", await res.text());
        return;
      }
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Deposit & FX 입력 — {month}</span>
            {prevSnapshot && (
              <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={handleCopyPrev}>
                <Copy className="w-3 h-3" />
                전월과 동일
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Stock Deposit — Value Investment Account */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Stock Deposit — Value Investment Account
          </p>
          {(["4802", "1635", "1402"] as const).map((acc) => {
            const krwState = acc === "4802" ? dep4802Krw : acc === "1635" ? dep1635Krw : dep1402Krw;
            const usdState = acc === "4802" ? dep4802Usd : acc === "1635" ? dep1635Usd : dep1402Usd;
            const setKrw = acc === "4802" ? setDep4802Krw : acc === "1635" ? setDep1635Krw : setDep1402Krw;
            const setUsd = acc === "4802" ? setDep4802Usd : acc === "1635" ? setDep1635Usd : setDep1402Usd;
            return (
              <div key={acc} className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">계좌 {acc}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">KRW</Label>
                    <FormattedInput value={krwState} onChange={setKrw} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-muted-foreground">USD ($)</Label>
                    <FormattedInput value={usdState} onChange={setUsd} isUsd />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stock Deposit — 기타 계좌 */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Stock Deposit — 기타 계좌
          </p>
          <NumRow label="Short-term 2805" value={shortterm2805} set={setShortterm2805} />
          <NumRow label="Education 1470" value={education1470} set={setEducation1470} />
        </div>

        {/* Stock Deposit — 연금 */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Stock Deposit — 연금 예수금
          </p>
          <NumRow label="퇴직연금 (RETIREMENT)" value={pensionRetirement} set={setPensionRetirement} />
          <NumRow label="연금저축 (SAVINGS)" value={pensionSavings} set={setPensionSavings} />
          <NumRow label="IRP" value={pensionIrp} set={setPensionIrp} />
        </div>

        {/* Currency Deposit */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Currency Deposit
          </p>
          <NumRow label="Foreign deposit (USD)" value={cashForeignUsd} set={setCashForeignUsd} isUsd />
          <NumRow label="Foreign deposit (CAD)" value={cashForeignCad} set={setCashForeignCad} isUsd />
          <NumRow label="Fixed deposit (KRW)" value={fixedDepositKrw} set={setFixedDepositKrw} />
          <NumRow label="Fixed deposit (USD)" value={fixedDepositUsd} set={setFixedDepositUsd} isUsd />
        </div>

        {/* Digital Asset — Principal (자산관리 II에서 이관) */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Digital Asset — Principal (취득원가)
          </p>
          {snapshot?.status === "CONFIRMED" ? (
            <p className="text-xs text-muted-foreground">CONFIRMED 월 — 수정 불가</p>
          ) : (
            <>
              <NumRow label="Upbit 원가 (KRW)" value={upbitPrincipal} set={setUpbitPrincipal} />
              <NumRow label="Korbit 원가 (KRW)" value={korbitPrincipal} set={setKorbitPrincipal} />
              <NumRow label="Binance 원가 (USD)" value={binancePrincipalUsd} set={setBinancePrincipalUsd} isUsd />
            </>
          )}
        </div>

        {/* RESP/RRSP (자산관리 II에서 이관) */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            RESP/RRSP — 잔액
          </p>
          {snapshot?.status === "CONFIRMED" ? (
            <p className="text-xs text-muted-foreground">CONFIRMED 월 — 수정 불가</p>
          ) : (
            <NumRow label="잔액 (CAD)" value={respRrspBalanceCad} set={setRespRrspBalanceCad} isUsd />
          )}
        </div>

        {/* Lease Deposit */}
        <div className="space-y-3 py-2">
          <p className="text-xs font-semibold text-foreground border-b border-border pb-1">
            Liabilities
          </p>
          <NumRow label="Lease Deposit (임차보증금)" value={leaseDeposit} set={setLeaseDeposit} />
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

export function DepositsView({
  snapshots,
  onRefresh,
  onRateSave,
  onRateRefresh,
  rateRefreshing = false,
}: DepositsViewProps) {
  const curMonthStr = currentMonth();
  const curYear = Number(curMonthStr.split("-")[0]);
  const [selectedYear, setSelectedYear] = useState(curYear);
  const [dialogMonth, setDialogMonth] = useState<string | null>(null);

  const yearData = buildDepositsYearlyData(snapshots, selectedYear);
  const baselineCol = yearData[0];
  const monthCols = yearData.slice(1);
  const allCols = [baselineCol, ...monthCols];

  const handleSaved = useCallback(async () => {
    await onRefresh();
  }, [onRefresh]);

  const getSnapshotForMonth = (month: string) =>
    snapshots.find((s) => s.month === month) ?? null;

  const getPrevSnapshot = (month: string): FinancialSnapshot | null => {
    const [y, m] = month.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    return snapshots.find((s) => s.month === prevMonth) ?? null;
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Deposit &amp; FX</span>
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
          {allCols.some((c) => c.isDraft) && onRateRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onRateRefresh}
              disabled={rateRefreshing}
            >
              <RefreshCw className={`w-3 h-3 ${rateRefreshing ? "animate-spin" : ""}`} />
              환율 갱신
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 text-xs gap-1">
            <RefreshCw className="w-3 h-3" />새로고침
          </Button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-muted/80 border-b-2 border-border">
              <th className="sticky left-0 px-3 py-2 text-left text-xs font-medium text-muted-foreground bg-muted/80 min-w-[170px]">
                항목
              </th>
              {/* baseline */}
              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground min-w-[110px] bg-muted/40">
                {fmtMonthLabel(baselineCol.month, true)}
              </th>
              {/* 월별 컬럼 */}
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
                        <button
                          onClick={() => setDialogMonth(col.month)}
                          className="text-muted-foreground hover:text-foreground"
                          title="입력"
                        >
                          <ClipboardPen className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground min-w-[110px] bg-muted/40">
                YTD
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── Exchange Rates ─────────────────────────────── */}
            <tr className="bg-muted/60 border-t-2 border-border">
              <td
                colSpan={allCols.length + 2}
                className="px-3 py-1.5 text-xs font-semibold sticky left-0 bg-muted/60"
              >
                <div className="flex items-center justify-between pr-2">
                  <span>Exchange Rates</span>
                  {allCols.some((c) => c.isDraft) && onRateRefresh && (
                    <button
                      onClick={onRateRefresh}
                      disabled={rateRefreshing}
                      className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${rateRefreshing ? "animate-spin" : ""}`} />
                      {rateRefreshing ? "조회 중…" : "실시간 갱신"}
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {(["usdKrw", "cadKrw"] as const).map((key) => {
              const label = key === "usdKrw" ? "USD/KRW" : "CAD/KRW";
              const lastCol = [...monthCols].reverse().find((c) => c.hasData);
              return (
                <tr key={key} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="sticky left-0 px-3 py-1 text-xs text-muted-foreground bg-background whitespace-nowrap">
                    {label}
                  </td>
                  {allCols.map((col) => {
                    if (!col.hasData) {
                      return (
                        <td key={col.month} className="px-2 py-1 text-right text-xs text-muted-foreground/40 bg-yellow-50/60 dark:bg-yellow-950/20">–</td>
                      );
                    }
                    if (col.isDraft && onRateSave) {
                      return (
                        <td key={col.month} className="px-1 py-0.5 bg-yellow-50/60 dark:bg-yellow-950/20">
                          <RateCell value={col.exchangeRates[key]} onSave={(v) => onRateSave(key, v)} compact />
                        </td>
                      );
                    }
                    return (
                      <td key={col.month} className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground bg-yellow-50/60 dark:bg-yellow-950/20">
                        <span className="inline-flex items-center justify-end gap-1">
                          {col.exchangeRates[key].toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <Lock className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right text-xs tabular-nums text-muted-foreground bg-yellow-50/60 dark:bg-yellow-950/20">
                    {lastCol
                      ? lastCol.exchangeRates[key].toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : "–"}
                  </td>
                </tr>
              );
            })}

            {/* ── Stock Deposit — Value Investment Account ─── */}
            <SectionHeader label="Stock Deposit — Value Investment Account" colCount={allCols.length} />
            {(["4802", "1635", "1402"] as const).map((acc) => (
              <Fragment key={acc}>
                <SimpleRow
                  label={`${acc} (KRW)`}
                  cols={allCols}
                  getValue={(c) => c.stockDepositByAccount[acc].krw}
                  isManualInput
                />
                <SimpleRow
                  label={`${acc} (USD)`}
                  cols={allCols}
                  getValue={(c) => c.stockDepositByAccount[acc].usd}
                  isUsd
                  isManualInput
                />
              </Fragment>
            ))}

            {/* ── Stock Deposit — 기타 계좌 ─────────────────── */}
            <SectionHeader label="Stock Deposit — 기타 계좌" colCount={allCols.length} />
            <SimpleRow
              label="Short-term 2805"
              cols={allCols}
              getValue={(c) => c.shortterm2805Deposit}
              isManualInput
            />
            <SimpleRow
              label="Education 1470"
              cols={allCols}
              getValue={(c) => c.education1470Deposit}
              isManualInput
            />

            {/* ── Stock Deposit — 연금 예수금 ───────────────── */}
            <SectionHeader label="Stock Deposit — 연금 예수금" colCount={allCols.length} />
            <SimpleRow
              label="퇴직연금 (RETIREMENT)"
              cols={allCols}
              getValue={(c) => c.pensionCashDeposit.RETIREMENT}
              isManualInput
            />
            <SimpleRow
              label="연금저축 (SAVINGS)"
              cols={allCols}
              getValue={(c) => c.pensionCashDeposit.SAVINGS}
              isManualInput
            />
            <SimpleRow
              label="IRP"
              cols={allCols}
              getValue={(c) => c.pensionCashDeposit.IRP}
              isManualInput
            />

            {/* ── Currency Deposit ─────────────────────────── */}
            <SectionHeader label="Currency Deposit" colCount={allCols.length} />
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

            {/* ── Digital Asset Principal ───────────────────── */}
            <SectionHeader label="Digital Asset — Principal (취득원가)" colCount={allCols.length} />
            <SimpleRow
              label="Upbit 원가 (KRW)"
              cols={allCols}
              getValue={(c) => c.digitalAssetPrincipal.upbitPrincipal}
              isManualInput
            />
            <SimpleRow
              label="Korbit 원가 (KRW)"
              cols={allCols}
              getValue={(c) => c.digitalAssetPrincipal.korbitPrincipal}
              isManualInput
            />
            <SimpleRow
              label="Binance 원가 (USD)"
              cols={allCols}
              getValue={(c) => c.digitalAssetPrincipal.binancePrincipalUsd}
              isUsd
              isManualInput
            />
            <SimpleRow
              label="합계 (KRW 환산)"
              cols={allCols}
              getValue={(c) => c.digitalAssetPrincipal.totalPrincipalKrw}
              isBold
            />

            {/* ── RESP/RRSP ─────────────────────────────────── */}
            <SectionHeader label="RESP/RRSP" colCount={allCols.length} />
            <SimpleRow
              label="잔액 (CAD)"
              cols={allCols}
              getValue={(c) => c.respRrsp.balanceCad}
              isUsd
              isManualInput
            />
            <SimpleRow
              label="잔액 (KRW 환산)"
              cols={allCols}
              getValue={(c) => c.respRrsp.balanceKrw}
            />

            {/* ── Lease Deposit ─────────────────────────────── */}
            <SectionHeader label="Lease Deposit" colCount={allCols.length} />
            <SimpleRow
              label="임차보증금"
              cols={allCols}
              getValue={(c) => c.leaseDeposit}
              isManualInput
            />
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>• KRW: 전체 수치 (원)</span>
        <span>• USD/CAD: 원화 미환산</span>
        <span className="text-amber-600">• DRAFT: 현재 월</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-300/60" />
          직접입력 필드
        </span>
      </div>

      {/* 입력 다이얼로그 */}
      {dialogMonth && (
        <DepositsInputDialog
          open={!!dialogMonth}
          month={dialogMonth}
          snapshot={getSnapshotForMonth(dialogMonth)}
          prevSnapshot={getPrevSnapshot(dialogMonth)}
          onClose={() => setDialogMonth(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
