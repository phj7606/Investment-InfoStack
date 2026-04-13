// 포트폴리오 페이지 — 보유 종목 현황, 교체 신호, IRP 포트폴리오
// RSC: 데이터 연동 전 플레이스홀더 구성
// 실제 연동 시: PortfolioPosition 타입 배열을 로컬 스토리지 또는 API에서 로드

import { Briefcase } from "lucide-react";
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

export default function PortfolioPage() {
  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="포트폴리오"
        description="보유 종목 현황, 상대강도 기반 교체 신호, IRP 포트폴리오를 관리합니다."
      />

      {/* 포트폴리오 요약 스탯 자리 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {["총 평가금액", "총 수익률", "교체 신호 종목"].map((label) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <Skeleton className="h-8 w-28 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 하단: 일반 포트폴리오 + IRP 포트폴리오 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 일반 포트폴리오 보유 종목 */}
        <Card>
          <CardHeader>
            <CardTitle>보유 종목</CardTitle>
            <CardDescription>
              상대강도 기반 교체 신호 포함 — 빨간 행은 교체 검토 대상
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="포트폴리오 준비 중"
              description="보유 종목을 등록하면 교체 신호와 수익률이 표시됩니다."
              icon={<Briefcase className="h-8 w-8 text-muted-foreground" />}
              action={{ label: "종목 등록", href: "/dashboard/settings" }}
            />
          </CardContent>
        </Card>

        {/* IRP 포트폴리오 */}
        <Card>
          <CardHeader>
            <CardTitle>IRP 포트폴리오</CardTitle>
            <CardDescription>
              개인형 퇴직연금 ETF 구성 및 리밸런싱 현황
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* IRP ETF 항목 자리 스켈레톤 */}
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  {/* 비중 바 자리 */}
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
