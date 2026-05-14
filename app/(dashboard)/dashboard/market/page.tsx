// 시장 환경 페이지 — ACTION 1의 독립 선행 단계
// 섹터 조감 이전에 거시 시장 환경을 파악하는 단계
// 3개 내부 탭: Stock Market / Bonds / Index
// Stock Market: S&P500·NASDAQ, VIX·SDEX, VIX·VVIX, VVIX/VIX Ratio
// Bonds: HY Spread, FED Funds Rate, US 2Y·10Y Yield, 10Y·MOVE Index
// Index: 실질임금 상승률, Markit 제조업 PMI (FRED MPMIE), 한국 월간 수출

import { PageHeader } from "@/components/common/page-header";
import { MarketEnvironmentClient } from "@/components/charts/MarketEnvironmentClient";

export default function MarketPage() {
  return (
    <div>
      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="시장 환경"
          description="거시 금융 시장 환경을 파악하여 투자 방향성을 결정합니다."
        />

        {/* MarketEnvironmentClient: Stock Market / Bonds / Index 3탭 구조
            일별 데이터(Yahoo+FRED)와 월별 경제지표(FRED+ECOS)를 통합 관리 */}
        <div className="mt-6">
          <MarketEnvironmentClient />
        </div>
      </div>
    </div>
  );
}
