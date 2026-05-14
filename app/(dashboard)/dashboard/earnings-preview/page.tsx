// ACTION 1 · Step 3 — 재무 체크포인트 페이지 (Phase 8 P8-14)
// fundamental-screening 스킬 기반 5개년 재무제표 수집 + 4대 질문 분석
//
// 데이터 수집: Alpha Vantage(US) / DART(KR) 공식 API
// 분석: Claude claude-sonnet-4-6 — 돈이 많은가 / 이익 내는가 / 극대화 가능한가 / 현금 버는가

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import { FundamentalScreeningClient } from "@/components/charts/FundamentalScreeningClient";

export default function EarningsPreviewPage() {
  return (
    <div>
      {/* ACTION 1 Step 진행 표시 바 */}
      <Action1StepNav currentStep={3} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="재무 체크포인트"
          description="5개년 재무제표 기반 기본적 분석 — 돈이 많은가 / 이익을 내는가 / 극대화 가능한가 / 현금을 버는가"
        />

        {/* 재무 스크리닝 클라이언트 컴포넌트 */}
        <div className="mt-6">
          <FundamentalScreeningClient />
        </div>
      </div>
    </div>
  );
}
