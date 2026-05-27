/**
 * 공용 색상 유틸리티
 *
 * 수익률·손익 색상을 프로젝트 전역에서 일관되게 적용하기 위해 중앙화.
 * 전 화면 통일: 수익=초록(emerald-600), 손실=빨강(red-500) + 다크 모드 대응
 */

/**
 * 수익률/손익 부호에 따른 Tailwind 텍스트 색상 클래스 반환.
 *
 * @param value  표시할 숫자 (양수=수익, 음수=손실, 0=보합)
 */
export function getPLColor(value: number): string {
  if (value === 0) return "text-muted-foreground";
  return value > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-500 dark:text-red-400";
}

/**
 * ACTION 1/2/3 배지·스텝 네비게이션의 색상 팔레트.
 * 사이드바, 스텝 네비, 대시보드 페이지에서 공통 사용.
 * ACTION 색상을 변경하거나 새 ACTION을 추가할 때 이 객체만 수정하면 된다.
 */
export const ACTION_THEME = {
  1: {
    /** 배지 배경 + 텍스트 + 테두리 링 */
    badge:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-inset ring-indigo-500/20",
    /** 활성 스텝 버튼 */
    stepActive:
      "bg-indigo-600 text-white shadow-md shadow-indigo-500/25",
    /** 완료된 스텝 버튼 */
    stepCompleted:
      "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50",
    /** 진행 바 */
    progress: "bg-indigo-500",
    /** 텍스트 강조 */
    text: "text-indigo-600 dark:text-indigo-400",
    /** 사이드바 활성 링크 — 왼쪽 보더 + 배경 틴트 */
    activeLink:
      "border-l-2 border-indigo-500 !text-indigo-600 dark:!text-indigo-400 !bg-indigo-500/8",
    /** 사이드바 메뉴 아이콘 배지 (활성) */
    iconBadgeActive: "bg-indigo-500 text-white",
    /** 사이드바 메뉴 아이콘 배지 (비활성) */
    iconBadgeInactive: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  },
  2: {
    badge:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
    stepActive:
      "bg-emerald-600 text-white shadow-md shadow-emerald-500/25",
    stepCompleted:
      "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50",
    progress: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    activeLink:
      "border-l-2 border-emerald-500 !text-emerald-600 dark:!text-emerald-400 !bg-emerald-500/8",
    iconBadgeActive: "bg-emerald-500 text-white",
    iconBadgeInactive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  3: {
    badge:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20",
    stepActive:
      "bg-amber-600 text-white shadow-md shadow-amber-500/25",
    stepCompleted:
      "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50",
    progress: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    activeLink:
      "border-l-2 border-amber-500 !text-amber-600 dark:!text-amber-400 !bg-amber-500/8",
    iconBadgeActive: "bg-amber-500 text-white",
    iconBadgeInactive: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
} as const;
