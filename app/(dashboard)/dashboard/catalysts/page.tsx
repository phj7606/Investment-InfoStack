// ACTION 2 — Catalyst 캘린더 페이지 쉘 (Phase 7)
// 보유 종목 이벤트 일정 관리 + Google Calendar 연동 (Phase 9 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action2StepNav } from "@/components/common/action2-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CalendarDays, Plus, CalendarCheck, ClipboardList, Calendar } from "lucide-react";

// Catalyst 캘린더 구현 예정 기능 명세 (Phase 9 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: CalendarDays,
    title: "캘린더 뷰",
    description: "월별 캘린더 컴포넌트 — 이벤트 도트 색상으로 중요도(H/M/L) 표시",
  },
  {
    icon: Plus,
    title: "이벤트 등록 폼",
    description:
      "종목명, 이벤트 유형(실적/IR/규제/제품), 예정일, 중요도(H/M/L) 입력 폼",
  },
  {
    icon: ClipboardList,
    title: "리스트 뷰",
    description: "가까운 이벤트 순 타임라인 리스트 — 7일 / 30일 / 90일 필터",
  },
  {
    icon: Calendar,
    title: "Google Calendar 연동",
    description: "등록 이벤트 → Google Calendar MCP 자동 동기화 (Phase 11 활성화)",
  },
  {
    icon: CalendarCheck,
    title: "결과 기록",
    description: "이벤트 후 결과 입력 + Thesis 핵심 가정 영향도 평가",
  },
];

export default function CatalystsPage() {
  return (
    <div>
      {/* ACTION 2 Step 진행 표시 바 */}
      <Action2StepNav currentStep={2} />
      <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Catalyst 캘린더"
        description="보유 종목의 주요 이벤트를 등록하고 결과를 Thesis에 연동합니다."
      />

      {/* Phase 9 구현 예정 기능 명세 플레이스홀더 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
