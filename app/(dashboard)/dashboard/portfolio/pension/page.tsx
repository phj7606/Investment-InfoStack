// 연금 계좌 대시보드 페이지
// 퇴직연금 / 연금저축 / IRP 계좌별 포지션 + 리밸런싱 + 거래내역 + 종목별

import { PageHeader } from "@/components/common/page-header";
import { PensionAccountDashboardClient } from "@/components/portfolio/pension/PensionAccountDashboardClient";

export const metadata = {
  title: "Pension Account | Investment+",
  description: "퇴직연금 / 연금저축 / IRP 계좌 통합 관리 및 리밸런싱 분석",
};

export default function PensionAccountPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="Pension Account"
          description="퇴직연금 / 연금저축 / IRP — 보유 포지션, 거래 내역 및 리밸런싱"
        />
      </div>
      <PensionAccountDashboardClient />
    </div>
  );
}
