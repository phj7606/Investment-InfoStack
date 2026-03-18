"use client";

// 방문자 추이 차트 — recharts는 클래스 컴포넌트 기반이므로 'use client' 필수
// React 19 서버 컴포넌트에서 recharts 직접 사용 시 호환성 오류 발생

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

// 최근 6개월 방문자/전환 데이터
const chartData = [
  { month: "10월", visitors: 14200, conversions: 980 },
  { month: "11월", visitors: 17800, conversions: 1240 },
  { month: "12월", visitors: 16500, conversions: 1100 },
  { month: "1월", visitors: 19200, conversions: 1380 },
  { month: "2월", visitors: 21800, conversions: 1620 },
  { month: "3월", visitors: 24521, conversions: 1893 },
];

const chartConfig: ChartConfig = {
  visitors: {
    label: "방문자",
    color: "var(--chart-1)",
  },
  conversions: {
    label: "전환",
    color: "var(--chart-2)",
  },
};

export function VisitorsChart() {
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {/* 영역 그래프: 시간 흐름에 따른 누적 변화 강조 */}
        <Area
          type="monotone"
          dataKey="visitors"
          stroke="var(--chart-1)"
          fill="var(--chart-1)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="conversions"
          stroke="var(--chart-2)"
          fill="var(--chart-2)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
