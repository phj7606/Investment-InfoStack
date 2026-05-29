"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClipboardPen, RefreshCw, Copy, CheckSquare } from "lucide-react";
import { LockPricesDialog } from "./LockPricesDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const abs = Math.abs(v).toLocaleString("ko-KR");
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
  // Digital Asset
  upbitBalance: string;
  upbitPrincipal: string;
  korbitBalance: string;
  korbitPrincipal: string;
  binanceBalance: string;
  binancePrincipal: string;
  // Education 1470
  educationDeposit: string;
  educationAccountTransfer: string;
  // Pension — 원금만 수동 입력, 잔액은 자동계산
  pensionFundPrincipal: string;
  pensionDepositPrincipal: string;
  irpPrincipal: string;
  // RESP/RRSP
  respRrspBalanceCad: string;
  // Short-term Account (2805)
  shorttermDeposit: string;
  shorttermAccountTransfer: string;
  shorttermStockBalance: string;  // 수동 오버라이드 (비워두면 live-data 사용)
}

interface InputDialogProps {
  open: boolean;
  onClose: () => void;
  state: DialogState;
  onChange: (state: DialogState) => void;
  onSave: () => Promise<void>;
  onCopyPrev: () => void;
  hasPrev: boolean;
  saving: boolean;
}

function AssetManagementIIInputDialog({
  open, onClose, state, onChange, onSave, onCopyPrev, hasPrev, saving,
}: InputDialogProps) {
  const set = (key: keyof DialogState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, [key]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            자산관리 II 편집 — {state.month}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Digital Asset */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Digital Asset
              </p>
              {hasPrev && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs gap-1"
                  onClick={onCopyPrev}
                >
                  <Copy className="h-3 w-3" />
                  전월 원가 복사
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Upbit 잔액 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.upbitBalance} onChange={set("upbitBalance")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Upbit 원가 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.upbitPrincipal} onChange={set("upbitPrincipal")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Korbit 잔액 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.korbitBalance} onChange={set("korbitBalance")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Korbit 원가 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.korbitPrincipal} onChange={set("korbitPrincipal")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Binance 잔액 (USD)</Label>
                <Input className="h-7 text-xs" value={state.binanceBalance} onChange={set("binanceBalance")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Binance 원가 (USD)</Label>
                <Input className="h-7 text-xs" value={state.binancePrincipal} onChange={set("binancePrincipal")} placeholder="0" />
              </div>
            </div>
          </section>

          {/* Education 1470 */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Education 1470
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">예수금 / Deposit (KRW)</Label>
                <Input className="h-7 text-xs" value={state.educationDeposit} onChange={set("educationDeposit")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Account Transfer (KRW)</Label>
                <Input className="h-7 text-xs" value={state.educationAccountTransfer} onChange={set("educationAccountTransfer")} placeholder="0" />
              </div>
            </div>
          </section>

          {/* Pension — 원금만 수동 입력, 잔액은 자동계산 */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Pension
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">퇴직연금 원금 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.pensionFundPrincipal} onChange={set("pensionFundPrincipal")} placeholder="" />
              </div>
              <div>
                <Label className="text-xs">연금저축 원금 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.pensionDepositPrincipal} onChange={set("pensionDepositPrincipal")} placeholder="" />
              </div>
              <div>
                <Label className="text-xs">IRP 원금 (KRW)</Label>
                <Input className="h-7 text-xs" value={state.irpPrincipal} onChange={set("irpPrincipal")} placeholder="" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              * 잔액은 거래내역+종가 자동계산 | 비워두면 원금도 자동 계산
            </p>
          </section>

          {/* RESP/RRSP */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              RESP/RRSP
            </p>
            <div>
              <Label className="text-xs">잔액 (CAD)</Label>
              <Input className="h-7 text-xs" value={state.respRrspBalanceCad} onChange={set("respRrspBalanceCad")} placeholder="0" />
            </div>
          </section>

          {/* Short-term Account (2805) */}
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Short-term Account (2805)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">예수금 / Deposit (KRW)</Label>
                <Input className="h-7 text-xs" value={state.shorttermDeposit} onChange={set("shorttermDeposit")} placeholder="0" />
              </div>
              <div>
                <Label className="text-xs">Account Transfer (KRW)</Label>
                <Input className="h-7 text-xs" value={state.shorttermAccountTransfer} onChange={set("shorttermAccountTransfer")} placeholder="0" />
              </div>
            </div>
            <div className="mt-2">
              <Label className="text-xs">주식 잔액 오버라이드 (KRW)</Label>
              <Input className="h-7 text-xs" value={state.shorttermStockBalance} onChange={set("shorttermStockBalance")} placeholder="비워두면 live-data 자동 계산" />
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

  // 편집 다이얼로그 상태
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({
    month: "",
    upbitBalance: "0", upbitPrincipal: "0",
    korbitBalance: "0", korbitPrincipal: "0",
    binanceBalance: "0", binancePrincipal: "0",
    educationDeposit: "0",
    educationAccountTransfer: "0",
    pensionFundPrincipal: "",
    pensionDepositPrincipal: "",
    irpPrincipal: "",
    respRrspBalanceCad: "0",
    shorttermDeposit: "0",
    shorttermAccountTransfer: "0",
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
    const pm = snap?.pensionMonthly;

    setDialogState({
      month: col.month,
      upbitBalance: String(crypto?.upbit?.balance ?? col.digitalAsset.upbitBalance),
      upbitPrincipal: String(crypto?.upbit?.principal ?? col.digitalAsset.upbitPrincipal),
      korbitBalance: String(crypto?.korbit?.balance ?? col.digitalAsset.korbitBalance),
      korbitPrincipal: String(crypto?.korbit?.principal ?? col.digitalAsset.korbitPrincipal),
      binanceBalance: String(crypto?.binance?.balance ?? col.digitalAsset.binanceBalanceUsd),
      binancePrincipal: String(crypto?.binance?.principal ?? col.digitalAsset.binancePrincipalUsd),
      // Education: 저장된 수동 입력값 우선, 없으면 현재 집계값
      educationDeposit: String(snap?.educationMonthly?.deposit ?? col.education.deposit),
      educationAccountTransfer: String(snap?.educationMonthly?.accountTransfer ?? col.education.accountTransfer),
      // Pension: 원금만 수동 입력 (잔액은 거래내역+종가 자동계산)
      pensionFundPrincipal: pm?.fundPrincipal != null ? String(pm.fundPrincipal) : "",
      pensionDepositPrincipal: pm?.depositPrincipal != null ? String(pm.depositPrincipal) : "",
      irpPrincipal: pm?.irpPrincipal != null ? String(pm.irpPrincipal) : "",
      respRrspBalanceCad: String(snap?.canadianPension?.balanceCad ?? col.respRrsp.balanceCad),
      // Short-term: 저장된 수동 입력값 우선, 없으면 현재 집계값
      shorttermDeposit: String(snap?.shorttermMonthly?.deposit ?? col.shortterm.deposit),
      shorttermAccountTransfer: String(snap?.shorttermMonthly?.accountTransfer ?? col.shortterm.accountTransfer),
      shorttermStockBalance: snap?.shorttermMonthly?.stockBalance != null ? String(snap.shorttermMonthly.stockBalance) : "",
    });
    setDialogOpen(true);
  }, [snapMap]);

  // ── 전월 원가 복사 ────────────────────────────────
  const handleCopyPrev = useCallback(() => {
    const [yearStr, monthStr] = dialogState.month.split("-");
    const prevMonth = parseInt(monthStr) === 1
      ? `${parseInt(yearStr) - 1}-12`
      : `${yearStr}-${String(parseInt(monthStr) - 1).padStart(2, "0")}`;
    const prevSnap = snapMap.get(prevMonth);
    if (!prevSnap?.crypto) return;

    setDialogState((prev) => ({
      ...prev,
      upbitPrincipal: String(prevSnap.crypto?.upbit?.principal ?? prev.upbitPrincipal),
      korbitPrincipal: String(prevSnap.crypto?.korbit?.principal ?? prev.korbitPrincipal),
      binancePrincipal: String(prevSnap.crypto?.binance?.principal ?? prev.binancePrincipal),
    }));
  }, [dialogState.month, snapMap]);

  // ── 전월 데이터 존재 여부 확인 ──────────────────
  const hasPrevData = useCallback(() => {
    const [yearStr, monthStr] = dialogState.month.split("-");
    const prevMonth = parseInt(monthStr) === 1
      ? `${parseInt(yearStr) - 1}-12`
      : `${yearStr}-${String(parseInt(monthStr) - 1).padStart(2, "0")}`;
    return snapMap.has(prevMonth);
  }, [dialogState.month, snapMap]);

  // ── 저장 처리 ─────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Pension 수동 입력: 빈 문자열이면 null(= 자동 계산 사용), 숫자면 수동 입력값
      const parsePension = (v: string) => v.trim() === "" ? undefined : (Number(v) || 0);

      const body: UpdateSnapshotRequest = {
        crypto: {
          upbit: {
            balance: Number(dialogState.upbitBalance) || 0,
            principal: Number(dialogState.upbitPrincipal) || 0,
          },
          korbit: {
            balance: Number(dialogState.korbitBalance) || 0,
            principal: Number(dialogState.korbitPrincipal) || 0,
          },
          binance: {
            balance: Number(dialogState.binanceBalance) || 0,
            principal: Number(dialogState.binancePrincipal) || 0,
          },
        },
        educationMonthly: {
          deposit: Number(dialogState.educationDeposit) || 0,
          accountTransfer: Number(dialogState.educationAccountTransfer) || 0,
        },
        pensionMonthly: {
          fundPrincipal: parsePension(dialogState.pensionFundPrincipal),
          depositPrincipal: parsePension(dialogState.pensionDepositPrincipal),
          irpPrincipal: parsePension(dialogState.irpPrincipal),
        },
        canadianPension: {
          balanceCad: Number(dialogState.respRrspBalanceCad) || 0,
          monthlyFeeCad: 0,
        },
        shorttermMonthly: {
          deposit: Number(dialogState.shorttermDeposit) || 0,
          accountTransfer: Number(dialogState.shorttermAccountTransfer) || 0,
          // 비워두면 undefined → financial-calc에서 liveData fallback 사용
          ...(dialogState.shorttermStockBalance.trim() !== "" && {
            stockBalance: Number(dialogState.shorttermStockBalance) || 0,
          }),
        },
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

            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Principal (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.education.principal)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            {/* Account Transfer — 직접입력 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Account Transfer (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.education.accountTransfer)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>

            <LabelRow label="Balance (KRW)" indent={0} />
            {/* Deposit — 직접입력 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Deposit" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.education.deposit)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            {/* Stock — live data, 하이라이트 없음 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Stock" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.education.stockBalance)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <TotalRow
              label="Total Balance"
              columns={columns}
              getValue={(col) => fmtKrw(col.education.balance)}
            />

            {/* P/L = Stock - Principal */}
            <tr className="hover:bg-muted/20 border-b border-border/40">
              <LabelCell label="P/L (KRW)" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtKrw(col.education.pnl)}
                  className={pnlClass(col.education.pnl)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>

            {/* ── Pension 섹션 ── */}
            <SectionHeaderRow label="Pension" colCount={columns.length} />

            {/* Principal — 직접입력 */}
            <LabelRow label="Principal (KRW)" indent={0} />
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 퇴직연금 (Pension Fund)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.pensionFundPrincipal)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· 연금저축 (Pension Deposit)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.pensionDepositPrincipal)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· IRP" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.pension.irpPrincipal)} isBaseline={col.isBaseline} isManualInput />
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

            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Principal (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.shortterm.principal)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            {/* Account Transfer — 직접입력 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <LabelCell label="Account Transfer (KRW)" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.shortterm.accountTransfer)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>

            <LabelRow label="Balance (KRW)" indent={0} />
            {/* Deposit — 직접입력 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Deposit" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.shortterm.deposit)} isBaseline={col.isBaseline} isManualInput />
              ))}
            </tr>
            {/* Stock — live data, 하이라이트 없음 */}
            <tr className="hover:bg-muted/20 border-b border-border/30">
              <SubLabelCell label="· Stock" />
              {columns.map((col) => (
                <Cell key={col.month} value={fmtKrw(col.shortterm.stockBalance)} isBaseline={col.isBaseline} />
              ))}
            </tr>
            <TotalRow
              label="Total Balance"
              columns={columns}
              getValue={(col) => fmtKrw(col.shortterm.balance)}
            />

            {/* P/L = Stock - Principal */}
            <tr className="hover:bg-muted/20 border-b border-border/40">
              <LabelCell label="P/L (KRW)" />
              {columns.map((col) => (
                <Cell
                  key={col.month}
                  value={fmtKrw(col.shortterm.pnl)}
                  className={pnlClass(col.shortterm.pnl)}
                  isBaseline={col.isBaseline}
                />
              ))}
            </tr>
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
        onCopyPrev={handleCopyPrev}
        hasPrev={hasPrevData()}
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
