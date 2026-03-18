// 분석 페이지 — 방문자/전환율 등 상세 분석 데이터 표시
// RSC: 데이터 중심 페이지, 클라이언트 상태 불필요

import { PageHeader } from "@/components/common/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsPage() {
  return (
    <div>
      {/* 페이지 헤더: 제목 + 설명 */}
      <PageHeader
        title="분석"
        description="트래픽, 전환율, 사용자 행동 등 상세 분석 데이터를 확인하세요."
      />

      {/* 분석 카드 그리드 — 실제 환경에서는 API 데이터로 교체 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 페이지뷰 추이 플레이스홀더 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>페이지뷰 추이</CardTitle>
            <CardDescription>최근 30일 페이지뷰 및 세션 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 차트 영역 스켈레톤 — 실제 차트 연동 전 플레이스홀더 */}
            <Skeleton className="h-64 w-full rounded-md" />
          </CardContent>
        </Card>

        {/* 유입 경로 분석 플레이스홀더 */}
        <Card>
          <CardHeader>
            <CardTitle>유입 경로</CardTitle>
            <CardDescription>트래픽 소스별 방문자 비율</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 5개 항목 스켈레톤 리스트 */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-3 w-3 rounded-full shrink-0" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 인기 페이지 플레이스홀더 */}
        <Card>
          <CardHeader>
            <CardTitle>인기 페이지</CardTitle>
            <CardDescription>조회수 기준 상위 페이지 목록</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
