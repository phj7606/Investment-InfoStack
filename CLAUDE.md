# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 명령어

```bash
npm run dev      # 개발 서버 실행 (기본 포트 3000)
npm run build    # 프로덕션 빌드 + TypeScript 타입 검사
npm run start    # 프로덕션 서버 실행
npm run lint     # ESLint 실행
npx tsc --noEmit # TypeScript 타입 검사만 단독 실행
```

테스트 프레임워크는 현재 설정되어 있지 않다.

## 기술 스택

| 패키지 | 버전 | 용도 |
|--------|------|------|
| Next.js | 16.1.7 | 앱 프레임워크 (App Router) |
| React | 19.2.3 | UI 라이브러리 |
| TypeScript | ^5 | 타입 안전성 |
| Tailwind CSS | v4 | 유틸리티 CSS |
| shadcn/ui | ^4 | UI 컴포넌트 (Radix UI 기반) |
| next-themes | ^0.4 | 다크 모드 |
| react-hook-form | ^7 | 폼 상태 관리 |
| zod | ^4 | 스키마 유효성 검사 |
| recharts | ^2 | 차트 라이브러리 |
| sonner | ^2 | 토스트 알림 |
| lucide-react | ^0.577 | 아이콘 |
| usehooks-ts | ^3 | 범용 React 훅 |

## 아키텍처 개요

### 라우트 그룹 기반 레이아웃 분리

세 가지 레이아웃이 Next.js 라우트 그룹으로 완전히 분리되어 있다:

| 그룹 | 경로 | 레이아웃 구성 |
|------|------|--------------|
| `(marketing)` | `/` | Header + Footer (공개 랜딩) |
| `(auth)` | `/login`, `/register`, `/forgot-password` | 로고 + 중앙 카드 |
| `(dashboard)` | `/dashboard/**` | SidebarProvider + DashboardSidebar + 메인 |

대시보드 페이지: `/dashboard` (개요), `/dashboard/analytics` (분석), `/dashboard/users` (사용자), `/dashboard/settings` (설정)

> 스타터킷 특성상 대부분의 데이터는 하드코딩된 목업이며, 일부 페이지는 Skeleton UI로 플레이스홀더 구현되어 있다. 실제 API 연동 시 해당 부분을 교체한다.

### Provider 계층

`app/layout.tsx` (RSC) → `components/providers.tsx` ("use client") → `ThemeProvider` + `Toaster`

`providers.tsx`는 루트 레이아웃을 RSC로 유지하면서 클라이언트 전용 Provider를 격리하기 위해 존재한다. 새 클라이언트 전용 Provider는 이 파일에 추가한다.

### 컴포넌트 계층

```
components/
├── ui/          # shadcn/ui 컴포넌트 (직접 수정 가능, Radix UI 기반)
├── common/      # 여러 레이아웃에서 재사용되는 컴포넌트
│               # StatsCard, PageHeader, ThemeToggle, UserMenu, EmptyState, VisitorsChart
├── layout/      # 레이아웃 전용 구조 컴포넌트
│               # Header, Footer, DashboardSidebar, MobileNav
└── marketing/   # 마케팅 페이지 전용 섹션 컴포넌트
                # HeroSection, FeaturesSection, CtaSection, TechStackSection
```

## 주요 파일

| 파일 | 역할 |
|------|------|
| `lib/constants.ts` | 사이트 메타데이터, 내비게이션, 기능 목록 등 단일 진실 원천 |
| `lib/utils.ts` | `cn()` 유틸리티 — clsx + tailwind-merge 조합, 모든 조건부 클래스에 사용 |
| `types/index.ts` | 공통 타입 (`NavItem`, `SiteConfig`, `StatsCardData`, `Feature`) |

## 스타일링

Tailwind CSS v4 + shadcn/ui 조합. `globals.css`에서 CSS 변수로 디자인 토큰 정의 (`--background`, `--foreground`, `--primary` 등). 다크 모드는 `next-themes`가 `<html>`에 `.dark` 클래스를 주입하는 방식으로 동작한다.

## 패턴 및 규칙

### 폼 패턴

인증 폼은 `react-hook-form` + `zod` + `@hookform/resolvers` 조합을 사용한다. 스키마는 각 페이지 파일 내부에 정의되어 있다.

### 반응형 사이드바

`components/ui/sidebar.tsx`의 shadcn Sidebar 컴포넌트와 `hooks/use-mobile.ts`의 `useIsMobile()` (breakpoint: 768px)을 조합한다. 모바일에서는 Sheet 드로어로 전환된다.

### recharts 클라이언트 격리

recharts는 클래스 컴포넌트 기반이므로 React 19 RSC에서 직접 사용하면 호환성 오류가 발생한다. 반드시 `"use client"`가 선언된 별도 컴포넌트로 분리해야 한다. (`components/common/visitors-chart.tsx` 참고)

### next-themes suppressHydrationWarning

`app/layout.tsx`의 `<html>` 태그에 `suppressHydrationWarning`이 반드시 필요하다. next-themes가 서버/클라이언트 간 class 불일치를 유발하기 때문이다. 이 속성 없이는 hydration 경고가 발생한다.

### shadcn 컴포넌트 추가

`components.json` 설정을 기반으로 shadcn CLI를 사용한다:

```bash
npx shadcn@latest add [component-name]
```
