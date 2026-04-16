// ACTION 1 · Step 4 — 체크포인트 페이지 쉘 (Phase 7)
// 다음 실적 발표일 조회 + Claude API 기반 채점 기준 5가지 생성 (Phase 8 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarClock, Bot, Target } from "lucide-react";

// Step 4에서 구현 예정인 기능 명세 (Phase 8 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: CalendarClock,
    title: "다음 실적 발표일 조회",
    description: "티커 기반 다음 실적 발표 예정일 + 컨센서스 EPS/매출 카드 표시",
  },
  {
    icon: Bot,
    title: "채점 기준 5가지 생성",
    description:
      "Claude API — '다음 실적에서 확인할 5가지 핵심 지표' 자동 생성. 직전 실적 분석 컨텍스트 활용",
  },
  {
    icon: Target,
    title: "컨센서스 표시",
    description:
      "현재 컨센서스 EPS/매출 가이던스 카드 — 시장 기대치 대비 상하방 리스크 시각화",
  },
];

export default function EarningsPreviewPage() {
  return (
    <div>
      {/* ACTION 1 Step 진행 표시 바 */}
      <Action1StepNav currentStep={4} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="체크포인트"
          description="다음 실적 발표 전 확인할 5가지 기준을 사전에 설정합니다."
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
