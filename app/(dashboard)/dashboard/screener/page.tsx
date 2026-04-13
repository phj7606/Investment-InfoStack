// 종목 스크리너 페이지 — RS + 모멘텀 + MA 복합 필터
//
// RSC에서 calcScreener를 직접 호출하여 서버 사이드 데이터 수집
// 필터링/정렬은 클라이언트 컴포넌트(ScreenerClient)에서 즉시 처리 (서버 왕복 없음)

import { ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { ScreenerClient } from "@/components/screener/ScreenerClient";
import { calcScreener } from "@/lib/etf/screener";

export default async function ScreenerPage() {
  // 한국/미국 스크리너 데이터 병렬 수집 — 하나 실패 시 빈 배열로 대체
  const [krResult, usResult] = await Promise.all([
    calcScreener("kr").catch((err) => {
      console.error("한국 ETF 스크리너 데이터 로드 오류:", err);
      return null;
    }),
    calcScreener("us").catch((err) => {
      console.error("미국 ETF 스크리너 데이터 로드 오류:", err);
      return null;
    }),
  ]);

  const krData = krResult?.results ?? [];
  const usData = usResult?.results ?? [];

  // 두 시장 모두 데이터 없으면 에러 상태 표시
  if (krData.length === 0 && usData.length === 0) {
    return (
      <div>
        <PageHeader
          title="종목 스크리너"
          description="Mansfield RS + 변동성 조정 모멘텀 + MA 복합 필터"
        />
        <EmptyState
          title="데이터를 불러오지 못했습니다"
          description="Yahoo Finance 연결 상태를 확인하고 잠시 후 다시 시도해 주세요."
          icon={<ScanSearch className="h-8 w-8 text-muted-foreground" />}
        />
      </div>
    );
  }

  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="종목 스크리너"
        description="Mansfield RS + 변동성 조정 모멘텀 + MA 복합 필터 · 클라이언트 즉시 반응"
      />

      {/* 메타 정보 */}
      {(krResult || usResult) && (
        <div className="text-xs text-muted-foreground flex gap-4 mb-4">
          {usResult && (
            <span>
              미국: {usResult.meta.totalSymbols}종 · 기준일 {usResult.meta.dataEndDate}
            </span>
          )}
          {krResult && (
            <span>
              한국: {krResult.meta.totalSymbols}종 · 기준일 {krResult.meta.dataEndDate}
            </span>
          )}
        </div>
      )}

      {/* 스크리너 클라이언트 (필터 + 결과 테이블) */}
      <ScreenerClient krData={krData} usData={usData} />
    </div>
  );
}
