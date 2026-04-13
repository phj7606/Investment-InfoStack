// 기업 분석 페이지 (P5-01 RSC shell)
// 상태 없는 RSC — 데이터 사전 로드 불필요 (분석은 클라이언트에서 시작)
// CompanyAnalysisClient가 모든 인터랙션 담당

import { PageHeader } from "@/components/common/page-header";
import { CompanyAnalysisClient } from "@/components/company-analysis";

export default function CompanyAnalysisPage() {
  return (
    <div>
      {/* 페이지 제목 + 설명 */}
      <PageHeader
        title="기업 분석"
        description="AI 기반 심층 투자 분석 리포트 — Claude Sonnet + 실시간 웹 검색"
      />

      {/* 기업 분석 모듈 메인 클라이언트 컴포넌트 */}
      <CompanyAnalysisClient />
    </div>
  );
}
