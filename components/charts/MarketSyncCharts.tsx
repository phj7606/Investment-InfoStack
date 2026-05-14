"use client";

// 시장 분석 — 동기화 차트 라이브러리
// recharts 클라이언트 격리 필수 ("use client")
// syncId="market-analysis" 로 모든 차트의 crosshair/툴팁이 자동 동기화된다
//
// 차트 구성 (Stock Market):
//   1. S&P 500 & NASDAQ (이중 Y축, 350px)
//   2. VIX & SDEX (이중 Y축, 200px)
//   3. VIX & VVIX (이중 Y축, 200px)
//   4. VVIX/VIX Ratio (단일 Y축, 200px)
//
// 차트 구성 (Bonds):
//   5. ICE BofA HY Spread (단일 Y축, 200px)
//   6. FED Funds Rate (단일 Y축, 계단형, 200px)
//   7. US 2Y & 10Y Bond Yield (이중 Y축, 200px)
//   8. US 10Y Yield & MOVE Index (이중 Y축, 200px)

import { useState } from "react";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { UsAnalysisBar } from "@/types/market-analysis";

// ─── 색상 상수 ──────────────────────────────────────────────────────────────
const COLORS = {
  spx: "#22c55e",         // green-500
  nasdaq: "#3b82f6",      // blue-500
  vix: "#1e1b4b",         // indigo-950 (dark navy)
  sdex: "#93c5fd",        // blue-300 (light blue)
  vvix: "#f97316",        // orange-500
  vvixVix: "#ef4444",     // red-500
  hySpread: "#a855f7",    // purple-500
  sofr: "#1e3a5f",        // dark navy (이미지 참조)
  ust10y: "#ef4444",      // red-500 (이미지 참조)
  fedFundsRate: "#16a34a",// green-700 dashed (이미지 참조)
  moveIndex: "#a21caf",   // fuchsia-700 (이미지 참조)
} as const;

// ─── 공통 차트 설정 ─────────────────────────────────────────────────────────
const SYNC_ID = "market-analysis";

/** X축 날짜 포맷: "YYYY-MM-DD" → "MMM YY" (예: "Apr 25") */
function formatXTick(value: string): string {
  if (!value) return "";
  const date = new Date(value + "T00:00:00Z");
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Y축 숫자 포맷: 큰 숫자는 "k" 단위 */
function formatYAxis(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value.toFixed(0);
}

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────
interface ChartTooltipProps extends TooltipProps<number, string> {
  labelMap: Record<string, string>;
  formatters?: Record<string, (v: number) => string>;
}

function ChartTooltip({ active, payload, label, labelMap, formatters }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md">
      {/* 날짜 표시 */}
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry) => {
        const key = entry.dataKey as string;
        const displayLabel = labelMap[key] ?? key;
        const fmt = formatters?.[key];
        const val = entry.value;
        const formatted = val == null ? "—" : fmt ? fmt(val) : val.toLocaleString("en-US", { maximumFractionDigits: 2 });
        return (
          <p key={key} style={{ color: entry.color }} className="flex justify-between gap-4">
            <span>{displayLabel}</span>
            <span className="font-mono">{formatted}</span>
          </p>
        );
      })}
    </div>
  );
}

// ─── 클릭 가능한 레전드 ──────────────────────────────────────────────────────
// 각 항목 클릭 시 해당 라인을 on/off — 비활성 시 취소선 + 회색 처리
interface LegendItem {
  key: string;
  label: string;
  color: string;
}

interface ToggleLegendProps {
  items: LegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}

function ToggleLegend({ items, hidden, onToggle }: ToggleLegendProps) {
  return (
    <div className="flex flex-wrap gap-3 mt-1">
      {items.map(({ key, label, color }) => {
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ opacity: isHidden ? 0.35 : 1 }}
          >
            {/* 색상 원 — 비활성 시 테두리만 표시 */}
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
              style={{
                backgroundColor: isHidden ? "transparent" : color,
                border: `2px solid ${color}`,
              }}
            />
            {/* 레이블 — 비활성 시 취소선 */}
            <span
              className="text-muted-foreground transition-all"
              style={{ textDecoration: isHidden ? "line-through" : "none" }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── 공통 XAxis props ────────────────────────────────────────────────────────
const commonXAxisProps = {
  dataKey: "date" as const,
  tickFormatter: formatXTick,
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  axisLine: { stroke: "hsl(var(--border))" },
  tickLine: false,
  // X축 틱 수 조정 — 너무 많으면 겹침
  interval: "preserveStartEnd" as const,
  minTickGap: 60,
};

// ─── 공통 그리드 props ──────────────────────────────────────────────────────
const cartesianGridProps = {
  strokeDasharray: "3 3",
  stroke: "hsl(var(--border))",
  vertical: false,
};

// ─── 공통 YAxis props ────────────────────────────────────────────────────────
// domain: ['auto', 'auto'] — 데이터 범위에 맞게 Y축 자동 스케일
// padding으로 최고/최저값이 차트 경계에 딱 붙지 않도록 여백 추가
function leftYAxisProps(color: string) {
  return {
    yAxisId: "left" as const,
    orientation: "left" as const,
    tickFormatter: formatYAxis,
    tick: { fontSize: 11, fill: color },
    axisLine: false,
    tickLine: false,
    width: 55,
    domain: ["auto", "auto"] as ["auto", "auto"],
  };
}

function rightYAxisProps(color: string) {
  return {
    yAxisId: "right" as const,
    orientation: "right" as const,
    tickFormatter: formatYAxis,
    tick: { fontSize: 11, fill: color },
    axisLine: false,
    tickLine: false,
    width: 55,
    domain: ["auto", "auto"] as ["auto", "auto"],
  };
}

// ─── 공통 Line props ─────────────────────────────────────────────────────────
function lineProps(dataKey: string, color: string, yAxisId: "left" | "right" = "left") {
  return {
    type: "monotone" as const,
    dataKey,
    stroke: color,
    dot: false,
    strokeWidth: 1.5,
    connectNulls: false,  // 결측 구간 선 끊김 처리
    yAxisId,
    isAnimationActive: false,  // 성능 최적화 (데이터 많을 때 애니메이션 비용)
  };
}

// ─── Chart 1: S&P 500 & NASDAQ ───────────────────────────────────────────────
export function SpxNasdaqChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">S&amp;P 500 &amp; NASDAQ</CardTitle>
        <ToggleLegend
          items={[
            { key: "spx", label: "S&P 500", color: COLORS.spx },
            { key: "nasdaq", label: "NASDAQ", color: COLORS.nasdaq },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            <YAxis {...leftYAxisProps(COLORS.spx)} />
            <YAxis {...rightYAxisProps(COLORS.nasdaq)} />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ spx: "S&P 500", nasdaq: "NASDAQ" }}
                />
              }
            />
            <Line {...lineProps("spx", COLORS.spx, "left")} name="S&P 500" hide={hidden.has("spx")} />
            <Line {...lineProps("nasdaq", COLORS.nasdaq, "right")} name="NASDAQ" hide={hidden.has("nasdaq")} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 2: VIX & SDEX ─────────────────────────────────────────────────────
export function VixSdexChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">VIX &amp; SDEX</CardTitle>
        <ToggleLegend
          items={[
            { key: "vix", label: "VIX", color: COLORS.vix },
            { key: "sdex", label: "SDEX (S&P 500 Downside Risk)", color: COLORS.sdex },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            <YAxis {...leftYAxisProps(COLORS.vix)} />
            <YAxis {...rightYAxisProps(COLORS.sdex)} />
            <Tooltip
              content={<ChartTooltip labelMap={{ vix: "VIX", sdex: "SDEX" }} />}
            />
            {/* VIX 20 기준선 — 일반적 공포/안도 임계값 */}
            <ReferenceLine yAxisId="left" y={20} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: "20", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }} />
            <Line {...lineProps("vix", COLORS.vix, "left")} name="VIX" hide={hidden.has("vix")} />
            <Line {...lineProps("sdex", COLORS.sdex, "right")} name="SDEX" hide={hidden.has("sdex")} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 3: VIX & VVIX ────────────────────────────────────────────────────
export function VixVvixChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">VIX &amp; VVIX</CardTitle>
        <ToggleLegend
          items={[
            { key: "vix", label: "VIX", color: COLORS.vix },
            { key: "vvix", label: "VVIX (Volatility of VIX)", color: COLORS.vvix },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            <YAxis {...leftYAxisProps(COLORS.vix)} />
            <YAxis {...rightYAxisProps(COLORS.vvix)} />
            <Tooltip
              content={<ChartTooltip labelMap={{ vix: "VIX", vvix: "VVIX" }} />}
            />
            {/* VIX 20 기준선 — 일반적 공포/안도 임계값 */}
            <ReferenceLine yAxisId="left" y={20} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: "20", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }} />
            <Line {...lineProps("vix", COLORS.vix, "left")} name="VIX" hide={hidden.has("vix")} />
            <Line {...lineProps("vvix", COLORS.vvix, "right")} name="VVIX" hide={hidden.has("vvix")} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 4: VVIX/VIX Ratio ────────────────────────────────────────────────
export function VvixVixRatioChart({ data }: { data: UsAnalysisBar[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">VVIX / VIX</CardTitle>
        <CardDescription className="text-xs">
          <span style={{ color: COLORS.vvixVix }}>● VVIX/VIX Ratio</span>
          &nbsp;— 공포의 공포 지수. 값이 높을수록 변동성 불확실성 증가
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          {/* right: 63 = 이중 Y축 차트의 right(8) + rightYAxis.width(55)와 동일한 우측 공간 확보 */}
        <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 63, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 11, fill: COLORS.vvixVix }}
              axisLine={false}
              tickLine={false}
              width={55}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            {/* 3, 6 기준선 — 변동성 구조 임계 레벨 표시 */}
            <ReferenceLine yAxisId="left" y={3} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: "3", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }} />
            <ReferenceLine yAxisId="left" y={6} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1}
              label={{ value: "6", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ vvixVixRatio: "VVIX/VIX" }}
                  formatters={{ vvixVixRatio: (v) => v.toFixed(4) }}
                />
              }
            />
            <Line {...lineProps("vvixVixRatio", COLORS.vvixVix, "left")} name="VVIX/VIX" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 5: ICE BofA HY Spread ─────────────────────────────────────────────
export function HySpreadChart({ data }: { data: UsAnalysisBar[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">ICE BofA US High Yield Spread</CardTitle>
        <CardDescription className="text-xs">
          <span style={{ color: COLORS.hySpread }}>● Option-Adjusted Spread (%)</span>
          &nbsp;— 신용위험 프리미엄. 상승 시 시장 신용 스트레스 증가
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          {/* right: 63 = 이중 Y축 차트의 right(8) + rightYAxis.width(55)와 동일한 우측 공간 확보 */}
        <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 63, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 11, fill: COLORS.hySpread }}
              axisLine={false}
              tickLine={false}
              width={55}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(1)}`}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ hySpread: "HY Spread" }}
                  formatters={{ hySpread: (v) => `${v.toFixed(2)}%` }}
                />
              }
            />
            <Line {...lineProps("hySpread", COLORS.hySpread, "left")} name="HY Spread" />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 6: SOFR + 10Y Yield + FED Funds Rate ──────────────────────────────
export function SofrYieldChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">SOFR &amp; US 10-Year Bond Yield</CardTitle>
        <ToggleLegend
          items={[
            { key: "sofr", label: "SOFR", color: COLORS.sofr },
            { key: "ust10y", label: "US 10-Year Yield", color: COLORS.ust10y },
            { key: "fedFundsRate", label: "FED Funds Rate", color: COLORS.fedFundsRate },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            {/* 좌측: SOFR + FED Funds Rate (동일 % 스케일) */}
            <YAxis {...leftYAxisProps(COLORS.sofr)} tickFormatter={(v: number) => `${v.toFixed(2)}`} />
            {/* 우측: 10Y Yield */}
            <YAxis {...rightYAxisProps(COLORS.ust10y)} tickFormatter={(v: number) => `${v.toFixed(2)}`} />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ sofr: "SOFR", ust10y: "10Y Yield", fedFundsRate: "FED Funds Rate" }}
                  formatters={{
                    sofr: (v) => `${v.toFixed(2)}%`,
                    ust10y: (v) => `${v.toFixed(2)}%`,
                    fedFundsRate: (v) => `${v.toFixed(2)}%`,
                  }}
                />
              }
            />
            <Line {...lineProps("sofr", COLORS.sofr, "left")} name="SOFR" hide={hidden.has("sofr")} />
            <Line {...lineProps("ust10y", COLORS.ust10y, "right")} name="10Y Yield" hide={hidden.has("ust10y")} />
            {/* FED Funds Rate: 계단형(stepAfter) 실선 */}
            <Line
              {...lineProps("fedFundsRate", COLORS.fedFundsRate, "left")}
              type="stepAfter"
              strokeWidth={1.5}
              name="FED Funds Rate"
              hide={hidden.has("fedFundsRate")}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 7: 10Y Yield + MOVE Index ────────────────────────────────────────
export function YieldMoveChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">US 10-Year Yield &amp; MOVE Index</CardTitle>
        <ToggleLegend
          items={[
            { key: "ust10y", label: "US 10-Year Yield", color: COLORS.ust10y },
            { key: "moveIndex", label: "MOVE Index", color: COLORS.moveIndex },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            {/* 좌측: 10Y Yield + FED Funds Rate (% 스케일) */}
            <YAxis {...leftYAxisProps(COLORS.ust10y)} tickFormatter={(v: number) => `${v.toFixed(2)}`} />
            {/* 우측: MOVE Index (포인트 단위) */}
            <YAxis {...rightYAxisProps(COLORS.moveIndex)} tickFormatter={(v: number) => v.toFixed(0)} />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ ust10y: "10Y Yield", moveIndex: "MOVE Index" }}
                  formatters={{
                    ust10y: (v) => `${v.toFixed(2)}%`,
                    moveIndex: (v) => v.toFixed(1),
                  }}
                />
              }
            />
            {/* 4.3 Key line / 4.5 Kill line — 주식 시장에 영향을 주는 10Y 금리 임계값 */}
            <ReferenceLine yAxisId="left" y={4.3} stroke="#6b7280" strokeWidth={1}
              label={{ value: "Key line", position: "insideTopRight", fontSize: 10, fill: "#6b7280" }} />
            <ReferenceLine yAxisId="left" y={4.5} stroke="#6b7280" strokeWidth={1}
              label={{ value: "Kill line", position: "insideTopRight", fontSize: 10, fill: "#6b7280" }} />
            <Line {...lineProps("ust10y", COLORS.ust10y, "left")} name="10Y Yield" hide={hidden.has("ust10y")} />
            <Line {...lineProps("moveIndex", COLORS.moveIndex, "right")} name="MOVE Index" hide={hidden.has("moveIndex")} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 8: FED Funds Rate (단독) ──────────────────────────────────────────
// SOFR 차트에서 FED Funds Rate만 추출 — Bonds 탭용 간결 버전
export function FedFundsOnlyChart({ data }: { data: UsAnalysisBar[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">FED Funds Rate</CardTitle>
        <CardDescription className="text-xs">
          <span style={{ color: COLORS.fedFundsRate }}>● FED Funds Target Rate</span>
          &nbsp;— FOMC 결정 시마다 변경되는 계단형 금리 (연율 %)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          {/* right: 63 = 단일 Y축 차트의 우측 공간 균형 유지 */}
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 63, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 11, fill: COLORS.fedFundsRate }}
              axisLine={false}
              tickLine={false}
              width={55}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(2)}`}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ fedFundsRate: "FED Funds Rate" }}
                  formatters={{ fedFundsRate: (v) => `${v.toFixed(2)}%` }}
                />
              }
            />
            {/* 계단형(stepAfter) + 점선 — FOMC 결정일 사이에는 고정 유지 */}
            <Line
              {...lineProps("fedFundsRate", COLORS.fedFundsRate, "left")}
              type="stepAfter"
              strokeDasharray="5 4"
              strokeWidth={2}
              name="FED Funds Rate"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 9: US 2Y & 10Y Bond Yield ────────────────────────────────────────
// 단기(2년)와 장기(10년) 국채 수익률 비교 — 역전 여부로 침체 신호 판단
export function Ust2y10yChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">US 2-Year &amp; 10-Year Bond Yield</CardTitle>
        <ToggleLegend
          items={[
            { key: "ust2y", label: "US 2-Year Yield", color: "#f59e0b" },   // amber-500
            { key: "ust10y", label: "US 10-Year Yield", color: COLORS.ust10y },
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid {...cartesianGridProps} />
            <XAxis {...commonXAxisProps} />
            {/* 두 수익률 모두 % 단위이므로 동일 스케일(좌측 Y축)로 표시 */}
            <YAxis
              yAxisId="left"
              orientation="left"
              tick={{ fontSize: 11, fill: "#f59e0b" }}
              axisLine={false}
              tickLine={false}
              width={55}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(2)}`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: COLORS.ust10y }}
              axisLine={false}
              tickLine={false}
              width={55}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => `${v.toFixed(2)}`}
            />
            <Tooltip
              content={
                <ChartTooltip
                  labelMap={{ ust2y: "2Y Yield", ust10y: "10Y Yield" }}
                  formatters={{
                    ust2y: (v) => `${v.toFixed(2)}%`,
                    ust10y: (v) => `${v.toFixed(2)}%`,
                  }}
                />
              }
            />
            {/* 4.3 Key line / 4.5 Kill line — 10Y 수익률 기준 임계값 (right Y축) */}
            <ReferenceLine yAxisId="right" y={4.3} stroke="#6b7280" strokeWidth={1}
              label={{ value: "Key line", position: "insideTopRight", fontSize: 10, fill: "#6b7280" }} />
            <ReferenceLine yAxisId="right" y={4.5} stroke="#6b7280" strokeWidth={1}
              label={{ value: "Kill line", position: "insideTopRight", fontSize: 10, fill: "#6b7280" }} />
            <Line {...lineProps("ust2y", "#f59e0b", "left")} name="2Y Yield" hide={hidden.has("ust2y")} />
            <Line {...lineProps("ust10y", COLORS.ust10y, "right")} name="10Y Yield" hide={hidden.has("ust10y")} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Chart 10: 10Y 명목/실질 수익률 & 손익분기 인플레이션 ───────────────────
// Fisher 방정식: 명목 수익률 = 실질 수익률 + 기대 인플레이션
//   - 파란선: DGS10 — 10Y 명목 국채 수익률
//   - 빨간선: T10YIE — 10Y 손익분기 인플레이션율 (시장 내재 인플레이션 기대치)
//   - 초록선: realYield10y = DGS10 - T10YIE — 실질 수익률
// 실질 수익률 < 0 → 채권 투자자가 실질 손실 수용 (극도의 위험 회피)
// 실질 수익률 상승 → 금융 환경 긴축, 성장주·금·신흥국에 부담
export function RealYieldChart({ data }: { data: UsAnalysisBar[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // 실질 수익률 데이터 존재 여부 확인
  const hasData = data.some(
    (d) => d.ust10y !== undefined || d.breakeven10y !== undefined
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          10Y 실질 수익률 분해 (명목 = 실질 + 기대 인플레이션)
        </CardTitle>
        <ToggleLegend
          items={[
            { key: "ust10y",      label: "10Y 명목 수익률 (DGS10)",           color: "#3b82f6" },  // blue-500
            { key: "breakeven10y", label: "10Y 손익분기 인플레이션 (T10YIE)", color: "#ef4444" },  // red-500
            { key: "realYield10y", label: "10Y 실질 수익률 (=명목−BEI)",       color: "#22c55e" },  // green-500
          ]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {!hasData ? (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            FRED DGS10 / T10YIE 데이터 없음 — FRED API 키를 확인해 주세요.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            {/* right: 63 = 단일 Y축 차트 우측 여백 (이중 Y축과 정렬 일치) */}
            <ComposedChart data={data} syncId={SYNC_ID} margin={{ top: 4, right: 63, left: 8, bottom: 4 }}>
              <CartesianGrid {...cartesianGridProps} />
              <XAxis {...commonXAxisProps} />
              {/* 단일 Y축 — 세 시리즈 모두 % 단위로 동일 스케일 사용 */}
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={55}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${v.toFixed(1)}`}
              />
              {/* 0% 기준선 — 실질 수익률 플러스/마이너스 구분 (FRED 차트 검은 선 재현)
                  CSS 변수 대신 고정 색상 사용 — SVG 내 CSS 변수 해석 불안정 방지 */}
              <ReferenceLine
                yAxisId="left"
                y={0}
                stroke="#1e293b"
                strokeWidth={1}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelMap={{
                      ust10y:       "명목 10Y",
                      breakeven10y: "손익분기 인플레이션",
                      realYield10y: "실질 10Y",
                    }}
                    formatters={{
                      ust10y:       (v) => `${v.toFixed(2)}%`,
                      breakeven10y: (v) => `${v.toFixed(2)}%`,
                      realYield10y: (v) => `${v.toFixed(2)}%`,
                    }}
                  />
                }
              />
              {/* 파란선: 명목 10Y 수익률 */}
              <Line
                {...lineProps("ust10y", "#3b82f6", "left")}
                name="명목 10Y"
                hide={hidden.has("ust10y")}
              />
              {/* 빨간선: 손익분기 인플레이션율 */}
              <Line
                {...lineProps("breakeven10y", "#ef4444", "left")}
                name="손익분기 인플레이션"
                hide={hidden.has("breakeven10y")}
              />
              {/* 초록선: 실질 수익률 (명목 - BEI, 클라이언트에서 계산 주입) */}
              <Line
                {...lineProps("realYield10y", "#22c55e", "left")}
                name="실질 10Y"
                hide={hidden.has("realYield10y")}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────────────────
interface MarketSyncChartsProps {
  data: UsAnalysisBar[];
}

export function MarketSyncCharts({ data }: MarketSyncChartsProps) {
  // VVIX/VIX 비율 클라이언트 계산 — API에서 받은 데이터에 주입
  const enrichedData: UsAnalysisBar[] = data.map((d) => ({
    ...d,
    vvixVixRatio:
      d.vvix != null && d.vix != null && d.vix > 0
        ? d.vvix / d.vix
        : undefined,
  }));

  return (
    <div className="space-y-4">
      {/* 차트 1: 메인 인덱스 (높이 350px) */}
      <SpxNasdaqChart data={enrichedData} />

      {/* 차트 2~5: 변동성·리스크 지표 (높이 200px) */}
      <VixSdexChart data={enrichedData} />
      <VixVvixChart data={enrichedData} />
      <VvixVixRatioChart data={enrichedData} />
      <HySpreadChart data={enrichedData} />

      {/* 차트 6~7: 채권·금리 지표 (높이 200px) */}
      <SofrYieldChart data={enrichedData} />
      <YieldMoveChart data={enrichedData} />
    </div>
  );
}
