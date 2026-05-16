// ACTION 1 · Step 2 — 종목 분석 페이지 (Phase 8)
// 탭 1: 주가 성과 — 히스토리컬 성과 분석 (정규화 가격 / 수익률 / MDD / 월별기하수익률)
// 탭 2: 개별주식 스크리너 — 재무 + 밸류에이션 복합 필터, Claude API 스트리밍
// 탭 3: 실적 채점 — Beat/Miss 분석 + KPI 트렌드 차트

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StockScreenerClient } from "@/components/charts/StockScreenerClient";
import { EarningsAnalysisClient } from "@/components/charts/EarningsAnalysisClient";
import { StockPerformanceClient } from "@/components/charts/StockPerformanceClient";
import { ScanSearch, TrendingUp, BarChart2 } from "lucide-react";

export default function ScreenPage() {
  return (
    <div>
      <Action1StepNav currentStep={2} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="종목 분석"
          description="주가 성과를 비교하고, 스크리너로 후보를 압축하고, 실적 채점으로 모멘텀을 검증합니다."
        />

        <Tabs defaultValue="performance" className="mt-6">
          <TabsList className="mb-4">
            <TabsTrigger value="performance" className="flex items-center gap-1.5 text-xs">
              <BarChart2 className="h-3.5 w-3.5" />
              주가 성과
            </TabsTrigger>
            <TabsTrigger value="screener" className="flex items-center gap-1.5 text-xs">
              <ScanSearch className="h-3.5 w-3.5" />
              개별주식 스크리너
            </TabsTrigger>
            <TabsTrigger value="earnings" className="flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3.5 w-3.5" />
              실적 채점
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance">
            <StockPerformanceClient />
          </TabsContent>

          <TabsContent value="screener">
            <StockScreenerClient />
          </TabsContent>

          <TabsContent value="earnings">
            <EarningsAnalysisClient />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
