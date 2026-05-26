// 포트폴리오 성과 분석 페이지 — ACTION 2 · 포트폴리오 관리
// RSC: 데이터 조회는 PerformanceDashboardClient에서 /api/portfolio/performance 호출로 처리
// Jan~Apr 2026: FS 2026.xlsx 엑셀 기반 / May 2026+: longterm-transactions.json 동적 계산

import { PageHeader } from "@/components/common/page-header";
import { PerformanceDashboardClient } from "@/components/portfolio/performance/PerformanceDashboardClient";

export const metadata = {
  title: "성과 분석",
  description: "포트폴리오 월별 수익률 · 벤치마크 비교 · Jan 2026~ KR/US 분리 분석",
};

export default function PortfolioPerformancePage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="포트폴리오 성과 분석"
          description="Jan 2026~ · 월별 MoM% · 누적수익률 · KOSPI / S&P500 / NASDAQ 벤치마크 비교"
        />
      </div>
      <div className="px-6 pb-6 max-w-7xl mx-auto">
        <PerformanceDashboardClient />
      </div>
    </div>
  );
}
