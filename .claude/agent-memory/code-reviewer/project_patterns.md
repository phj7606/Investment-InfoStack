---
name: project_patterns
description: claude-starterkit 프로젝트의 핵심 아키텍처 패턴 및 관찰된 코딩 컨벤션
type: project
---

이 프로젝트는 Next.js 15 + React 19 기반 스타터킷이며 아래와 같은 패턴을 사용한다.

**Why:** 첫 번째 전체 코드 리뷰에서 파악한 구조적 사실들.
**How to apply:** 향후 리뷰나 기능 추가 시 일관성 판단 기준으로 활용.

## 확인된 패턴

- 라우트 그룹: (marketing), (auth), (dashboard) 완전 분리
- RSC 우선 설계: 불필요한 "use client" 최소화. 폼/훅/이벤트가 없으면 무조건 RSC
- 공통 타입은 types/index.ts, 상수는 lib/constants.ts 단일 진실 원천
- shadcn/ui 컴포넌트를 직접 수정(ui/ 폴더)하는 패턴 채택
- recharts는 "use client" 클라이언트 컴포넌트로 격리하여 RSC와 분리
- zod 스키마는 각 페이지 파일 내부에 인라인 정의 (공유 schema 파일 없음)
- ThemeToggle이 useIsClient()로 SSR 하이드레이션 레이아웃 시프트 방지
- 대시보드 사이드바 NAV_ITEMS 가 constants.ts 의 DASHBOARD_NAV_ITEMS 와 중복 정의됨 (알려진 이슈)
- EmptyState 컴포넌트의 action.href가 next/link 대신 <a> 태그 사용 (개선 필요)
- use-mobile.ts 훅이 코딩 컨벤션(한국어 주석, 2칸 들여쓰기)을 따르지 않음 (shadcn 자동 생성 파일)
- console.log가 인증 폼 onSubmit에 남아 있음 (프로덕션 전 제거 필요)
- footer.tsx의 링크 목록이 NAV_ITEMS/상수와 연동되지 않고 하드코딩됨
