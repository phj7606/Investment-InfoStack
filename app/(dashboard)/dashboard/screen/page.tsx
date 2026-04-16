// ACTION 1 · Step 2 — 종목 압축 페이지 쉘 (Phase 7)
// 기존 ETF 스크리너(Phase 2) + RS 랭킹(Phase 1) + 업종 수급 필터(Phase 4)를 통합 (Phase 8 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScanSearch, BarChart2, TrendingDown } from "lucide-react";

// Step 2에서 구현 예정인 기능 명세 (Phase 8 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: ScanSearch,
    title: "ETF 스크리너",
    description:
      "한국 ETF / 미국 ETF 탭 — RS + 모멘텀 복합 필터, MA 옵션(10/20/50일), CSV 내보내기. Phase 2 구현 이전",
  },
  {
    icon: BarChart2,
    title: "RS 랭킹 테이블",
    description:
      "Mansfield RS 기반 한국/미국 ETF 랭킹 테이블. Phase 1 구현 이전",
  },
  {
    icon: TrendingDown,
    title: "업종 수급 필터",
    description:
      "KOSPI 19개 업종 기관/외국인 수급 MACD 오실레이터 — 업종별 수급 강도 기준 종목 압축",
  },
];

export default function ScreenPage() {
  return (
    <div>
      {/* ACTION 1 Step 진행 표시 바 */}
      <Action1StepNav currentStep={2} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="종목 압축"
          description="스크리너와 RS 랭킹으로 매수 후보를 압축합니다."
        />

        {/* Phase 8 구현 예정 기능 명세 플레이스홀더 */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANNED_FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title} className="border-dashed">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-xs leading-relaxed">
                    {feature.description}
                  </CardDescription>
                  <p className="mt-2 text-xs text-muted-foreground/60 font-medium">
                    Phase 8에서 구현 예정
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
