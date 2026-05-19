"use client";

// Equity Curve 차트 (recharts LineChart)
// - 매도 거래 날짜 기준 누적 손익을 시계열로 표시
// - 0 기준선을 점선으로 표시 (수익/손실 구간 구분)
// - 반드시 "use client"로 분리 — RSC에서 recharts 직접 사용 불가 (React 19 RSC 호환성)

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { EquityCurvePoint } from "@/types/portfolio";

interface EquityCurveChartProps {
  data: EquityCurvePoint[];
  isLoading: boolean;
}

// 금액을 축약 표현으로 포맷 (Y축용)
function formatYAxis(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
  return `${value}`;
}

// 툴팁 커스텀 컨텐츠
function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value as number;

  return (
    <div className="rounded-lg border bg-background/95 px-3 py-2 shadow-md text-xs">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-semibold ${value >= 0 ? "text-emerald-600" : "text-red-500"}`}>
        {value >= 0 ? "+" : ""}
        {value.toLocaleString()}원
      </p>
    </div>
  );
}

export function EquityCurveChart({ data, isLoading }: EquityCurveChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Equity Curve</CardTitle>
          <CardDescription className="text-xs">누적 손익 시계열</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
            거래 이력이 없어 차트를 표시할 수 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  // 최종 누적 손익
  const finalValue = data[data.length - 1]?.value ?? 0;
  const lineColor = finalValue >= 0 ? "#10b981" : "#ef4444"; // 에메랄드/레드

  // 데이터 기간 범위 (YYYY-MM 형식으로 표시 — "어느 기간의 누적인지" 명시)
  const startPeriod = data[0]?.date?.slice(0, 7) ?? "";
  const endPeriod = data[data.length - 1]?.date?.slice(0, 7) ?? "";
  const periodLabel = startPeriod && endPeriod
    ? startPeriod === endPeriod ? startPeriod : `${startPeriod} ~ ${endPeriod}`
    : "";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Equity Curve</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              누적 손익 (원화)
              {periodLabel && (
                <span className="ml-1.5 font-medium text-foreground/60">{periodLabel}</span>
              )}
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">누적 손익 {periodLabel && <span className="text-[9px]">({periodLabel})</span>}</p>
            <p className={`text-sm font-bold ${finalValue >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {finalValue >= 0 ? "+" : ""}
              {finalValue.toLocaleString()}원
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              // 날짜가 많으면 일부만 표시
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatYAxis}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            {/* 0 기준선 — 수익/손실 구분 점선 (기존 Checkpoint 차트 패턴: strokeDasharray="2 2") */}
            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 2"
              strokeOpacity={0.6}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={data.length <= 30 ? { r: 3, fill: lineColor } : false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
