// Deposit & FX 관리 페이지
// Stock Deposit / Cash & Equivalent / Lease Deposit / Exchange Rates 월별 입력 관리

import { Suspense } from "react";
import { PageHeader } from "@/components/common/page-header";
import { DepositsDashboardClient } from "@/components/portfolio/financial/DepositsDashboardClient";

export const metadata = {
  title: "Deposit & FX",
  description: "예수금 · 현금성 자산 · 환율 · 임차보증금 월별 입력 관리",
};

export default function DepositsPage() {
  return (
    <div>
      <div className="px-6 pt-6 pb-0 max-w-7xl mx-auto">
        <PageHeader
          title="Deposit & FX"
          description="예수금 · 현금성 자산 · 환율 · 임차보증금 — 월별 수동 입력 관리"
        />
      </div>
      <Suspense>
        <DepositsDashboardClient />
      </Suspense>
    </div>
  );
}
