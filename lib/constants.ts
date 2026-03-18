// 애플리케이션 전체에서 사용하는 상수 정의
// 단일 진실 원천(Single Source of Truth)으로 관리

import type { SiteConfig, NavItem, Feature } from "@/types";

// 사이트 기본 메타데이터 설정
export const SITE_CONFIG: SiteConfig = {
  name: "StarterKit",
  description: "모든 웹 프로젝트의 시작점 — 검증된 컴포넌트와 레이아웃 모음",
  url: "https://starterkit.example.com",
  ogImage: "https://starterkit.example.com/og.png",
  links: {
    github: "https://github.com",
  },
};

// 마케팅/헤더 내비게이션 링크
export const NAV_ITEMS: NavItem[] = [
  { title: "기술 스택", href: "/#tech-stack" },
  { title: "대시보드", href: "/dashboard" },
];

// 대시보드 사이드바 내비게이션 — 아이콘은 컴포넌트에서 직접 import
export const DASHBOARD_NAV_ITEMS = [
  { title: "대시보드", href: "/dashboard", iconName: "LayoutDashboard" },
  { title: "분석", href: "/dashboard/analytics", iconName: "BarChart3" },
  { title: "사용자", href: "/dashboard/users", iconName: "Users" },
  { title: "설정", href: "/dashboard/settings", iconName: "Settings" },
] as const;

// 랜딩 페이지 기능 소개 섹션 데이터
export const FEATURES: Feature[] = [
  {
    title: "Atomic Design",
    description:
      "Layer 0~5의 계층적 컴포넌트 구조로 일관성 있는 UI 시스템을 구축합니다.",
  },
  {
    title: "다크 모드 지원",
    description:
      "next-themes로 시스템 설정 감지, localStorage 영속화, SSR 깜빡임 없는 테마 전환.",
  },
  {
    title: "타입 안전성",
    description:
      "TypeScript + Zod를 통해 런타임 유효성 검사와 컴파일 타임 타입 검사를 동시에 제공.",
  },
  {
    title: "반응형 레이아웃",
    description:
      "모바일 Sheet 드로어, 데스크탑 사이드바, 마케팅/인증/대시보드 레이아웃 완비.",
  },
  {
    title: "폼 & 검증",
    description:
      "react-hook-form + zod 조합으로 선언적이고 성능 최적화된 폼 처리.",
  },
  {
    title: "라이브러리 통합",
    description:
      "shadcn/ui, sonner, recharts 등 검증된 라이브러리를 바퀴 재발명 없이 통합.",
  },
];

// 기술 스택 배지 목록
export const TECH_STACK = [
  "Next.js 15",
  "React 19",
  "TypeScript",
  "Tailwind CSS v4",
  "shadcn/ui",
  "Radix UI",
  "next-themes",
  "react-hook-form",
  "Zod",
  "Recharts",
  "Sonner",
  "usehooks-ts",
  "Lucide React",
];
