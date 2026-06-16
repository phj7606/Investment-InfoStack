"use client";

// 주가 성과 분석 클라이언트 컴포넌트
// 종목 입력 → /api/stock-performance 호출 → 차트 + 성과 요약 카드 렌더링
// recharts 클라이언트 격리 필수 ("use client")

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { Loader2, AlertCircle, BarChart2, Search, Zap, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SyncChartDateControl } from "./SyncChartDateControl";
import type { StockPerformanceResult, DailyBar, MonthlyBar } from "@/app/api/stock-performance/route";
import type { SearchSuggestion } from "@/app/api/stock-performance/search/route";
import type { DateRange, PeriodLabel } from "@/types/market-analysis";

// ─── 색상 상수 ────────────────────────────────────────────────────────────────
const COLORS = {
  stock: "#6366f1",       // indigo-500 (ACTION 1 테마)
  bench1: "#22c55e",      // green-500 (KOSPI / S&P500)
  bench2: "#3b82f6",      // blue-500 (NASDAQ)
  positive: "#22c55e",    // 양의 수익률 — 초록
  negative: "#ef4444",    // 음의 수익률 — 빨강
  posLight: "#86efac",    // 양의 벤치마크 — 연초록
  negLight: "#fca5a5",    // 음의 벤치마크 — 연빨강
} as const;

// ─── 유틸 함수 ────────────────────────────────────────────────────────────────
// KST(UTC+9) 환경에서 toISOString()은 UTC 기준 → 자정 이전 접속 시 날짜 1일 밀림 방지
function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDefaultRange(): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86400 * 1000);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end), period: "1Y" };
}

/** X축 날짜 포맷: "YYYY-MM-DD" → "MMM YY" */
function formatXTick(value: string): string {
  if (!value) return "";
  const d = new Date(value + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** 숫자 포맷: 소수점 N자리 + 단위 */
function fmt(value: number, suffix = "%", digits = 2): string {
  return `${value.toFixed(digits)}${suffix}`;
}

/** 지표값 색상 결정 */
function metricColor(value: number, higherIsBetter = true): string {
  if (higherIsBetter) return value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return value <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────
interface ChartTooltipProps extends TooltipProps<number, string> {
  labelMap?: Record<string, string>;
  unit?: string;
  digits?: number;
}

function ChartTooltip({ active, payload, label, labelMap, unit = "%", digits = 2 }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md min-w-36">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry) => {
        const key = entry.dataKey as string;
        const displayLabel = labelMap?.[key] ?? entry.name ?? key;
        const val = entry.value;
        return (
          <p key={key} style={{ color: entry.color }} className="flex justify-between gap-4">
            <span>{displayLabel}</span>
            <span className="tabular-nums">{val != null ? fmt(val, unit, digits) : "—"}</span>
          </p>
        );
      })}
    </div>
  );
}

// ─── 성과 요약 카드 ──────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  /** 지표 설명 — 카드 하단 회색 텍스트로 표시 */
  hint?: string;
  /** 기준점 텍스트 (예: "1 이상 양호") — 기준선이 있는 지표에 사용 */
  benchmark?: string;
  stockValue: number;
  benchValue?: number;
  benchLabel?: string;
  format: (v: number) => string;
  higherIsBetter?: boolean;
  absLowerIsBetter?: boolean;
}

function MetricCard({
  label, hint, benchmark,
  stockValue, benchValue, benchLabel,
  format, higherIsBetter = true, absLowerIsBetter = false,
}: MetricCardProps) {
  const isGood = absLowerIsBetter
    ? Math.abs(stockValue) < Math.abs(benchValue ?? 0)
    : higherIsBetter
      ? stockValue > (benchValue ?? 0)
      : stockValue < (benchValue ?? 0);

  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground mb-0.5 leading-snug">{label}</p>
      {/* hint 영역 — 없어도 동일 높이 확보해서 모든 카드에서 수치가 같은 위치에 정렬 */}
      <p className="text-[10px] text-muted-foreground/60 mb-1 leading-tight min-h-[14px]">
        {hint ?? ""}
      </p>
      {/* 수치 — 기본 폰트 유지, tabular-nums로 숫자 너비만 고정 */}
      <p className={`text-xl font-bold tabular-nums ${absLowerIsBetter ? metricColor(stockValue, false) : metricColor(stockValue, higherIsBetter)}`}>
        {format(stockValue)}
      </p>
      {/* 기준점 (칼마 등) */}
      {benchmark && (
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{benchmark}</p>
      )}
      {/* 벤치마크 비교 */}
      {benchValue !== undefined && benchLabel && (
        <p className="text-xs text-muted-foreground mt-1">
          <span className="tabular-nums">{format(benchValue)}</span>
          <span className="ml-1">({benchLabel})</span>
          <span className={`ml-1 font-semibold ${isGood ? "text-emerald-500" : "text-red-500"}`}>
            {isGood ? "▲" : "▼"}
          </span>
        </p>
      )}
    </Card>
  );
}

// ─── 로딩 / 에러 상태 ─────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">성과 데이터 계산 중...</span>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
      <BarChart2 className="h-10 w-10 opacity-30" />
      <p className="text-sm">종목을 입력하고 분석을 실행하세요.</p>
      <p className="text-xs opacity-60">한국 주식: 6자리 종목코드 입력 시 KRX 자동 설정 (예: 005930)</p>
    </div>
  );
}

// ─── 차트 컴포넌트들 ──────────────────────────────────────────────────────────

// 4개 차트가 동일한 syncId를 공유 → 커서/툴팁 자동 동기화
const SYNC_ID = "stock-perf";

interface ChartContainerProps {
  title: string;
  children: React.ReactNode;
  height?: number;
  /** 차트 상단 우측에 표시할 범례 (커스텀) */
  legend?: React.ReactNode;
}

function ChartContainer({ title, children, height = 280, legend }: ChartContainerProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          {legend}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/** Chart 1: 정규화 가격 (100 기준 LineChart) */
function NormalizedPriceChart({ data, labels, hasBench2 }: { data: DailyBar[]; labels: StockPerformanceResult["labels"]; hasBench2: boolean }) {
  const labelMap: Record<string, string> = {
    stockNorm: labels.stock,
    bench1Norm: labels.bench1,
    ...(hasBench2 && labels.bench2 ? { bench2Norm: labels.bench2 } : {}),
  };

  const legend = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-indigo-500" />{labels.stock}</span>
      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-green-500" />{labels.bench1}</span>
      {hasBench2 && labels.bench2 && <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-blue-500 border-dashed" style={{borderTop: "2px dashed #3b82f6"}} />{labels.bench2}</span>}
    </div>
  );

  return (
    <ChartContainer title="정규화 가격 (시작일=100)" legend={legend}>
      <LineChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tickFormatter={formatXTick} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={60} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
        <Tooltip content={<ChartTooltip labelMap={labelMap} unit="" digits={1} />} />
        <ReferenceLine y={100} stroke="hsl(var(--border))" strokeDasharray="4 2" />
        <Line type="monotone" dataKey="stockNorm" name={labels.stock} stroke={COLORS.stock} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="bench1Norm" name={labels.bench1} stroke={COLORS.bench1} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        {hasBench2 && labels.bench2 && (
          <Line type="monotone" dataKey="bench2Norm" name={labels.bench2} stroke={COLORS.bench2} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="4 2" />
        )}
      </LineChart>
    </ChartContainer>
  );
}

/** Chart 2: 누적 수익률 (%) LineChart */
function CumulativeReturnChart({ data, labels, hasBench2 }: { data: DailyBar[]; labels: StockPerformanceResult["labels"]; hasBench2: boolean }) {
  const labelMap: Record<string, string> = {
    stockReturn: labels.stock,
    bench1Return: labels.bench1,
    ...(hasBench2 && labels.bench2 ? { bench2Return: labels.bench2 } : {}),
  };

  const legend = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-indigo-500" />{labels.stock}</span>
      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-green-500" />{labels.bench1}</span>
    </div>
  );

  return (
    <ChartContainer title="누적 수익률 (%)" legend={legend}>
      <LineChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tickFormatter={formatXTick} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={60} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v.toFixed(0)}%`} />
        <Tooltip content={<ChartTooltip labelMap={labelMap} unit="%" digits={2} />} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
        <Line type="monotone" dataKey="stockReturn" name={labels.stock} stroke={COLORS.stock} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="bench1Return" name={labels.bench1} stroke={COLORS.bench1} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        {hasBench2 && labels.bench2 && (
          <Line type="monotone" dataKey="bench2Return" name={labels.bench2} stroke={COLORS.bench2} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="4 2" />
        )}
      </LineChart>
    </ChartContainer>
  );
}

/**
 * Chart — 변동성 항력 차트 (산술평균 − 기하평균, 월별 rolling)
 *
 * 변동성 항력(volatility drag) = 산술평균(t) − 기하평균(t)
 *   산술평균(t): Σrᵢ / t
 *   기하평균(t): (∏(1+rᵢ))^(1/t) − 1
 *
 * 항상 ≥ 0 (AM-GM 부등식).
 * 값이 클수록 등락이 심해 복리 손실이 크다는 의미.
 * 수익률이 안정적일수록 0에 수렴.
 */
function CombinedReturnChart({ monthly, labels, hasBench2 }: {
  daily: DailyBar[];    // 미사용 — 시그니처 호환을 위해 유지
  monthly: MonthlyBar[];
  labels: StockPerformanceResult["labels"];
  hasBench2: boolean;
}) {
  type DragRow = {
    month: string;
    stockDrag: number;    // 종목 변동성 항력 = 산술 − 기하 (%/월)
    bench1Drag: number;
    bench2Drag?: number;
  };

  const drag: DragRow[] = [];
  let sSum = 0, b1Sum = 0, b2Sum = 0;
  let sProd = 1, b1Prod = 1, b2Prod = 1;

  for (let i = 0; i < monthly.length; i++) {
    const m = monthly[i];
    const t = i + 1;

    const sr  = m.stockReturn  / 100;
    const b1r = m.bench1Return / 100;
    const b2r = (m.bench2Return ?? 0) / 100;

    sSum  += sr;  b1Sum  += b1r;  b2Sum  += b2r;
    sProd *= (1 + sr);  b1Prod *= (1 + b1r);  b2Prod *= (1 + b2r);

    const sArith  = (sSum  / t) * 100;
    const b1Arith = (b1Sum / t) * 100;
    const b2Arith = (b2Sum / t) * 100;
    const sGeo    = (Math.pow(sProd,  1 / t) - 1) * 100;
    const b1Geo   = (Math.pow(b1Prod, 1 / t) - 1) * 100;
    const b2Geo   = (Math.pow(b2Prod, 1 / t) - 1) * 100;

    drag.push({
      month:      m.month,
      // 산술 − 기하: 항상 ≥ 0 (AM-GM). 클수록 변동성이 복리 수익을 잠식
      stockDrag:  sArith  - sGeo,
      bench1Drag: b1Arith - b1Geo,
      bench2Drag: hasBench2 ? b2Arith - b2Geo : undefined,
    });
  }

  const labelMap: Record<string, string> = {
    stockDrag:  `${labels.stock} 변동성 항력`,
    bench1Drag: `${labels.bench1} 변동성 항력`,
    ...(hasBench2 && labels.bench2 ? { bench2Drag: `${labels.bench2} 변동성 항력` } : {}),
  };

  const legend = (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 shrink-0" style={{ background: COLORS.stock }} />
          {labels.stock}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 shrink-0" style={{ background: COLORS.bench1 }} />
          {labels.bench1}
        </span>
        {hasBench2 && labels.bench2 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 shrink-0" style={{ background: COLORS.bench2 }} />
            {labels.bench2}
          </span>
        )}
      </div>
      <p className="text-[10px] opacity-40">
        산술평균 − 기하평균 = 변동성 항력 · 0에 가까울수록 수익률이 안정적
      </p>
    </div>
  );

  return (
    <ChartContainer title="변동성 항력 (산술평균 − 기하평균, %/월 · 월별 rolling)" legend={legend}>
      <LineChart data={drag} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={50} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `${v.toFixed(2)}%`} />
        <Tooltip content={<ChartTooltip labelMap={labelMap} unit="%/월" digits={4} />} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
        <Line type="monotone" dataKey="stockDrag"  stroke={COLORS.stock}  strokeWidth={2}   dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="bench1Drag" stroke={COLORS.bench1} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        {hasBench2 && labels.bench2 && (
          <Line type="monotone" dataKey="bench2Drag" stroke={COLORS.bench2} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        )}
      </LineChart>
    </ChartContainer>
  );
}

/**
 * Chart 3: MDD (최대낙폭) — 구별이 잘 되도록 개선
 * 종목: 인디고 실선 + 연한 채우기
 * 벤치마크: 초록 점선 + 채우기 없음 → 겹쳐도 명확히 구별
 */
function MddChart({ data, labels, hasBench2 }: { data: DailyBar[]; labels: StockPerformanceResult["labels"]; hasBench2: boolean }) {
  const labelMap: Record<string, string> = {
    stockMdd: labels.stock,
    bench1Mdd: labels.bench1,
    ...(hasBench2 && labels.bench2 ? { bench2Mdd: labels.bench2 } : {}),
  };

  const legend = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {/* 종목: 실선 + 채우기 */}
      <span className="flex items-center gap-1">
        <span className="inline-block w-5 h-3 rounded-sm" style={{ background: `${COLORS.stock}40`, borderBottom: `2px solid ${COLORS.stock}` }} />
        {labels.stock}
      </span>
      {/* 벤치마크: 점선만 */}
      <span className="flex items-center gap-1">
        <span className="inline-block w-5 h-0.5" style={{ borderTop: `2px dashed ${COLORS.bench1}` }} />
        {labels.bench1}
      </span>
    </div>
  );

  return (
    <ChartContainer title="MDD — 고점 대비 낙폭 (%)" legend={legend}>
      <AreaChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="stockMddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={COLORS.stock} stopOpacity={0.35} />
            <stop offset="95%" stopColor={COLORS.stock} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tickFormatter={formatXTick} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={60} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v.toFixed(0)}%`} />
        <Tooltip content={<ChartTooltip labelMap={labelMap} unit="%" digits={2} />} />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
        {/* 종목: 채우기 있는 Area */}
        <Area type="monotone" dataKey="stockMdd" name={labels.stock} stroke={COLORS.stock} fill="url(#stockMddGrad)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        {/* 벤치마크: 점선 Line만 (fill 없음 → 겹침에서도 명확히 구별) */}
        <Area type="monotone" dataKey="bench1Mdd" name={labels.bench1} stroke={COLORS.bench1} fill="none" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
        {hasBench2 && labels.bench2 && (
          <Area type="monotone" dataKey="bench2Mdd" name={labels.bench2} stroke={COLORS.bench2} fill="none" strokeWidth={1.5} strokeDasharray="2 2" dot={false} isAnimationActive={false} connectNulls />
        )}
      </AreaChart>
    </ChartContainer>
  );
}

/**
 * Chart 4: 월별 기하수익률 Grouped BarChart
 * 커스텀 범례로 "어느 막대가 어느 종목인지" 명확히 표시
 */
function MonthlyReturnChart({ data, labels, hasBench2 }: { data: MonthlyBar[]; labels: StockPerformanceResult["labels"]; hasBench2: boolean }) {
  // 수동 범례: 조건부 색상 때문에 recharts 기본 Legend가 불명확 → 직접 구성
  const legend = (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.stock }} />
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.negative }} />
        {labels.stock}
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.posLight }} />
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.negLight }} />
        {labels.bench1}
      </span>
      {hasBench2 && labels.bench2 && (
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-300" />
          <span className="inline-block w-3 h-3 rounded-sm bg-red-200" />
          {labels.bench2}
        </span>
      )}
      <span className="text-muted-foreground/50">( 진한색=상승 · 연한색=하락 )</span>
    </div>
  );

  return (
    <ChartContainer title="월별 기하수익률 (%)" height={320} legend={legend}>
      {/* barGap: 같은 월 내 막대 간격 축소 / barCategoryGap: 월 간 간격 확대 → 월 그룹 시각적 분리 */}
      <BarChart data={data} margin={{ top: 4, right: 16, left: -8, bottom: 20 }} barGap={1} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          angle={-45}
          textAnchor="end"
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v.toFixed(0)}%`} />
        <Tooltip
          formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
          contentStyle={{ fontSize: 11 }}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />

        {/* 종목: 상승=인디고, 하락=빨강 */}
        <Bar dataKey="stockReturn" name={labels.stock} isAnimationActive={false} maxBarSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.stockReturn >= 0 ? COLORS.stock : COLORS.negative} fillOpacity={0.85} />
          ))}
        </Bar>

        {/* 벤치마크1: 상승=연초록, 하락=연빨강 (종목보다 연하게 → 뒤에 있어도 구별) */}
        <Bar dataKey="bench1Return" name={labels.bench1} isAnimationActive={false} maxBarSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.bench1Return >= 0 ? COLORS.posLight : COLORS.negLight} fillOpacity={0.9} />
          ))}
        </Bar>

        {hasBench2 && labels.bench2 && (
          <Bar dataKey="bench2Return" name={labels.bench2} isAnimationActive={false} maxBarSize={20}>
            {data.map((entry, i) => (
              <Cell key={i} fill={(entry.bench2Return ?? 0) >= 0 ? "#93c5fd" : "#fca5a5"} fillOpacity={0.7} />
            ))}
          </Bar>
        )}
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Chart 5: 월말 정규화 가격 — 일별 데이터에서 각 월의 마지막 거래일 값을 추출
 * 월별 수익률을 복리 곱산하는 방식은 월 경계 갭(전월 말↔당월 초 가격 차이)이 누락되어
 * 정규화 가격 차트와 불일치 → 일별 norm 값을 직접 사용해 완전히 일치시킴
 */
function CumulativeMonthlyChart({ data, labels, hasBench2 }: { data: DailyBar[]; labels: StockPerformanceResult["labels"]; hasBench2: boolean }) {
  // 월별 마지막 거래일의 정규화 가격 추출 (시작일=100 기준, 정규화 가격 차트와 동일 기준)
  const monthMap = new Map<string, { stockCum: number; bench1Cum: number; bench2Cum?: number }>();
  for (const bar of data) {
    const month = bar.date.slice(0, 7); // "YYYY-MM"
    // 날짜 오름차순이므로 덮어쓸 때마다 해당 월의 최신(마지막) 거래일 값으로 갱신
    monthMap.set(month, {
      stockCum:  bar.stockNorm,
      bench1Cum: bar.bench1Norm,
      bench2Cum: bar.bench2Norm,
    });
  }
  const cumulative = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  const labelMap: Record<string, string> = {
    stockCum: labels.stock,
    bench1Cum: labels.bench1,
    ...(hasBench2 && labels.bench2 ? { bench2Cum: labels.bench2 } : {}),
  };

  const legend = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-indigo-500" />{labels.stock}</span>
      <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-green-500" />{labels.bench1}</span>
    </div>
  );

  return (
    <ChartContainer title="월말 정규화 가격 (시작일=100 · 월간 집계)" legend={legend}>
      <LineChart data={cumulative} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={50} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
        <Tooltip content={<ChartTooltip labelMap={labelMap} unit="" digits={1} />} />
        <ReferenceLine y={100} stroke="hsl(var(--border))" strokeDasharray="4 2" />
        <Line type="monotone" dataKey="stockCum" name={labels.stock} stroke={COLORS.stock} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="bench1Cum" name={labels.bench1} stroke={COLORS.bench1} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
        {hasBench2 && labels.bench2 && (
          <Line type="monotone" dataKey="bench2Cum" name={labels.bench2} stroke={COLORS.bench2} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls strokeDasharray="4 2" />
        )}
      </LineChart>
    </ChartContainer>
  );
}

// ─── CAGR vs 월별수익률 비교 설명 배너 ───────────────────────────────────────
function CagrExplainer({ cagr, monthlyData }: { cagr: number; monthlyData: MonthlyBar[] }) {
  const n = monthlyData.length;
  if (n === 0) return null;

  const totalFromMonthly = monthlyData.reduce((acc, m) => acc * (1 + m.stockReturn / 100), 1);
  const cagrFromMonthly = (Math.pow(totalFromMonthly, 12 / n) - 1) * 100;

  return (
    <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
      <div>
        <span className="font-semibold text-foreground">CAGR</span>
        <span className="ml-2 tabular-nums text-indigo-600 dark:text-indigo-400">{fmt(cagr, "%")}</span>
        <span className="ml-1 opacity-60">— 전체 기간 수익률을 연 단위로 환산</span>
      </div>
      <div>
        <span className="font-semibold text-foreground">월별 기하평균 연환산</span>
        <span className="ml-2 tabular-nums text-indigo-500 dark:text-indigo-300">{fmt(cagrFromMonthly, "%")}</span>
        <span className="ml-1 opacity-60">— 월별 수익률을 복리 합산 ({n}개월)</span>
      </div>
    </div>
  );
}

// ─── 거래소 레이블 ────────────────────────────────────────────────────────────
const EXCHANGE_LABELS: Record<string, string> = {
  KRX: "KRX (한국)",
  NYSE: "NYSE (미국)",
  NASDAQ: "NASDAQ (미국)",
};

// ─── sessionStorage 상태 복원 ─────────────────────────────────────────────────
const SESSION_KEY = "stock-perf-state";

interface PersistedState {
  ticker: string;
  exchange: "KRX" | "NYSE" | "NASDAQ";
  dateRange: DateRange;
  result: StockPerformanceResult;
}

/** sessionStorage에서 이전 분석 상태 복원 — 단일 파싱으로 stale 여부까지 반환
 *  endDate가 오늘보다 이전이면 오늘로 업데이트하고 wasStale=true 반환 */
function loadPersistedState(): { state: PersistedState; wasStale: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as PersistedState;
    const today = toIsoDate(new Date());
    const wasStale = state.dateRange.endDate < today;
    // endDate가 오늘보다 이전이면 오늘로 갱신 (날짜 stale 방지)
    if (wasStale) {
      state.dateRange = { ...state.dateRange, endDate: today };
    }
    return { state, wasStale };
  } catch {
    // 파싱 실패 시 무시
  }
  return null;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export function StockPerformanceClient() {
  // 마운트 당 1회만 sessionStorage 파싱 (useState lazy init은 첫 렌더링에서만 실행)
  // 이후 각 useState에서 persisted를 재사용 → 중복 파싱 없음
  const [persisted] = useState(() => loadPersistedState());

  const [ticker, setTicker] = useState(() => persisted?.state.ticker ?? "");
  const [exchange, setExchange] = useState<"KRX" | "NYSE" | "NASDAQ">(
    () => persisted?.state.exchange ?? "NASDAQ"
  );
  const [dateRange, setDateRange] = useState<DateRange>(
    () => persisted?.state.dateRange ?? getDefaultRange()
  );

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [exchangeAutoDetected, setExchangeAutoDetected] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockPerformanceResult | null>(
    () => persisted?.state.result ?? null
  );

  // 복원된 상태로 시작하는 경우 dateRange 변경 감지 useEffect가 즉시 재분석하지 않도록 플래그
  // wasStale=true(날짜가 오래됨) → false: 마운트 시 자동 재분석 허용
  // wasStale=false(오늘 날짜) → true: 이미 유효한 결과이므로 재분석 스킵
  const isRestoredRef = useRef(persisted !== null && !persisted.wasStale);

  const inputWrapperRef = useRef<HTMLDivElement>(null);

  // ── 자동완성 검색 (350ms 디바운스) ─────────────────────────────────────────
  useEffect(() => {
    const q = ticker.trim();
    if (q.length < 1) { setSuggestions([]); setShowDropdown(false); return; }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/stock-performance/search?q=${encodeURIComponent(q)}`);
        const data: SearchSuggestion[] = await res.json();
        setSuggestions(data);
        setShowDropdown(data.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [ticker]);

  // ── 드롭다운 바깥 클릭 시 닫기 ─────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (inputWrapperRef.current && !inputWrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(s: SearchSuggestion) {
    setTicker(s.ticker);
    setExchange(s.exchange);
    setExchangeAutoDetected(true);
    setSuggestions([]);
    setShowDropdown(false);
  }

  // ── 분석 실행 ────────────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!ticker.trim() || loading) return;
    setShowDropdown(false);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/stock-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: ticker.trim().toUpperCase(),
          exchange,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        }),
      });

      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "데이터를 불러오지 못했습니다."); return; }
      setResult(json as StockPerformanceResult);
    } catch (e) {
      setError(`네트워크 오류: ${e instanceof Error ? e.message : "알 수 없는 오류"}`);
    } finally {
      setLoading(false);
    }
  }, [ticker, exchange, dateRange, loading]);

  // 날짜 변경 시 결과가 있으면 자동 재분석
  // 단, sessionStorage에서 복원된 직후 첫 실행은 건너뜀 (이미 유효한 결과가 있으므로)
  useEffect(() => {
    if (isRestoredRef.current) {
      isRestoredRef.current = false;
      return;
    }
    if (result) runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // 분석 결과가 바뀔 때마다 sessionStorage에 저장 → 메뉴 이동 후 복원에 사용
  useEffect(() => {
    if (!result) return;
    try {
      const state: PersistedState = { ticker, exchange, dateRange, result };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch {
      // 저장 실패(용량 초과 등) 시 무시
    }
  // result가 확정된 시점의 ticker/exchange/dateRange를 함께 저장해야 하므로 모두 포함
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const hasBench2 = result?.labels.bench2 != null;
  // 벤치마크 레이블 (짧게)
  const b1Label = result?.labels.bench1 ?? "벤치마크";

  return (
    <div className="space-y-5">
      {/* ── 입력 패널 ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">

            {/* 티커 입력 + 자동완성 드롭다운 */}
            <div className="flex-1 space-y-1" ref={inputWrapperRef}>
              <Label className="text-xs font-medium">티커 / 종목코드</Label>
              <div className="relative">
                <Input
                  placeholder="티커 또는 종목코드 (예: AAPL, 005930)"
                  value={ticker}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTicker(val);
                    // 6자리 숫자 = 한국 종목코드 → 거래소 자동 KRX 설정
                    if (/^\d{6}$/.test(val.trim())) {
                      setExchange("KRX");
                      setExchangeAutoDetected(true);
                    } else {
                      setExchangeAutoDetected(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) {
                      if (showDropdown && suggestions.length > 0) selectSuggestion(suggestions[0]);
                      else runAnalysis();
                    }
                    if (e.key === "Escape") setShowDropdown(false);
                  }}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  className="h-9 text-sm pr-8"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {showDropdown && suggestions.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
                    {suggestions.map((s) => (
                      <button
                        key={s.yahooSymbol}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted transition-colors first:rounded-t-md last:rounded-b-md"
                        onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-foreground shrink-0">{s.ticker}</span>
                          <span className="text-muted-foreground truncate">{s.name}</span>
                        </span>
                        <Badge
                          variant="outline"
                          className={[
                            "ml-2 shrink-0 text-xs font-medium",
                            s.exchange === "KRX"
                              ? "border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400"
                              : s.exchange === "NASDAQ"
                                ? "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                                : "border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400",
                          ].join(" ")}
                        >
                          {s.exchange}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 거래소 선택 */}
            <div className="w-full sm:w-40 space-y-1">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                거래소
                {exchangeAutoDetected && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Zap className="h-2.5 w-2.5" />
                    자동 감지
                  </span>
                )}
              </Label>
              <Select value={exchange} onValueChange={(v) => { setExchange(v as typeof exchange); setExchangeAutoDetected(false); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KRX">KRX (한국)</SelectItem>
                  <SelectItem value="NYSE">NYSE (미국)</SelectItem>
                  <SelectItem value="NASDAQ">NASDAQ (미국)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={runAnalysis}
              disabled={loading || !ticker.trim()}
              className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-5 shrink-0"
            >
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />분석 중...</>
              ) : (
                <><Search className="h-3.5 w-3.5 mr-1.5" />성과 분석</>
              )}
            </Button>
          </div>

          <SyncChartDateControl
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            period={dateRange.period}
            onRangeChange={(start, end, period) =>
              setDateRange({ startDate: start, endDate: end, period: period as PeriodLabel })
            }
          />
        </CardContent>
      </Card>

      {/* ── 상태별 렌더링 ──────────────────────────────────────────────────── */}
      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}
      {!loading && !error && !result && <EmptyState />}

      {!loading && result?.companyName && result.ticker && (
        <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30 px-3 py-2 text-xs text-indigo-700 dark:text-indigo-300">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>
            {/* 기업명: KRX 종목이면 네이버 금융 페이지로 이동하는 링크 */}
            {result.exchange === "KRX" ? (
              <a
                href={`https://stock.naver.com/domestic/stock/${result.ticker}/price`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline-offset-2 hover:underline inline-flex items-center gap-0.5"
              >
                {result.companyName}
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            ) : (
              <span className="font-semibold">{result.companyName}</span>
            )}
            <span className="mx-1 opacity-60">→</span>
            티커: <span className="font-semibold">{result.ticker}</span>
          </span>
        </div>
      )}

      {/* ── 분석 결과 ─────────────────────────────────────────────────────── */}
      {!loading && result && (
        <div className="space-y-5">

          {/* 성과 요약 카드 */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
              성과 요약 — {result.labels.stock} vs {b1Label}
              {hasBench2 && ` / ${result.labels.bench2}`}
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="CAGR"
                hint="연환산 복합수익률"
                stockValue={result.metrics.stock.cagr}
                benchValue={result.metrics.bench1.cagr}
                benchLabel={b1Label}
                format={(v) => fmt(v, "%")}
                higherIsBetter
              />
              <MetricCard
                label="총 수익률"
                stockValue={result.metrics.stock.totalReturn}
                benchValue={result.metrics.bench1.totalReturn}
                benchLabel={b1Label}
                format={(v) => fmt(v, "%")}
                higherIsBetter
              />
              <MetricCard
                label="MDD"
                hint="최대 낙폭 (고점 대비 최대 하락)"
                stockValue={result.metrics.stock.mdd}
                benchValue={result.metrics.bench1.mdd}
                benchLabel={b1Label}
                format={(v) => fmt(v, "%")}
                absLowerIsBetter
              />
              <MetricCard
                label="연환산 변동성"
                hint="일별 수익률의 표준편차 × √252"
                stockValue={result.metrics.stock.volatility}
                benchValue={result.metrics.bench1.volatility}
                benchLabel={b1Label}
                format={(v) => fmt(v, "%")}
                higherIsBetter={false}
              />
              <MetricCard
                label="샤프 비율"
                hint="수익 ÷ 전체 변동성 (상승·하락 모두 포함)"
                benchmark="1 이상 양호 · 2 이상 우수"
                stockValue={result.metrics.stock.sharpe}
                benchValue={result.metrics.bench1.sharpe}
                benchLabel={b1Label}
                format={(v) => v.toFixed(2)}
                higherIsBetter
              />
              <MetricCard
                label="소르티노 비율"
                hint="수익 ÷ 하방 변동성 (하락 구간만 측정)"
                benchmark="샤프보다 높으면 하락이 적다는 의미"
                stockValue={result.metrics.stock.sortino}
                benchValue={result.metrics.bench1.sortino}
                benchLabel={b1Label}
                format={(v) => v.toFixed(2)}
                higherIsBetter
              />
              <MetricCard
                label="칼마 비율"
                hint="CAGR ÷ |MDD| — 낙폭 대비 수익 효율"
                benchmark="0.5 이상 양호 · 1 이상 우수"
                stockValue={result.metrics.stock.calmar}
                format={(v) => v.toFixed(2)}
                higherIsBetter
              />
              <MetricCard
                label="월 승률"
                hint="수익이 플러스인 달의 비율"
                benchmark="50% 이상이면 상승 우위"
                stockValue={result.metrics.stock.winRate}
                benchValue={result.metrics.bench1.winRate}
                benchLabel={b1Label}
                format={(v) => fmt(v, "%", 1)}
                higherIsBetter
              />
            </div>

            {(result.metrics.stock.beta != null || result.metrics.stock.correlation != null) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                {result.metrics.stock.beta != null && (
                  <MetricCard
                    label="베타"
                    hint={`${b1Label} 대비 민감도. 1 초과=더 민감`}
                    stockValue={result.metrics.stock.beta}
                    format={(v) => v.toFixed(2)}
                    higherIsBetter={false}
                  />
                )}
                {result.metrics.stock.correlation != null && (
                  <MetricCard
                    label="상관계수"
                    hint={`${b1Label}와 동조화 정도 (−1 ~ +1)`}
                    stockValue={result.metrics.stock.correlation}
                    format={(v) => v.toFixed(2)}
                    higherIsBetter={false}
                  />
                )}
              </div>
            )}
          </div>

          {/* CAGR vs 월별수익률 설명 */}
          <CagrExplainer cagr={result.metrics.stock.cagr} monthlyData={result.monthly} />

          {/* 차트 탭 (6개) */}
          <Tabs defaultValue="normalized">
            <TabsList className="mb-3 flex-wrap h-auto gap-y-1">
              <TabsTrigger value="normalized" className="text-xs">정규화 가격</TabsTrigger>
              <TabsTrigger value="cumulative" className="text-xs">누적 수익률</TabsTrigger>
              <TabsTrigger value="combined" className="text-xs">변동성 항력</TabsTrigger>
              <TabsTrigger value="mdd" className="text-xs">MDD</TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs">월별 수익률</TabsTrigger>
              <TabsTrigger value="cumMonthly" className="text-xs">누적 월별</TabsTrigger>
            </TabsList>

            <TabsContent value="normalized" className="mt-0">
              <NormalizedPriceChart data={result.daily} labels={result.labels} hasBench2={hasBench2} />
            </TabsContent>
            <TabsContent value="cumulative" className="mt-0">
              <CumulativeReturnChart data={result.daily} labels={result.labels} hasBench2={hasBench2} />
            </TabsContent>
            {/* 누적수익률(일별) + 누적 기하수익률(월별 복리)을 동시에 표시 */}
            <TabsContent value="combined" className="mt-0">
              <CombinedReturnChart
                daily={result.daily}
                monthly={result.monthly}
                labels={result.labels}
                hasBench2={hasBench2}
              />
            </TabsContent>
            <TabsContent value="mdd" className="mt-0">
              <MddChart data={result.daily} labels={result.labels} hasBench2={hasBench2} />
            </TabsContent>
            <TabsContent value="monthly" className="mt-0">
              <MonthlyReturnChart data={result.monthly} labels={result.labels} hasBench2={hasBench2} />
            </TabsContent>
            <TabsContent value="cumMonthly" className="mt-0">
              <CumulativeMonthlyChart data={result.daily} labels={result.labels} hasBench2={hasBench2} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
