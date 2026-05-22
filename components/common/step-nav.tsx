"use client";

/**
 * 공용 Step 진행 표시 컴포넌트
 *
 * Action 1(인디고 4단계)과 Action 2(에메랄드 3단계) 양쪽에서 사용.
 * 각 ACTION 페이지는 action1-step-nav / action2-step-nav 래퍼를 통해 이 컴포넌트를 호출한다.
 * 색상 팔레트는 lib/theme/colors.ts의 ACTION_THEME에서 중앙 관리.
 */

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACTION_THEME } from "@/lib/theme/colors";

export interface StepDef {
  label: string;
  href: string;
}

interface StepNavProps {
  steps: StepDef[];
  /** 1-indexed 현재 Step 번호 */
  currentStep: number;
  /** ACTION_THEME 키 (1=인디고, 2=에메랄드, 3=앰버) */
  actionTheme: 1 | 2 | 3;
}

export function StepNav({ steps, currentStep, actionTheme }: StepNavProps) {
  const router = useRouter();
  const theme = ACTION_THEME[actionTheme];

  // 0-indexed 변환
  const currentIndex = currentStep - 1;
  const prevStep = currentIndex > 0 ? steps[currentIndex - 1] : null;
  const nextStep = currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;

  // ACTION별 그라디언트 배경 — 테마 색상으로 ACTION을 시각적으로 구분
  const gradientClass: Record<1 | 2 | 3, string> = {
    1: "from-indigo-50/80 via-background/95 dark:from-indigo-950/30 dark:via-background/95",
    2: "from-emerald-50/80 via-background/95 dark:from-emerald-950/20 dark:via-background/95",
    3: "from-amber-50/80 via-background/95 dark:from-amber-950/20 dark:via-background/95",
  };

  // 이전/다음 버튼 hover 클래스 — 테마 색상 텍스트/배경
  const navBtnHoverClass: Record<1 | 2 | 3, string> = {
    1: "hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50",
    2: "hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30",
    3: "hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30",
  };

  // 완료된 Step 연결선 색상
  const connectorClass: Record<1 | 2 | 3, string> = {
    1: "bg-indigo-400 dark:bg-indigo-600",
    2: "bg-emerald-400",
    3: "bg-amber-400",
  };

  return (
    <div
      className={cn(
        "border-b bg-gradient-to-r to-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm",
        gradientClass[actionTheme]
      )}
    >
      <div className="flex items-center justify-between px-6 py-2.5 max-w-5xl mx-auto">

        {/* ── 이전 Step 버튼 — 첫 번째 Step이면 공간만 유지 ── */}
        <div className="w-20 shrink-0">
          {prevStep && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "gap-1 text-muted-foreground h-7 px-2 text-xs font-medium transition-colors",
                navBtnHoverClass[actionTheme]
              )}
              onClick={() => router.push(prevStep.href)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              이전
            </Button>
          )}
        </div>

        {/* ── Step 목록 ── */}
        <ol className="flex items-center">
          {steps.map((step, i) => {
            const stepNumber = i + 1;
            const isActive = stepNumber === currentStep;
            const isCompleted = stepNumber < currentStep;
            const isFuture = stepNumber > currentStep;

            return (
              <li key={step.href} className="flex items-center">
                {/* Step 버튼 */}
                <button
                  onClick={() => router.push(step.href)}
                  disabled={isFuture}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all duration-200",
                    // 현재 Step: ACTION 색상 배경으로 강조
                    isActive && theme.stepActive,
                    // 완료 Step: 연한 텍스트 + hover 가능
                    isCompleted && theme.stepCompleted,
                    // 미래 Step: 비활성 + 클릭 불가
                    isFuture && "text-muted-foreground/40 cursor-not-allowed"
                  )}
                >
                  {/* Step 배지 — 완료: 초록 체크, 현재: 펄스 dot, 미래: 회색 번호 */}
                  <span className="relative flex items-center justify-center">
                    {isCompleted ? (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    ) : isActive ? (
                      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
                        {/* 현재 Step 표시용 펄스 링 애니메이션 */}
                        <span className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
                        <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-black">
                          {stepNumber}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/50 text-[10px] font-bold">
                        {stepNumber}
                      </span>
                    )}
                  </span>

                  {/* 레이블 — sm 이상에서만 표시 (모바일 공간 절약) */}
                  <span className="hidden sm:inline">{step.label}</span>
                </button>

                {/* Step 간 연결선 — 완료 구간은 ACTION 색상, 미완료는 회색 */}
                {i < steps.length - 1 && (
                  <div className="mx-1 flex items-center">
                    <div
                      className={cn(
                        "h-px w-4 transition-colors duration-300",
                        i < currentIndex
                          ? connectorClass[actionTheme]
                          : "bg-border"
                      )}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* ── 다음 Step 버튼 — 마지막 Step이면 공간만 유지 ── */}
        <div className="w-20 shrink-0 flex justify-end">
          {nextStep && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "gap-1 text-muted-foreground h-7 px-2 text-xs font-medium transition-colors",
                navBtnHoverClass[actionTheme]
              )}
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
