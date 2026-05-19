"use client";

/**
 * 월별 Alpha + 누적 Alpha 복합 차트
 *
 * 역할: 포트폴리오가 벤치마크를 언제 초과/하회했는지 시각화
 *
 * 구성:
 *   - Bar:  월별 Alpha = 포트폴리오 MoM% - 벤치마크 MoM%
 *           양수(초과) = 에메랄드, 음수(하회) = 레드
 *   - Line: 누적 Alpha = (1 + 포트폴리오 cumPct/100) / (1 + 벤치마크 cumPct/100) - 1
 *           기하학적 초과수익 — 복리 효과 반영
 *
 * 기준점: Dec 2025 = 0%
 *
 * recharts는 "use client" 전용 — RSC에서 직접 import 금지
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
  /** US: S&P500 + NASDAQ (S&P500 우선 사용) */
  benchmarkSP500?: BenchmarkMonthPoint[];
  benchmarkNasdaq?: BenchmarkMonthPoint[];
  market: "KR" | "US";
}

/** "YYYY-MM" → "M월" */
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

export function MonthlyAlphaChart({
  months,
  benchmarkKR,
  benchmarkSP500,
  benchmarkNasdaq: _benchmarkNasdaq,
  market,
}: Props) {
  if (months.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        데이터가 없습니다
      </div>
    );
  }

  // KR = KOSPI, US = S&P500 기준 alpha 계산 (주요 벤치마크 1개만)
  const activeBench = market === "KR" ? benchmarkKR : benchmarkSP500;
  const benchName   = market === "KR" ? "KOSPI" : "S&P500";

  if (!activeBench || activeBench.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        벤치마크 데이터가 없습니다
      </div>
    );
  }

  // period → 벤치마크 맵
  const benchMap = new Map(activeBench.map((b) => [b.period, b]));

  // 차트 데이터 구성
  const chartData = months.map((m) => {
    const bench = benchMap.get(m.period);

    // 월별 Alpha = 포트폴리오 MoM% - 벤치마크 MoM%
    const monthlyAlpha =
      bench !== undefined
        ? Math.round((m.momPct - bench.momReturnPct) * 100) / 100
        : undefined;

    // 누적 Alpha (기하학적) = (1 + portCum/100) / (1 + benchCum/100) - 1
    // 복리 효과를 반영한 진정한 초과수익률
    const cumAlpha =
      bench !== undefined
        ? Math.round(
            ((1 + m.cumPct / 100) / (1 + bench.cumReturnPct / 100) - 1) * 10000
          ) / 100
        : undefined;

    return {
      period:       m.period,
      label:        toMonthLabel(m.period),
      monthlyAlpha,
      cumAlpha,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        {/* 배경 격자 — 수평선만 */}
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />

        {/* 왼쪽 Y축: 월별 Alpha (Bar) */}
        <YAxis
          yAxisId="left"
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />

        {/* 오른쪽 Y축: 누적 Alpha (Line) */}
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />

        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
        />

        {/* y=0 기준선 */}
        <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />

        {/* 월별 Alpha Bar — 초과(에메랄드) / 하회(레드) */}
        <Bar
          yAxisId="left"
          dataKey="monthlyAlpha"
          name={`월별 Alpha (vs ${benchName})`}
          radius={[3, 3, 0, 0]}
          maxBarSize={48}
        >
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                (entry.monthlyAlpha ?? 0) >= 0
                  ? "hsl(142 71% 45%)"   // 에메랄드-500
                  : "hsl(0 84% 60%)"     // 레드-500
              }
              fillOpacity={0.8}
            />
          ))}
        </Bar>

        {/* 누적 Alpha Line — 기하학적 초과수익 누적 추이 */}
        <Line
          yAxisId="right"
          dataKey="cumAlpha"
          name={`누적 Alpha (vs ${benchName})`}
          stroke="#8b5cf6"        // 바이올렛-500
          strokeWidth={2.5}
          dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
