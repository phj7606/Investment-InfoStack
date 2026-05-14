"use client";

// 시장 환경 페이지 최상위 클라이언트 조율 컴포넌트
// 4개 탭(Stock Market / Bonds / Index / AI Infra Investment) 으로 시장 데이터를 구조화
// Stock Market · Bonds: /api/market/us-analysis (일별 Yahoo+FRED 데이터)
// Index: /api/market/economic-index (월별 FRED+ECOS 경제지표)
// AI Infra Investment: /api/market/ai-infra (Neocloud 주가) + 뉴스/AI 검색

import { useState, useEffect, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SyncChartDateControl } from "./SyncChartDateControl";
import {
  SpxNasdaqChart,
  VixSdexChart,
  VixVvixChart,
  VvixVixRatioChart,
  HySpreadChart,
  SofrYieldChart,
  Ust2y10yChart,
  YieldMoveChart,
  RealYieldChart,
} from "./MarketSyncCharts";
import {
  RealWageChart,
  MpmieChart,
} from "./EconomicIndexCharts";
import { AiInfraInvestmentClient } from "./AiInfraInvestmentClient";
import type { UsAnalysisBar, DateRange, PeriodLabel, AiInfraBar } from "@/types/market-analysis";
import type { EconomicIndexBar } from "@/app/api/market/economic-index/route";

/** "YYYY-MM-DD" 형식으로 Date 변환 */
function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 기본 날짜 범위 계산 (2Y) — 경제지표는 더 긴 기간이 의미있으므로 2년 기본 */
function getDefaultRange(): DateRange {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 365 * 86400 * 1000);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    period: "2Y",
  };
}

// ─── 로딩 스피너 ─────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">데이터 로드 중...</span>
    </div>
  );
}

// ─── 에러 메시지 ─────────────────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 flex-shrink-0" />
      <span>데이터를 불러오지 못했습니다: {message}</span>
    </div>
  );
}

export function MarketEnvironmentClient() {
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

  // ── Stock Market / Bonds 탭 데이터 (일별) ──
  const [dailyData, setDailyData] = useState<UsAnalysisBar[]>([]);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [dailyError, setDailyError] = useState<string | null>(null);

  // ── Index 탭 데이터 (월별 경제지표) ──
  const [indexData, setIndexData] = useState<EconomicIndexBar[]>([]);
  const [indexLoading, setIndexLoading] = useState(true);
  const [indexError, setIndexError] = useState<string | null>(null);

  // ── AI Infra Investment 탭 데이터 (Neocloud 주가) ──
  // lazy 로드: 탭 최초 클릭 시에만 fetch
  const [aiInfraData, setAiInfraData] = useState<AiInfraBar[]>([]);
  const [aiInfraLoading, setAiInfraLoading] = useState(false);
  const [aiInfraError, setAiInfraError] = useState<string | null>(null);
  // 최초 로드 여부 추적 (날짜 변경 시 재로드를 위해 boolean 사용)
  const [aiInfraLoaded, setAiInfraLoaded] = useState(false);

  /** 일별 시장 데이터 수집 — /api/market/us-analysis */
  const fetchDailyData = useCallback(async (start: string, end: string) => {
    setDailyLoading(true);
    setDailyError(null);
    try {
      const res = await fetch(`/api/market/us-analysis?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDailyData(json.data ?? []);
    } catch (err) {
      setDailyError(err instanceof Error ? err.message : String(err));
      setDailyData([]);
    } finally {
      setDailyLoading(false);
    }
  }, []);

  /** 월별 경제지표 수집 — /api/market/economic-index (날짜 범위 동기화) */
  const fetchIndexData = useCallback(async (start: string, end: string) => {
    setIndexLoading(true);
    setIndexError(null);
    try {
      const res = await fetch(`/api/market/economic-index?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setIndexData(json.data ?? []);
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : String(err));
      setIndexData([]);
    } finally {
      setIndexLoading(false);
    }
  }, []);

  /** Neocloud 주가 수집 — /api/market/ai-infra */
  const fetchAiInfraData = useCallback(async (start: string, end: string) => {
    setAiInfraLoading(true);
    setAiInfraError(null);
    try {
      const res = await fetch(`/api/market/ai-infra?startDate=${start}&endDate=${end}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAiInfraData(json.data ?? []);
      setAiInfraLoaded(true);
    } catch (err) {
      setAiInfraError(err instanceof Error ? err.message : String(err));
      setAiInfraData([]);
    } finally {
      setAiInfraLoading(false);
    }
  }, []);

  // 날짜 변경 시 Stock Market / Bonds / Index 동시 갱신
  // AI Infra는 이미 로드된 경우에만 재갱신 (탭 방문 전에는 불필요한 API 호출 방지)
  useEffect(() => {
    fetchDailyData(dateRange.startDate, dateRange.endDate);
    fetchIndexData(dateRange.startDate, dateRange.endDate);
    if (aiInfraLoaded) {
      fetchAiInfraData(dateRange.startDate, dateRange.endDate);
    }
  }, [dateRange.startDate, dateRange.endDate, fetchDailyData, fetchIndexData, fetchAiInfraData, aiInfraLoaded]);

  /** 탭 전환 핸들러 — AI Infra 탭 최초 진입 시 lazy 로드 */
  function handleTabChange(value: string) {
    if (value === "ai-infra" && !aiInfraLoaded && !aiInfraLoading) {
      fetchAiInfraData(dateRange.startDate, dateRange.endDate);
    }
  }

  /** 날짜/기간 컨트롤 변경 핸들러 */
  function handleRangeChange(start: string, end: string, period: PeriodLabel) {
    setDateRange({ startDate: start, endDate: end, period });
  }

  // VVIX/VIX 비율 + 10Y 실질 수익률 클라이언트 계산 후 주입
  // realYield10y = 명목 수익률(DGS10) - 손익분기 인플레이션(T10YIE)
  // Fisher 방정식 근사: 양수=실질 플러스, 음수=인플레이션이 명목보다 높은 극단 상황
  const enrichedDailyData: UsAnalysisBar[] = dailyData.map((d) => ({
    ...d,
    vvixVixRatio:
      d.vvix != null && d.vix != null && d.vix > 0
        ? d.vvix / d.vix
        : undefined,
    realYield10y:
      d.ust10y != null && d.breakeven10y != null
        ? d.ust10y - d.breakeven10y
        : undefined,
  }));

  return (
    <div className="space-y-4">
      {/* 날짜 범위 컨트롤 — 모든 탭에 동일 기간 적용 */}
      <SyncChartDateControl
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        period={dateRange.period}
        onRangeChange={handleRangeChange}
      />

      <Tabs defaultValue="stock-market" onValueChange={handleTabChange}>
        <TabsList className="h-9">
          <TabsTrigger value="stock-market" className="text-xs">Stock Market</TabsTrigger>
          <TabsTrigger value="bonds" className="text-xs">Bonds</TabsTrigger>
          <TabsTrigger value="index" className="text-xs">Index</TabsTrigger>
          {/* AI Infra Investment — Neocloud 주가 비교 + 멀티소스 뉴스 + AI 웹검색 */}
          <TabsTrigger value="ai-infra" className="text-xs">AI Infra Investment</TabsTrigger>
        </TabsList>

        {/* ── Stock Market 탭: 주가·변동성 지표 4종 ── */}
        <TabsContent value="stock-market" className="mt-4 space-y-4">
          {dailyLoading && <LoadingState />}
          {!dailyLoading && dailyError && <ErrorState message={dailyError} />}
          {!dailyLoading && !dailyError && enrichedDailyData.length > 0 && (
            <>
              {/* S&P 500 & NASDAQ — 메인 지수 비교 */}
              <SpxNasdaqChart data={enrichedDailyData} />
              {/* VIX & SDEX — 시장 하방 위험 지표 */}
              <VixSdexChart data={enrichedDailyData} />
              {/* VIX & VVIX — 변동성의 변동성 비교 */}
              <VixVvixChart data={enrichedDailyData} />
              {/* VVIX/VIX Ratio — 공포의 구조 분석 */}
              <VvixVixRatioChart data={enrichedDailyData} />
            </>
          )}
          {!dailyLoading && !dailyError && enrichedDailyData.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              선택한 기간에 데이터가 없습니다.
            </div>
          )}
        </TabsContent>

        {/* ── Bonds 탭: 채권·금리 지표 + ISM PMI ── */}
        <TabsContent value="bonds" className="mt-4 space-y-4">
          {dailyLoading && <LoadingState />}
          {!dailyLoading && dailyError && <ErrorState message={dailyError} />}
          {!dailyLoading && !dailyError && enrichedDailyData.length > 0 && (
            <>
              {/* ICE BofA HY Spread — 신용 위험 프리미엄 */}
              <HySpreadChart data={enrichedDailyData} />
              {/* SOFR + 10Y Yield + FED Funds Rate — 단기·장기·정책금리 비교 */}
              <SofrYieldChart data={enrichedDailyData} />
              {/* US 2Y & 10Y Yield — 장단기 금리차(역전) 모니터링 */}
              <Ust2y10yChart data={enrichedDailyData} />
              {/* US 10Y Yield & MOVE Index — 채권 변동성 비교 */}
              <YieldMoveChart data={enrichedDailyData} />
              {/* 10Y 실질 수익률 분해 — 명목/BEI/실질 3선 (FRED 차트 재현) */}
              <RealYieldChart data={enrichedDailyData} />
            </>
          )}
          {!dailyLoading && !dailyError && enrichedDailyData.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              선택한 기간에 데이터가 없습니다.
            </div>
          )}
        </TabsContent>

        {/* ── Index 탭: 월별 경제지표 3종 ── */}
        <TabsContent value="index" className="mt-4 space-y-4">
          {indexLoading && <LoadingState />}
          {!indexLoading && indexError && <ErrorState message={indexError} />}
          {!indexLoading && !indexError && (
            <>
              {/* 실질임금 상승률 — 소비 여력 판단 기준 */}
              <RealWageChart data={indexData} />
              {/* Markit 제조업 PMI — 경기 싸이클 선행 지표 (FRED MPMIE 레벨) */}
              <MpmieChart data={indexData} />
            </>
          )}
        </TabsContent>

        {/* ── AI Infra Investment 탭: Neocloud 주가 + 뉴스 + AI 웹검색 ── */}
        <TabsContent value="ai-infra" className="mt-4">
          <AiInfraInvestmentClient
            data={aiInfraData}
            loading={aiInfraLoading}
            error={aiInfraError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
