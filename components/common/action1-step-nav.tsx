"use client";

// ACTION 1 Step 네비게이션 래퍼
// 4단계 퍼널(섹터 조감 → 종목 분석 → 체크포인트 → 매수 결정)
// 공용 StepNav에 인디고(ACTION 1) 테마와 4단계 정의를 전달한다.

import { StepNav } from "./step-nav";

interface Action1StepNavProps {
  currentStep: 1 | 2 | 3 | 4;
}

// 4단계 퍼널 정의 — 경로와 레이블을 중앙에서 관리
const STEPS = [
  { label: "섹터 조감", href: "/dashboard/sector" },
  { label: "종목 분석", href: "/dashboard/screen" },
  { label: "체크포인트", href: "/dashboard/earnings-preview" },
  { label: "매수 결정", href: "/dashboard/initiating-coverage" },
];

export function Action1StepNav({ currentStep }: Action1StepNavProps) {
  return (
    <StepNav steps={STEPS} currentStep={currentStep} actionTheme={1} />
  );
}
