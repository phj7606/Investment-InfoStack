// ACTION 1 · Step 5 — 매수 결정 페이지 쉘 (Phase 7)
// Claude API 기반 기업 심층 분석(Phase 5 이전) + 매수 기준 체크리스트 (Phase 8 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action1StepNav } from "@/components/common/action1-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, CheckSquare, BookmarkPlus, MessageSquare, Download } from "lucide-react";

// Step 5에서 구현 예정인 기능 명세 (Phase 8 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: FileText,
    title: "기업 분석 이전",
    description:
      "Phase 5에서 구현한 Claude API 기반 기업 심층 분석 모듈을 이 페이지로 이전",
  },
  {
    icon: CheckSquare,
    title: "매수 기준 자동 채점",
    description:
      "가이드 문서 5개 기준 체크리스트 — Thesis / 밸류에이션 / 모멘텀 / 리스크 / 유동성",
  },
  {
    icon: BookmarkPlus,
    title: "Thesis 자동 생성",
    description:
      "분석 결과 → Thesis 초안 자동 생성 → ACTION 2 Thesis 관리 페이지로 저장 연동",
  },
  {
    icon: MessageSquare,
    title: "LLM Q&A",
    description: "보고서 컨텍스트 기반 대화형 Q&A (Phase 5 구현 재활용)",
  },
  {
    icon: Download,
    title: "보고서 저장",
    description: "Markdown 다운로드 + Google Drive 저장 (MCP 연동 후 활성화)",
  },
];

export default function InitiatingCoveragePage() {
  return (
    <div>
      {/* ACTION 1 Step 진행 표시 바 */}
      <Action1StepNav currentStep={5} />

      <div className="p-6 max-w-5xl mx-auto">
        <PageHeader
          title="매수 결정"
          description="기업 심층 분석 + 5개 기준 채점으로 최종 매수 여부를 결정합니다."
        />

        {/* Phase 8 구현 예정 기능 명세 플레이스홀더 */}
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
