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
  /**
   * localStorage 저장 키 — 계좌별로 독립 보관.
   * 미지정 시 기본값(RISK_MANAGEMENT_STORAGE_KEY) 사용.
   */
  storageKey?: string;
  /** 설정 변경 시 부모에 최신 config 전달 (포지션 리스크 테이블 연동용) */
  onConfigChange?: (config: RiskManagementConfig) => void;
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

// 1~3 단계 선택 버튼 그룹 (Market Status / Current Market / Unit / Unit Investment 공용)
function UnitButtons({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: 1 | 2 | 3) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {([1, 2, 3] as const).map((n) => (
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

// Win Rate 프리셋 버튼 그룹 (30, 35, 40, 45, 50%)
// 같은 버튼 재클릭 시 선택 해제(→ 자동 계산 모드로 전환)
const WIN_RATE_PRESETS = [0.3, 0.35, 0.4, 0.45, 0.5] as const;

function WinRateButtons({
  value,
  onChange,
}: {
  value: number; // 0~1 (0 = 자동)
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-0.5">
      {WIN_RATE_PRESETS.map((preset) => {
        const label = String(Math.round(preset * 100));
        const isActive = Math.abs(value - preset) < 0.001;
        return (
          <button
            key={preset}
            // 이미 선택된 버튼 클릭 → 0으로 리셋(자동 모드)
            onClick={() => onChange(isActive ? 0 : preset)}
            className={cn(
              "w-7 h-6 rounded text-[10px] font-semibold transition-colors",
              isActive
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-600"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────

// localStorage에서 설정을 읽어 반환하는 헬퍼 (서버에서는 기본값 반환)
function loadConfig(key: string): RiskManagementConfig {
  if (typeof window === "undefined") return DEFAULT_RISK_CONFIG;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as RiskManagementConfig;
  } catch { /* ignore */ }
  return DEFAULT_RISK_CONFIG;
}

// 다이얼로그 입력 초기값을 config에서 파생하는 헬퍼
function deriveInputs(c: RiskManagementConfig) {
  return {
    capital: c.totalCapital > 0 ? String(c.totalCapital) : "",
    winRate: c.winRate > 0 ? String(Math.round(c.winRate * 100)) : "",
    multipleR: String(Math.round(c.multipleR * 100)),
    cutoff: String(Math.round(c.cutoff * 100)),
    unit: String(c.unit),
    unitInvestment: String(c.unitInvestment),
  };
}

export function RiskManagementPanel({
  positions,
  winRate = 0,
  storageKey = RISK_MANAGEMENT_STORAGE_KEY,
  onConfigChange,
}: RiskManagementPanelProps) {
  // lazy initializer — 마운트 시점에 바로 localStorage에서 복원
  const [config, setConfig] = useState<RiskManagementConfig>(
    () => loadConfig(storageKey)
  );

  // 다이얼로그 입력 상태도 저장된 config에서 바로 초기화
  const initial = deriveInputs(loadConfig(storageKey));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputCapital, setInputCapital] = useState(initial.capital);
  const [inputWinRate, setInputWinRate] = useState(initial.winRate);
  const [inputMultipleR, setInputMultipleR] = useState(initial.multipleR);
  const [inputCutoff, setInputCutoff] = useState(initial.cutoff);
  const [inputUnit, setInputUnit] = useState(initial.unit);
  const [inputUnitInvestment, setInputUnitInvestment] = useState(initial.unitInvestment);

  // storageKey가 변경된 경우 해당 키의 데이터로 전체 재로드
  // (계좌별 독립 저장 구조에서 계좌 전환 시 사용)
  useEffect(() => {
    const loaded = loadConfig(storageKey);
    const inputs = deriveInputs(loaded);
    setConfig(loaded);
    setInputCapital(inputs.capital);
    setInputWinRate(inputs.winRate);
    setInputMultipleR(inputs.multipleR);
    setInputCutoff(inputs.cutoff);
    setInputUnit(inputs.unit);
    setInputUnitInvestment(inputs.unitInvestment);
    // 부모에도 즉시 전달하여 PositionRiskTable이 올바른 config를 받도록 함
    onConfigChange?.(loaded);
  // storageKey가 바뀔 때만 실행 (마운트 시 한 번 포함)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 설정 저장 헬퍼 (storageKey prop 기반으로 계좌별 독립 저장)
  function persist(next: RiskManagementConfig) {
    setConfig(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore
    }
    // 부모 컴포넌트에도 최신 config 전달 (PositionRiskTable 연동)
    onConfigChange?.(next);
  }

  // 다이얼로그 저장 (Account Total, Multiple R, Cutoff만 처리 — Unit/WinRate는 패널에서 직접)
  function saveDialog() {
    const capital = parseFloat(inputCapital.replace(/,/g, "")) || 0;
    // Win Rate: 빈 문자열이면 0(자동), 아니면 0~1 범위로 변환
    const wr = inputWinRate.trim() !== ""
      ? Math.min(1, Math.max(0, (parseFloat(inputWinRate) || 0) / 100))
      : 0;
    const multipleR = Math.min(1, Math.max(0, (parseFloat(inputMultipleR) || 2) / 100));
    const cutoff = Math.min(1, Math.max(0, (parseFloat(inputCutoff) || 8) / 100));

    persist({ ...config, totalCapital: capital, winRate: wr, multipleR, cutoff });
    setDialogOpen(false);
  }

  // Unit 직접 변경 (패널 버튼에서 호출)
  // Unit Investment는 Unit보다 클 수 없으므로 초과 시 Unit 값으로 클램프
  function setUnit(v: 1 | 2 | 3) {
    persist({
      ...config,
      unit: v,
      unitInvestment: Math.min(config.unitInvestment, v) as 1 | 2 | 3,
    });
  }

  // Unit Investment 직접 변경 (Unit 범위 내로 제한)
  function setUnitInvestment(v: 1 | 2 | 3) {
    const clamped = Math.min(v, config.unit) as 1 | 2 | 3;
    persist({ ...config, unitInvestment: clamped });
  }

  // Win Rate 직접 변경 (패널 버튼에서 호출)
  function setWinRatePreset(v: number) {
    persist({ ...config, winRate: v });
    // 다이얼로그 입력 상태도 동기화
    setInputWinRate(v > 0 ? String(Math.round(v * 100)) : "");
  }

  // 시장 상태 직접 변경
  function setMarketStatus(v: 1 | 2 | 3) {
    persist({ ...config, marketStatus: v });
  }
  function setCurrentMarket(v: 1 | 2 | 3) {
    persist({ ...config, currentMarket: v });
  }

  // ── 계산값 ────────────────────────────────
  const riskAmount = Math.round(config.totalCapital * config.multipleR);

  // 유효 승률: config에 직접 입력값이 있으면 우선 사용, 없으면 거래이력 기반 prop 사용
  const effectiveWinRate = config.winRate > 0 ? config.winRate : winRate;

  // 10연속 손실 확률: (1 - winRate)^10
  const tenLosingStreak =
    effectiveWinRate > 0 ? Math.pow(1 - effectiveWinRate, 10) * 100 : 0;

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

                {/* Win Rate */}
                <div className="space-y-0.5">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Win Rate (%) — 직접 입력 (비우면 거래이력 자동)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={inputWinRate}
                      min="0"
                      max="100"
                      step="1"
                      onChange={(e) => setInputWinRate(e.target.value)}
                      placeholder="자동 (거래이력 기반)"
                      className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-[11px] text-muted-foreground shrink-0">%</span>
                  </div>
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

            {/* Win Rate — 직접 입력값 우선, 없으면 거래이력 기반 자동 계산 */}
            <MetricRow
              label="Win Rate"
              value={effectiveWinRate > 0 ? fmtPct(effectiveWinRate * 100, 0) : "-"}
              note={effectiveWinRate > 0
                ? config.winRate > 0 ? "(직접입력)" : "(자동)"
                : undefined}
              settable
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
                <UnitButtons
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
                <UnitButtons
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

              {/* Unit — 1~3 버튼 */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-red-500 text-[8px]">▶</span>
                  Unit
                </span>
                <UnitButtons value={config.unit} onChange={setUnit} />
              </div>

              {/* Unit Investment — 1~3 버튼 (Unit 초과 불가) */}
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-red-500 text-[8px]">▶</span>
                  Unit Investment
                </span>
                <UnitButtons
                  value={config.unitInvestment}
                  onChange={setUnitInvestment}
                />
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
