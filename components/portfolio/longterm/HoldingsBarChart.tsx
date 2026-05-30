"use client";

// 보유 종목별 평가금액 수평 바 차트 (TOP 10)
// - 현재가 있으면 evalAmount, 없으면 avgCost × quantity fallback
// - KR/US 탭 버튼으로 시장 전환
// - recharts BarChart (layout="vertical") 사용 → "use client" 격리 필수

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LongtermPosition } from "@/types/portfolio";

interface HoldingsBarChartProps {
  positions: LongtermPosition[];
  isLoading: boolean;
  // 부모(LongtermDashboardClient)에서 URL 동기화를 위해 제어 (controlled)
  marketTab: MarketTab;
  onMarketTabChange: (tab: MarketTab) => void;
}

type MarketTab = "KR" | "US";

// 종목명 축약 (Y축 공간 절약)
function truncateName(name: string, max = 8): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// X축 금액 포맷
function formatAmount(v: number, market: MarketTab): string {
  if (market === "KR") {
    // 1억 이상: 소수점 2자리까지 표시 (예: 1.23억)
    if (v >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(2)}억`;
    if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
    return v.toLocaleString();
  }
  // USD — 소수점 2자리까지 표시
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}k`;
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 커스텀 툴팁
function CustomTooltip({ active, payload, market }: {
  active?: boolean;
  payload?: { payload: { fullName: string; amount: number; evalPLPct?: number; hasCurrent: boolean } }[];
  market: MarketTab;
}) {
  if (!active || !payload?.length) return null;
  const { fullName, amount, evalPLPct, hasCurrent } = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background/95 p-3 shadow-xl text-xs min-w-[140px]">
      <p className="font-semibold mb-1.5 truncate max-w-[180px]">{fullName}</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">평가금액</span>
          <span className="font-medium tabular-nums">{formatAmount(amount, market)}</span>
        </div>
        {hasCurrent && evalPLPct !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">수익률</span>
            <span className={`font-semibold tabular-nums ${evalPLPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
              {evalPLPct >= 0 ? "+" : ""}{evalPLPct.toFixed(2)}%
            </span>
          </div>
        )}
        {!hasCurrent && (
          <p className="text-muted-foreground/70 text-[10px]">현재가 미입력 (취득가 기준)</p>
        )}
      </div>
    </div>
  );
}

export function HoldingsBarChart({ positions, isLoading, marketTab, onMarketTabChange }: HoldingsBarChartProps) {

  // 탭 기준 필터 + TOP 10 정렬
  const chartData = useMemo(() => {
    const filtered = positions.filter((p) => p.market === marketTab);
    return filtered
      .map((p) => ({
        name: truncateName(p.stockName),
        fullName: p.stockName,
        stockCode: p.stockCode,
        // 현재가 있으면 평가금액, 없으면 취득원가
        amount: p.currentPrice !== undefined ? p.evalAmount : p.avgCost * p.quantity,
        evalPLPct: p.evalPLPct,
        hasCurrent: p.currentPrice !== undefined,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  }, [positions, marketTab]);

  // 바 색상 (수익률 기준: 양수=green, 음수=red, 미입력=회색)
  function barColor(entry: typeof chartData[0]): string {
    if (!entry.hasCurrent) return "#94a3b8"; // 슬레이트-400
    if (entry.evalPLPct > 0) return "#10b981";  // emerald-500
    if (entry.evalPLPct < 0) return "#ef4444";  // red-500
    return "#94a3b8";
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="w-full h-40 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = chartData.length === 0;
  // Y축 너비: 이름 최대 길이에 맞게 동적 계산
  const yAxisWidth = Math.min(80, Math.max(50, chartData.reduce((m, d) => Math.max(m, d.name.length * 7), 40)));

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">
          종목별 평가금액
          <span className="text-[10px] text-muted-foreground font-normal ml-1">TOP 10</span>
        </CardTitle>
        {/* KR/US 탭 버튼 */}
        <div className="flex gap-1">
          {(["KR", "US"] as MarketTab[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={marketTab === m ? "default" : "outline"}
              className="h-6 px-2 text-[10px]"
              onClick={() => onMarketTabChange(m)}
            >
              {m}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {isEmpty ? (
          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
            {marketTab === "KR" ? "국내" : "해외"} 보유 종목이 없습니다.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 34)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="hsl(var(--border))"
                strokeOpacity={0.5}
              />
              <XAxis
                type="number"
                tickFormatter={(v: number) => formatAmount(v, marketTab)}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={yAxisWidth}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip market={marketTab} />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
              <Bar dataKey="amount" radius={[0, 3, 3, 0]} maxBarSize={22}>
                {chartData.map((entry) => (
                  <Cell key={entry.stockCode + entry.name} fill={barColor(entry)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-muted-foreground mt-2">
          * 현재가 미입력 종목은 취득원가 기준 표시. 색상: 수익=초록 / 손실=빨강 / 미입력=회색
        </p>
      </CardContent>
    </Card>
  );
}
