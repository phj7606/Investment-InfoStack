// ACTION 3 — 자동화 설정 페이지 쉘 (Phase 7)
// Morning Note 스케줄 설정 + 조건 트리거 + MCP 연결 상태 (Phase 10 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action3StepNav } from "@/components/common/action3-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Clock, Bell, Plug } from "lucide-react";

// 자동화 설정 구현 예정 기능 명세 (Phase 10 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: Clock,
    title: "스케줄 설정",
    description:
      "Morning Note 생성 시각, 주간 리뷰 요일 설정 폼 — schedule skill 기반 크론 등록",
  },
  {
    icon: Bell,
    title: "조건 트리거 설정",
    description:
      "손절 경고(-15%), 목표가 도달 알림 조건 설정 — Gmail/Slack 알림 대상 지정",
  },
  {
    icon: Plug,
    title: "MCP 연결 상태",
    description:
      "Notion, Google Drive, Gmail, Google Calendar 연결 상태 카드 — Phase 11 MCP 연동 현황 확인",
  },
];

export default function AutomationPage() {
  return (
    <div>
      {/* ACTION 3 Step 진행 표시 바 */}
      <Action3StepNav currentStep={4} />
      <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="자동화 설정"
        description="루틴 스케줄과 조건 알림을 설정하고 MCP 연결 상태를 확인합니다."
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
