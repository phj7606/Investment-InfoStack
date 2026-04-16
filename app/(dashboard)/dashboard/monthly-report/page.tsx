// ACTION 3 — 월간 보고서 페이지 쉘 (Phase 7)
// 월간 성과 집계 + Thesis 정확도 통계 + 교훈 기록 (Phase 10 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action3StepNav } from "@/components/common/action3-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, BarChart2, PenLine } from "lucide-react";

// 월간 보고서 구현 예정 기능 명세 (Phase 10 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: TrendingUp,
    title: "월간 성과 집계",
    description:
      "보유/매도 종목 월간 수익률 + KOSPI/S&P500 대비 알파 계산. 월별 추이 차트",
  },
  {
    icon: BarChart2,
    title: "Thesis 정확도 통계",
    description:
      "핵심 가정 월간 Hit Rate 바 차트 — 종목별 가정 적중률 추이 분석",
  },
  {
    icon: PenLine,
    title: "교훈 기록",
    description:
      "자유 텍스트 월간 교훈/회고 입력 + localStorage 저장. 과거 교훈 이력 조회",
  },
];

export default function MonthlyReportPage() {
  return (
    <div>
      {/* ACTION 3 Step 진행 표시 바 */}
      <Action3StepNav currentStep={3} />
      <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="월간 보고서"
        description="한 달간의 투자 성과와 Thesis 정확도를 종합 분석합니다."
      />

      {/* Phase 10 구현 예정 기능 명세 플레이스홀더 */}
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
                  Phase 10에서 구현 예정
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
