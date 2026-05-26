// Short-term 계좌 대시보드 페이지 — ACTION 2 · 포트폴리오 관리
// 파일 기반 수동 관리 (data/shortterm-account.json)
// 계좌: Short-term Account (Account 2805)

import { PageHeader } from "@/components/common/page-header";
import { ShorttermAccountDashboardClient } from "@/components/portfolio/shortterm/ShorttermAccountDashboardClient";

export const metadata = {
  title: "Short-term Account",
  description: "단기투자 계좌(2805) 보유 포지션, 거래 내역 및 Risk Management",
};

export default function ShorttermAccountPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="Short-term Account"
          description="단기투자 계좌 (Account 2805) — 보유 포지션, 거래 내역 및 Risk Management"
        />
      </div>
      <ShorttermAccountDashboardClient />
    </div>
  );
}
