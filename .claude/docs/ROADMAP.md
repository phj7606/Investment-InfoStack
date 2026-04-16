# ROADMAP — Investment+ (1인 투자 하우스 시스템)

> **버전**: v3.2 | **작성일**: 2026.03.31 | **최종 수정**: 2026.04.14 | **상태**: Living Document
> PRD v3.2와 함께 관리. 새로운 기능/수정사항 추가 시 수시 반영.

---

## 전체 Phase 구조

```
[완료] Phase 0~3, 6          [이전] Phase 4~5          [신규] Phase 7~11
ETF 분석 플랫폼 구축     →   Sector Flow / 기업분석  →   Investment+ 3개 워크플로우
                              (Phase 7~8에 통합)
```

```
Phase 7           Phase 8            Phase 9             Phase 10           Phase 11
UI/UX Shell  →   ACTION 1      →   ACTION 2       →   ACTION 3       →   MCP 연동
앱 재구성         종목 탐색           추적 관찰            자동화 루틴           완성
~1주              ~4주               ~3주                ~3주               ~2주
```

---

## [완료] Phase 0 — 기반 구축 + 알고리즘 수정 ✅

> ✅ **2026.03.31 완료**

| ID | 태스크 | 상태 |
|----|--------|------|
| P0-01 | 레포 디렉토리 구조 | ✅ |
| P0-02 | Mansfield RS MA 252일 수정 | ✅ |
| P0-03 | 모멘텀 기간 63/126/252 수정 | ✅ |
| P0-04 | 한국 ETF 개별주식 6종 제거 | ✅ |
| P0-05 | 예외 처리 개선 | ✅ |
| P0-06 | 티커 JSON 파일 생성 | ✅ |
| P0-07 | Yahoo fetcher 구현 | ✅ |
| P0-08 | JSON 캐시 구현 | ✅ |
| P0-09 | Rolling Percentile 함수 | ✅ |

---

## [완료] Phase 1 — 핵심 지표 계산 ✅

> ✅ **2026.03.31 완료**

| ID | 태스크 | 상태 |
|----|--------|------|
| P1-01 | Mansfield RS — 한국 ETF | ✅ |
| P1-02 | Mansfield RS — 미국 ETF | ✅ |
| P1-03 | 변동성 조정 모멘텀 — 한국 | ✅ |
| P1-04 | 변동성 조정 모멘텀 — 미국 | ✅ |
| P1-05 | RS 랭킹 테이블 컴포넌트 | ✅ |
| P1-06 | 모멘텀 바 차트 컴포넌트 | ✅ |
| P1-07 | 단위 테스트 29개 | ✅ |

---

## [완료] Phase 2 — 스크리너 구현 ✅

> ✅ **2026.04.01 완료**

| ID | 태스크 | 상태 |
|----|--------|------|
| P2-01 | RS + 모멘텀 복합 필터 스크리너 | ✅ |
| P2-02 | 필터 UI (임계값/Top N/카테고리) | ✅ |
| P2-03 | MA 필터 옵션 (10/20/50일) | ✅ |
| P2-04 | CSV 내보내기 (UTF-8 BOM) | ✅ |
| P2-05 | 단위 테스트 42개 | ✅ |

---

## [완료] Phase 3 — 대시보드 통합 ✅

> ✅ **2026.04.01 완료**

| ID | 태스크 | 상태 |
|----|--------|------|
| P3-01 | 사이드바 네비게이션 | ✅ |
| P3-02 | 홈 화면 | ✅ |
| P3-03 | 한국 시장 화면 | ✅ |
| P3-04 | 미국 시장 화면 | ✅ |
| P3-05 | 스크리너 화면 | ✅ |
| P3-06 | 설정 화면 | ✅ |

---

## [완료] Phase 6 — 시장 분석 탭 ✅

> ✅ **2026.04.13 완료**

FRED API + Yahoo Finance 기반 7개 동기화 차트 (S&P500, NASDAQ, VIX, VVIX, SDEX, HY Spread, SOFR, 10Y Yield, MOVE Index). 날짜 범위 컨트롤, 레전드 토글. → **Phase 8 ACTION 1 Step 1에 통합**

---

## [이전 계획] Phase 4 — Sector Flow Oscillator

> Phase 8 ACTION 1 Step 2 (`/dashboard/screen`)에 흡수 통합. 독립 Phase 취소.

KOSPI 19개 업종 기관/외국인 수급 MACD 오실레이터 기능은 `/dashboard/screen` 종목 압축 탭의 "업종 수급 필터"로 편입.

---

## [이전 계획] Phase 5 — 기업 분석 모듈

> Phase 8 ACTION 1 Step 5 (`/dashboard/initiating-coverage`)에 흡수 통합. 독립 Phase 취소.

Claude API 기반 기업 심층 분석은 `/dashboard/initiating-coverage` 매수 결정 단계의 핵심 기능으로 편입.

---

## Phase 7 — UI/UX Shell (앱 전면 재구성) 🔄

**목표**: Investment+ 브랜딩 + 3개 Action 워크플로우 기반 사이드바/페이지 구조 완성. 데이터 없는 UI Shell로 전체 흐름 먼저 구축.

> **2026.04.14 기준**: 9/10 완료 (P7-08 redirect 미구현)

### 태스크 목록

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P7-01 | 앱 이름/브랜딩 변경 | `lib/constants.ts` — SITE_CONFIG.name "Investment+" 변경, 설명 업데이트 | 🔴 | ✅ |
| P7-02 | 사이드바 전면 재편 | `components/layout/dashboard-sidebar.tsx` — 4개 SidebarGroup (홈/ACTION 1·2·3/설정). ACTION 1은 Step 1~5 번호 표시. 각 Action별 컬러 테마(인디고/에메랄드/앰버) + 활성 메뉴 컬러 보더 | 🔴 | ✅ |
| P7-03 | 홈 페이지 재작성 | `/dashboard` — 3개 Action 워크플로우 카드(그라디언트 배경, 컬러별 Action 카드, hover 애니메이션) | 🔴 | ✅ |
| P7-04 | Step 진행 컴포넌트 | ACTION 1/2/3 공용 Step Nav 컴포넌트 (각각 인디고/에메랄드/앰버 테마). 완료 체크 아이콘 + 현재 Step 펄스 애니메이션. 이전/다음 Step 이동 지원 | 🔴 | ✅ |
| P7-05 | 신규 페이지 쉘 생성 | `/dashboard/sector`, `/screen`, `/earnings-analysis`, `/earnings-preview`, `/initiating-coverage` — ACTION 1 Step Nav 포함 | 🔴 | ✅ |
| P7-06 | 신규 페이지 쉘 생성 | `/dashboard/thesis`, `/catalysts`, `/earnings` — ACTION 2 Step Nav(`[1 Thesis관리]→[2 Catalyst캘린더]→[3 실적채점]`) 에메랄드 테마 포함 | 🔴 | ✅ |
| P7-07 | 신규 페이지 쉘 생성 | `/dashboard/morning-note`, `/weekly-review`, `/monthly-report`, `/automation` — ACTION 3 Step Nav(`[1 MorningNote]→[2 주간리뷰]→[3 월간보고서]→[4 자동화설정]`) 앰버 테마 포함 | 🔴 | ✅ |
| P7-08 | 기존 라우트 redirect | `kr-market`→`sector`, `us-market`→`sector`, `screener`→`screen`, `relative-strength`→`screen`, `company-analysis`→`initiating-coverage`, `portfolio`→`thesis` | 🔴 | ⬜ |
| P7-09 | 불필요 페이지 삭제 | `/dashboard/analytics`, `/dashboard/users` 삭제 | 🟡 | ✅ |
| P7-10 | 빌드 검증 | `npm run build` 타입 오류 없음 — 37개 페이지 빌드 완료 확인 | 🔴 | ✅ |

### 완료 기준
- [x] 사이드바에 ACTION 1·2·3 그룹 + Step 번호 표시 확인
- [x] 홈 페이지에 3개 Action 카드 표시
- [x] 신규 라우트 12개 접근 가능
- [ ] 기존 라우트 redirect 동작
- [x] `npm run build` 오류 없음

---

## Phase 8 — ACTION 1 · 종목 탐색 구현 ⬜

**목표**: 5단계 퍼널 전체 구현. 섹터 조감 → 종목 압축 → 실적 채점 → 체크포인트 → 매수 결정.

### Step 1 — 섹터 조감 (`/dashboard/sector`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P8-01 | 시장 환경 차트 이전 | Phase 6에서 구현한 7개 동기화 차트를 `/dashboard/sector` 시장 환경 탭으로 이전 | 🔴 | ✅ |
| P8-02 | 한국 섹터 탭 | 섹터별 대표 ETF(AUM 기준) 수익률 테이블 — 1M/3M/12M 수익률 + RS Percentile. `sector_group` 필드 추가 + `KrSectorTable` 컴포넌트 + `/api/sector/kr-returns` 엔드포인트 | 🟡 | ✅ |
| P8-03 | 미국 섹터 탭 | SPDR 섹터 ETF 11종 수익률 비교 바 차트 | 🟡 | ⬜ |
| P8-04 | AI 섹터 보고서 | equity-research 플러그인 `sector-overview` 스킬 기반. 자유 텍스트 섹터 입력(ETF 구분 무관) → sell-side 리포트 1차 탐색 + web_search 보조 → 증권사 컨센서스·Market Overview·Competitive·Valuation·Investment Implications 6섹션 보고서 스트리밍. 모든 reference 필수 명시. 구현: `lib/sector-report/prompts.ts` + `app/api/sector/ai-report/route.ts` + `components/charts/SectorReportClient.tsx` | 🟡 | ⬜ |

### Step 2 — 종목 압축 (`/dashboard/screen`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P8-05 | 기존 ETF 스크리너 이전 | Phase 2 스크리너를 `/dashboard/screen`으로 이전. 탭: 한국 ETF / 미국 ETF | 🔴 | ⬜ |
| P8-06 | RS 랭킹 테이블 이전 | Phase 1 RS 랭킹 테이블을 `/dashboard/screen` 내 RS 탭으로 통합 | 🔴 | ⬜ |
| P8-07 | 업종 수급 필터 탭 | Sector Flow Oscillator (기존 Phase 4 계획) — 업종 수급 MACD 기준 압축 탭 추가 | 🟡 | ⬜ |
| P8-07a | 개별주식 스크리너 구현 | /screen skill 기반 재무(ROE·영업이익률·부채비율) + 밸류에이션(PER·PBR·EV/EBITDA) 복합 필터 UI. 결과 테이블 + CSV 내보내기. PRD A2-04 구현 | 🟡 | ⬜ |

### Step 3 — 실적 채점 (`/dashboard/earnings-analysis`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P8-08 | 입력 UI | 티커/기업명 입력 + 거래소 선택 | 🔴 | ⬜ |
| P8-09 | Beat/Miss 분석 API | Claude API 기반 최근 분기 EPS/매출 컨센서스 대비 분석. 스트리밍 | 🔴 | ⬜ |
| P8-10 | KPI 트렌드 차트 | 매출성장률, 영업이익률, EPS 분기별 Recharts 라인 차트 | 🟡 | ⬜ |

### Step 4 — 체크포인트 (`/dashboard/earnings-preview`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P8-11 | 다음 실적 발표일 조회 | 티커 기반 다음 실적 발표 예정일 표시 | 🔴 | ⬜ |
| P8-12 | 채점 기준 5가지 생성 | Claude API — "다음 실적에서 확인할 5가지" 자동 생성 | 🔴 | ⬜ |
| P8-13 | 컨센서스 표시 | 현재 컨센서스 EPS/매출 가이던스 카드 | 🟡 | ⬜ |

### Step 5 — 매수 결정 (`/dashboard/initiating-coverage`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P8-14 | 기존 기업 분석 이전 | Phase 5에서 구현한 Claude API 분석 모듈을 `/dashboard/initiating-coverage`로 이전 | 🔴 | ⬜ |
| P8-15 | 매수 기준 자동 채점 | 가이드 문서 5개 기준 (Thesis/밸류에이션/모멘텀/리스크/유동성) 체크리스트 UI | 🔴 | ⬜ |
| P8-16 | Thesis 자동 생성 | 분석 결과 기반 표준 Thesis 초안 생성 — 핵심 가정 4개(성장 드라이버·수익성·Re-rating·Catalyst Timeline) + 베어 케이스 조건 2~3가지 + 손절 기준(-15%) 구조. /dashboard/thesis 페이지로 저장. PRD A5-04 구현 | 🟡 | ⬜ |
| P8-17 | LLM Q&A | 보고서 컨텍스트 기반 대화형 Q&A (기존 구현 재활용) | 🟡 | ⬜ |
| P8-18 | 보고서 저장 | Markdown 다운로드 + Google Drive 저장 (연동 후 활성화) | 🟡 | ⬜ |

### 완료 기준
- [ ] Step 1~5 모든 라우트 기능 동작
- [ ] Step 진행 표시 + 이전/다음 버튼 동작
- [ ] ETF 스크리너 `/dashboard/screen`에서 정상 작동
- [ ] Claude API 실적 분석 스트리밍 응답
- [ ] 매수 기준 5개 체크리스트 UI
- [ ] `npm run build` 오류 없음

---

## Phase 9 — ACTION 2 · 추적 관찰 구현 ⬜

**목표**: 보유 종목 Thesis 관리 + Catalyst 캘린더 + 실적 채점 구현.

### Thesis 관리 (`/dashboard/thesis`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P9-01 | Thesis 목록 UI | 보유 종목별 카드 그리드. 상태(Active/Review/Exit), 수익률, 핵심 가정 진행률 | 🔴 | ⬜ |
| P9-02 | Thesis 작성 폼 | 표준 템플릿 Sheet/Dialog — 종목명/티커, 매수가/목표가, 핵심 가정 4개, 베어 케이스, 손절 기준 | 🔴 | ⬜ |
| P9-03 | 핵심 가정 채점 | 가정별 Hit/Miss 토글. 2개 이상 Miss 시 자동 경고 배지 | 🔴 | ⬜ |
| P9-04 | localStorage 저장 | Thesis 데이터 브라우저 저장. CRUD 기능 | 🔴 | ⬜ |
| P9-05 | Notion 연동 | Thesis를 Notion Investment Thesis DB에 저장 (MCP 연동 후 활성화) | 🟡 | ⬜ |

### Catalyst 캘린더 (`/dashboard/catalysts`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P9-06 | 캘린더 뷰 UI | 월별 캘린더 컴포넌트. 이벤트 도트 표시 | 🔴 | ⬜ |
| P9-07 | 이벤트 등록 폼 | 종목명, 이벤트 유형(실적/IR/규제/제품), 예정일, 중요도(H/M/L) | 🔴 | ⬜ |
| P9-08 | 리스트 뷰 | 가까운 이벤트 순 타임라인 리스트 (7일/30일/90일 필터) | 🔴 | ⬜ |
| P9-09 | Google Calendar 연동 | 등록 이벤트 → Google Calendar MCP 자동 동기화 | 🟡 | ⬜ |
| P9-10 | 결과 기록 | 이벤트 후 결과 입력 + Thesis 영향도 평가 | 🟡 | ⬜ |

### 실적 채점 (`/dashboard/earnings`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P9-11 | 실적 입력 UI | 발표 EPS/매출 실제값 입력 + 컨센서스 자동 로드 | 🔴 | ⬜ |
| P9-12 | Beat/Miss 판정 | Claude API 기반 즉시 분석 + Thesis 가정 채점 | 🔴 | ⬜ |
| P9-13 | Thesis 상태 업데이트 | 채점 결과 반영 → Thesis 카드 자동 업데이트 | 🔴 | ⬜ |

### 완료 기준
- [ ] Thesis 목록 CRUD 동작 (localStorage)
- [ ] 핵심 가정 채점 + 경고 배지 동작
- [ ] Catalyst 캘린더 이벤트 등록/조회
- [ ] 실적 채점 → Thesis 상태 반영
- [ ] `npm run build` 오류 없음

---

## Phase 10 — ACTION 3 · 자동화 루틴 구현 ⬜

**목표**: Morning Note 자동 생성 + 주간/월간 리뷰 + 자동화 스케줄 설정.

### Morning Note (`/dashboard/morning-note`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P10-01 | Morning Note 생성 API | `app/api/morning-note/route.ts` — FRED+Yahoo 시장 데이터 + WebSearch 뉴스 + Claude API 종합. 스트리밍 | 🔴 | ⬜ |
| P10-02 | Morning Note 렌더링 UI | 3개 섹션 카드: 시장 동향 / 섹터 이슈 / 보유 종목 영향. Markdown 렌더링 | 🔴 | ⬜ |
| P10-03 | 수동 생성 버튼 | "오늘 Morning Note 생성" 버튼 + 로딩 상태 | 🔴 | ⬜ |
| P10-04 | 이력 조회 | 날짜별 Morning Note 목록. localStorage 저장 | 🟡 | ⬜ |
| P10-05 | Notion 저장 | Morning Notes DB 자동 저장 (MCP 연동 후 활성화) | 🟡 | ⬜ |
| P10-06 | Gmail 발송 | 요약 이메일 자동 발송 (MCP 연동 후 활성화) | 🟡 | ⬜ |

### 주간 리뷰 (`/dashboard/weekly-review`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P10-07 | 주간 성과 요약 UI | 보유 종목 주간 수익률 테이블 + 벤치마크 대비 알파 | 🟡 | ⬜ |
| P10-08 | Catalyst 결과 확인 | 지난 주 이벤트 체크리스트 — 완료/미완료 상태 표시 | 🟡 | ⬜ |
| P10-09 | Thesis 리뷰 알림 | 주간 변화로 재검토 필요한 종목 하이라이트 | 🟡 | ⬜ |

### 월간 보고서 (`/dashboard/monthly-report`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P10-10 | 월간 성과 집계 | 보유/매도 종목 월간 수익률 + KOSPI/S&P500 대비 알파 | 🟡 | ⬜ |
| P10-11 | Thesis 정확도 통계 | 핵심 가정 월간 Hit Rate 바 차트 | 🟡 | ⬜ |
| P10-12 | 교훈 기록 | 자유 텍스트 입력 + localStorage 저장 | 🟡 | ⬜ |

### 자동화 설정 (`/dashboard/automation`)

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P10-13 | 스케줄 설정 UI | Morning Note 생성 시각, 주간 리뷰 요일 설정 폼 | 🟡 | ⬜ |
| P10-14 | 조건 트리거 설정 | 손절 경고(-15%), 목표가 도달 알림 조건 설정 | 🟡 | ⬜ |
| P10-15 | MCP 연결 상태 표시 | Notion, Google Drive, Gmail, Calendar 연결 상태 카드 | 🟡 | ⬜ |

### 완료 기준
- [ ] Morning Note 수동 생성 + 스트리밍 렌더링
- [ ] Morning Note 이력 조회
- [ ] 주간 리뷰 성과 테이블
- [ ] 월간 Thesis 정확도 통계
- [ ] `npm run build` 오류 없음

---

## Phase 11 — MCP 연동 완성 ⬜

**목표**: Notion / Google Drive / Gmail / Google Calendar MCP 전체 연결. 자동화 파이프라인 활성화.

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P11-01 | Notion DB 스키마 생성 | Investment Thesis DB, Catalyst Calendar DB, Morning Notes DB, Performance DB 4개 생성 | 🔴 | ⬜ |
| P11-02 | Thesis → Notion 연동 | `/dashboard/thesis` CRUD ↔ Notion Investment Thesis DB 양방향 동기화 | 🔴 | ⬜ |
| P11-03 | Morning Note → Notion 연동 | 생성된 Morning Note 자동 저장 + 이력 조회 | 🔴 | ⬜ |
| P11-04 | Catalyst → Google Calendar | `/dashboard/catalysts` 이벤트 → Google Calendar 자동 동기화 | 🔴 | ⬜ |
| P11-05 | 실적 알림 → Gmail | T-7일, T-1일 실적 발표 전 자동 알림 발송 | 🟡 | ⬜ |
| P11-06 | Morning Note → Gmail | 매일 07:30 Morning Note 요약 이메일 자동 발송 | 🟡 | ⬜ |
| P11-07 | 보고서 → Google Drive | 월간 보고서 .md 자동 저장 | 🟡 | ⬜ |
| P11-08 | 07:30 자동 스케줄 | schedule skill 기반 Morning Note 자동 생성 트리거 등록 | 🟡 | ⬜ |
| P11-09 | 조건 기반 알림 | -15% 손절 경고, 목표가 도달 Gmail/Slack 알림 | 🟡 | ⬜ |

### 완료 기준
- [ ] 4개 Notion DB 연결 + CRUD 동작
- [ ] Catalyst 이벤트 Google Calendar 동기화
- [ ] Morning Note 자동 생성 + Notion 저장 + Gmail 발송 파이프라인
- [ ] 손절/목표가 알림 동작

---

## 미결 결정사항

| # | 항목 | 선택지 | 상태 |
|---|-----|--------|------|
| OQ-01 | 한국 ETF 최종 유니버스 | ~35종 현행 유지 / 추가 검토 | ⏳ |
| OQ-02 | RS 필터 임계값 | Rolling Percentile 50/70/80 | ⏳ |
| OQ-03 | 배포 환경 | 로컬 / Vercel / 자체 서버 | ⏳ |
| OQ-04 | Notion MCP 연동 시기 | Phase 9 동시 / Phase 11 별도 | ⏳ |
| OQ-05 | Morning Note 스케줄러 | schedule skill / Vercel Cron / GitHub Actions | ⏳ |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|-----|------|---------|
| v1.0 | 2026.03 | 최초 작성 |
| v2.0 | 2026.03.31 | ETF RS 플랫폼 Phase 0~3 구성 |
| v2.1 | 2026.04.08 | Phase 4 Sector Flow 추가 |
| v2.2 | 2026.04.12 | Phase 5 기업 분석 모듈 추가 |
| v2.7~2.9 | 2026.04.13 | Phase 6 시장 분석 탭 완료 |
| v3.0 | 2026.04.14 | **Investment+ 전면 재구성** — 3개 Action 워크플로우 기반 Phase 7~11 신규 추가. Phase 4·5 독립 취소 → Phase 8에 통합. 기존 Phase 0~3·6 완료 이력 보존 |
| v3.1 | 2026.04.14 | Phase 7 UI/UX Shell 9/10 완료 (P7-08 redirect 제외). Action 2/3 Step Nav 추가. 모던 UI 리디자인 완료 |
| v3.2 | 2026.04.14 | 가이드 문서 갭 반영: A2-04 P3→P2 상향(P8-07a 추가), P8-16 Thesis 생성 구조 구체화 |

---

*v3.2 | 2026.04.14 | Living Document*
