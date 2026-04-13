// 상대강도 스크리너 페이지 — Mansfield RS + 변동성 조정 모멘텀 통합뷰
//
// RSC에서 calcEtfRs/calcEtfMomentum을 직접 호출하여 절대 URL 없이 서버 데이터 수집
// US ETF / 한국 ETF 탭 전환 → shadcn Tabs 컴포넌트 사용

import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EtfRsTable } from "@/components/charts/EtfRsTable";
import { EtfMomentumChart } from "@/components/charts/EtfMomentumChart";
import { calcEtfRs } from "@/lib/etf/rs";
import { calcEtfMomentum } from "@/lib/etf/momentum";
import type { EtfRsResponse, EtfMomentumResponse } from "@/types";

export default async function RelativeStrengthPage() {
  // 4개 데이터셋 병렬 수집 — 하나가 실패해도 나머지는 정상 표시
  const [krRsResult, usRsResult, krMomentumResult, usMomentumResult] =
    await Promise.allSettled([
      calcEtfRs("kr"),
      calcEtfRs("us"),
      calcEtfMomentum("kr"),
      calcEtfMomentum("us"),
    ]);

  const krRs       = krRsResult.status === "fulfilled" ? krRsResult.value : null;
  const usRs       = usRsResult.status === "fulfilled" ? usRsResult.value : null;
  const krMomentum = krMomentumResult.status === "fulfilled" ? krMomentumResult.value : null;
  const usMomentum = usMomentumResult.status === "fulfilled" ? usMomentumResult.value : null;

  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="상대강도 스크리너"
        description="Mansfield RS + 변동성 조정 모멘텀 통합 랭킹"
      />

      {/* US ETF / 한국 ETF 탭 전환 */}
      <Tabs defaultValue="us" className="space-y-6">
        <TabsList>
          <TabsTrigger value="us">미국 ETF</TabsTrigger>
          <TabsTrigger value="kr">한국 ETF</TabsTrigger>
        </TabsList>

        {/* ── 미국 ETF 탭 ──────────────────────────────────────── */}
        <TabsContent value="us" className="space-y-6">
          <EtfTabContent
            rsData={usRs}
            momentumData={usMomentum}
            market="us"
          />
        </TabsContent>

        {/* ── 한국 ETF 탭 ──────────────────────────────────────── */}
        <TabsContent value="kr" className="space-y-6">
          <EtfTabContent
            rsData={krRs}
            momentumData={krMomentum}
            market="kr"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 탭 내 콘텐츠 서브컴포넌트
// RS 테이블 + 모멘텀 바 차트를 함께 렌더링
// ────────────────────────────────────────────────────────────────

interface EtfTabContentProps {
  rsData: EtfRsResponse | null;
  momentumData: EtfMomentumResponse | null;
  market: "kr" | "us";
}

function EtfTabContent({ rsData, momentumData, market }: EtfTabContentProps) {
  const label = market === "us" ? "미국 ETF" : "한국 ETF";
  const benchmark = rsData?.meta.benchmark ?? (market === "us" ? "SPY" : "KOSPI");

  return (
    <>
      {/* 메타 정보 요약 */}
      {rsData && (
        <div className="text-xs text-muted-foreground flex gap-4">
          <span>기준일: {rsData.meta.dataEndDate}</span>
          <span>벤치마크: {benchmark}</span>
          <span>유효 종목: {rsData.meta.validSymbols} / {rsData.meta.totalSymbols}</span>
          <span>MA 윈도우: {rsData.meta.windowDays}일</span>
        </div>
      )}

      {/* Mansfield RS 랭킹 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>Mansfield RS 랭킹 — {label}</CardTitle>
          <CardDescription>
            RS Percentile 기준 내림차순 · 벤치마크({benchmark}) 대비 상대강도
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rsData ? (
            <EtfRsTable data={rsData.rankings} market={market} />
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              RS 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 변동성 조정 모멘텀 Top N 바 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>
            변동성 조정 모멘텀 Top {momentumData?.meta.topN ?? 15} — {label}
          </CardTitle>
          <CardDescription>
            3M / 6M / 12M Sharpe-like 점수 평균 · 높을수록 강한 추세
          </CardDescription>
        </CardHeader>
        <CardContent>
          {momentumData ? (
            <EtfMomentumChart data={momentumData.topRankings} market={market} />
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              모멘텀 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
