"use client";

// 시장 분석 탭 — 최상위 클라이언트 조율 컴포넌트
// 날짜 범위 상태 관리 + API 데이터 fetch + 차트 렌더링 조율

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { SyncChartDateControl } from "./SyncChartDateControl";
import { MarketSyncCharts } from "./MarketSyncCharts";
import type { UsAnalysisBar, DateRange, PeriodLabel } from "@/types/market-analysis";

/** "YYYY-MM-DD" 형식으로 Date 변환 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** PeriodLabel → 일수 */
const PERIOD_DAYS: Record<Exclude<PeriodLabel, "custom">, number> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "2Y": 730,
  "5Y": 1825,
};

/** 기본 날짜 범위 계산 (1Y) */
function getDefaultRange(): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86400 * 1000);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    period: "1Y",
  };
}

export function MarketAnalysisClient() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);
  const [data, setData] = useState<UsAnalysisBar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 날짜 범위가 변경될 때마다 API 재요청 */
  const fetchData = useCallback(async (start: string, end: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/market/us-analysis?startDate=${start}&endDate=${end}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 초기 로드 및 날짜 변경 시 재요청
  useEffect(() => {
    fetchData(dateRange.startDate, dateRange.endDate);
  }, [dateRange.startDate, dateRange.endDate, fetchData]);

  /** 날짜/기간 컨트롤 변경 핸들러 */
  function handleRangeChange(start: string, end: string, period: PeriodLabel) {
    setDateRange({ startDate: start, endDate: end, period });
  }

  return (
    <div className="space-y-4">
      {/* 날짜 범위 컨트롤 */}
      <SyncChartDateControl
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        period={dateRange.period}
        onRangeChange={handleRangeChange}
      />

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">데이터 로드 중...</span>
        </div>
      )}

      {/* 에러 상태 */}
      {!isLoading && error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>데이터를 불러오지 못했습니다: {error}</span>
        </div>
      )}

      {/* 차트 (데이터 있을 때만 표시 — 이전 데이터 유지로 깜빡임 최소화) */}
      {!isLoading && !error && data.length > 0 && (
        <MarketSyncCharts data={data} />
      )}

      {/* 데이터 없음 (에러 없음인데 빈 배열) */}
      {!isLoading && !error && data.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          선택한 기간에 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
