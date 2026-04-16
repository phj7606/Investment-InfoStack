// ACTION 3 — 주간 리뷰 페이지 쉘 (Phase 7)
// 보유 종목 주간 성과 집계 + Catalyst 결과 확인 + Thesis 리뷰 알림 (Phase 10 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action3StepNav } from "@/components/common/action3-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TableProperties, CalendarCheck, Bell } from "lucide-react";

// 주간 리뷰 구현 예정 기능 명세 (Phase 10 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: TableProperties,
    title: "주간 성과 요약",
    description:
      "보유 종목 주간 수익률 테이블 + 벤치마크(KOSPI/S&P500) 대비 알파 계산",
  },
  {
    icon: CalendarCheck,
    title: "Catalyst 결과 확인",
    description:
      "지난 주 등록된 이벤트 체크리스트 — 완료/미완료 상태 표시 + 결과 기록",
  },
  {
    icon: Bell,
    title: "Thesis 리뷰 알림",
    description:
      "주간 가격 변화로 재검토가 필요한 종목 하이라이트 — 손절 기준 접근 경고 포함",
  },
];

export default function WeeklyReviewPage() {
  return (
    <div>
      {/* ACTION 3 Step 진행 표시 바 */}
      <Action3StepNav currentStep={2} />
      <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="주간 리뷰"
        description="한 주간의 성과를 점검하고 Thesis 유효성을 재확인합니다."
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
