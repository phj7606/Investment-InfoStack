// Education 계좌 대시보드 페이지 — ACTION 2 · 포트폴리오 관리 (Phase 9)
// RSC: 클라이언트 컴포넌트에 데이터 수집 위임
// 데이터 소스: data/education-account.json (파일 기반 수동 관리)
// Kiwoom API 연결 불가로 수동 기입 방식 사용

import { PageHeader } from "@/components/common/page-header";
import { EducationAccountDashboardClient } from "@/components/portfolio/education/EducationAccountDashboardClient";

export const metadata = {
  title: "Education Account | Investment+",
  description: "교육 계좌(1470) 보유 포지션 및 거래내역 — 수동 기입 관리",
};

export default function EducationAccountPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="Education Account"
          description="교육 계좌 (Account 1470) — 보유 포지션, 거래 내역 및 Risk Management"
        />
      </div>
      <EducationAccountDashboardClient />
    </div>
  );
}
