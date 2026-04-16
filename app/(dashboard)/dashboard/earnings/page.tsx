// ACTION 2 — 실적 채점 페이지 쉘 (Phase 7)
// 발표된 실적을 Thesis 핵심 가정 대비 채점 (Phase 9 구현 예정)
// (ACTION 1 Step 3 "실적 채점"은 탐색용, 이 페이지는 보유 종목 Thesis 연동용으로 구분)

import { PageHeader } from "@/components/common/page-header";
import { Action2StepNav } from "@/components/common/action2-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClipboardEdit, Bot, RefreshCw } from "lucide-react";

// 실적 채점 구현 예정 기능 명세 (Phase 9 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: ClipboardEdit,
    title: "실적 입력 UI",
    description:
      "발표 EPS/매출 실제값 직접 입력 + 컨센서스 자동 로드. 예상 대비 Beat/Miss 즉시 계산",
  },
  {
    icon: Bot,
    title: "Beat/Miss 판정",
    description:
      "Claude API 기반 즉시 분석 — 컨센서스 대비 Beat/Miss 판정 + Thesis 핵심 가정 채점 자동화",
  },
  {
    icon: RefreshCw,
    title: "Thesis 상태 업데이트",
    description:
      "채점 결과 → Thesis 카드 자동 업데이트. 2개 이상 Miss 시 Review 상태로 자동 전환",
  },
];

export default function EarningsPage() {
  return (
    <div>
      {/* ACTION 2 Step 진행 표시 바 */}
      <Action2StepNav currentStep={3} />
      <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="실적 채점"
        description="발표된 실적을 Thesis 핵심 가정 대비 채점하여 보유 논리를 검증합니다."
      />

      {/* Phase 9 구현 예정 기능 명세 플레이스홀더 */}
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
                  Phase 9에서 구현 예정
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
