"use client";

// 스크리너 클라이언트 메인 컴포넌트
// 필터 상태를 관리하고 ScreenerFilterPanel + ScreenerResultTable을 조합

import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScreenerFilterPanel } from "./ScreenerFilterPanel";
import { ScreenerResultTable } from "./ScreenerResultTable";
import params from "@/config/params.json";
import type { ScreenerResult, ScreenerFilters } from "@/types";

interface ScreenerClientProps {
  krData: ScreenerResult[];
  usData: ScreenerResult[];
}

// 필터 초기값 — params.json 연동
const DEFAULT_FILTERS: ScreenerFilters = {
  rsPercentileMin: 50,
  topNMomentum: params.screener.topN,   // 기본: 20
  requireMa10: false,
  requireMa20: false,
  requireMa50: false,
  categoryFilter: "",
};

/**
 * 데이터에서 유니크 카테고리 목록 추출 (정렬 포함)
 */
function extractCategories(data: ScreenerResult[]): string[] {
  return Array.from(new Set(data.map((r) => r.category))).sort();
}

export function ScreenerClient({ krData, usData }: ScreenerClientProps) {
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);

  // 시장 탭 전환 시 필터 초기화
  const handleTabChange = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // 데이터별 카테고리 목록 (탭 전환 시 Select 옵션 반영)
  const krCategories = useMemo(() => extractCategories(krData), [krData]);
  const usCategories = useMemo(() => extractCategories(usData), [usData]);

  return (
    <Tabs defaultValue="us" className="space-y-6" onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="us">미국 ETF</TabsTrigger>
        <TabsTrigger value="kr">한국 ETF</TabsTrigger>
      </TabsList>

      {/* ── 미국 ETF 탭 ──────────────────────────────────────────── */}
      <TabsContent value="us" className="space-y-4">
        {/* 필터 패널 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">필터 조건</CardTitle>
            <CardDescription className="text-xs">
              RS Percentile, 모멘텀 순위, 이동평균, 카테고리 조건을 조합하여 종목을 추출합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScreenerFilterPanel
              filters={filters}
              categories={usCategories}
              onChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />
          </CardContent>
        </Card>

        {/* 결과 테이블 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">스크리닝 결과 — 미국 ETF</CardTitle>
            <CardDescription className="text-xs">
              Mansfield RS + 변동성 조정 모멘텀 + MA 복합 필터
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScreenerResultTable data={usData} filters={filters} market="us" />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ── 한국 ETF 탭 ──────────────────────────────────────────── */}
      <TabsContent value="kr" className="space-y-4">
        {/* 필터 패널 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">필터 조건</CardTitle>
            <CardDescription className="text-xs">
              RS Percentile, 모멘텀 순위, 이동평균, 카테고리 조건을 조합하여 종목을 추출합니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScreenerFilterPanel
              filters={filters}
              categories={krCategories}
              onChange={setFilters}
              onReset={() => setFilters(DEFAULT_FILTERS)}
            />
          </CardContent>
        </Card>

        {/* 결과 테이블 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">스크리닝 결과 — 한국 ETF</CardTitle>
            <CardDescription className="text-xs">
              Mansfield RS + 변동성 조정 모멘텀 + MA 복합 필터
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScreenerResultTable data={krData} filters={filters} market="kr" />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
