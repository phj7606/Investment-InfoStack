// 미국 시장 페이지 — US ETF Mansfield RS + 변동성 조정 모멘텀
//
// RSC에서 calcEtfRs/calcEtfMomentum을 직접 호출하여 실 데이터 렌더링
// Fear & Greed Oscillator(US) 섹션은 데이터 소스 연동 후 별도 구현

import { Globe } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EtfRsTable } from "@/components/charts/EtfRsTable";
import { EtfMomentumChart } from "@/components/charts/EtfMomentumChart";
import { calcEtfRs } from "@/lib/etf/rs";
import { calcEtfMomentum } from "@/lib/etf/momentum";

export default async function UsMarketPage() {
  // RS + 모멘텀 병렬 수집 — 하나가 실패해도 나머지 표시
  const [usRsData, usMomentumData] = await Promise.all([
    calcEtfRs("us").catch((err) => { console.error("미국 ETF RS 데이터 로드 오류:", err); return null; }),
    calcEtfMomentum("us").catch((err) => { console.error("미국 ETF 모멘텀 데이터 로드 오류:", err); return null; }),
  ]);

  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="미국 시장"
        description="미국 직접 상장 테마 ETF 38종 · Mansfield RS + 변동성 조정 모멘텀 랭킹"
      />

      {/* 상단: 핵심 지수 스냅샷 스켈레톤 (US F&G 연동 전 자리) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {["S&P 500", "NASDAQ", "VIX", "F&G 지수 (US)"].map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <Skeleton className="h-8 w-24 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 메타 정보 */}
      {usRsData && (
        <div className="text-xs text-muted-foreground flex gap-4 mb-4">
          <span>기준일: {usRsData.meta.dataEndDate}</span>
          <span>벤치마크: {usRsData.meta.benchmark}</span>
          <span>유효 종목: {usRsData.meta.validSymbols} / {usRsData.meta.totalSymbols}</span>
        </div>
      )}

      {/* Mansfield RS 랭킹 테이블 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Mansfield RS 랭킹 — 미국 ETF 38종</CardTitle>
          <CardDescription>
            SPY(S&amp;P500) 대비 · Rolling Percentile (252일) · 높을수록 강세
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usRsData ? (
            <EtfRsTable data={usRsData.rankings} market="us" />
          ) : (
            <EmptyState
              title="RS 데이터 준비 중"
              description="Yahoo Finance 연결 확인 후 다시 시도해 주세요."
              icon={<Globe className="h-8 w-8 text-muted-foreground" />}
            />
          )}
        </CardContent>
      </Card>

      {/* 변동성 조정 모멘텀 Top N 바 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>
            변동성 조정 모멘텀 Top {usMomentumData?.meta.topN ?? 15} — 미국 ETF
          </CardTitle>
          <CardDescription>
            3M / 6M / 12M Sharpe-like 점수 평균 · 높을수록 강한 추세 모멘텀
          </CardDescription>
        </CardHeader>
        <CardContent>
          {usMomentumData ? (
            <EtfMomentumChart data={usMomentumData.topRankings} market="us" />
          ) : (
            <EmptyState
              title="모멘텀 데이터 준비 중"
              description="데이터 소스 연결 후 활성화됩니다."
              icon={<Globe className="h-8 w-8 text-muted-foreground" />}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
