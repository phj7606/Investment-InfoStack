"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { FinancialStatementData } from "@/types/financial";

interface AssetAllocationDonutProps {
  data: FinancialStatementData;
}

/** 자산 배분 색상 팔레트 */
const COLORS = [
  "hsl(217, 91%, 60%)",  // Longterm KRW — 파랑
  "hsl(199, 89%, 48%)",  // Longterm USD — 하늘
  "hsl(142, 71%, 45%)",  // 연금 국내 — 초록
  "hsl(160, 60%, 40%)",  // 연금 캐나다 — 다크초록
  "hsl(45, 93%, 58%)",   // Education — 노랑
  "hsl(265, 70%, 60%)",  // Shortterm — 보라
  "hsl(20, 90%, 60%)",   // 가상자산 — 주황
  "hsl(0, 0%, 70%)",     // 현금 — 회색
];

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; percent: number }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-background border border-border rounded-lg p-2 shadow-lg text-sm">
      <p className="font-semibold">{p.name}</p>
      <p className="tabular-nums">{p.value.toLocaleString()}원</p>
      <p className="text-muted-foreground">{(p.percent * 100).toFixed(1)}%</p>
    </div>
  );
}

export function AssetAllocationDonut({ data }: AssetAllocationDonutProps) {
  const { assets } = data;

  // 도넛 데이터 구성 (0원 항목 제외)
  const slices = [
    { name: "Longterm KRW", value: assets.investmentPortfolio[0]?.amountKrw ?? 0 },
    { name: "Longterm USD", value: assets.investmentPortfolio[1]?.amountKrw ?? 0 },
    { name: "연금 (국내)", value: assets.pension[0]?.amountKrw ?? 0 },
    { name: "연금 (캐나다)", value: assets.pension[1]?.amountKrw ?? 0 },
    { name: "Education", value: assets.education.amountKrw },
    { name: "Shortterm", value: assets.shortterm.amountKrw },
    { name: "가상자산", value: assets.digitalAssets.amountKrw },
    { name: "현금·CMA", value: assets.cash.amountKrw },
    ...assets.otherAssets.map((a) => ({ name: a.label, value: a.amountKrw })),
  ].filter((s) => s.value > 0);

  if (slices.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        자산 데이터가 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={slices}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "11px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
