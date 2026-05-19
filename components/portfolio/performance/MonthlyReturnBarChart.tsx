"use client";

/**
 * 월별 MoM% 수익률 복합 차트
 *
 * recharts ComposedChart: 포트폴리오 Bar + 벤치마크 Line 오버레이
 * - 포트폴리오 MoM%: 양수 = 에메랄드 Bar, 음수 = 레드 Bar
 * - 벤치마크: 점선 Line (KR=인디고, SP500=앰버, NASDAQ=사이안)
 * - Y축: % 단위, X축: "MM월" 형식
 * - ReferenceLine y={0}: 기준선
 *
 * recharts는 "use client" 컴포넌트에서만 사용 가능 (RSC 호환 불가)
 */

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { PerformanceMonthPoint, BenchmarkMonthPoint } from "@/types/portfolio";

interface Props {
  months: PerformanceMonthPoint[];
  /** KR: KOSPI 단일 벤치마크 */
  benchmarkKR?: BenchmarkMonthPoint[];
  /** US: S&P500 + NASDAQ */
  benchmarkSP500?: BenchmarkMonthPoint[];
  benchmarkNasdaq?: BenchmarkMonthPoint[];
  /** 표시 모드 */
  market: "KR" | "US";
}

/** "YYYY-MM" → "M월" 형식 */
function toMonthLabel(period: string): string {
  return `${parseInt(period.slice(5))}월`;
}

/** 툴팁 커스텀 컴포넌트 */
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background/95 p-3 shadow-xl text-xs">
      <p className="font-semibold mb-2 text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: p.color }}
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span
            className={`font-bold ml-auto ${
              p.value >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400"
            }`}
          >
            {p.value >= 0 ? "+" : ""}
            {p.value.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function MonthlyReturnBarChart({
  months,
  benchmarkKR,
  benchmarkSP500,
  benchmarkNasdaq,
  market,
}: Props) {
  if (months.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        데이터가 없습니다
      </div>
    );
  }

  // period 기준으로 포트폴리오 + 벤치마크 데이터 병합
  const periodSet = new Set(months.map((m) => m.period));

  // 각 벤치마크를 period 맵으로 변환
  const benchKRMap = new Map(benchmarkKR?.map((b) => [b.period, b]) ?? []);
  const benchSPMap = new Map(benchmarkSP500?.map((b) => [b.period, b]) ?? []);
  const benchNQMap = new Map(benchmarkNasdaq?.map((b) => [b.period, b]) ?? []);

  const chartData = months.map((m) => ({
    period: m.period,
    label: toMonthLabel(m.period),
    portfolio: m.momPct,
    kospi: benchKRMap.get(m.period)?.momReturnPct,
    sp500: benchSPMap.get(m.period)?.momReturnPct,
    nasdaq: benchNQMap.get(m.period)?.momReturnPct,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        {/* 배경 격자 — 수평선만 */}
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />

        {/* X축: 월 레이블 */}
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />

        {/* Y축: % 단위 */}
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />

        {/* 툴팁 */}
        <Tooltip content={<CustomTooltip />} />

        {/* 범례 */}
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
        />

        {/* y=0 기준선 */}
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />

        {/* 포트폴리오 MoM% Bar — 양수/음수 색상 분기 */}
        <Bar dataKey="portfolio" name="포트폴리오" radius={[3, 3, 0, 0]} maxBarSize={48}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                (entry.portfolio ?? 0) >= 0
                  ? "hsl(142 71% 45%)"   // 에메랄드-500
                  : "hsl(0 84% 60%)"     // 레드-500
              }
              fillOpacity={0.85}
            />
          ))}
        </Bar>

        {/* KR: KOSPI 벤치마크 Line */}
        {market === "KR" && (benchmarkKR?.length ?? 0) > 0 && (
          <Line
            dataKey="kospi"
            name="KOSPI"
            stroke="#6366f1"  // 인디고-500
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        )}

        {/* US: S&P500 Line */}
        {market === "US" && (benchmarkSP500?.length ?? 0) > 0 && (
          <Line
            dataKey="sp500"
            name="S&P500"
            stroke="#f59e0b"  // 앰버-500
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        )}

        {/* US: NASDAQ Line */}
        {market === "US" && (benchmarkNasdaq?.length ?? 0) > 0 && (
          <Line
            dataKey="nasdaq"
            name="NASDAQ"
            stroke="#06b6d4"  // 사이안-500
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
