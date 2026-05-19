"use client";

// 성과 지표 카드 (8개 KPI)
// 승률·손익비·EV·평균수익·평균손실·거래수·최대연속손실·MDD
// 각 지표의 의미와 해석 기준을 tooltip으로 제공

import { Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PerformanceSummary } from "@/types/portfolio";

interface PerformanceMetricsProps {
  summary: PerformanceSummary;
  isLoading: boolean;
}

// KPI 카드 데이터 타입
interface MetricItem {
  label: string;
  value: string;
  description: string; // hover tooltip
  emphasis: "positive" | "negative" | "neutral" | "dynamic";
  dynamicValue?: number; // emphasis가 "dynamic"일 때 양/음 판별용
}

export function PerformanceMetrics({ summary, isLoading }: PerformanceMetricsProps) {
  const metrics: MetricItem[] = [
    {
      label: "승률",
      value:
        summary.totalTrades === 0
          ? "-"
          : `${Math.round(summary.winRate * 100)}%`,
      description: `수익 거래 ${summary.winCount}건 / 전체 ${summary.totalTrades}건`,
      emphasis:
        summary.totalTrades === 0
          ? "neutral"
          : summary.winRate >= 0.5
          ? "positive"
          : "negative",
    },
    {
      label: "손익비 (PF)",
      value:
        summary.totalTrades === 0
          ? "-"
          : summary.profitFactor == null
          ? "-"
          : summary.profitFactor === Infinity
          ? "∞"
          : summary.profitFactor.toFixed(2),
      description: `총수익 / |총손실|. 1.0 이상이면 양의 기대값.`,
      emphasis:
        summary.totalTrades === 0
          ? "neutral"
          : summary.profitFactor == null
          ? "neutral"
          : summary.profitFactor >= 1
          ? "positive"
          : "negative",
    },
    {
      label: "기대값 (EV)",
      value:
        summary.totalTrades === 0 || summary.expectedValue == null
          ? "-"
          : `${summary.expectedValue >= 0 ? "+" : ""}${summary.expectedValue.toFixed(2)}%`,
      description: `승률×평균수익 - 패율×평균손실. 양수이면 시스템 유효.`,
      emphasis: "dynamic",
      dynamicValue: summary.expectedValue,
    },
    {
      label: "평균 수익 (Avg Win)",
      value:
        summary.winCount === 0 || summary.avgWinPct == null
          ? "-"
          : `+${summary.avgWinPct.toFixed(2)}%`,
      description: `WIN 거래 ${summary.winCount}건의 평균 수익률.`,
      emphasis: "positive",
    },
    {
      label: "평균 손실 (Avg Loss)",
      value:
        summary.lossCount === 0 || summary.avgLossPct == null
          ? "-"
          : `-${summary.avgLossPct.toFixed(2)}%`,
      description: `LOSS 거래 ${summary.lossCount}건의 평균 손실률.`,
      emphasis: "negative",
    },
    {
      label: "총 거래 수",
      value: `${summary.totalTrades}건`,
      description: `매도 완료 거래 기준. WIN ${summary.winCount} / LOSS ${summary.lossCount}`,
      emphasis: "neutral",
    },
    {
      label: "최대 연속 손실",
      value:
        summary.maxConsecutiveLoss === 0
          ? "-"
          : `${summary.maxConsecutiveLoss}연속`,
      description: `날짜 순 기준 LOSS가 연속된 최대 구간.`,
      emphasis:
        summary.maxConsecutiveLoss <= 2
          ? "neutral"
          : summary.maxConsecutiveLoss <= 4
          ? "negative"
          : "negative",
    },
    {
      label: "MDD",
      value:
        summary.mdd == null || summary.mdd === 0
          ? "-"
          : `${summary.mdd.toFixed(1)}%`,
      description: `Equity Curve 기준 최대 낙폭 (Maximum Drawdown). 음수.`,
      emphasis:
        summary.mdd == null || summary.mdd === 0
          ? "neutral"
          : summary.mdd > -15
          ? "neutral"
          : "negative",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((metric) => {
        // dynamic emphasis: 양수=positive, 음수=negative
        const resolvedEmphasis =
          metric.emphasis === "dynamic"
            ? (metric.dynamicValue ?? 0) >= 0
              ? "positive"
              : "negative"
            : metric.emphasis;

        return (
          <Card key={metric.label} className="relative group">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                {metric.label}
                {/* 정보 아이콘 — hover 시 설명 표시 */}
                <span className="relative inline-flex">
                  <Info className="h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 rounded-md border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-md z-10">
                    {metric.description}
                  </span>
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <p
                className={cn(
                  "text-xl font-bold tabular-nums",
                  resolvedEmphasis === "positive" && "text-emerald-600 dark:text-emerald-400",
                  resolvedEmphasis === "negative" && "text-red-500 dark:text-red-400",
                  resolvedEmphasis === "neutral" && "text-foreground"
                )}
              >
                {metric.value}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
