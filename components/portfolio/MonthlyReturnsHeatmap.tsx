"use client";

// 월별 수익률 히트맵
// 행=연도, 열=1~12월 그리드 형태로 수익/손실 시각화
// - 원금 설정 시: 원금 대비 수익률(%) 색상
// - 원금 미설정 시: 손익 부호(+/-)만으로 색상 (손익 절대값 툴팁 표시)
// recharts 없이 순수 CSS 그리드로 구현 (반드시 "use client" 필요)

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MonthlyReturn } from "@/types/portfolio";

interface MonthlyReturnsHeatmapProps {
  data: MonthlyReturn[];
  isLoading: boolean;
  /** 원금 제공 시 수익률(%) 색상 강도 조절에 활용 */
  totalCapital?: number;
}

const MONTH_LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// 수익률 크기에 따른 배경 색상 강도 (초록/빨강)
function getCellColor(returnPct: number, hasCapital: boolean, profitLoss: number): string {
  // 원금 없을 때는 손익 부호로만 판단
  const value = hasCapital ? returnPct : profitLoss;

  if (value === 0) return "bg-muted/30";

  if (value > 0) {
    if (value < (hasCapital ? 2 : 50_000)) return "bg-emerald-100 dark:bg-emerald-950/40";
    if (value < (hasCapital ? 5 : 200_000)) return "bg-emerald-200 dark:bg-emerald-900/60";
    if (value < (hasCapital ? 10 : 500_000)) return "bg-emerald-300 dark:bg-emerald-800/70";
    return "bg-emerald-500 dark:bg-emerald-700";
  } else {
    if (value > (hasCapital ? -2 : -50_000)) return "bg-red-100 dark:bg-red-950/40";
    if (value > (hasCapital ? -5 : -200_000)) return "bg-red-200 dark:bg-red-900/60";
    if (value > (hasCapital ? -10 : -500_000)) return "bg-red-300 dark:bg-red-800/70";
    return "bg-red-500 dark:bg-red-700";
  }
}

function getCellTextColor(returnPct: number, hasCapital: boolean, profitLoss: number): string {
  const value = hasCapital ? returnPct : profitLoss;
  if (value === 0) return "text-muted-foreground";
  return value > 0 ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200";
}

export function MonthlyReturnsHeatmap({
  data,
  isLoading,
  totalCapital,
}: MonthlyReturnsHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ year: number; month: number } | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">월별 수익률</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">월별 수익률</CardTitle>
          <CardDescription className="text-xs">연·월별 손익 히트맵</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
            거래 이력이 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  // 연도 목록 추출 (오름차순)
  const years = [...new Set(data.map((d) => d.year))].sort();

  // 데이터 맵: year-month → MonthlyReturn
  const dataMap = new Map(data.map((d) => [`${d.year}-${d.month}`, d]));

  const hasCapital = !!(totalCapital && totalCapital > 0);

  // 호버된 셀의 툴팁 정보
  const hoveredData = hoveredCell
    ? dataMap.get(`${hoveredCell.year}-${hoveredCell.month}`)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-sm">월별 수익률</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {hasCapital ? "원금 대비 수익률 (%)" : "손익 부호 기준 (원금 미설정)"}
            </CardDescription>
          </div>
          {/* 호버 셀 정보 표시 */}
          {hoveredData && (
            <div className="text-right text-xs">
              <p className="text-muted-foreground">
                {hoveredData.year}년 {hoveredData.month}월
              </p>
              {hasCapital && hoveredData.returnPct !== 0 && (
                <p className={cn(
                  "font-semibold",
                  hoveredData.returnPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                )}>
                  {hoveredData.returnPct >= 0 ? "+" : ""}
                  {hoveredData.returnPct.toFixed(2)}%
                </p>
              )}
              <p className={cn(
                "font-semibold",
                hoveredData.profitLoss > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
              )}>
                {hoveredData.profitLoss >= 0 ? "+" : ""}
                {hoveredData.profitLoss.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* 월 헤더 */}
        <div className="grid grid-cols-[auto_repeat(12,1fr)] gap-0.5 text-center mb-0.5">
          <div className="text-[9px] text-transparent select-none">연도</div>
          {MONTH_LABELS.map((m) => (
            <div key={m} className="text-[9px] text-muted-foreground font-medium">
              {m}
            </div>
          ))}
        </div>

        {/* 연도별 행 */}
        <div className="space-y-0.5">
          {years.map((year) => (
            <div
              key={year}
              className="grid grid-cols-[auto_repeat(12,1fr)] gap-0.5 items-center"
            >
              {/* 연도 레이블 */}
              <div className="text-[9px] text-muted-foreground font-medium w-8 text-right pr-1">
                {year}
              </div>

              {/* 12개 월 셀 */}
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const entry = dataMap.get(`${year}-${month}`);
                const returnPct = entry?.returnPct ?? 0;
                const profitLoss = entry?.profitLoss ?? 0;
                const isHovered =
                  hoveredCell?.year === year && hoveredCell?.month === month;

                return (
                  <div
                    key={month}
                    className={cn(
                      "h-7 rounded-sm flex items-center justify-center cursor-default transition-all",
                      entry
                        ? getCellColor(returnPct, hasCapital, profitLoss)
                        : "bg-muted/20",
                      isHovered && "ring-1 ring-inset ring-foreground/30 scale-105"
                    )}
                    onMouseEnter={() => setHoveredCell({ year, month })}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {entry ? (
                      <span
                        className={cn(
                          "text-[9px] font-semibold leading-none",
                          getCellTextColor(returnPct, hasCapital, profitLoss)
                        )}
                      >
                        {hasCapital && returnPct !== 0
                          ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}`
                          : profitLoss > 0
                          ? "+"
                          : profitLoss < 0
                          ? "−"
                          : "0"}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-[9px] text-muted-foreground">손실</span>
          {["bg-red-500", "bg-red-200", "bg-muted/30", "bg-emerald-200", "bg-emerald-500"].map(
            (cls, i) => (
              <div key={i} className={cn("h-3 w-5 rounded-sm", cls)} />
            )
          )}
          <span className="text-[9px] text-muted-foreground">수익</span>
        </div>
      </CardContent>
    </Card>
  );
}
