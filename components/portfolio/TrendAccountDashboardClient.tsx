"use client";

// 추세추종 계좌 대시보드 — 메인 컨테이너 컴포넌트
// 5개 탭:
//   개요       — 현재 포지션 요약 대시보드
//   보유 포지션 — 보유 종목 상세 테이블
//   거래실적    — 완료 거래 성과 + 수동 매도 추가
//   성과분석   — Equity Curve, 월별 히트맵, KPI
//   계좌관리   — 리스크 설정 + 포지션 사이징 계산기
//
// 공통: Excel Export / Import

import { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download, Upload } from "lucide-react";
import { RiskManagementPanel } from "./RiskManagementPanel";
import { PositionsTable } from "./PositionsTable";
import { TradeHistoryTable } from "./TradeHistoryTable";
import { PerformanceMetrics } from "./PerformanceMetrics";
import { EquityCurveChart } from "./EquityCurveChart";
import { MonthlyReturnsHeatmap } from "./MonthlyReturnsHeatmap";
import { PositionSizingCalculator } from "./PositionSizingCalculator";
import { exportPortfolioExcel, importPortfolioExcel } from "@/lib/portfolio/excel";
import type {
  KiwoomPosition,
  StockPerformance,
  PerformanceSummary,
  RiskManagementConfig,
} from "@/types/portfolio";
import { DEFAULT_RISK_CONFIG, RISK_MANAGEMENT_STORAGE_KEY } from "@/types/portfolio";

// 올해 1월 1일 ~ 오늘 기본 조회 기간
function getDefaultDateRange(): { startDate: string; endDate: string } {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

// 한국식 색상 규칙: 상승=빨강, 하락=파랑
function plColor(v: number) {
  return v > 0 ? "text-red-500" : v < 0 ? "text-blue-500" : "text-muted-foreground";
}

export function TrendAccountDashboardClient() {
  // ── 데이터 상태 ─────────────────────────────
  const [positions, setPositions] = useState<KiwoomPosition[]>([]);
  const [performances, setPerformances] = useState<StockPerformance[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [riskConfig, setRiskConfig] = useState<RiskManagementConfig>(DEFAULT_RISK_CONFIG);

  // ── 로딩/에러 상태 ───────────────────────────
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [positionsFetchedAt, setPositionsFetchedAt] = useState<string | undefined>();

  // ── 파일 import ref ──────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);

  // ── localStorage에서 리스크 설정 로드 ──────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RISK_MANAGEMENT_STORAGE_KEY);
      if (saved) {
        setRiskConfig(JSON.parse(saved) as RiskManagementConfig);
      }
    } catch {
      // ignore
    }
  }, []);

  // ── 보유 포지션 API 조회 ────────────────────────
  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true);
    setPositionsError(null);
    try {
      const res = await fetch("/api/portfolio/kiwoom/positions?account=TREND");
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { positions: KiwoomPosition[]; fetchedAt: string };
      setPositions(data.positions);
      setPositionsFetchedAt(data.fetchedAt);
    } catch (err) {
      const message = err instanceof Error ? err.message : "포지션 조회 실패";
      setPositionsError(message);
    } finally {
      setPositionsLoading(false);
    }
  }, []);

  // ── 거래실적 API 조회 ──────────────────────────
  const fetchTrades = useCallback(async () => {
    setTradesLoading(true);
    setTradesError(null);
    const { startDate, endDate } = getDefaultDateRange();
    try {
      const res = await fetch(
        `/api/portfolio/kiwoom/trades?account=TREND&startDate=${startDate}&endDate=${endDate}`
      );
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        stockPerformances: StockPerformance[];
        summary: PerformanceSummary;
      };
      setPerformances(data.stockPerformances);
      setSummary(data.summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : "거래실적 조회 실패";
      setTradesError(message);
    } finally {
      setTradesLoading(false);
    }
  }, []);

  // ── 마운트 시 동시 조회 ─────────────────────────
  useEffect(() => {
    void fetchPositions();
    void fetchTrades();
  }, [fetchPositions, fetchTrades]);

  // ── 수동 매도 추가 (거래실적에 append) ──────────
  function appendPerformance(newPerf: StockPerformance) {
    setPerformances((prev) => [newPerf, ...prev]);
  }

  // ── Excel Export ────────────────────────────
  function handleExport() {
    exportPortfolioExcel(positions, performances, summary);
  }

  // ── Excel Import ────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importPortfolioExcel(file);
      if (result.positions.length > 0) setPositions(result.positions);
      if (result.performances.length > 0) setPerformances(result.performances);
    } catch (err) {
      console.error("Excel import 실패:", err);
    }
    // input 초기화 (같은 파일 재업로드 허용)
    if (importFileRef.current) importFileRef.current.value = "";
  }

  // ── 개요 탭 계산값 ──────────────────────────────
  const totalEvalAmount = positions.reduce((s, p) => s + p.evalAmount, 0);
  const totalPL = positions.reduce((s, p) => s + p.profitLoss, 0);
  const weightedPLPct =
    totalEvalAmount > 0
      ? positions.reduce((s, p) => s + p.profitLossPct * (p.evalAmount / totalEvalAmount), 0)
      : 0;

  // 환경 변수 미설정 오류 여부
  const isEnvError =
    positionsError?.includes("환경 변수") || tradesError?.includes("환경 변수");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* ── 환경 변수 미설정 경고 ── */}
      {isEnvError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">키움 REST API 환경 변수 미설정</p>
            <p className="text-xs mt-0.5 text-amber-700 dark:text-amber-300">
              .env.local에 KIWOOM_TREND_APP_KEY, KIWOOM_TREND_APP_SECRET, KIWOOM_TREND_ACCOUNT_NO를 설정해 주세요.
            </p>
          </div>
        </div>
      )}

      {/* ── Excel 공통 도구 모음 ── */}
      <div className="flex items-center justify-end gap-2">
        {/* 숨겨진 파일 인풋 (import용) */}
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImport}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => importFileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Excel 가져오기
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={handleExport}
        >
          <Download className="h-3.5 w-3.5" />
          Excel 내보내기
        </Button>
      </div>

      {/* ── 5개 탭 ── */}
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-5 bg-emerald-500/5 border">
          {[
            { value: "overview",    label: "개요" },
            { value: "positions",   label: "보유 포지션",  count: positions.length },
            { value: "trades",      label: "거래실적",     count: performances.length },
            { value: "performance", label: "성과분석" },
            { value: "account",     label: "계좌관리" },
          ].map(({ value, label, count }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white text-xs"
            >
              {label}
              {count != null && count > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── 탭 1: 개요 (포지션 요약 대시보드) ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">

          {/* 상단 KPI 카드 4종 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="총 평가금액"
              value={positionsLoading ? "-" : `${totalEvalAmount.toLocaleString()}원`}
            />
            <KpiCard
              label="총 평가손익"
              value={
                positionsLoading
                  ? "-"
                  : `${totalPL >= 0 ? "+" : ""}${totalPL.toLocaleString()}원`
              }
              valueClass={plColor(totalPL)}
            />
            <KpiCard
              label="가중 평균 수익률"
              value={
                positionsLoading
                  ? "-"
                  : `${weightedPLPct >= 0 ? "+" : ""}${weightedPLPct.toFixed(2)}%`
              }
              valueClass={plColor(weightedPLPct)}
            />
            <KpiCard
              label="보유 종목 수"
              value={positionsLoading ? "-" : `${positions.length}종목`}
            />
          </div>

          {/* 성과 요약 (API 연결 후 채워짐) */}
          {summary && summary.totalTrades > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="승률" value={`${Math.round(summary.winRate * 100)}%`} />
              <KpiCard
                label="손익비 (PF)"
                value={summary.profitFactor === Infinity ? "∞" : summary.profitFactor.toFixed(2)}
              />
              <KpiCard
                label="누적 손익"
                value={`${summary.cumulativeProfitLoss >= 0 ? "+" : ""}${summary.cumulativeProfitLoss.toLocaleString()}원`}
                valueClass={plColor(summary.cumulativeProfitLoss)}
              />
              <KpiCard label="총 거래" value={`${summary.totalTrades}건`} />
            </div>
          )}

          {/* 보유 포지션 미니 테이블 */}
          {positions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">보유 포지션 현황</CardTitle>
                <CardDescription className="text-xs">
                  {positionsFetchedAt
                    ? `${new Date(positionsFetchedAt).toLocaleString("ko-KR")} 기준`
                    : "실시간"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left pb-1.5 font-medium">종목</th>
                        <th className="text-right pb-1.5 font-medium">평가금액</th>
                        <th className="text-right pb-1.5 font-medium">수익률</th>
                        <th className="text-right pb-1.5 font-medium">비중</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {positions.map((p) => (
                        <tr key={p.stockCode}>
                          <td className="py-1.5">
                            <span className="font-medium">{p.stockName}</span>
                            <span className="ml-1 text-muted-foreground">{p.stockCode}</span>
                          </td>
                          <td className="text-right py-1.5 tabular-nums">
                            {p.evalAmount.toLocaleString()}
                          </td>
                          <td className={`text-right py-1.5 tabular-nums font-semibold ${plColor(p.profitLossPct)}`}>
                            {p.profitLossPct >= 0 ? "+" : ""}{p.profitLossPct.toFixed(2)}%
                          </td>
                          <td className="text-right py-1.5 tabular-nums text-muted-foreground">
                            {totalEvalAmount > 0
                              ? `${((p.evalAmount / totalEvalAmount) * 100).toFixed(1)}%`
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 포지션 없을 때 */}
          {!positionsLoading && positions.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {positionsError && !isEnvError
                ? positionsError
                : "현재 보유 중인 종목이 없습니다."}
            </div>
          )}
        </TabsContent>

        {/* ── 탭 2: 보유 포지션 ── */}
        <TabsContent value="positions" className="mt-4">
          <PositionsTable
            positions={positions}
            isLoading={positionsLoading}
            onRefresh={fetchPositions}
            fetchedAt={positionsFetchedAt}
          />
        </TabsContent>

        {/* ── 탭 3: 거래실적 ── */}
        <TabsContent value="trades" className="mt-4">
          {tradesError && !isEnvError && (
            <p className="text-xs text-red-500 mb-2">{tradesError}</p>
          )}
          <TradeHistoryTable
            performances={performances}
            isLoading={tradesLoading}
            onAppend={appendPerformance}
          />
        </TabsContent>

        {/* ── 탭 4: 성과분석 ── */}
        <TabsContent value="performance" className="space-y-4 mt-4">
          {tradesError && !isEnvError && (
            <p className="text-xs text-red-500">{tradesError}</p>
          )}
          <PerformanceMetrics
            summary={summary ?? {
              totalTrades: 0, winCount: 0, lossCount: 0, winRate: 0,
              profitFactor: 0, avgWinPct: 0, avgLossPct: 0, expectedValue: 0,
              maxConsecutiveLoss: 0, cumulativeProfitLoss: 0, mdd: 0,
              equityCurve: [], monthlyReturns: [],
            }}
            isLoading={tradesLoading}
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EquityCurveChart
              data={summary?.equityCurve ?? []}
              isLoading={tradesLoading}
            />
            <MonthlyReturnsHeatmap
              data={summary?.monthlyReturns ?? []}
              isLoading={tradesLoading}
              totalCapital={riskConfig.totalCapital > 0 ? riskConfig.totalCapital : undefined}
            />
          </div>
        </TabsContent>

        {/* ── 탭 5: 계좌관리 ── */}
        <TabsContent value="account" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 리스크 관리 패널 */}
            <RiskManagementPanel
              positions={positions}
              winRate={summary?.winRate ?? 0}
            />
            {/* 포지션 사이징 계산기 */}
            <PositionSizingCalculator config={riskConfig} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────
// 공통 KPI 카드 컴포넌트
// ─────────────────────────────────────────

function KpiCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold mt-0.5 tabular-nums ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}
