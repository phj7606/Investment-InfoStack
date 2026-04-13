# Development Guidelines — Investment InfoStack

## 프로젝트 개요

Next.js 16 App Router + TypeScript + Tailwind CSS v4 + shadcn/ui 기반 개인 투자 분석 플랫폼.
한국/미국 시장의 Fear & Greed Oscillator, Mansfield RS, 스크리너, 포트폴리오 관리를 통합 제공한다.
현재 모든 대시보드 페이지는 Skeleton/EmptyState 플레이스홀더 상태이며, 실제 API 연동이 진행 중이다.

---

## 디렉토리 구조

```
app/
├── (auth)/                    # 인증 레이아웃 그룹 (로그인/회원가입/비밀번호 찾기)
├── (dashboard)/
│   └── dashboard/
│       ├── page.tsx           # 시장 환경 개요 (대시보드 루트)
│       ├── kr-market/         # 한국 시장 (KOSPI/KOSDAQ F&G, SuperMA)
│       ├── us-market/         # 미국 시장 (S&P500/NASDAQ F&G)
│       ├── relative-strength/ # Mansfield RS, Sortino, ETR Comfort
│       ├── screener/          # 복합 조건 스크리너
│       ├── portfolio/         # 포트폴리오 관리
│       ├── analytics/         # 분석 (스타터킷 잔여)
│       ├── users/             # 사용자 (스타터킷 잔여)
│       └── settings/          # 설정
├── (marketing)/               # 랜딩 페이지 레이아웃 그룹
└── api/                       # Next.js Route Handlers (데이터 fetcher)

components/
├── ui/           # shadcn/ui 원본 컴포넌트 — npx shadcn@latest add로만 추가
├── common/       # 여러 레이아웃 공용: PageHeader, StatsCard, EmptyState, VisitorsChart, ThemeToggle, UserMenu
├── layout/       # 레이아웃 전용: DashboardSidebar, Header, Footer, MobileNav
└── marketing/    # 랜딩 페이지 전용 섹션 컴포넌트

lib/
├── constants.ts  # 사이트 메타데이터, 내비게이션, FEATURES, COVERAGE_ITEMS — 단일 진실 원천
└── utils.ts      # cn() 유틸리티만 존재

types/
└── index.ts      # 모든 공통 타입 및 투자 도메인 타입 정의
```

---

## 라우트 맵

| 경로 | 파일 | 모듈 |
|------|------|------|
| `/` | `app/(marketing)/page.tsx` | 랜딩 페이지 |
| `/login` | `app/(auth)/login/page.tsx` | 로그인 |
| `/register` | `app/(auth)/register/page.tsx` | 회원가입 |
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` | 시장 환경 개요 |
| `/dashboard/kr-market` | `…/kr-market/page.tsx` | 한국 시장 |
| `/dashboard/us-market` | `…/us-market/page.tsx` | 미국 시장 |
| `/dashboard/relative-strength` | `…/relative-strength/page.tsx` | 상대강도 |
| `/dashboard/screener` | `…/screener/page.tsx` | 종목 스크리너 |
| `/dashboard/portfolio` | `…/portfolio/page.tsx` | 포트폴리오 |
| `/dashboard/settings` | `…/settings/page.tsx` | 설정 |

---

## 파일 연동 규칙 (다중 파일 동시 수정)

### 규칙 1 — 새 대시보드 페이지 추가 시
아래 두 파일을 **반드시 동시에** 수정한다:
1. `app/(dashboard)/dashboard/[route]/page.tsx` 생성
2. `components/layout/dashboard-sidebar.tsx` → `NAV_ITEMS` 배열에 항목 추가

### 규칙 2 — 사이트명/내비게이션/기능 목록 변경 시
`lib/constants.ts` **한 파일만** 수정한다. 다른 파일에 직접 텍스트를 하드코딩하지 않는다.
- `SITE_CONFIG` — 사이트 메타데이터
- `NAV_ITEMS` — 마케팅 헤더 내비게이션
- `FOOTER_NAV_ITEMS` — 푸터 내비게이션
- `FEATURES` — 랜딩 기능 소개
- `COVERAGE_ITEMS` — 커버리지 배지 목록

### 규칙 3 — 새 투자 도메인 타입 추가 시
`types/index.ts` **한 파일만** 수정한다. 페이지/컴포넌트 파일 내부에 인라인으로 타입을 정의하지 않는다.

현재 정의된 도메인 타입:
- `MarketRegime` — extreme_fear / fear / neutral / greed / extreme_greed
- `FearGreedData` — F&G 지수 스냅샷 (value, regime, change, updatedAt)
- `TickerData` — 개별 가격 스냅샷 (symbol, name, price, changePercent, volume, updatedAt)
- `SectorData` — Mansfield RS 데이터 (name, symbol, mansFieldRS, momentum4w, momentum52w, rank)
- `PortfolioPosition` — 보유 종목 (symbol, name, quantity, avgCost, currentPrice, returnPercent, weight, hasExitSignal)
- `MarketRegion` — "KR" | "US" | "GLOBAL"

### 규칙 4 — 사이드바 활성화 로직
`dashboard-sidebar.tsx`의 isActive 판정 규칙을 유지한다:
- `/dashboard` 루트 → `pathname === "/dashboard"` (정확히 일치)
- 나머지 서브 페이지 → `pathname.startsWith(item.href)`

---

## 컴포넌트 사용 규칙

### 대시보드 페이지 레이아웃 패턴
모든 대시보드 페이지는 아래 순서를 따른다:
1. `<PageHeader title="..." description="..." />` — 페이지 상단 제목 영역
2. 상단 지표 그리드 — `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` (StatsCard 또는 Skeleton)
3. 하단 차트/테이블 — `<Card>` 기반으로 구성

### 미구현 영역 처리
- 데이터 미연동 차트/테이블 자리 → `<EmptyState>` 컴포넌트 사용
- 로딩/플레이스홀더 → `<Skeleton>` 컴포넌트 사용
- EmptyState 없이 빈 공간을 그대로 두지 않는다

### recharts 차트 컴포넌트
- recharts를 사용하는 컴포넌트는 **반드시** `"use client"` 선언 + `components/common/` 내 별도 파일로 분리
- RSC 내에서 recharts를 직접 import하지 않는다
- 참고: `components/common/visitors-chart.tsx`

### RSC vs Client Component 판단
- 기본값: RSC (Server Component)
- `"use client"` 선언 조건: usePathname, useState, useEffect, 이벤트 핸들러, recharts 사용 시
- `components/layout/dashboard-sidebar.tsx`는 usePathname 때문에 "use client"

### shadcn/ui 컴포넌트 추가
```bash
npx shadcn@latest add [component-name]
```
- `components/ui/` 파일을 직접 편집해도 된다 (shadcn 정책)
- 컴포넌트 설정: `components.json` 참조

### cn() 유틸리티
- 조건부 클래스 결합은 항상 `cn()` 사용 (`lib/utils.ts`)
- 직접 문자열 연결(`"class1 " + condition ? "class2" : ""`)하지 않는다

---

## API Route 구현 규칙

### 데이터 Fetcher 위치
- 모든 외부 API 호출은 `app/api/` 하위 Route Handler로 격리
- 시장별 분리 구조 권장:
  ```
  app/api/
  ├── market/
  │   ├── kr/route.ts    # KOSPI/KOSDAQ 데이터
  │   └── us/route.ts    # S&P500/NASDAQ 데이터
  ├── indicators/
  │   ├── fg/route.ts    # Fear & Greed Oscillator
  │   └── rs/route.ts    # Mansfield RS
  └── portfolio/route.ts
  ```
- 페이지 컴포넌트에서 `fetch("/api/...")` 패턴으로 호출

### 응답 타입
- API 응답은 `types/index.ts`의 도메인 타입을 기반으로 직렬화
- 새 API 응답 구조 추가 시 → `types/index.ts`에 타입 먼저 정의 후 Route Handler 구현

---

## 코드 작성 규칙

### 언어 및 주석
- 코드 주석: **한국어** (why 중심, 로직 배경/이유 설명)
- 변수명/함수명: **영어** (camelCase)
- 컴포넌트명: **영어** (PascalCase)
- JSX 각 주요 블록에 역할 설명 주석 작성

### 들여쓰기 및 포맷
- 들여쓰기: **2칸**
- TypeScript strict 모드 준수

### 스타일링
- Tailwind CSS v4 유틸리티 클래스 사용
- CSS 변수 토큰: `globals.css`에서 `--background`, `--foreground`, `--primary` 등으로 정의됨
- 다크 모드: `next-themes`가 `<html>`에 `.dark` 클래스 주입 방식

### 폼 패턴
- 인증 폼: `react-hook-form` + `zod` + `@hookform/resolvers` 조합
- 스키마는 해당 페이지 파일 내부에 정의

---

## AI 의사결정 기준

### 새 분석 페이지 추가 요청 시
1. `types/index.ts`에 필요한 도메인 타입 추가
2. `app/(dashboard)/dashboard/[route]/page.tsx` 생성 (PageHeader + Skeleton 패턴)
3. `components/layout/dashboard-sidebar.tsx` NAV_ITEMS에 항목 추가
4. 차트가 필요하면 `components/common/[name]-chart.tsx` 생성 ("use client")

### 텍스트/문구 변경 요청 시
- 랜딩 페이지 기능 소개 → `lib/constants.ts` FEATURES 수정
- 내비게이션 링크 → `lib/constants.ts` NAV_ITEMS / FOOTER_NAV_ITEMS 수정
- 사이트명 → `lib/constants.ts` SITE_CONFIG.name 수정

### 타입 오류 발생 시
- `types/index.ts` 먼저 확인 후 필요 타입 추가/수정
- 인라인 타입 선언으로 임시 해결하지 않는다

---

## 금지 사항

- **`lib/constants.ts` 외 파일에 내비게이션/기능 목록 하드코딩 금지**
- **`types/index.ts` 외 파일에 도메인 인터페이스 인라인 정의 금지**
- **RSC에서 recharts 직접 import 금지** (hydration 오류 발생)
- **`"use client"` 없는 컴포넌트에서 usePathname/useState/useEffect 사용 금지**
- **대시보드 페이지에 EmptyState/Skeleton 없이 빈 영역 방치 금지**
- **shadcn/ui 컴포넌트를 `components/ui/` 외부에 복사하여 별도 관리 금지**
- **`cn()` 없이 조건부 className 문자열 연결 금지**
- **Python/Streamlit/pandas 관련 코드 이 프로젝트에 추가 금지** (Next.js/TypeScript 스택 전용)
- **`app/layout.tsx`의 `suppressHydrationWarning` 제거 금지** (next-themes hydration 경고 방지에 필수)
