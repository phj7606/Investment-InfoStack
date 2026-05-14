// 기업 분석 페이지 (P5-01 RSC shell)
// 스크리너에서 종목 클릭 시 URL 파라미터(ticker, exchange, companyName)를 수신하여
// CompanyAnalysisClient에 initialInput으로 전달 → 폼 자동 입력 + 분석 즉시 시작
// searchParams는 Next.js 15+ App Router에서 Promise<> 타입이므로 await 처리 필요

import { PageHeader } from "@/components/common/page-header";
import { CompanyAnalysisClient } from "@/components/company-analysis";
import type { CompanyAnalysisInput } from "@/types/company-analysis";

interface PageProps {
  searchParams: Promise<{
    ticker?: string;
    exchange?: string;
    companyName?: string;
  }>;
}

export default async function CompanyAnalysisPage({ searchParams }: PageProps) {
  const params = await searchParams;

  // 스크리너에서 넘어온 경우 initialInput 구성, 직접 접근 시 undefined
  const initialInput: CompanyAnalysisInput | undefined = params.ticker
    ? {
        ticker: params.ticker.toUpperCase(),
        exchange: (params.exchange ?? "KRX") as CompanyAnalysisInput["exchange"],
        companyName: params.companyName
          ? decodeURIComponent(params.companyName)
          : undefined,
      }
    : undefined;

  return (
    <div>
      {/* 페이지 제목 + 설명 */}
      <PageHeader
        title="기업 분석"
        description="AI 기반 심층 투자 분석 리포트 — Claude Sonnet + 실시간 웹 검색"
      />

      {/* initialInput이 있으면 폼 자동 입력 + 분석 즉시 시작 */}
      <CompanyAnalysisClient initialInput={initialInput} />
    </div>
  );
}
