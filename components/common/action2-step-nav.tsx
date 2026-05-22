"use client";

// ACTION 2 Step 네비게이션 래퍼
// 3단계 추적 관찰 워크플로우(Thesis 관리 → Catalyst 캘린더 → 실적 채점)
// 공용 StepNav에 에메랄드(ACTION 2) 테마와 3단계 정의를 전달한다.

import { StepNav } from "./step-nav";

interface Action2StepNavProps {
  currentStep: 1 | 2 | 3;
}

// 3단계 추적 관찰 정의 — 경로와 레이블을 중앙에서 관리
const STEPS = [
  { label: "Thesis 관리", href: "/dashboard/thesis" },
  { label: "Catalyst 캘린더", href: "/dashboard/catalysts" },
  { label: "실적 채점", href: "/dashboard/earnings" },
];

export function Action2StepNav({ currentStep }: Action2StepNavProps) {
  return (
    <StepNav steps={STEPS} currentStep={currentStep} actionTheme={2} />
  );
}
