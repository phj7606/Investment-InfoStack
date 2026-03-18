// 통계/지표 카드 컴포넌트 — 대시보드에서 핵심 수치 표시
// RSC: 데이터를 props로 받아 정적 렌더링

import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StatsCardData } from "@/types";

export function StatsCard({
  title,
  value,
  trend,
  icon: Icon,
  description,
}: StatsCardData) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {/* 우측 상단: 카드 주제를 나타내는 아이콘 */}
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        {/* 주요 수치: 크게 표시하여 한눈에 파악 */}
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-1 mt-1">
          {/* 트렌드 표시: 증감 방향과 수치로 빠른 판단 지원 */}
          {trend && (
            <span
              className={`flex items-center gap-0.5 text-xs font-medium ${
                trend.isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {trend.isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {trend.isPositive ? "+" : ""}{trend.value}%
            </span>
          )}
          {description && (
            <span className="text-xs text-muted-foreground">{description}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
