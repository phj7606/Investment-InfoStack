// ACTION 1 · Step 3 — 실적 채점 페이지 쉘 (Phase 7)
// 티커 입력 → Claude API 기반 Beat/Miss 분석 + KPI 트렌드 차트 (Phase 8 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Bot, LineChart } from "lucide-react";

// Step 3에서 구현 예정인 기능 명세 (Phase 8 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: Search,
    title: "종목 입력 UI",
    description: "티커/기업명 검색 + 거래소(KRX/NYSE/NASDAQ) 선택 입력 폼",
  },
  {
    icon: Bot,
    title: "Beat/Miss 분석",
    description:
      "Claude API 기반 최근 분기 EPS/매출 컨센서스 대비 분석 — 스트리밍 응답",
  },
  {
    icon: LineChart,
    title: "KPI 트렌드 차트",
    description:
      "매출성장률, 영업이익률, EPS 분기별 Recharts 라인 차트 — 멀티 시리즈",
  },
];

export default function EarningsAnalysisPage() {
  return (
    <div>
      {/* ACTION 1 Step 진행 표시 바 */}
      <Action1StepNav currentStep={3} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="실적 채점"
          description="최근 분기 실적을 컨센서스 대비 분석하여 종목의 실적 모멘텀을 평가합니다."
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
