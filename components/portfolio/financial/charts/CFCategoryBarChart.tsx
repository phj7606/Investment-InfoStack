"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { MonthlyCFSummary } from "@/types/financial";

interface CFCategoryBarChartProps {
  data: MonthlyCFSummary[];  // 최근 N개월 CF 요약
}

function formatKrw(value: number): string {
  if (Math.abs(value) >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(1)}억`;
  }
  if (Math.abs(value) >= 1_0000) {
    return `${(value / 1_0000).toFixed(0)}만`;
  }
  return value.toLocaleString();
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; fill: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="tabular-nums">{p.value.toLocaleString()}원</span>
        </div>
      ))}
    </div>
  );
}

export function CFCategoryBarChart({ data }: CFCategoryBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        현금흐름 항목을 추가하면 차트가 표시됩니다.
      </div>
    );
  }

  // 차트 데이터 변환 (월 라벨 축약)
  const chartData = data.map((d) => ({
    label: `${Number(d.month.slice(5))}월`,
    수입: d.totalIncome,
    지출: d.totalExpense,
    계좌이체: d.totalTransfer,
    순현금흐름: d.netCF,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis
          tickFormatter={formatKrw}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={55}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: "12px" }} />
        {/* 수입 — 초록 */}
        <Bar dataKey="수입" fill="hsl(142, 71%, 45%)" radius={[3, 3, 0, 0]} />
        {/* 지출 — 빨강 */}
        <Bar dataKey="지출" fill="hsl(0, 84%, 60%)" radius={[3, 3, 0, 0]} />
        {/* 계좌이체 — 파랑 */}
        <Bar dataKey="계좌이체" fill="hsl(217, 91%, 60%)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
