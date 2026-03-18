// 대시보드 메인 페이지 — 핵심 지표 카드 + 차트
// RSC: 데이터 표시 위주, 상태 불필요

import {
  Users,
  DollarSign,
  Activity,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatsCard } from "@/components/common/stats-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// recharts 클래스 컴포넌트 격리 — 'use client'가 선언된 별도 컴포넌트로 분리
import { VisitorsChart } from "@/components/common/visitors-chart";

// 통계 카드 데이터 — 실제 환경에서는 API/DB에서 가져옴
const statsData = [
  {
    title: "총 방문자",
    value: "24,521",
    trend: { value: 12.5, isPositive: true },
    icon: Users,
    description: "지난달 대비",
  },
  {
    title: "월 매출",
    value: "₩3,240,000",
    trend: { value: 8.2, isPositive: true },
    icon: DollarSign,
    description: "지난달 대비",
  },
  {
    title: "활성 사용자",
    value: "1,893",
    trend: { value: 3.1, isPositive: false },
    icon: Activity,
    description: "지난달 대비",
  },
  {
    title: "전환율",
    value: "7.72%",
    trend: { value: 1.4, isPositive: true },
    icon: TrendingUp,
    description: "지난달 대비",
  },
];

export default function DashboardPage() {
  return (
    <div>
      {/* 페이지 헤더: 제목 + 내보내기 액션 버튼 */}
      <PageHeader
        title="대시보드"
        description="서비스 핵심 지표를 한눈에 확인하세요."
        action={<Button size="sm">보고서 내보내기</Button>}
      />

      {/* 통계 카드 4개: 반응형 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsData.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* 하단 영역: 차트 + 로딩 스켈레톤 예시 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 방문자 추이 차트 — 전체 너비의 2/3 차지 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>방문자 추이</CardTitle>
            <CardDescription>최근 6개월 방문자 및 전환 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {/* VisitorsChart: recharts 클래스 컴포넌트 호환성을 위해 'use client' 분리 */}
            <VisitorsChart />
          </CardContent>
        </Card>

        {/* 로딩 스켈레톤 예시 — 실제 사용 시 데이터 로딩 중 표시 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 활동</CardTitle>
            <CardDescription>스켈레톤 로딩 예시</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 5개의 스켈레톤 아이템 — 리스트 로딩 상태 시뮬레이션 */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
