// 시장 분석 메인 페이지 (Phase 6)
// 미국 시장 5개 동기화 차트: S&P500/NASDAQ, VIX/SDEX, VIX/VVIX, VVIX/VIX Ratio, HY Spread
// RSC shell — MarketAnalysisClient가 모든 데이터 fetch 및 차트 렌더링 담당

import { PageHeader } from "@/components/common/page-header";
import { MarketAnalysisClient } from "@/components/charts/MarketAnalysisClient";

export default function DashboardPage() {
  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="시장 분석"
        description="미국 시장 핵심 지표 — S&P 500, NASDAQ, VIX, VVIX, SDEX, HY Spread 동기화 차트"
      />

      {/* 5개 동기화 차트 클라이언트 컴포넌트 */}
      <MarketAnalysisClient />
    </div>
  );
}
