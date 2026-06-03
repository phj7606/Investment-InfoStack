"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardPen, RefreshCw, CheckSquare } from "lucide-react";
import { LockPricesDialog } from "./LockPricesDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FormattedInput } from "@/components/portfolio/financial/FormattedInput";
import { buildAssetManagementIIYearlyData } from "@/lib/portfolio/financial-calc";
import type {
  FinancialSnapshot,
  AssetManagementIIColumnData,
  LivePortfolioData,
  UpdateSnapshotRequest,
} from "@/types/financial";

// ─────────────────────────────────────────
// Props 및 상수
// ─────────────────────────────────────────

interface EduPensionViewProps {
  snapshots: FinancialSnapshot[];
  liveData: LivePortfolioData | null;
  liveLoading: boolean;
  onRefresh: () => void;
}

// 월 레이블 (Jan ~ Dec)
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─────────────────────────────────────────
// 숫자 포맷 유틸
// ─────────────────────────────────────────

function fmtKrw(v: number): string {
  if (v === 0) return "–";
  const abs = Math.abs(Math.round(v)).toLocaleString("ko-KR");
  return v < 0 ? `(${abs})` : abs;
}

function fmtUsd(v: number): string {
  if (v === 0) return "–";
  const abs = "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `(${abs})` : abs;
}

function fmtCad(v: number): string {
  if (v === 0) return "–";
  const abs = "C$" + Math.abs(v).toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return v < 0 ? `(${abs})` : abs;
}

function fmtPct(v: number): string {
  if (v === 0) return "–";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

/** P/L 값에 따른 텍스트 색상 클래스 */
function pnlClass(v: number): string {
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-rose-500";
  return "text-muted-foreground";
}

// ─────────────────────────────────────────
// 셀 렌더링 헬퍼
// ─────────────────────────────────────────

interface CellProps {
  value: string;
  className?: string;
  isBaseline?: boolean;
  /** 직접입력 필드 여부 — baseline 제외한 데이터 셀에 옅은 노란색 하이라이트 */
  isManualInput?: boolean;
}

function Cell({ value, className = "", isBaseline = false, isManualInput = false }: CellProps) {
  // hasData=false인 셀: 자산관리 탭과 동일하게 en-dash + 흐린 색상
  // (빈 값은 fmtKrw에서 "–"로 변환되어 전달됨)
  // baseline 컬럼은 기준값 배경 우선, 비baseline 직접입력만 노란색
  const bgClass = isBaseline
    ? "bg-muted/40 text-muted-foreground"
    : isManualInput
      ? "bg-yellow-50/60 dark:bg-yellow-950/20"
      : "";

  return (
    <td
      className={[
        "tabular-nums text-right px-2 py-1 text-xs border-l border-border/50",
        bgClass,
        value === "–" && !className ? "text-muted-foreground/40" : "",
        className,
      ].join(" ")}
    >
      {value}
    </td>
  );
}

// ─────────────────────────────────────────
// 입력 다이얼로그 (AssetManagementIIInputDialog)
// ─────────────────────────────────────────

interface DialogState {
  month: string;
  // Digital Asset — 잔액만 (원가는 Deposit & FX 페이지에서 관리)
  upbitBalance: string;
  korbitBalance: string;
  binanceBalance: string;
  // Short-term Account (2805) — 주식 잔액 수동 오버라이드만 (예수금·계좌이체는 Deposit & FX 페이지 관리)
  shorttermStockBalance: string;
}

interface InputDialogProps {
  open: boolean;
  onClose: () => void;
  state: DialogState;
  onChange: (state: DialogState) => void;
  onSave: () => Promise<void>;
  saving: boolean;
}

function AssetManagementIIInputDialog({
  open, onClose, state, onChange, onSave, saving,
}: InputDialogProps) {
  // FormattedInput은 raw 문자열을 직접 반환하므로 이벤트 없이 값을 받음
  const set = (key: keyof DialogState) => (raw: string) =>
    onChange({ ...state, [key]: raw });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            자산관리 II 편집 — {state.month}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Digital Asset — 잔액만 입력 (원가·RESP/RRSP는 Deposit & FX 페이지에서 입력) */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Digital Asset
              </p>
              <span className="text-xs text-muted-foreground/60">원가 → Deposit &amp; FX</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label className="text-xs">Upbit 잔액 (KRW)</Label>
                <FormattedInput value={state.upbitBalance} onChange={set("upbitBalance")} />
              </div>
              <div>
                <Label className="text-xs">Korbit 잔액 (KRW)</Label>
                <FormattedInput value={state.korbitBalance} onChange={set("korbitBalance")} />
              </div>
              <div>
                <Label className="text-xs">Binance 잔액 (USD)</Label>
                <FormattedInput value={state.binanceBalance} onChange={set("binanceBalance")} isUsd />
              </div>
            </div>
          </section>

          {/* Short-term Account (2805) — 주식 잔액 오버라이드만 (예수금은 Deposit & FX 페이지 관리) */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Short-term Account (2805)
            </p>
            <div>
              <Label className="text-xs">주식 잔액 오버라이드 (KRW)</Label>
              <FormattedInput value={state.shorttermStockBalance} onChange={set("shorttermStockBalance")} placeholder="비워두면 live-data 자동 계산" />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            취소
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function EduPensionView({ snapshots, liveData, liveLoading, onRefresh }: EduPensionViewProps) {
  const curYear = new Date().getFullYear();
  const [year, setYear] = useState(curYear);

  // 종가 확정 다이얼로그
  const curMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  // 편집 다이얼로그 상태 — 원가·RESP/RRSP는 Deposit & FX 페이지로 이관
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({
    month: "",
    upbitBalance: "0",
    korbitBalance: "0",
    binanceBalance: "0",
    shorttermStockBalance: "",
  });

  // 스냅샷 맵 (month → snapshot) — 이전 월 데이터 접근용
  const snapMap = new Map(snapshots.map((s) => [s.month, s]));

  // 컬럼 데이터 빌드
  const columns = buildAssetManagementIIYearlyData(snapshots, liveData, year);

  // 헤더 레이블 — Dec-{year-1} + Jan~Dec
  const headerLabels = [`Dec-${year - 1}`, ...MONTH_LABELS];

  // ── 편집 버튼 클릭 핸들러 ──────────────────────────
  const handleEdit = useCallback((col: AssetManagementIIColumnData) => {
    const snap = snapMap.get(col.month);
    const crypto = snap?.crypto;

    setDialogState({
      month: col.month,
      // 잔액만 편집 (원가는 Deposit & FX 페이지에서 관리)
      upbitBalance: String(crypto?.upbit?.balance ?? col.digitalAsset.upbitBalance),
      korbitBalance: String(crypto?.korbit?.balance ?? col.digitalAsset.korbitBalance),
      binanceBalance: String(crypto?.binance?.balance ?? col.digitalAsset.binanceBalanceUsd),
      // Short-term: 주식 잔액 수동 오버라이드만 (비워두면 live-data 자동 계산)
      shorttermStockBalance: snap?.shorttermMonthly?.stockBalance != null ? String(snap.shorttermMonthly.stockBalance) : "",
    });
    setDialogOpen(true);
  }, [snapMap]);

  // ── 저장 처리 — 잔액 저장 시 기존 원가 값을 스냅샷에서 읽어 merge ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const snap = snapMap.get(dialogState.month);
      const body: UpdateSnapshotRequest = {
        // 원가(principal)는 스냅샷의 기존 값을 그대로 유지 (Deposit & FX에서 관리)
        crypto: {
          upbit: {
            balance: Number(dialogState.upbitBalance) || 0,
            principal: snap?.crypto?.upbit?.principal ?? 0,
          },
          korbit: {
            balance: Number(dialogState.korbitBalance) || 0,
            principal: snap?.crypto?.korbit?.principal ?? 0,
          },
          binance: {
            balance: Number(dialogState.binanceBalance) || 0,
            principal: snap?.crypto?.binance?.principal ?? 0,
          },
        },
        // Short-term 주식 잔액 수동 오버라이드 (비워두면 live-data fallback 사용)
        ...(dialogState.shorttermStockBalance.trim() !== "" && {
          shorttermMonthly: {
            stockBalance: Number(dialogState.shorttermStockBalance) || 0,
          },
        }),
      };

      const res = await fetch(`/api/portfolio/financial/snapshot/${dialogState.month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("저장 실패");
      setDialogOpen(false);
      onRefresh();
    } catch (e) {
      console.error("[EduPensionView] save error", e);
    } finally {
      setSaving(false);
    }
  }, [dialogState, onRefresh]);

  // ── 테이블 렌더링 ─────────────────────────────────

  return (
    <div className="space-y-3">
      {/* 헤더: 연도 선택 + 새로고침 — 자산관리 탭과 동일한 형식 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">자산관리 II</span>
          <div className="flex gap-1">
            {[curYear - 1, curYear].map((y) => (
              <Button
                key={y}
                variant={year === y ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => setYear(y)}
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
          {columns.some((c) => c.isDraft) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-amber-400 text-amber-700 hover:bg-amber-50"
              onClick={() => setLockDialogOpen(true)}
            >
              <CheckSquare className="w-3 h-3" />종가 확정
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onRefresh} disabled={liveLoading}>
            <RefreshCw className={`h-3 w-3 ${liveLoading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {/* 고정 레이블 컬럼 */}
              <th className="sticky left-0 z-10 bg-muted/70 text-left px-3 py-2 text-xs font-semibold w-48 min-w-[180px] border-r border-border">
                항목
              </th>
              {columns.map((col, idx) => (
                <th
                  key={col.month}
                  className={[
                    "text-center px-2 py-2 font-medium border-l border-border/50 min-w-[90px]",
                    col.isBaseline ? "bg-muted/40 text-muted-foreground" : "",
                    !col.hasData ? "text-muted-foreground/50" : "",
                  ].join(" ")}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{headerLabels[idx]}</span>
                    {col.hasData && (
                      <div className="flex items-center gap-1">
                        {col.isDraft && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 border-orange-400 text-orange-500">
                            DRAFT
                          </Badge>
                        )}
                        {col.isDraft && (
                          <button
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => handleEdit(col)}
                          >
                            <ClipboardPen className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* ── Digital Asset 섹션 ── */}
            <SectionHeaderRow label="Digital Asset" colCount={columns.length} />

            {/* Principal — 직접입력 */}
            <LabelRow label="Principal (KRW)" indent={0} />
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Upbit" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.digitalAsset.upbitPrincipal)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Korbit" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.digitalAsset.korbitPrincipal)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Binance (USD)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtUsd(col.digitalAsset.binancePrincipalUsd)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <TotalRow
              label="Total Principal"
              columns={columns}
              getValue={(col) => fmtKrw(col.digitalAsset.totalPrincipalKrw)}
            />

            {/* Balance — 직접입력 */}
            <LabelRow label="Balance (KRW)" indent={0} />
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Upbit" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.digitalAsset.upbitBalance)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Korbit" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.digitalAsset.korbitBalance)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Binance (USD)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtUsd(col.digitalAsset.binanceBalanceUsd)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <TotalRow
              label="Total Balance"
              columns={columns}
              getValue={(col) => fmtKrw(col.digitalAsset.totalKrw)}
            />

            {/* P/L */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="P/L (KRW)" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtKrw(col.digitalAsset.pnlKrw)}
                  className={pnlClass(col.digitalAsset.pnlKrw)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/40">
              <LabelCell label="P/L %" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtPct(col.digitalAsset.pnlPct)}
                  className={pnlClass(col.digitalAsset.pnlPct)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>

            {/* ── Education 1470 섹션 ── */}
            <SectionHeaderRow label="Education 1470" colCount={columns.length} />

            {/* Principal/Balance/P/L/Deposit — principal=0이면 상세 데이터 없음, "-" 표시 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Principal (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={col.education.principal !== 0 ? fmtKrw(col.education.principal) : "–"} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Balance (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={col.education.principal !== 0 ? fmtKrw(col.education.balance) : "–"} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="P/L (KRW)" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={col.education.principal !== 0 ? fmtKrw(col.education.pnl) : "–"}
                  className={col.education.principal !== 0 ? pnlClass(col.education.pnl) : undefined}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Deposit (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={col.education.principal !== 0 ? fmtKrw(col.education.deposit) : "–"} isBaseline={col.isBaseline} />
              ))}
            </tr>
            {/* Total Balance = Balance + Deposit */}
            <TotalRow
              label="Total Balance"
              columns={columns}
              getValue={(col) => fmtKrw(col.education.totalBalance)}
            />

            {/* ── Pension 섹션 ── */}
            <SectionHeaderRow label="Pension" colCount={columns.length} />

            {/* Principal — Pension Account live-data 기준 (read-only) */}
            <LabelRow label="Principal (KRW)" indent={0} />
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 퇴직연금 (Pension Fund)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.pensionFundPrincipal)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 연금저축 (Pension Deposit)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.pensionDepositPrincipal)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· IRP" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.irpPrincipal)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <TotalRow
              label="Total Principal"
              columns={columns}
              getValue={(col) => fmtKrw(col.pension.totalPrincipal)}
            />

            {/* Balance — 실시간 자동계산 */}
            <LabelRow label="Balance (KRW)" indent={0} />
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 퇴직연금 (Pension Fund)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.pensionFundBalance)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 연금저축 (Pension Deposit)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.pensionDepositBalance)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· IRP" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.irpBalance)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <TotalRow
              label="Total Balance"
              columns={columns}
              getValue={(col) => fmtKrw(col.pension.totalBalance)}
            />

            {/* P/L */}
            <LabelRow label="P/L (KRW)" indent={0} />
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 퇴직연금" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtKrw(col.pension.pensionFundPnl)}
                  className={pnlClass(col.pension.pensionFundPnl)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 연금저축" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtKrw(col.pension.pensionDepositPnl)}
                  className={pnlClass(col.pension.pensionDepositPnl)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· IRP" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtKrw(col.pension.irpPnl)}
                  className={pnlClass(col.pension.irpPnl)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
            <TotalRow
              label="Total P/L"
              columns={columns}
              getValue={(col) => fmtKrw(col.pension.totalPnl)}
              getPnl={(col) => col.pension.totalPnl}
            />
            <tr className="hover:bg-muted/20 border-b border-border/40">
              <LabelCell label="P/L %" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtPct(col.pension.totalPnlPct)}
                  className={pnlClass(col.pension.totalPnlPct)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>

            {/* ── RESP/RRSP 섹션 ── */}
            <SectionHeaderRow label="RESP/RRSP" colCount={columns.length} />

            {/* Balance (CAD) — 직접입력 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Balance (CAD)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtCad(col.respRrsp.balanceCad)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            {/* Balance (KRW) — CAD × 환율 자동계산, 하이라이트 없음 */}
            <tr className="hover:bg-muted/20 border-b border-border/40">
              <LabelCell label="Balance (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.respRrsp.balanceKrw)} isBaseline={col.isBaseline} />
              ))}
            </tr>

            {/* ── Short-term Account 섹션 ── */}
            <SectionHeaderRow label="Short-term Account (2805)" colCount={columns.length} />

            {/* Principal/Balance/P/L/Deposit — principal=0이면 상세 데이터 없음, "-" 표시 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Principal (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={col.shortterm.principal !== 0 ? fmtKrw(col.shortterm.principal) : "–"} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Balance (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={col.shortterm.principal !== 0 ? fmtKrw(col.shortterm.balance) : "–"} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="P/L (KRW)" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={col.shortterm.principal !== 0 ? fmtKrw(col.shortterm.pnl) : "–"}
                  className={col.shortterm.principal !== 0 ? pnlClass(col.shortterm.pnl) : undefined}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Deposit (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={col.shortterm.principal !== 0 ? fmtKrw(col.shortterm.deposit) : "–"} isBaseline={col.isBaseline} />
              ))}
            </tr>
            {/* Total Balance = Balance + Deposit */}
            <TotalRow
              label="Total Balance"
              columns={columns}
              getValue={(col) => fmtKrw(col.shortterm.totalBalance)}
            />
          </tbody>
        </table>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="text-amber-600">• DRAFT: 현재 월 (실시간)</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-yellow-100 dark:bg-yellow-900/40 border border-yellow-300/60" />
          직접입력 필드
        </span>
      </div>

      {/* 입력 다이얼로그 */}
      <AssetManagementIIInputDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        state={dialogState}
        onChange={setDialogState}
        onSave={handleSave}
        saving={saving}
      />

      {/* 종가 확정 다이얼로그 */}
      <LockPricesDialog
        open={lockDialogOpen}
        onClose={() => setLockDialogOpen(false)}
        month={curMonthStr}
        mode="II"
        onLocked={onRefresh}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// 보조 행 컴포넌트
// ─────────────────────────────────────────

/** 섹션 구분 헤더 행 (회색 배경) */
function SectionHeaderRow({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-muted/30 border-y border-border/60">
      <td
        colSpan={colCount + 1}
        className="sticky left-0 z-10 bg-muted/50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

/** 일반 레이블 행 — 데이터 없이 레이블만 표시 (행 높이 축소) */
function LabelRow({ label, indent }: { label: string; indent: number }) {
  return (
    <tr className="border-b border-border/20 bg-muted/10">
      <td
        className="sticky left-0 z-10 bg-muted/20 px-3 py-1 text-xs text-muted-foreground border-r border-border"
        style={{ paddingLeft: `${12 + indent * 12}px` }}
      >
        {label}
      </td>
    </tr>
  );
}

/** 고정 레이블 셀 (일반 행용) */
function LabelCell({ label }: { label: string }) {
  return (
    <td className="sticky left-0 z-10 bg-background border-r border-border px-3 py-1 text-xs text-foreground font-medium">
      {label}
    </td>
  );
}

/** 들여쓰기 적용 서브 레이블 셀 */
function SubLabelCell({ label }: { label: string }) {
  return (
    <td className="sticky left-0 z-10 bg-background border-r border-border pl-6 pr-2 py-1 text-xs text-muted-foreground">
      {label}
    </td>
  );
}

/** 합계 행 (볼드체) */
function TotalRow({
  label,
  columns,
  getValue,
  getPnl,
}: {
  label: string;
  columns: AssetManagementIIColumnData[];
  getValue: (col: AssetManagementIIColumnData) => string;
  getPnl?: (col: AssetManagementIIColumnData) => number;
}) {
  return (
    <tr className="font-semibold border-b border-border/50 bg-muted/5">
      <td className="sticky left-0 z-10 bg-muted/10 border-r border-border px-3 py-1 text-xs text-foreground">
        {label}
      </td>
      {columns.map((col) => {
        // hasData=false 컬럼: 자산관리 탭과 동일하게 en-dash + 흐린 색상
        if (!col.hasData) {
          return (
            <td key={col.month} className="tabular-nums text-right px-2 py-1 text-xs border-l border-border/50 text-muted-foreground/40 font-semibold">
              –
            </td>
          );
        }
        const pnlVal = getPnl ? getPnl(col) : undefined;
        const cellVal = getValue(col);
        return (
          <td
            key={col.month}
            className={[
              "tabular-nums text-right px-2 py-1 text-xs border-l border-border/50",
              col.isBaseline ? "bg-muted/40 text-muted-foreground" : "",
              pnlVal !== undefined ? pnlClass(pnlVal) : "",
              // 값이 "–"이면 (0) 흐리게 표시
              cellVal === "–" && pnlVal === undefined ? "text-muted-foreground/40" : "",
            ].join(" ")}
          >
            {cellVal}
          </td>
        );
      })}
    </tr>
  );
}
