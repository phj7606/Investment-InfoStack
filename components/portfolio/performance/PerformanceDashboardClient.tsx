"use client";

/**
 * 포트폴리오 성과 분석 대시보드 클라이언트 컴포넌트
 *
 * 역할:
 * - /api/portfolio/performance 데이터 조회 (mount 시 자동 fetch)
 * - KR / US 탭 전환
 * - 계좌 서브탭 전환 (전체 / 계좌별)
 * - 새로고침 버튼 (?refresh=1 캐시 강제 갱신)
 */

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PerformanceSummaryCards } from "./PerformanceSummaryCards";
import { MonthlyReturnBarChart } from "./MonthlyReturnBarChart";
import { CumulativeReturnLineChart } from "./CumulativeReturnLineChart";
import { MonthlyAlphaChart } from "./MonthlyAlphaChart";
import { StockPerformanceTable } from "./StockPerformanceTable";
import type {
  PortfolioPerformanceResponse,
  PerformanceMonthPoint,
  BenchmarkMonthPoint,
  StockMonthPerformance,
} from "@/types/portfolio";

/** 계좌번호 표시명 */
const ACCOUNT_LABELS: Record<string, string> = {
  "4802": "4802 (주식)",
  "1635": "1635 (ETF)",
  "1402": "1402 (개인종합)",  // ISA = 개인종합자산관리계좌
  "8654": "8654",
};

function getAccountLabel(acct: string): string {
  return ACCOUNT_LABELS[acct] ?? acct;
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day:   "2-digit",
    hour:  "2-digit",
    minute: "2-digit",
  });
}

export function PerformanceDashboardClient() {
  const [data, setData] = useState<PortfolioPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  /** 시장 탭: KR / US */
  const [marketTab, setMarketTab] = useState<"KR" | "US">("KR");
  /** 계좌 서브탭: "all" | 계좌번호 */
  const [accountTab, setAccountTab] = useState<string>("all");

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/portfolio/performance${forceRefresh ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? "API 오류");
      }
      const json: PortfolioPerformanceResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "데이터 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 시장 탭이 바뀌면 계좌 탭을 "전체"로 초기화
  const handleMarketTab = (tab: "KR" | "US") => {
    setMarketTab(tab);
    setAccountTab("all");
  };

  // ── 현재 탭/계좌 기준 표시 데이터 결정 ──
  const marketData = data
    ? marketTab === "KR"
      ? { section: data.kr, currency: "KRW" as const }
      : { section: data.us, currency: "USD" as const }
    : null;

  // 현재 계좌 탭의 월별 성과
  const activeMonths: PerformanceMonthPoint[] = (() => {
    if (!marketData) return [];
    if (accountTab === "all") return marketData.section.months;
    return marketData.section.byAccount[accountTab] ?? [];
  })();

  // 벤치마크 — 전체/계좌 탭 모두 항상 표시
  const benchKR: BenchmarkMonthPoint[] | undefined =
    marketTab === "KR" ? (data?.kr.benchmark ?? []) : undefined;
  const benchSP: BenchmarkMonthPoint[] | undefined =
    marketTab === "US" ? (data?.us.benchmarks.sp500 ?? []) : undefined;
  const benchNQ: BenchmarkMonthPoint[] | undefined =
    marketTab === "US" ? (data?.us.benchmarks.nasdaq ?? []) : undefined;
  // 종목 하이라이트용 기준 벤치마크 (KR=KOSPI, US=S&P500)
  const activeBench = benchKR ?? benchSP ?? [];

  // 현재 계좌 탭 기준 종목 필터
  const activeStocks: StockMonthPerformance[] = (() => {
    if (!marketData) return [];
    if (accountTab === "all") return marketData.section.stocks;
    return marketData.section.stocks.filter((s) => s.accountNo === accountTab);
  })();

  // 계좌 탭 목록 (현재 시장 기준)
  const accountTabs: string[] = marketData
    ? Object.keys(marketData.section.byAccount).sort()
    : [];

  return (
    <div className="space-y-5">
      {/* ── 시장 탭 + 새로고침 ── */}
      <div className="flex items-center justify-between">
        {/* 시장 탭 */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {(["KR", "US"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => handleMarketTab(tab)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                marketTab === tab
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "KR" ? "한국주식 (KRW)" : "미국주식 (USD)"}
            </button>
          ))}
        </div>

        {/* 마지막 업데이트 + 새로고침 */}
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {formatFetchedAt(data.fetchedAt)} 기준
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">새로고침</span>
          </Button>
        </div>
      </div>

      {/* ── 계좌 서브탭 ── */}
      {!loading && accountTabs.length > 0 && (
        <div className="flex items-center gap-2 border-b pb-2">
          {/* 전체 버튼 */}
          <button
            onClick={() => setAccountTab("all")}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              accountTab === "all"
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            전체
          </button>
          {/* 계좌별 버튼 */}
          {accountTabs.map((acct) => (
            <button
              key={acct}
              onClick={() => setAccountTab(acct)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                accountTab === acct
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {getAccountLabel(acct)}
            </button>
          ))}
        </div>
      )}

      {/* ── 에러 ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ── 로딩 스켈레톤 ── */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
                <div className="h-3 w-20 bg-muted rounded mb-3" />
                <div className="h-7 w-28 bg-muted rounded" />
              </div>
            ))}
          </div>
          <div className="rounded-xl border bg-card p-4 animate-pulse h-64" />
          <div className="rounded-xl border bg-card p-4 animate-pulse h-64" />
        </div>
      )}

      {/* ── 데이터 표시 ── */}
      {marketData && (
        <div className="space-y-5">
          {/* KPI 요약 카드 */}
          <PerformanceSummaryCards
            months={activeMonths}
            currency={marketData.currency}
          />

          {/* 월별 MoM% Bar 차트 */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                월별 수익률 (MoM%)
              </h3>
              {accountTab !== "all" && (
                <span className="text-xs text-muted-foreground">
                  계좌 {getAccountLabel(accountTab)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              전월 말 잔고 대비 당월 수익률 · 벤치마크 비교
            </p>
            <MonthlyReturnBarChart
              months={activeMonths}
              benchmarkKR={benchKR}
              benchmarkSP500={benchSP}
              benchmarkNasdaq={benchNQ}
              market={marketTab}
            />
          </div>

          {/* 누적 수익률 Line 차트 */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                누적 수익률 (TWR Cum%)
              </h3>
              {accountTab !== "all" && (
                <span className="text-xs text-muted-foreground">
                  계좌 {getAccountLabel(accountTab)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Dec 2025 기준 · Time-Weighted Return 체인링크 · 포트폴리오 vs 벤치마크
            </p>
            <CumulativeReturnLineChart
              months={activeMonths}
              benchmarkKR={benchKR}
              benchmarkSP500={benchSP}
              benchmarkNasdaq={benchNQ}
              market={marketTab}
            />
          </div>

          {/* 월별 Alpha + 누적 Alpha 차트 */}
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-foreground">
                Alpha 분석
              </h3>
              {accountTab !== "all" && (
                <span className="text-xs text-muted-foreground">
                  계좌 {getAccountLabel(accountTab)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Bar: 월별 Alpha (포트폴리오 MoM% − 벤치마크 MoM%)
              {" · "}
              Line: 누적 Alpha — (1 + 포트폴리오) / (1 + 벤치마크) − 1 · 기하학적 초과수익
            </p>
            <MonthlyAlphaChart
              months={activeMonths}
              benchmarkKR={benchKR}
              benchmarkSP500={benchSP}
              benchmarkNasdaq={benchNQ}
              market={marketTab}
            />
          </div>

          {/* 종목별 성과 테이블 */}
          {activeStocks.length > 0 && (
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                종목별 성과
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Jan~Apr 엑셀 · May+ API 기반
                {accountTab === "all"
                  ? " · 전체 계좌"
                  : ` · 계좌 ${getAccountLabel(accountTab)}`}{" "}
                · 매도 완료 종목 포함 · 누적 수익률 = 종목 보유기간 기준 TWR · 벤치 = 동일 기간 기준
              </p>
              <StockPerformanceTable
                stocks={activeStocks}
                currency={marketData.currency}
                portfolioMonths={activeMonths}
                benchmarkData={activeBench}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
