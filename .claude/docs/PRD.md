# PRD — Investment+ (1인 투자 하우스 시스템)

> **버전**: v3.2 | **작성일**: 2026.03.31 | **최종 수정**: 2026.04.14 | **상태**: Living Document

---

## 1. 프로젝트 개요

### 1.1 목적
개인 투자자가 데이터와 논리에 기반한 투자 의사결정을 체계적으로 수행할 수 있도록 설계된 **AI 기반 1인 투자 하우스 시스템**.

- **종목탐색 → 분석 → 투자결정 → 추적관찰** 전 과정 체계화·자동화
- Claude Code, Skills, MCP 연동을 통한 기관급 리서치 역량 확보
- 매일 아침 5분 브리핑부터 심층 종목 분석(30페이지 보고서)까지 전 단계 커버
- 투자 의사결정 기준 데이터화, 매수/매도 후 thesis 검증 자동 추적
- Notion/Google Drive 기반 지식베이스로 투자 인사이트 복리 축적

### 1.2 핵심 가치 제안

| 문제 | 해결책 | 적용 도구 |
|-----|--------|---------|
| 정보 비대칭 | 실시간 웹서치 + 딥리서치 자동화 | WebSearch MCP + equity-research skills |
| 분석 역량 부족 | AI 기반 섹터/종목 분석 자동화 | /sector, /screen, /initiating-coverage |
| 의사결정 체계 부재 | 투자 thesis 템플릿 + 기준 매트릭스 | /thesis skill + 의사결정 프레임워크 |
| 추적 실패 | Catalyst 캘린더 + 실적 자동 분석 | /catalysts, /earnings, /earnings-preview |
| 지식 비축적 | Notion 지식베이스 + 자동화 파이프라인 | Notion MCP + 자동화 파이프라인 |

---

## 2. 시스템 아키텍처

### 2.1 5계층 구조

| Layer | 명칭 | 역할 | 핵심 컴포넌트 |
|-------|------|------|------------|
| L1 | 데이터 인텔리전스 | 시장 데이터·뉴스·거시경제 수집 | Yahoo Finance, FRED API, KRX, WebSearch MCP |
| L2 | 분석 엔진 | 섹터/종목 분석·밸류에이션 | equity-research skills, financial-analysis skills, Claude API, RS/모멘텀 지표 |
| L3 | 포트폴리오 관리 | 보유 종목 thesis 추적·모니터링 | /thesis, /catalysts, /earnings skills |
| L4 | 의사결정 프레임워크 | 매수/매도 기준·리스크 관리 | 의사결정 매트릭스, 포지션 사이징 룰 |
| L5 | 자동화 & 문서화 | 스케줄링·알림·지식베이스 관리 | schedule skill, Notion MCP, Gmail MCP |

### 2.2 3개 Action 워크플로우

```
ACTION 1 · 종목 탐색          ACTION 2 · 추적 관찰         ACTION 3 · 자동화 루틴
────────────────────────     ────────────────────────    ────────────────────────
Step 1: 섹터 조감            Thesis 관리                  Morning Note (매일 07:30)
Step 2: 종목 압축            Catalyst 캘린더              주간 포트폴리오 리뷰
Step 3: 실적 채점            실적 채점 (/earnings)        월간 성과 보고서
Step 4: 체크포인트           ↑ /earnings-preview 공유     자동화 설정
Step 5: 매수 결정            Exit 조건 충족 시 매도
```

---

## 3. 기능 요구사항

### 홈 대시보드

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| H-01 | 3개 Action 카드 | ACTION 1·2·3 각각의 현재 상태 요약 카드. ACTION 1은 5단계 퍼널 진행 상태, ACTION 2는 보유 thesis 수·다음 Catalyst, ACTION 3은 마지막 Morning Note 날짜 | P1 |
| H-02 | 빠른 진입 버튼 | 각 Action 카드에서 해당 Step/페이지로 즉시 이동 | P1 |

---

### ACTION 1 · 종목 탐색 (5단계 퍼널)

**공통 UI 요소**: 모든 Step 페이지 상단에 `[1 섹터조감]→[2 종목압축]→[3 실적채점]→[4 체크포인트]→[5 매수결정]` 진행 표시 + 이전/다음 Step 버튼

#### Step 1 — 섹터 조감 (`/dashboard/sector`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| A1-01 | 시장 환경 차트 | FRED+Yahoo 기반 거시지표 동기화 차트 (S&P500, NASDAQ, VIX, VVIX, HY Spread, SOFR, 10Y Yield, MOVE Index). 날짜 범위 컨트롤(1M/3M/6M/1Y/2Y/5Y). 레전드 토글 | P1 |
| A1-02 | 한국 섹터 데이터 | KOSPI 주요 섹터 현황 탭 (가격 수익률, 거래량) | P2 |
| A1-03 | 미국 섹터 데이터 | SPDR 섹터 ETF 수익률 비교 탭 | P2 |
| A1-04 | AI 섹터 보고서 | Claude API(/sector skill) 기반 선택 섹터 종합 보고서 — Macro + 업종 분석(경쟁 구조·주요 플레이어) + 밸류에이션 + 모멘텀 | P2 |

#### Step 2 — 종목 압축 (`/dashboard/screen`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| A2-01 | ETF RS 스크리너 | 한국/미국 ETF Mansfield RS + 변동성 조정 모멘텀 복합 필터. RS ≥ 임계값 AND 모멘텀 Top N. MA 조건(10/20/50일) 추가 필터. CSV 내보내기 | P1 |
| A2-02 | Mansfield RS 랭킹 | 한국 ETF ~35종, 미국 ETF 38종 RS 순위 테이블. MA 252일, Rolling Percentile 정규화 | P1 |
| A2-03 | 변동성 조정 모멘텀 | 3M/6M/12M 기간(63/126/252일) Sharpe-like 평균 모멘텀 점수. Top 15 바 차트 | P1 |
| A2-04 | 개별주식 스크리너 | /screen skill 기반 개별주식 스크리너 — 재무 필터(ROE·영업이익률·부채비율) + 밸류에이션 필터(PER·PBR·EV/EBITDA) 복합 적용. 섹터 내 구조적 매력 종목 압축. CSV 내보내기 | P2 |

> **알고리즘**: Mansfield RS = (ETF가격/벤치마크가격) ÷ MA252 × 100. 벤치마크: 한국 KOSPI(^KS11), 미국 SPY

#### Step 3 — 실적 채점 (`/dashboard/earnings-analysis`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| A3-01 | 실적 분석 입력 | 티커 또는 기업명 입력. 거래소 선택(KOSPI/KOSDAQ/NASDAQ/NYSE) | P1 |
| A3-02 | Beat/Miss 분석 | Claude API 기반 최근 분기 실적 컨센서스 대비 분석. EPS/매출 Beat/Miss 판정 | P1 |
| A3-03 | KPI 트렌드 | 핵심 지표(매출성장률, 영업이익률, EPS) 분기별 트렌드 시각화 | P2 |
| A3-04 | Thesis 지지 판단 | 분석 결과가 thesis를 지지하는지 AI 판단 | P2 |

#### Step 4 — 체크포인트 (`/dashboard/earnings-preview`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| A4-01 | 다음 실적 발표일 | 티커 기반 다음 실적 발표 예정일 조회 | P1 |
| A4-02 | 채점 기준 5가지 생성 | Claude API 기반 "다음 실적에서 확인할 5가지" 자동 생성 | P1 |
| A4-03 | 컨센서스 체크 | 현재 컨센서스 EPS/매출 가이던스 표시 | P2 |
| A4-04 | 채점표 저장 | 생성된 채점 기준을 Notion Catalyst Calendar DB에 저장 | P2 |

> **공유 페이지**: ACTION 2 추적 관찰에서도 보유 종목 컨텍스트로 재사용

#### Step 5 — 매수 결정 (`/dashboard/initiating-coverage`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| A5-01 | 종합 분석 보고서 | Claude API 기반 개시 보고서. Executive Summary + 5개 섹션 (사업 개요, 산업 분석, 재무 분석, 밸류에이션, 리스크) | P1 |
| A5-02 | 목표가 산출 | DCF 기반 내재가치 + 12M 목표가. 상/하단 시나리오 3개(Bull/Base/Bear). 보조 도구: /dcf skill(내재가치 산출), /comps skill(유사 기업 EV/EBITDA·P/E 비교) 필요 시 활용 | P2 |
| A5-03 | 매수 기준 체크 | 가이드 문서 5개 매수 기준 자동 채점 (Thesis 강도/밸류에이션/모멘텀/리스크/유동성) | P1 |
| A5-04 | Thesis 자동 생성 | 분석 결과 기반 표준 Thesis 초안 자동 생성 — ① 핵심 가정 4개(성장 드라이버·수익성 개선·밸류에이션 Re-rating·Catalyst Timeline) + 확인 지표, ② 베어 케이스 조건 2~3가지, ③ 손절 기준(-15%). 생성 후 /dashboard/thesis로 저장 | P1 |
| A5-05 | LLM Q&A | 생성된 보고서 컨텍스트 기반 대화형 Q&A | P2 |
| A5-06 | 보고서 저장 | Markdown 다운로드 + Google Drive 자동 저장 | P2 |

---

### ACTION 2 · 추적 관찰

**공통 UI 요소**: 모든 Step 페이지 상단에 `[1 Thesis관리]→[2 Catalyst캘린더]→[3 실적채점]` 진행 표시 + 이전/다음 Step 버튼 (에메랄드 테마)

#### Thesis 관리 (`/dashboard/thesis`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| B1-01 | Thesis 목록 | 보유 종목별 투자 Thesis 카드. 상태(Active/Review/Exit), 수익률, 마지막 업데이트 표시 | P1 |
| B1-02 | Thesis 작성 | 표준 템플릿 기반 신규 Thesis 작성: 종목명/티커, 매수가/목표가, 핵심 가정 4개, 베어 케이스 조건, 손절 기준(-15%) | P1 |
| B1-03 | 핵심 가정 채점 | 분기별 핵심 가정 4개 Hit/Miss 채점. 2개 이상 반증 시 자동 경고 | P1 |
| B1-04 | Notion 연동 | Thesis를 Notion Investment Thesis DB에 자동 저장/동기화 | P2 |
| B1-05 | Thesis 이력 | 변경 이력 추적. 가정 수정 시 근거와 날짜 기록 | P2 |

#### Catalyst 캘린더 (`/dashboard/catalysts`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| B2-01 | 이벤트 캘린더 | 보유 종목별 실적발표·IR·규제·제품출시 이벤트 월별 캘린더 뷰 | P1 |
| B2-02 | 이벤트 등록 | 수동 이벤트 등록. 종목명, 이벤트 유형, 예정일, 중요도(High/Medium/Low) | P1 |
| B2-03 | Google Calendar 연동 | 등록된 Catalyst를 Google Calendar에 자동 동기화 | P2 |
| B2-04 | 사전 알림 | 실적 발표 T-7일, T-1일 Gmail 알림 자동 발송 | P2 |
| B2-05 | 결과 기록 | 이벤트 후 결과 입력. Thesis 영향도 평가 | P2 |

#### 실적 채점 (`/dashboard/earnings`)

> **실적 전 준비**: 실적 발표 1주일 전 `/dashboard/earnings-preview`(/earnings-preview skill)를 통해 채점 기준 재확인 + 컨센서스 체크 수행 후 실적 채점으로 진입. (ACTION 1 Step 4와 공유 페이지)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| B3-01 | 실적 발표 당일 분석 | 발표된 실적 데이터 입력 + Claude API 기반 Beat/Miss 즉시 분석 | P1 |
| B3-02 | Thesis 채점 | 핵심 가정 4개 대비 실적 결과 자동 채점. Thesis 상태 업데이트 | P1 |
| B3-03 | 목표가 조정 | 실적 결과 반영한 목표가 재산출 제안 | P2 |
| B3-04 | Notion 저장 | 채점 결과를 Notion Catalyst Calendar DB에 자동 기록 | P2 |

---

### ACTION 3 · 자동화 루틴

**공통 UI 요소**: 모든 Step 페이지 상단에 `[1 MorningNote]→[2 주간리뷰]→[3 월간보고서]→[4 자동화설정]` 진행 표시 + 이전/다음 Step 버튼 (앰버 테마)

#### Morning Note (`/dashboard/morning-note`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| C1-01 | 자동 생성 | 매일 07:30 Claude API 기반 Morning Note 자동 생성 | P1 |
| C1-02 | 시장 동향 섹션 | 글로벌 시장 지수, 거시경제 지표(FRED), 전일 이슈 요약 | P1 |
| C1-03 | 섹터 이슈 섹션 | 주요 섹터별 뉴스/이슈 WebSearch 기반 수집 | P1 |
| C1-04 | 보유 종목 영향 섹션 | Thesis 보유 종목별 당일 뉴스/가격 영향 체크 | P1 |
| C1-05 | Notion 저장 | 생성된 Morning Note를 Notion Morning Notes DB에 자동 저장 | P2 |
| C1-06 | Gmail 발송 | Morning Note 요약을 Gmail로 자동 발송 | P2 |
| C1-07 | 이력 조회 | 날짜별 Morning Note 조회 | P2 |

#### 주간 포트폴리오 리뷰 (`/dashboard/weekly-review`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| C2-01 | 주간 성과 요약 | 보유 종목별 주간 수익률 + 벤치마크 대비 성과 | P2 |
| C2-02 | Catalyst 결과 확인 | 지난 주 발생한 Catalyst 이벤트 결과 확인 체크리스트 | P2 |
| C2-03 | Thesis 상태 리뷰 | 주간 변화 기준 Thesis 가정 상태 업데이트 필요 종목 하이라이트 | P2 |

#### 월간 성과 보고서 (`/dashboard/monthly-report`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| C3-01 | 월간 수익률 | 포트폴리오 월간 수익률 + KOSPI/S&P500 대비 알파 | P2 |
| C3-02 | Thesis 정확도 | 핵심 가정 월간 Hit Rate 통계 | P2 |
| C3-03 | 교훈 기록 | 이번 달 매매 복기 + 교훈 자유 기록 | P2 |
| C3-04 | Google Drive 저장 | 보고서를 Google Drive에 .md 파일로 자동 저장 | P3 |

#### 자동화 설정 (`/dashboard/automation`)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| C4-01 | 스케줄 관리 | 시간 기반 트리거 설정 (Morning Note 시각, 주간 리뷰 요일 등) | P2 |
| C4-02 | 이벤트 트리거 | 조건 기반 알림 설정 (-15% 손절 알림, 목표가 도달 알림) | P2 |
| C4-03 | MCP 연결 상태 | Notion, Google Drive, Gmail, Google Calendar MCP 연결 상태 확인 | P2 |

---

## 4. 의사결정 프레임워크

### 매수 기준 (5개 항목)

| 기준 | 요건 | 가중치 |
|-----|------|--------|
| Thesis 강도 | 핵심 가정 4개 중 3개 이상 성립 확인 | 30% |
| 밸류에이션 | DCF 기준 20% 이상 업사이드, Comps 대비 Discount 존재 | 25% |
| 모멘텀/촉매 | 향후 3개월 내 thesis 확인 가능한 Catalyst 존재 | 20% |
| 리스크 관리 | 최대 손실 시나리오 -20% 이내, 포트폴리오 영향 5% 이하 | 15% |
| 유동성 | 일 거래량 기준 포지션 청산에 3일 이내 가능 | 10% |

### 매도 기준 (Thesis Invalidation)

| 트리거 | 조건 |
|--------|------|
| Thesis 붕괴 | 핵심 가정 2개 이상 반증 → 즉시 매도 검토 |
| 목표가 달성 | DCF 목표가 ±5% 도달 → 점진적 차익 실현 |
| 베어 케이스 충족 | 사전 정의 조건 2개 이상 발현 |
| 기회비용 | 동일 섹터 내 더 강한 Conviction 종목 발견 시 교체 |
| 손절 기준 | 매수가 대비 -15% 도달 시 thesis 재검토 강제 |

---

## 5. Skills 활용 매핑

### Equity Research Skills (핵심 분석 도구)

| Skill | 워크플로우 위치 | 주요 출력물 | 주기 |
|-------|-------------|-----------|-----|
| /sector | ACTION 1 - Step 1 | 섹터 개요 보고서 (Macro + 업종 분석) | 아이디어 발굴 시 |
| /screen | ACTION 1 - Step 2 | 스크리닝된 종목 리스트 (재무/밸류에이션) | 섹터 선정 후 |
| /earnings-analysis | ACTION 1 - Step 3 | 분기 실적 Beat/Miss + KPI 트렌드 | 실적 발표 후 |
| /earnings-preview | ACTION 1 - Step 4 / ACTION 2 - Step 3 | 실적 채점 기준 + 가이던스 예측 | 실적 전 1주일 |
| /initiating-coverage | ACTION 1 - Step 5 | 30페이지 종합 분석 보고서 + 목표가 | 최종 매수 결정 시 |
| /thesis | ACTION 2 - Step 1 | 투자 thesis + 핵심 가정 4개 | 매수 시 / 분기 리뷰 |
| /catalysts | ACTION 2 - Step 2 | Catalyst 캘린더 + 이벤트 타임라인 | 지속 업데이트 |
| /earnings | ACTION 2 - Step 4 | 실적 분석 + Thesis 채점 결과 | 실적 발표 당일 |
| /morning-note | ACTION 3 - 매일 | 시장 5분 브리핑 + 보유 종목 영향 | 매일 07:30 |

### Financial Analysis Skills (보조 밸류에이션 도구)

> 특정 워크플로우 단계에 고정되지 않은 심층 분석 시 보조 도구

| Skill | 사용 시점 | 목적 |
|-------|---------|-----|
| /dcf | 종목 심층 분석 시 (Step 5 내) | DCF 기반 내재가치 산출 + 시나리오 분석 |
| /comps | 종목 심층 분석 시 (Step 5 내) | 유사 기업 비교 밸류에이션 (EV/EBITDA, P/E) |
| /competitive-analysis | 섹터 분석 / 종목 초기 탐색 | 경쟁사 포지셔닝 + 시장 지위 분석 |
| /lbo | M&A 관련 투자 아이디어 | PE 관점 인수 타당성 분석 |

### Data & Automation Skills

| Skill | 사용 시점 | 목적 |
|-------|---------|-----|
| data:build-dashboard | 주간/월간 리뷰 | 포트폴리오 성과 대시보드 HTML 생성 |
| data:create-viz | 보고서 작성 시 | 수익률 차트, 섹터 배분 파이차트 등 |
| data:analyze | 성과 분석 시 | Thesis 정확도, 수익 요인 분석 |
| anthropic-skills:schedule | 자동화 설정 | Morning note, 주간 리뷰 스케줄 등록 |

---

## 6. MCP 연동 요구사항

| MCP | 목적 | 주요 활용 |
|-----|------|---------|
| Notion MCP | 지식베이스 허브 | Thesis 저장, Morning Note, Catalyst 기록, Performance DB |
| Google Drive MCP | 문서 저장소 | 분석 보고서 자동 저장, 월간 보고서 |
| Gmail MCP | 알림 시스템 | Morning Note 요약, 실적 발표 전 알림, 손절 경고 |
| Google Calendar MCP | 이벤트 관리 | Catalyst 캘린더 자동 동기화 |

### Notion DB 스키마

| DB | 주요 필드 | 자동화 연동 |
|----|---------|-----------|
| Investment Thesis DB | 종목명, 섹터, 매수일, 목표가, 핵심가정4, Thesis상태, 수익률 | /initiating-coverage → 자동 생성 |
| Catalyst Calendar DB | 종목명, 이벤트명, 예정일, 중요도, 결과, Thesis영향 | /catalysts → Google Calendar 동기화 |
| Morning Notes DB | 날짜, 시장요약, 섹터이슈, 보유종목영향 | /morning-note → 매일 자동 생성 |
| Performance DB | 종목명, 매수/매도일가, 수익률, Thesis정확도, 교훈 | 월간 자동 집계 |

---

## 7. 데이터 흐름

### 종목 탐색 파이프라인 (ACTION 1)

```
/dashboard/sector
  ├── Yahoo Finance: ^GSPC, ^IXIC, ^VIX, ^VVIX, ^SDEX, ^MOVE
  └── FRED API: BAMLH0A0HYM2, SOFR, DGS10, DFEDTARU
  ↓
/dashboard/screen
  ├── Yahoo Finance: 한국 ETF .KS/.KQ (벤치마크 ^KS11)
  └── Yahoo Finance: 미국 ETF 38종 (벤치마크 SPY)
  ↓ lib/etf/rs.ts, lib/etf/momentum.ts
/dashboard/earnings-analysis → /dashboard/earnings-preview → /dashboard/initiating-coverage
  └── Claude API (claude-sonnet-4-6) + WebSearch MCP
```

### 추적 관찰 파이프라인 (ACTION 2)

```
/dashboard/thesis ↔ Notion Investment Thesis DB
/dashboard/catalysts ↔ Notion Catalyst Calendar DB ↔ Google Calendar
/dashboard/earnings → Claude API → Notion Catalyst Calendar DB
```

### 자동화 루틴 파이프라인 (ACTION 3)

```
매일 07:30 스케줄러
  → /dashboard/morning-note
    ├── FRED + Yahoo Finance (시장 환경)
    ├── WebSearch MCP (뉴스/섹터 이슈)
    └── Notion Thesis DB (보유 종목 목록)
  → Claude API (Morning Note 생성)
  → Notion Morning Notes DB 저장
  → Gmail 요약 발송
```

---

## 8. 기술 요구사항

| 요구사항 | 세부 내용 |
|---------|---------|
| 런타임 | Node.js 18+ (Next.js 16 App Router) |
| 언어 | TypeScript 5+ |
| UI | shadcn/ui (Radix UI 기반) + Tailwind CSS v4 |
| 차트 | Recharts (클라이언트 컴포넌트 격리 필수) |
| AI | Claude API (claude-sonnet-4-6), 스트리밍 응답 지원 |
| MCP 연동 | Notion, Google Drive, Gmail, Google Calendar |
| 스케줄러 | Claude Code schedule skill 또는 Vercel Cron |
| 데이터 저장 | Notion DB (구조화 데이터) + Google Drive (문서) + localStorage (임시) |
| 캐시 | JSON 파일 캐시 (`data/cache/`) — 일 1회 갱신 |
| 보안 | API 키는 환경 변수 관리. 투자 정보 외부 유출 없음 |

---

## 9. 성공 지표

| 카테고리 | 측정 항목 | 목표 |
|---------|---------|------|
| 시간 효율 | 종목 발굴 → 매수 결정 소요 시간 | 기존 대비 -70% |
| 시간 효율 | Daily 시장 파악 소요 시간 | 5분 이내 |
| 분석 품질 | 매수 종목 투자 thesis 문서화율 | 100% |
| 분석 품질 | Catalyst 캘린더 커버리지 | 보유 종목 주요 이벤트 100% |
| 의사결정 | 사전 정의 기준 준수율 | 매수/매도 결정의 90% 이상 |
| 성과 추적 | Thesis 정확도 측정 | 분기별 핵심 가정 Hit Rate 추적 |
| 자동화 | Daily 루틴 자동 완료율 | 80% 이상 |

---

## 10. 미결 결정사항

| # | 항목 | 선택지 | 상태 |
|---|-----|--------|------|
| OQ-01 | 한국 ETF 최종 유니버스 | 현재 ~35종 — 추가 검토 필요 | ⏳ |
| OQ-02 | RS 필터 임계값 | Rolling Percentile 50/70/80 중 선택 | ⏳ |
| OQ-03 | 배포 환경 | 로컬 전용 / Vercel / 자체 서버 | ⏳ |
| OQ-04 | Notion MCP 연동 시기 | Phase 8 동시 / Phase 9 별도 | ⏳ |
| OQ-05 | Morning Note 스케줄러 | schedule skill / Vercel Cron / GitHub Actions | ⏳ |

---

## 11. 제외 항목

- **Fear & Greed 지표** — 미구현 (복잡도 대비 효용 낮음)

---

## 12. 변경 이력

| 버전 | 날짜 | 변경 내용 |
|-----|------|---------|
| v1.0 | 2026.03 | 최초 작성 (Python + Streamlit 스택 기준) |
| v1.1 | 2026.03.27 | 기술스택 전환 — Next.js API Routes |
| v2.0 | 2026.03.31 | ETF RS 분석 플랫폼 — Mansfield RS MA 252일, 모멘텀 63/126/252, 한국ETF 개별주식 제거, 미국 직접 상장 ETF 38종 |
| v2.1 | 2026.04.08 | Sector Flow Oscillator 모듈 추가 (pykrx, KOSPI 19개 섹터) |
| v2.2 | 2026.04.12 | 기업 분석 모듈 추가 (Claude API, LLM Q&A) |
| v2.7~2.9 | 2026.04.13 | 시장 분석 탭 완성 (FRED API, 7개 동기화 차트) |
| v3.0 | 2026.04.14 | **1인 투자 하우스 시스템으로 전면 재구성** — Investment_System_PRD_v1.0.docx 반영. 3개 Action 워크플로우(종목탐색/추적관찰/자동화루틴) 기반 앱 구조 재편. 기존 ETF RS/모멘텀/시장분석 기능은 ACTION 1 Step 1·2에 편입. Fear & Greed 제외. MCP 연동(Notion/Google Drive/Gmail/Calendar) 추가. 의사결정 프레임워크 매트릭스 추가 |
| v3.1 | 2026.04.14 | Phase 7 완료 반영. ACTION 2/3 Step Nav 공통 UI 요소 추가 |
| v3.2 | 2026.04.14 | 가이드 문서(v1.0) 갭 반영: A1-04 업종 분석 추가, A2-04 P3→P2 상향+설명 구체화, A5-02 /dcf·/comps 보조 도구 명시, A5-04 Thesis 템플릿 4가지 가정 구조 반영, ACTION 2 /earnings-preview Step 3 활용 명시, Skills 활용 매핑 섹션(5절) 신규 추가 |

---

*v3.2 | 2026.04.14 | Living Document — 워크플로우/기능 추가 시 수시 업데이트*
