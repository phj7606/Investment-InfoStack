// 추세추종 계좌 대시보드 페이지 — ACTION 2 · 포트폴리오 관리 (Phase 9)
// RSC: 클라이언트 컴포넌트에 데이터 수집 위임
// 실제 데이터는 TrendAccountDashboardClient에서 키움 REST API를 통해 수집

import { PageHeader } from "@/components/common/page-header";
import { TrendAccountDashboardClient } from "@/components/portfolio/TrendAccountDashboardClient";

export const metadata = {
  title: "추세추종 계좌 | Investment+",
  description: "키움증권 추세추종 계좌 보유 포지션, 리스크 관리, 성과 분석 대시보드",
};

export default function TrendAccountPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="추세추종 계좌"
          description="키움증권 Account 1470 — 보유 포지션, 리스크 관리, 거래 이력 및 누적 성과"
        />
      </div>
      <TrendAccountDashboardClient />
    </div>
  );
}
