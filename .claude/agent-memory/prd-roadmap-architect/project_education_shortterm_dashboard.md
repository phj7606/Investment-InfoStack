---
name: Phase 9 교육 계좌 대시보드 + 단중기 계좌 인프라 (2026.05.20)
description: /dashboard/portfolio/education 교육 계좌 대시보드 P9-27~P9-29 완료. 단중기 계좌 인프라(P9-30) 준비. PRD v4.9 / ROADMAP v5.1 반영
type: project
---

Phase 9에 교육 계좌 대시보드(`/dashboard/portfolio/education`) + PositionRiskTable + 공유 다이얼로그 + 단중기 계좌 인프라가 추가됨. PRD v4.9 / ROADMAP v5.1에 반영.

**구현 파일 (P9-27 교육 계좌 대시보드):**
- `app/(dashboard)/dashboard/portfolio/education/page.tsx` — 교육 계좌 페이지
- `app/api/portfolio/education/positions/route.ts` — 포지션 GET/POST
- `app/api/portfolio/education/positions/sell/route.ts` — 매도 처리
- `app/api/portfolio/education/trades/route.ts` — 거래내역 CRUD
- `app/api/portfolio/education/backup/route.ts` — JSON 백업/복원
- `components/portfolio/education/EducationAccountDashboardClient.tsx` — 3탭 대시보드
- `components/portfolio/education/AddPositionDialog.tsx` — 포지션 추가
- `components/portfolio/education/SellPositionDialog.tsx` — 매도 다이얼로그
- `components/portfolio/education/AddTradeDialog.tsx` — 거래 추가
- `data/education-account.json` — 파일 기반 저장소
- `lib/portfolio/educationData.ts` — 데이터 접근 라이브러리

**구현 파일 (P9-28 PositionRiskTable):**
- `components/portfolio/PositionRiskTable.tsx` — 리스크 계산 테이블
- `app/api/portfolio/risk/prices/route.ts` — 현재가 조회 API
- 계산 항목: 손절가(bidPrice × (1-cutoff)) / 주당리스크(bidPrice × cutoff) / nR 수량(min(nR손실한도, 1회투자한도)) / 투자금 / 계좌손절비중

**구현 파일 (P9-29 공유 다이얼로그):**
- `components/portfolio/shared/EditPositionDialog.tsx` — Education/Shortterm 공통 포지션 편집
- `components/portfolio/shared/EditTradeDialog.tsx` — Education/Shortterm 공통 거래 편집

**구현 파일 (P9-30 단중기 계좌 인프라 — 페이지 미구현):**
- `app/api/portfolio/shortterm/` — API 라우트 4개 (positions/sell/trades/backup)
- `components/portfolio/shortterm/ShorttermAccountDashboardClient.tsx` — 대시보드 컴포넌트
- `data/shortterm-account.json` — 파일 기반 저장소
- `lib/portfolio/shorttermData.ts` — 데이터 접근 라이브러리
- **페이지(`/dashboard/portfolio/shortterm`)는 아직 미구현**

**사이드바 업데이트:**
- `components/layout/dashboard-sidebar.tsx` — "Short-term Account"(`/dashboard/portfolio/trend`) + "Education Account"(`/dashboard/portfolio/education`) 메뉴 추가

**신규 타입 (`types/portfolio.ts`):**
- `EducationPosition`, `EducationTrade`, `PerformanceSummary`, `DEFAULT_RISK_CONFIG`

**PRD 기능 ID 체계 (D2-xx 교육 계좌, D3-xx 단중기 계좌):**
- D2-01: 포지션 관리 (추가/매도/편집, 현재가 자동 조회)
- D2-02: 거래내역 관리 (추가/편집, 성과 요약 상단)
- D2-03: 리스크 관리 탭 (RiskManagementPanel + PositionRiskTable)
- D2-04: 백업/복원 (JSON 다운로드 + overwrite/merge 복원)
- D3-01: 단중기 계좌 인프라 (API+컴포넌트+데이터, 페이지 미구현)

**ROADMAP 태스크 ID: P9-27~P9-30**

**Why:** 투자 학습용 교육 계좌를 별도 대시보드로 관리. 리스크 관리 패널에서 PositionRiskTable로 포지션별 손절가·nR 수량을 자동 계산하여 포지션 사이징 의사결정 지원. 공유 다이얼로그는 교육/단중기 계좌에서 재사용하여 코드 중복 방지.
**How to apply:** 교육 계좌(education)와 단중기 계좌(shortterm)는 동일 파일 기반 3탭 구조(포지션/거래내역/리스크 관리). PositionRiskTable은 두 계좌 공통 재사용 컴포넌트. 단중기 계좌 페이지 구현 시 P9-30 상태를 ✅로 업데이트 필요.
