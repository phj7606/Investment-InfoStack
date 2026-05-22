// 재무현황 통합 대시보드 페이지
// 월별 현금흐름(Monthly CF) / 자산관리(Asset Management) / 종합 재무제표(Financial Statement)

import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { FinancialStatementClient } from "@/components/portfolio/financial/FinancialStatementClient";

export const metadata = {
  title: "Financial Statement | Investment+",
  description: "월별 현금흐름, 자산관리, 종합 재무제표 — 월말 확정 기반 자산 추적",
};

export default function FinancialPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="Financial Statement"
          description="재무제표 · 자산관리 · 현금흐름 — 월말 마감 기반 종합 자산 추적"
        />
      </div>
      {/* useSearchParams 등 클라이언트 훅 사용을 위해 Suspense 필수 */}
      <Suspense>
        <FinancialStatementClient />
      </Suspense>
    </div>
  );
}
