"use client";
// recharts는 반드시 "use client" 컴포넌트에서만 사용 (React 19 RSC 호환성)

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface NetWorthDataPoint {
  month: string;       // "2026-05"
  netWorth: number;    // KRW 기준 순자산
  totalAssets: number;
  totalDebt: number;
  status: "DRAFT" | "CONFIRMED";
}

interface NetWorthTrendChartProps {
  data: NetWorthDataPoint[];
}

/** KRW 금액을 억/만 단위로 축약 표시 */
function formatKrw(value: number): string {
  if (Math.abs(value) >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(1)}억`;
  }
  if (Math.abs(value) >= 1_0000) {
    return `${(value / 1_0000).toFixed(0)}만`;
  }
  return value.toLocaleString();
}

/** 툴팁 커스텀 — 월별 상세 수치 표시 */
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-sm">
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="tabular-nums">{p.value.toLocaleString()}원</span>
        </div>
      ))}
    </div>
  );
}

export function NetWorthTrendChart({ data }: NetWorthTrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        확정된 월이 없습니다. 월말 마감 후 추세선이 표시됩니다.
      </div>
    );
  }

  // 월 라벨 축약 (2026-05 → 5월)
  const formatted = data.map((d) => ({
    ...d,
    label: `${Number(d.month.slice(5))}월`,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={formatKrw}
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={55}
        />
        {/* 순자산 0선 강조 */}
        <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 4" />
        <Tooltip content={<CustomTooltip />} />
        {/* 순자산 라인 — 메인 */}
        <Line
          type="monotone"
          dataKey="netWorth"
          name="순자산"
          stroke="hsl(var(--primary))"
          strokeWidth={2.5}
          dot={(props) => {
            // DRAFT 월은 빈 원으로 표시 (미확정)
            const isDraft = formatted[props.index]?.status === "DRAFT";
            return (
              <circle
                key={props.index}
                cx={props.cx}
                cy={props.cy}
                r={4}
                fill={isDraft ? "hsl(var(--background))" : "hsl(var(--primary))"}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
              />
            );
          }}
          activeDot={{ r: 6 }}
        />
        {/* 총자산 라인 — 보조 */}
        <Line
          type="monotone"
          dataKey="totalAssets"
          name="총자산"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          strokeDasharray="5 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
