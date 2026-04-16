// ACTION 2 — Thesis 관리 페이지 쉘 (Phase 7)
// 보유 종목별 투자 논리(Thesis) CRUD + 핵심 가정 채점 (Phase 9 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action2StepNav } from "@/components/common/action2-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookOpen, PenLine, CheckCircle, Database, Cloud } from "lucide-react";

// Thesis 관리 구현 예정 기능 명세 (Phase 9 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: BookOpen,
    title: "Thesis 목록 UI",
    description:
      "보유 종목별 카드 그리드 — 상태(Active/Review/Exit), 수익률, 핵심 가정 진행률 표시",
  },
  {
    icon: PenLine,
    title: "Thesis 작성 폼",
    description:
      "표준 템플릿 Sheet/Dialog — 종목명/티커, 매수가/목표가, 핵심 가정 4개, 베어 케이스, 손절 기준",
  },
  {
    icon: CheckCircle,
    title: "핵심 가정 채점",
    description:
      "가정별 Hit/Miss 토글 — 2개 이상 Miss 시 자동 경고 배지. Thesis 유효성 실시간 추적",
  },
  {
    icon: Database,
    title: "localStorage 저장",
    description: "브라우저 로컬 스토리지 기반 Thesis 데이터 CRUD. 외부 의존성 없는 오프라인 동작",
  },
  {
    icon: Cloud,
    title: "Notion 연동",
    description: "Thesis → Notion Investment Thesis DB 저장 (Phase 11 MCP 연동 후 활성화)",
  },
];

export default function ThesisPage() {
  return (
    <div>
      {/* ACTION 2 Step 진행 표시 바 */}
      <Action2StepNav currentStep={1} />
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Thesis 관리"
        description="보유 종목의 투자 논리를 관리하고 핵심 가정의 이행 여부를 추적합니다."
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
