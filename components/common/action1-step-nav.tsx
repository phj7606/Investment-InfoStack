"use client";

// ACTION 1 공용 Step 진행 표시 컴포넌트 (Phase 7 — UI 리디자인)
// 5단계 퍼널(섹터 조감 → 종목 압축 → 실적 채점 → 체크포인트 → 매수 결정)의
// 현재 위치를 시각화하고, 이전/다음 Step 이동 버튼을 제공
// 완료된 Step: 체크 아이콘 / 현재 Step: 인디고 강조 + 펄스 dot / 미래 Step: 비활성

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Action1StepNavProps {
  // 현재 활성 Step (1~5)
  currentStep: 1 | 2 | 3 | 4 | 5;
}

// 5단계 퍼널 정의 — 경로와 레이블을 함께 관리하여 Step 이동 로직과 UI를 일관되게 유지
const STEPS: { label: string; href: string }[] = [
  { label: "섹터 조감", href: "/dashboard/sector" },
  { label: "종목 압축", href: "/dashboard/screen" },
  { label: "실적 채점", href: "/dashboard/earnings-analysis" },
  { label: "체크포인트", href: "/dashboard/earnings-preview" },
  { label: "매수 결정", href: "/dashboard/initiating-coverage" },
];

export function Action1StepNav({ currentStep }: Action1StepNavProps) {
  const router = useRouter();

  // 0-indexed로 변환하여 배열 접근
  const currentIndex = currentStep - 1;
  const prevStep = currentIndex > 0 ? STEPS[currentIndex - 1] : null;
  const nextStep = currentIndex < STEPS.length - 1 ? STEPS[currentIndex + 1] : null;

  return (
    // 전체 바: 미묘한 배경 + 블러 + 하단 보더로 섹션 구분
    <div className="border-b bg-gradient-to-r from-indigo-50/80 via-background/95 to-background/95 dark:from-indigo-950/30 dark:via-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
      <div className="flex items-center justify-between px-6 py-2.5 max-w-5xl mx-auto">

        {/* ── 이전 Step 이동 버튼 — 첫 번째 Step이면 공간만 유지 ── */}
        <div className="w-20 shrink-0">
          {prevStep && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 h-7 px-2 text-xs font-medium transition-colors"
              onClick={() => router.push(prevStep.href)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              이전
            </Button>
          )}
        </div>

        {/* ── 5단계 진행 표시 바 ── */}
        <ol className="flex items-center">
          {STEPS.map((step, i) => {
            const stepNumber = i + 1;
            const isActive = stepNumber === currentStep;
            // 현재 Step 이전은 완료 상태로 처리
            const isCompleted = stepNumber < currentStep;
            // 미래 Step: 아직 접근 불가
            const isFuture = stepNumber > currentStep;

            return (
              <li key={step.href} className="flex items-center">
                {/* ── Step 버튼 ── */}
                <button
                  onClick={() => router.push(step.href)}
                  // 미래 Step은 클릭 불가 — 순서대로 진행해야 함
                  disabled={isFuture}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all duration-200",
                    // 현재 Step: 인디고 배경 강조
                    isActive && "bg-indigo-600 text-white shadow-md shadow-indigo-500/25",
                    // 완료 Step: 흐린 텍스트 + hover 강조 가능
                    isCompleted && "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50",
                    // 미래 Step: 완전 비활성 스타일
                    isFuture && "text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  {/* Step 원형 배지 — 완료 시 체크 아이콘, 현재 시 펄스 dot */}
                  <span className="relative flex items-center justify-center">
                    {isCompleted ? (
                      // 완료된 Step: 초록 체크 원형
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    ) : isActive ? (
                      // 현재 Step: 흰 배경 번호 + 바깥 펄스 링 애니메이션
                      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                        {/* 펄스 링 — 현재 Step임을 시각적으로 강조 */}
                        <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
                        <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-black">
                          {stepNumber}
                        </span>
                      </span>
                    ) : (
                      // 미래 Step: 연한 배경 번호
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/50 text-[10px] font-bold">
                        {stepNumber}
                      </span>
                    )}
                  </span>

                  {/* Step 레이블 — sm 이상에서만 표시 */}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>

                {/* Step 사이 연결선 — 진행 상태 반영 (완료 구간은 인디고, 미완료는 회색) */}
                {i < STEPS.length - 1 && (
                  <div className="mx-1 flex items-center">
                    <div className={cn(
                      "h-px w-4 transition-colors duration-300",
                      // 완료된 구간: 인디고 실선
                      i < currentIndex ? "bg-indigo-400 dark:bg-indigo-600" : "bg-border"
                    )} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* ── 다음 Step 이동 버튼 — 마지막 Step이면 공간만 유지 ── */}
        <div className="w-20 shrink-0 flex justify-end">
          {nextStep && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 h-7 px-2 text-xs font-medium transition-colors"
              onClick={() => router.push(nextStep.href)}
            >
              다음
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
