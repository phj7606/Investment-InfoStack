"use client";

// 추세추종 계좌 리스크 관리 패널
// Excel "Risk Management Account I" 시트 기반 레이아웃:
//
//   좌측 컬럼 — 계좌 지표 테이블
//     Account Total, Win Rate(자동), 10 Losing Streak(자동),
//     Multiple R(설정), 2% Amount(자동), Cutoff(설정),
//     One-time Investment(자동)
//
//   우측 컬럼 — 시장·단위 설정
//     Market: Market Status(1~5), Current Market(1~5)
//     Win Rate: Unit(설정), Unit Investment(설정)
//
// 설정값은 localStorage에 저장하여 새로고침 후에도 유지

import { useState, useEffect } from "react";
import { Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DEFAULT_RISK_CONFIG,
  RISK_MANAGEMENT_STORAGE_KEY,
} from "@/types/portfolio";
import type { RiskManagementConfig, KiwoomPosition } from "@/types/portfolio";

interface RiskManagementPanelProps {
  positions: KiwoomPosition[];
  /** 거래 이력 기반 실제 승률 (0~1). 데이터 없으면 0 */
  winRate?: number;
}

// ────────────────────────────────────────
// 포맷 헬퍼
// ────────────────────────────────────────

/** 원화 금액을 쉼표 구분 + "원" 단위로 표시 */
function fmtAmount(v: number): string {
  if (v === 0) return "-";
  return `${v.toLocaleString()}원`;
}

/** 퍼센트 값을 소수점 1자리로 표시 */
function fmtPct(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}%`;
}

// ────────────────────────────────────────
// 공통 행 컴포넌트 (좌측 테이블용)
// ────────────────────────────────────────

interface MetricRowProps {
  label: string;
  value: string;
  note?: string;         // 우측 회색 주석 (예: "Risk 1~2%")
  dimmed?: boolean;      // 회색 텍스트 (자동 계산값 표시)
  bold?: boolean;        // 굵은 텍스트 (합계성 항목)
  settable?: boolean;    // 빨간 삼각형 인디케이터 표시
  extra?: string;        // 값 우측 추가 표시 (예: "25.0%")
}

function MetricRow({ label, value, note, dimmed, bold, settable, extra }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      {/* 라벨 — 설정 가능 항목은 빨간 삼각형(▶) 아이콘 표시 */}
      <span className={cn(
        "flex items-center gap-1",
        dimmed ? "text-muted-foreground" : "text-foreground/80"
      )}>
        {settable && (
          <span className="text-red-500 text-[8px] leading-none">▶</span>
        )}
        {label}
      </span>

      {/* 값 영역 */}
      <div className="flex items-center gap-2 tabular-nums">
        <span className={cn(
          bold ? "font-bold text-foreground" : "",
          dimmed ? "text-muted-foreground" : "font-medium"
        )}>
          {value}
        </span>
        {note && (
          <span className="text-[10px] text-muted-foreground/70">{note}</span>
        )}
        {extra && (
          <span className="text-[10px] text-muted-foreground font-medium">{extra}</span>
        )}
      </div>
    </div>
  );
}

// 1~5 단계 선택 버튼 그룹
function PhaseButtons({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={cn(
            "w-6 h-6 rounded text-[11px] font-semibold transition-colors",
            value === n
              ? "bg-emerald-500 text-white"
              : "bg-muted text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-600"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// ────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────

export function RiskManagementPanel({
  positions,
  winRate = 0,
}: RiskManagementPanelProps) {
  const [config, setConfig] = useState<RiskManagementConfig>(DEFAULT_RISK_CONFIG);

  // 설정 다이얼로그 로컬 상태
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputCapital, setInputCapital] = useState("");
  const [inputMultipleR, setInputMultipleR] = useState(
    String(Math.round(DEFAULT_RISK_CONFIG.multipleR * 100))
  );
  const [inputCutoff, setInputCutoff] = useState(
    String(Math.round(DEFAULT_RISK_CONFIG.cutoff * 100))
  );
  const [inputUnit, setInputUnit] = useState(String(DEFAULT_RISK_CONFIG.unit));
  const [inputUnitInvestment, setInputUnitInvestment] = useState(
    String(DEFAULT_RISK_CONFIG.unitInvestment)
  );

  // localStorage에서 설정 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RISK_MANAGEMENT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as RiskManagementConfig;
        setConfig(parsed);
        setInputCapital(String(parsed.totalCapital || ""));
        setInputMultipleR(String(Math.round(parsed.multipleR * 100)));
        setInputCutoff(String(Math.round(parsed.cutoff * 100)));
        setInputUnit(String(parsed.unit));
        setInputUnitInvestment(String(parsed.unitInvestment));
      }
    } catch {
      // localStorage 접근 불가 환경에서는 기본값 유지
    }
  }, []);

  // 설정 저장 헬퍼
  function persist(next: RiskManagementConfig) {
    setConfig(next);
    try {
      localStorage.setItem(RISK_MANAGEMENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  // 다이얼로그 저장
  function saveDialog() {
    const capital = parseFloat(inputCapital.replace(/,/g, "")) || 0;
    const multipleR = Math.min(1, Math.max(0, (parseFloat(inputMultipleR) || 2) / 100));
    const cutoff = Math.min(1, Math.max(0, (parseFloat(inputCutoff) || 8) / 100));
    const unit = Math.max(1, parseInt(inputUnit, 10) || 3);
    const unitInvestment = Math.max(1, Math.min(unit, parseInt(inputUnitInvestment, 10) || 3));

    persist({ ...config, totalCapital: capital, multipleR, cutoff, unit, unitInvestment });
    setDialogOpen(false);
  }

  // 시장 상태 직접 변경
  function setMarketStatus(v: 1 | 2 | 3 | 4 | 5) {
    persist({ ...config, marketStatus: v });
  }
  function setCurrentMarket(v: 1 | 2 | 3 | 4 | 5) {
    persist({ ...config, currentMarket: v });
  }

  // ── 계산값 ────────────────────────────────
  const riskAmount = Math.round(config.totalCapital * config.multipleR);

  // 10연속 손실 확률: (1 - winRate)^10
  const tenLosingStreak =
    winRate > 0 ? Math.pow(1 - winRate, 10) * 100 : 0;

  // 1회 투자금액: totalCapital / (unit + 1)
  const oneTimeInvestment =
    config.totalCapital > 0 && config.unit > 0
      ? Math.round(config.totalCapital / (config.unit + 1))
      : 0;
  const oneTimeInvestmentPct =
    config.unit > 0 ? (1 / (config.unit + 1)) * 100 : 0;

  // 현재 보유 포지션 총 평가금액
  const currentInvested = positions.reduce((s, p) => s + p.evalAmount, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">리스크 관리</CardTitle>

          {/* 설정 다이얼로그 — Multiple R, Cutoff, Unit 등 수치 설정 */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle className="text-sm">리스크 설정</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-1 text-xs">

                {/* Account Total */}
                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium text-muted-foreground">Account Total (원)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={inputCapital}
                    onChange={(e) => setInputCapital(e.target.value)}
                    placeholder="예: 25000000"
                    className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Multiple R */}
                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Multiple R — 종목당 손실 허용 (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={inputMultipleR}
                      min="0.5"
                      max="10"
                      step="0.5"
                      onChange={(e) => setInputMultipleR(e.target.value)}
                      className="w-24 rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] text-muted-foreground">% (권장 1~2%)</span>
                  </div>
                </div>

                {/* Cutoff */}
                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Cutoff — 손절 기준 (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={inputCutoff}
                      min="1"
                      max="30"
                      step="0.5"
                      onChange={(e) => setInputCutoff(e.target.value)}
                      className="w-24 rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] text-muted-foreground">% (Target = 3R)</span>
                  </div>
                </div>

                {/* Unit */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Unit</label>
                    <input
                      type="number"
                      value={inputUnit}
                      min="1"
                      max="10"
                      step="1"
                      onChange={(e) => setInputUnit(e.target.value)}
                      className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Unit Investment</label>
                    <input
                      type="number"
                      value={inputUnitInvestment}
                      min="1"
                      max={inputUnit || "10"}
                      step="1"
                      onChange={(e) => setInputUnitInvestment(e.target.value)}
                      className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <Button
                  onClick={saveDialog}
                  className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  저장
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* 2컬럼 메인 레이아웃 */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-0">

          {/* ── 좌측: 계좌 지표 테이블 ── */}
          <div className="space-y-0.5">
            {/* Account Total */}
            <MetricRow
              label="Account Total"
              value={config.totalCapital > 0 ? fmtAmount(config.totalCapital) : "-"}
              bold
            />

            {/* Win Rate — 거래 이력 기반 자동 계산 */}
            <MetricRow
              label="Win Rate"
              value={winRate > 0 ? fmtPct(winRate * 100, 0) : "-"}
              dimmed
            />

            {/* 10 Losing Streak — 자동 계산 */}
            <MetricRow
              label="10 Losing Streak"
              value={tenLosingStreak > 0 ? fmtPct(tenLosingStreak) : "-"}
              dimmed
            />

            {/* 구분선 */}
            <div className="my-1 border-t border-border/40" />

            {/* Multiple R — 설정 가능 */}
            <MetricRow
              label="Multiple R"
              value={fmtPct(config.multipleR * 100, 0)}
              note={`Risk 1~2%`}
              settable
            />

            {/* 2% Amount — 자동 계산 */}
            <MetricRow
              label={`${Math.round(config.multipleR * 100)}% Amount`}
              value={riskAmount > 0 ? riskAmount.toLocaleString() : "-"}
            />

            {/* Cutoff — 설정 가능 */}
            <MetricRow
              label="Cutoff"
              value={fmtPct(config.cutoff * 100, 1)}
              note="Target profit, 3R"
              settable
            />

            {/* 구분선 */}
            <div className="my-1 border-t border-border/40" />

            {/* One-time Investment — 자동 계산 */}
            <MetricRow
              label="One-time Inves"
              value={oneTimeInvestment > 0 ? oneTimeInvestment.toLocaleString() : "-"}
              extra={oneTimeInvestment > 0 ? fmtPct(oneTimeInvestmentPct) : undefined}
              bold
            />

            {/* 현재 보유 포지션 총액 (참고용) */}
            {currentInvested > 0 && (
              <MetricRow
                label="Current Invested"
                value={currentInvested.toLocaleString()}
                dimmed
              />
            )}
          </div>

          {/* ── 우측: 시장 상태 + 단위 설정 ── */}
          <div className="space-y-3">

            {/* Market 섹션 */}
            <div>
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-foreground/70">Market</span>
                <span className="text-[11px] font-semibold text-foreground/70">Unit</span>
              </div>

              {/* Market Status */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-red-500 text-[8px]">▶</span>
                  Market Status
                </span>
                <PhaseButtons
                  value={config.marketStatus}
                  onChange={setMarketStatus}
                />
              </div>

              {/* Current Market */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-red-500 text-[8px]">▶</span>
                  Current Market
                </span>
                <PhaseButtons
                  value={config.currentMarket}
                  onChange={setCurrentMarket}
                />
              </div>
            </div>

            {/* 구분선 */}
            <div className="border-t border-border/40" />

            {/* Win Rate 섹션 */}
            <div>
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-foreground/70">Win Rate</span>
                <span className="text-[11px] font-semibold text-foreground/70">Unit</span>
              </div>

              {/* Unit */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-red-500 text-[8px]">▶</span>
                  Unit
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {config.unit} Units
                </span>
              </div>

              {/* Unit Investment */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-red-500 text-[8px]">▶</span>
                  Unit Investment
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {config.unitInvestment} Units
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 원금 미입력 시 안내 */}
        {config.totalCapital === 0 && (
          <p className="mt-3 text-center text-[11px] text-muted-foreground border border-dashed rounded px-2 py-2">
            설정(⚙) 버튼을 눌러 Account Total을 입력하세요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
