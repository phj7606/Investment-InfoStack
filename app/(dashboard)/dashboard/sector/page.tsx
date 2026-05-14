// ACTION 1 · Step 1 — 섹터 조감 페이지 (Phase 8 P8-02 ~ P8-04)
// 시장 환경은 /dashboard/market 페이지로 분리 (독립 메뉴)
// P8-02: 한국 섹터 탭 — KrSectorTable (섹터별 대표 ETF 수익률 + RS강도)
// P8-03: 미국 섹터 탭 — UsSectorTable (테마 ETF 40개 수익률 + RS강도, SPY 벤치마크)
// P8-04: AI 섹터 보고서 — SectorReportClient (Claude API + web_search 스트리밍)

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KrSectorTable } from "@/components/charts/KrSectorTable";
import { UsSectorTable } from "@/components/charts/UsSectorTable";
import { SectorReportClient } from "@/components/charts/SectorReportClient";

export default function SectorPage() {
  return (
    <div>
      {/* ACTION 1 Step 진행 표시 바 */}
      <Action1StepNav currentStep={1} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="섹터 조감"
          description="섹터 흐름을 파악하여 탐색 방향을 설정합니다."
        />

        {/* 탭 구성: 한국/미국 섹터 + AI 보고서 (시장 환경은 /dashboard/market으로 독립) */}
        <Tabs defaultValue="kr-sector" className="mt-6">
          <TabsList className="h-9">
            <TabsTrigger value="kr-sector" className="text-xs">
              한국 섹터
            </TabsTrigger>
            <TabsTrigger value="us-sector" className="text-xs">
              미국 섹터
            </TabsTrigger>
            <TabsTrigger value="ai-report" className="text-xs">
              AI 섹터 보고서
            </TabsTrigger>
          </TabsList>

          {/* ── 탭 1: 한국 섹터 — KrSectorTable ── */}
          <TabsContent value="kr-sector" className="mt-4">
            {/* 섹터별 대표 ETF 수익률(1M/3M/12M) + RS Percentile 테이블
                행 클릭 → EtfDetailSheet (가격 차트 + RS 시계열) */}
            <KrSectorTable />
          </TabsContent>

          {/* ── 탭 2: 미국 섹터 — UsSectorTable ── */}
          <TabsContent value="us-sector" className="mt-4">
            {/* 미국 테마 ETF 40개 수익률(1M/3M/12M) + RS강도(SPY 대비)
                카테고리 필터 탭(전체/테마/광역시장) + 행 클릭 → EtfDetailSheet */}
            <UsSectorTable />
          </TabsContent>

          {/* ── 탭 3: AI 섹터 보고서 — P8-04 ── */}
          <TabsContent value="ai-report" className="mt-4">
            {/*
              SectorReportClient: 자유 텍스트 섹터 입력 →
              /api/sector/ai-report SSE 스트리밍 →
              증권사 컨센서스·Market Overview·Competitive·Valuation·
              Investment Implications 6섹션 Markdown 렌더링
            */}
            <SectorReportClient />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
