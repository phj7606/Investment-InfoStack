// [미사용 라우트] 스타터킷 잔존 페이지
// 현재 사이드바에 노출되지 않음 — 투자 분석 플랫폼 전환 시 삭제 예정
// 이 경로(/dashboard/analytics)는 실제 플랫폼에서 사용하지 않는다

import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="분석"
        description="이 페이지는 현재 사용되지 않습니다."
      />
      <EmptyState
        title="이 페이지는 사용되지 않습니다"
        description="투자 분석 플랫폼으로 전환 중입니다. 사이드바의 다른 메뉴를 이용하세요."
        action={{ label: "대시보드로 이동", href: "/dashboard" }}
      />
    </div>
  );
}
