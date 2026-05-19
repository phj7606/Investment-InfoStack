"use client";

/**
 * 누적 수익률 비교 라인 차트
 *
 * 포트폴리오 cumPct vs 벤치마크 cumReturnPct (Dec 2025 = 0% 기준)
 * - 포트폴리오: 굵은 에메랄드 실선
 * - KOSPI: 인디고 점선
 * - S&P500: 앰버 점선
 * - NASDAQ: 사이안 점선
 *
 * recharts는 "use client" 전용 — RSC에서 직접 import 금지
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { PerformanceMonthPoint, BenchmarkMonthPoint } from "@/types/portfolio";

interface Props {
  months: PerformanceMonthPoint[];
  benchmarkKR?: BenchmarkMonthPoint[];
  benchmarkSP500?: BenchmarkMonthPoint[];
  benchmarkNasdaq?: BenchmarkMonthPoint[];
  market: "KR" | "US";
}

function toMonthLabel(period: string): string {
  return `${parseInt(period.slice(5))}월`;
}

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

export function CumulativeReturnLineChart({
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

  // period 기준으로 데이터 병합
  const benchKRMap  = new Map(benchmarkKR?.map((b) => [b.period, b]) ?? []);
  const benchSPMap  = new Map(benchmarkSP500?.map((b) => [b.period, b]) ?? []);
  const benchNQMap  = new Map(benchmarkNasdaq?.map((b) => [b.period, b]) ?? []);

  // Dec 2025 기준점(0%)을 포함하여 차트 시작
  const chartData = [
    // Dec 2025 기준점 — 포트폴리오와 벤치마크 모두 0%
    {
      period:    "2025-12",
      label:     "25년 12월",
      portfolio: 0,
      kospi:     benchKRMap.size > 0 ? 0 : undefined,
      sp500:     benchSPMap.size > 0 ? 0 : undefined,
      nasdaq:    benchNQMap.size > 0 ? 0 : undefined,
    },
    // Jan 2026~
    ...months.map((m) => ({
      period:    m.period,
      label:     toMonthLabel(m.period),
      portfolio: m.cumPct,
      kospi:     benchKRMap.get(m.period)?.cumReturnPct,
      sp500:     benchSPMap.get(m.period)?.cumReturnPct,
      nasdaq:    benchNQMap.get(m.period)?.cumReturnPct,
    })),
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
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
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />

        {/* 포트폴리오 누적 수익률 — 굵은 에메랄드 실선 */}
        <Line
          dataKey="portfolio"
          name="포트폴리오"
          stroke="#10b981"  // 에메랄드-500
          strokeWidth={3}
          dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />

        {/* KR: KOSPI 누적 수익률 */}
        {market === "KR" && (benchmarkKR?.length ?? 0) > 0 && (
          <Line
            dataKey="kospi"
            name="KOSPI"
            stroke="#6366f1"  // 인디고-500
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        )}

        {/* US: S&P500 누적 수익률 */}
        {market === "US" && (benchmarkSP500?.length ?? 0) > 0 && (
          <Line
            dataKey="sp500"
            name="S&P500"
            stroke="#f59e0b"  // 앰버-500
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        )}

        {/* US: NASDAQ 누적 수익률 */}
        {market === "US" && (benchmarkNasdaq?.length ?? 0) > 0 && (
          <Line
            dataKey="nasdaq"
            name="NASDAQ"
            stroke="#06b6d4"  // 사이안-500
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
