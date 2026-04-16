"use client";

// ACTION 3 공용 Step 진행 표시 컴포넌트
// 4단계 자동화 루틴 워크플로우(Morning Note → 주간 리뷰 → 월간 보고서 → 자동화 설정)의
// 현재 위치를 시각화하고 이전/다음 Step 이동 버튼 제공
// Action 1(인디고), Action 2(에메랄드)와 구분되는 앰버 컬러 테마 사용

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Action3StepNavProps {
  // 현재 활성 Step (1~4)
  currentStep: 1 | 2 | 3 | 4;
}

// 4단계 자동화 루틴 정의 — 경로와 레이블을 함께 관리
const STEPS: { label: string; href: string }[] = [
  { label: "Morning Note", href: "/dashboard/morning-note" },
  { label: "주간 리뷰", href: "/dashboard/weekly-review" },
  { label: "월간 보고서", href: "/dashboard/monthly-report" },
  { label: "자동화 설정", href: "/dashboard/automation" },
];

export function Action3StepNav({ currentStep }: Action3StepNavProps) {
  const router = useRouter();

  // 0-indexed로 변환하여 배열 접근
  const currentIndex = currentStep - 1;
  const prevStep = currentIndex > 0 ? STEPS[currentIndex - 1] : null;
  const nextStep =
    currentIndex < STEPS.length - 1 ? STEPS[currentIndex + 1] : null;

  return (
    // 앰버 그라디언트 힌트 배경으로 Action 1/2와 시각적 구분
    <div className="border-b bg-gradient-to-r from-amber-50/80 via-background/95 to-background/95 dark:from-amber-950/20 dark:via-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center justify-between px-6 py-3 max-w-5xl mx-auto">
        {/* 이전 Step 이동 버튼 — 첫 번째 Step이면 공간 유지용 빈 div */}
        <div className="w-28">
          {prevStep && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => router.push(prevStep.href)}
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
          )}
        </div>

        {/* 4단계 진행 표시 — 앰버 테마 */}
        <ol className="flex items-center gap-1 sm:gap-2">
          {STEPS.map((step, i) => {
            const stepNumber = i + 1;
            const isActive = stepNumber === currentStep;
            // 현재 Step 이전은 완료 상태
            const isCompleted = stepNumber < currentStep;

            return (
              <li key={step.href} className="flex items-center gap-1 sm:gap-2">
                {/* Step 버튼 */}
                <button
                  onClick={() => router.push(step.href)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-all duration-200",
                    isActive &&
                      "bg-amber-500 text-white shadow-sm shadow-amber-500/30",
                    isCompleted &&
                      "text-amber-600 dark:text-amber-400 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30",
                    !isActive &&
                      !isCompleted &&
                      "text-muted-foreground/60 cursor-default"
                  )}
                  // 미래 Step은 클릭 불가 — 순서대로 진행
                  disabled={!isActive && !isCompleted}
                >
                  {/* 완료 Step은 체크 아이콘, 현재 Step은 번호 + 펄스 효과 */}
                  <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
                    {isCompleted ? (
                      // 완료: 앰버 원형 체크 아이콘
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500">
                        <Check className="h-2.5 w-2.5 text-white stroke-[3]" />
                      </span>
                    ) : isActive ? (
                      // 현재: 흰 배경 번호 + 외부 펄스 링
                      <>
                        <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-ping" />
                        <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-black text-amber-600">
                          {stepNumber}
                        </span>
                      </>
                    ) : (
                      // 미래: 회색 배경 번호
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground/60">
                        {stepNumber}
                      </span>
                    )}
                  </span>
                  {/* 레이블은 sm 이상에서만 표시 */}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>

                {/* Step 사이 연결선 — 완료 구간은 앰버, 미완료는 회색 */}
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      "hidden sm:block h-px w-4 transition-colors duration-300",
                      isCompleted ? "bg-amber-400" : "bg-border"
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* 다음 Step 이동 버튼 — 마지막 Step이면 공간 유지용 빈 div */}
        <div className="w-28 flex justify-end">
          {nextStep && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => router.push(nextStep.href)}
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
