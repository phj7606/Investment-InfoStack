// 중장기 투자 계좌 대시보드 페이지 — ACTION 2 · 포트폴리오 관리
// RSC: 데이터 수집은 LongtermDashboardClient에서 API 호출로 처리
// 계좌: 4802 / 1635 / 1402 — KR(원화) / US(달러) 완전 분리

import { PageHeader } from "@/components/common/page-header";
import { LongtermDashboardClient } from "@/components/portfolio/longterm/LongtermDashboardClient";

export const metadata = {
  title: "중장기 투자 계좌 | Investment+",
  description: "중장기 투자 계좌 포트폴리오 관리 — 포지션, 거래 내역, 성과 분석, 리밸런싱",
};

export default function LongtermAccountPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="중장기 투자 계좌"
          description="계좌 4802 · 1635 · 1402 — 포지션 현황, 거래 내역, 성과 분석 및 리밸런싱"
        />
      </div>
      <LongtermDashboardClient />
    </div>
  );
}
