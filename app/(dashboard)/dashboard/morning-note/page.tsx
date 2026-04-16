// ACTION 3 — Morning Note 페이지 쉘 (Phase 7)
// FRED + Yahoo Finance + Claude API 기반 매일 아침 시장 요약 자동 생성 (Phase 10 구현 예정)

import { PageHeader } from "@/components/common/page-header";
import { Action3StepNav } from "@/components/common/action3-step-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Bot, LayoutList, PlayCircle, History, Cloud, Mail } from "lucide-react";

// Morning Note 구현 예정 기능 명세 (Phase 10 작업 대상)
const PLANNED_FEATURES = [
  {
    icon: Bot,
    title: "Morning Note 생성 API",
    description:
      "FRED + Yahoo Finance 시장 데이터 + WebSearch 뉴스 + Claude API 종합 분석. 스트리밍 응답",
  },
  {
    icon: LayoutList,
    title: "3섹션 렌더링 UI",
    description:
      "시장 동향 / 섹터 이슈 / 보유 종목 영향 — 3개 카드 섹션으로 Markdown 렌더링",
  },
  {
    icon: PlayCircle,
    title: "수동 생성 버튼",
    description: '"오늘 Morning Note 생성" 버튼 + 스트리밍 로딩 상태 표시',
  },
  {
    icon: History,
    title: "이력 조회",
    description: "날짜별 Morning Note 목록 — localStorage 저장 + 과거 노트 열람",
  },
  {
    icon: Cloud,
    title: "Notion 저장",
    description: "Morning Notes DB 자동 저장 (Phase 11 MCP 연동 후 활성화)",
  },
  {
    icon: Mail,
    title: "Gmail 발송",
    description: "매일 07:30 Morning Note 요약 이메일 자동 발송 (Phase 11 활성화)",
  },
];

export default function MorningNotePage() {
  return (
    <div>
      {/* ACTION 3 Step 진행 표시 바 */}
      <Action3StepNav currentStep={1} />
      <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Morning Note"
        description="매일 아침 시장 동향과 보유 종목 영향을 자동으로 분석합니다."
      />

      {/* Phase 10 구현 예정 기능 명세 플레이스홀더 */}
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
