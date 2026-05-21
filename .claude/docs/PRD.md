# PRD — Investment+ (1인 투자 하우스 시스템)

> **버전**: v5.2 | **작성일**: 2026.03.31 | **최종 수정**: 2026.05.21 | **상태**: Living Document

---

## 1. 프로젝트 개요

### 1.1 목적

개인 투자자가 데이터와 논리에 기반한 투자 의사결정을 체계적으로 수행할 수 있도록 설계된 **AI 기반 1인 투자 하우스 시스템**.

- **종목탐색 → 분석 → 투자결정 → 추적관찰** 전 과정 체계화·자동화
- Claude API + MCP 연동을 통한 기관급 리서치 역량 확보
- 매일 아침 5분 브리핑부터 심층 종목 분석(30페이지 보고서)까지 전 단계 커버
- Notion/Google Drive 기반 지식베이스로 투자 인사이트 복리 축적

### 1.2 핵심 가치 제안

| 문제 | 해결책 | 구현 도구 |
|------|--------|---------|
| 정보 비대칭 | 실시간 웹서치 + 딥리서치 자동화 | Claude API web_search + 멀티 LLM |
| 분석 역량 부족 | AI 기반 섹터/종목 분석 자동화 | sector skill, screen skill, initiating-coverage |
| 의사결정 체계 부재 | 투자 thesis 템플릿 + 기준 매트릭스 | 의사결정 프레임워크 + 5개 매수 기준 |
| 추적 실패 | Catalyst 캘린더 + 실적 자동 분석 | /catalysts, /earnings, /earnings-preview |
| 지식 비축적 | Notion 지식베이스 + 자동화 파이프라인 | Notion MCP + 자동화 루틴 |

### 1.3 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) + TypeScript 5 |
| UI | shadcn/ui (Radix UI) + Tailwind CSS v4 + Recharts |
| AI | Claude API (claude-sonnet-4-6), SSE 스트리밍 |
| 멀티 LLM | Claude / GPT / Gemini 추상화 (`lib/llm/`) |
| 데이터 | Yahoo Finance, FRED API, KRX, Alpha Vantage, DART |
| 외부 연동 | Notion MCP, Google Drive MCP, Gmail MCP, Google Calendar MCP |
| 저장소 | localStorage (임시) → Notion DB (영구) |
| 캐시 | JSON 파일 캐시 (`data/cache/`) |

---

## 2. 시스템 아키텍처

### 2.1 3개 Action 워크플로우

```
ACTION 1 · 종목 탐색          ACTION 2 · 추적 관찰         ACTION 3 · 자동화 루틴
────────────────────────     ────────────────────────    ──────────────────────
Step 1: 섹터 조감             Step 1: Thesis 관리          Step 1: Morning Note
Step 2: 종목 압축             Step 2: Catalyst 캘린더      Step 2: 주간 포트폴리오 리뷰
Step 3: 실적 채점             Step 3: 실적 채점            Step 3: 월간 성과 보고서
Step 4: 체크포인트                                         Step 4: 자동화 설정
Step 5: 매수 결정
```

### 2.2 페이지 맵

> ACTION 1 퍼널: **4단계** (섹터 조감 → 종목 분석 → 체크포인트 → 매수 결정)
> `/dashboard/earnings-analysis`는 `/dashboard/screen`으로 redirect 처리 (Step 2 "실적 채점" 탭으로 통합)

| 라우트 | Action | 기능 | 구현 상태 |
|--------|--------|------|---------|
| `/dashboard` | 홈 | 3개 Action 워크플로우 카드 | ✅ |
| `/dashboard/market` | A1 선행 | 시장 환경 (거시경제지표 차트) | ✅ |
| `/dashboard/sector` | A1 Step 1 | 섹터 조감 + AI 섹터 보고서 | ✅ |
| `/dashboard/screen` | A1 Step 2 | 종목 분석 (주가 성과 + 개별주식 스크리너 + 실적 채점 탭) | 🔄 |
| `/dashboard/earnings-preview` | A1 Step 3 | 체크포인트 | ✅ |
| `/dashboard/initiating-coverage` | A1 Step 4 | 매수 결정 (기업 분석) | 🔄 |
| `/dashboard/thesis` | A2 Step 1 | Thesis 관리 | ⬜ |
| `/dashboard/catalysts` | A2 Step 2 | Catalyst 캘린더 | ⬜ |
| `/dashboard/earnings` | A2 Step 3 | 실적 채점 (보유 종목) | ⬜ |
| `/dashboard/morning-note` | A3 Step 1 | Morning Note | ⬜ |
| `/dashboard/weekly-review` | A3 Step 2 | 주간 포트폴리오 리뷰 | ⬜ |
| `/dashboard/monthly-report` | A3 Step 3 | 월간 성과 보고서 | ⬜ |
| `/dashboard/automation` | A3 Step 4 | 자동화 설정 | ⬜ |
| `/dashboard/portfolio` | A2 | 포트폴리오 허브 (계좌 선택) | ✅ |
| `/dashboard/portfolio/trend` | A2 | 추세추종 계좌 대시보드 | ✅ |
| `/dashboard/portfolio/longterm` | A2 | 장기투자 계좌 대시보드 | ✅ |
| `/dashboard/portfolio/education` | A2 | 교육 계좌 대시보드 (포지션/거래내역/리스크 관리 3탭) | ✅ |
| `/dashboard/portfolio/pension` | A2 | 연금 계좌 대시보드 (퇴직연금/연금저축/IRP, 거래내역·리밸런싱·종목별 3탭) | ✅ |
| `/dashboard/portfolio/performance` | A2 | 포트폴리오 성과 분석 (KR/US 월별 수익률·누적수익률·벤치마크 비교) | ✅ |
| `/dashboard/portfolio/financial` | A2 | 재무제표 통합 대시보드 (재무제표/자산관리/연금·교육/현금흐름 4탭) | ✅ |
| `/dashboard/settings` | 기타 | 앱 설정 (ETF 티커·파라미터·백업/복원) | ✅ |

---

## 3. 기능 요구사항

> **상태 범례**: ✅ 구현완료 / 🔄 부분구현 / ⬜ 미구현

---

### 홈 대시보드 (`/dashboard`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| H-01 | 3개 Action 카드 | ACTION 1·2·3 각각 컬러 테마(인디고/에메랄드/앰버) 그라디언트 카드. 각 Step 퍼널 요약 | ✅ |
| H-02 | 빠른 진입 버튼 | 각 Action 카드 → 해당 Step 1 페이지 즉시 이동 | ✅ |

---

### 시장 환경 (`/dashboard/market`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| M-01 | 거시경제 동기화 차트 | S&P500, NASDAQ, VIX, VVIX, HY Spread, SOFR, 10Y Yield, MOVE Index. 날짜 범위 컨트롤(1M/3M/6M/1Y/2Y/5Y). 레전드 토글 | ✅ |
| M-02 | 경제지수 차트 | Alpha Vantage 기반 경제지표 시각화 | ✅ |
| M-03 | 한국 시장 지표 | VKOSPI, Fear&Greed(KR), KR 주요 지수 | ✅ |

---

### ACTION 1 · 종목 탐색

**공통 UI**: 모든 Step 페이지 상단에 `[1 섹터조감]→[2 종목분석]→[3 체크포인트]→[4 매수결정]` 진행 표시 + 이전/다음 Step 버튼 (인디고 테마) ✅

> Step 2 "종목 분석"은 주가 성과 탭 + 개별주식 스크리너 탭 + 실적 채점 탭 3개로 구성. `/dashboard/earnings-analysis`는 이 페이지로 redirect.

#### Step 1 — 섹터 조감 (`/dashboard/sector`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| A1-01 | 시장 환경 차트 탭 | FRED+Yahoo 기반 거시지표 동기화 차트. M-01과 동일 컴포넌트 재사용 | ✅ |
| A1-02 | 한국 섹터 ETF 수익률 탭 | KOSPI 주요 섹터 대표 ETF 수익률 테이블 (1M/3M/12M + RS Percentile) | ✅ |
| A1-03 | 미국 섹터 ETF 수익률 탭 | SPDR 11개 섹터 ETF 수익률 비교 바 차트 | ✅ |
| A1-04 | AI 섹터 보고서 탭 | 멀티 LLM(Claude/GPT/Gemini) + web_search 기반 섹터 종합 보고서 스트리밍. sector-research SKILL.md 6단계 워크플로우 엄격 준수. Q&A(최대 8턴). MD 다운로드 + PDF 출력. React Context로 페이지 이탈 후 보고서 유지 | ✅ |

#### Step 2 — 종목 분석 (`/dashboard/screen`)

> 주가 성과 + 개별주식 스크리너 + 실적 채점 탭 3개 구성. `/dashboard/earnings-analysis`는 이 페이지로 redirect.

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| A2-00 | 주가 성과 분석 탭 | 종목 입력 + 거래소 선택(KRX/US) + 기간 선택 → 히스토리컬 성과 분석 6개 차트 탭(정규화 가격/누적수익률/변동성항력/MDD/월별수익률/누적월별). 성과 요약 카드 10개 지표(CAGR/총수익률/MDD/변동성/Sharpe/Sortino/Calmar/월승률/Beta/상관계수). 자동완성 종목 검색(KRX: 네이버 금융, US: Yahoo Finance). sessionStorage 기반 분석 상태 유지(메뉴 이동 후 복원). 벤치마크: KOSPI(KRX)/S&P500+NASDAQ(US) | ✅ |
| A2-01 | 개별주식 스크리너 탭 | screen SKILL 기반 재무(ROE/영업이익률/부채비율) + 밸류에이션(PER/PBR/EV/EBITDA) 복합 필터. Claude web_search 후보 발굴 → API 수집 → 필터 게이트 → 보고서 스트리밍. 이전 분석 참고(파일 업로드/.md 또는 기업분석 히스토리 선택) | ✅ |
| A2-02 | 실적 채점 탭 | 티커 + 거래소 선택(KOSPI/KOSDAQ/NASDAQ/NYSE). Claude API 기반 최근 분기 EPS/매출 컨센서스 대비 Beat/Miss 분석. 매출성장률/영업이익률/EPS 분기별 KPI 트렌드 차트 | ✅ |
| A2-03 | ETF RS 스크리너 탭 | RS + 모멘텀 복합 필터. **레거시 `/dashboard/screener` → 통합 이전 필요** | 🔄 |
| A2-04 | Mansfield RS 랭킹 탭 | 한국 ETF ~35종 + 미국 ETF 38종 RS 순위. **레거시 라우트에서 통합 이전 필요** | 🔄 |
| A2-05 | 변동성 조정 모멘텀 탭 | 3M/6M/12M Sharpe-like 모멘텀 점수. Top 15 바 차트 | 🔄 |

> **알고리즘**: Mansfield RS = (ETF가격/벤치마크가격) ÷ MA252 × 100. 벤치마크: 한국 KOSPI(^KS11), 미국 SPY

#### Step 3 — 체크포인트 (`/dashboard/earnings-preview`)

> Claude 보고서 스트리밍 방식을 폐기하고, 재무제표 원시 데이터 수집 후 4대 질문별 시각화 탭으로 재구성. 전체 완성(4/4).

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| A3-01 | 재무제표 수집 | FnGuide(KR) HTML 파싱 / Alpha Vantage(US) API — 연간+분기 재무제표 원시 항목(RawDartItem[]) 수집. 30일 TTL 캐시 + 연도 증분 자동 업데이트. SSE 스트리밍 API (`dataOnly` 플래그 포함). FnGuide `<title>` 태그에서 기업명 자동 추출(`companyName?` 필드). ratioItems/quarterlyRatioItems(FnGuide SVD_FinanceRatio 수익성 지표) 수집 | ✅ |
| A3-02 | 재무제표 테이블 | 수집된 원시 계정을 sj_div(IS/BS/CF/CIS/SCE)별로 섹션 분류하여 표시. 연간/분기 탭 전환(FnGuide KR 전용). 종목별 localStorage 저장/불러오기. 페이지 이동 후 sessionStorage 복원. `FinancialRawDataTable.tsx` | ✅ |
| A3-03 | 체크포인트 1: 돈이 많은 기업인가 | BS 재무상태표 기반 비영업자산(유동금융자산+현금및현금성자산+장기금융자산+관계기업등지분관련투자자산) vs 금융부채(단기사채+단기차입금+유동성장기부채+유동금융부채+장기차입금+비유동금융부채) 연도별 합산. recharts ComposedChart: grouped bar + 차이 bar(양수=순현금/초록, 음수=순차입/빨강). 매칭 계정 목록 표시. `Checkpoint1Client.tsx` | ✅ |
| A3-04 | 체크포인트 2: 이익을 내는가 | IS 손익계산서 기반 매출액/영업이익/순이익 트렌드 Line 차트, 영업이익률 추이. YoY/QoQ 성장률. CCC(현금전환주기) 활동성 지표. `Checkpoint2Client.tsx` | ✅ |
| A3-05 | 체크포인트 3: 극대화 가능한가 | FnGuide SVD_FinanceRatio에서 ratioItems 자동 추출. ROA/ROE/ROIC 트렌드 Line 차트. DuPont 분해: 순이익률 × 자산회전율 × 레버리지(3개 독립 미니차트). 비용구조 비율: 매출원가율+판관비율(Bar)+영업이익률(Line). BS 계정 exactOnly 로직(자산/자본 총계 FnGuide 표기 차이 대응). `Checkpoint3Client.tsx` | ✅ |
| A3-06 | 체크포인트 4: 현금을 버는가 | CCR(Cash Conversion Ratio = 영업CF/당기순이익) Bar 차트(에메랄드/앰버/레드 3단계). 현금흐름 트렌드 Line 차트: 영업CF/Capex(음수)/재무CF/FCF. Capex 계정과목 설정 패널(기본값: 유형자산의증가+무형자산의증가). `Checkpoint4Client.tsx` | ✅ |

#### Step 4 — 매수 결정 (`/dashboard/initiating-coverage`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| A5-01 | 종합 분석 보고서 | Claude API + web_search 기반 기업 심층 분석 보고서 스트리밍. Executive Summary + 사업개요/산업/재무/밸류에이션/리스크 5개 섹션 | ✅ |
| A5-02 | LLM Q&A | 생성된 보고서 컨텍스트 기반 대화형 Q&A 패널 | ✅ |
| A5-03 | 분석 이력 관리 | 완료된 분석 목록 저장/조회/삭제 (localStorage) | ✅ |
| A5-04 | 보고서 저장 | MD 다운로드 + PDF 출력(window.open + window.print, 외부 라이브러리 없음) | ✅ |
| A5-05 | 페이지 이탈 유지 | localStorage auto-save/restore (`company-analysis-current-result` 키) — 페이지 이동 후에도 마지막 분석 자동 복원 | ✅ |
| A5-06 | 이전 분석 참고 | 파일 업로드(.md) 또는 분석 이력에서 선택 → `previousReport` API 전달 → 비교 분석 섹션 자동 추가 | ✅ |
| A5-07 | 매수 기준 자동 채점 | 5개 기준(Thesis 강도/밸류에이션/모멘텀/리스크/유동성) 체크리스트 UI + AI 자동 평가 | ⬜ |
| A5-08 | Thesis 자동 생성 | 분석 결과 기반 표준 Thesis 초안 — 핵심 가정 4개 + 베어 케이스 2~3개 + 손절 기준(-15%). `/dashboard/thesis`로 저장 | ⬜ |
| A5-09 | 보고서 Google Drive 저장 | Google Drive MCP 연동 후 .md 자동 저장 활성화 (Phase 11) | ⬜ |

---

### ACTION 2 · 포트폴리오 관리

**공통 UI**: 사이드바 "포트폴리오 관리" 그룹 → 계좌별 페이지 진입 (에메랄드 테마) ✅

#### 포트폴리오 허브 (`/dashboard/portfolio`)

> 계좌 선택 허브 — 추세추종 계좌(Account 1470) + 장기투자 계좌 카드 그리드

#### 추세추종 계좌 (`/dashboard/portfolio/trend`)

> 키움 REST API 연동 기반 보유 포지션 + 리스크 관리 + 거래 이력 + 성과 분석 (P9-01~P9-12 완료)

#### 장기투자 계좌 (`/dashboard/portfolio/longterm`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| D1-01 | Excel 계층구조 임포트 | FS 2026.xlsx Stock Trading(주식·ETF) + Fund Trading(펀드) 이중 파서. Stock Investment 시트 lookup으로 계좌번호·시장·자산유형 자동 매핑. 서버+클라이언트 이중 dedup | ✅ |
| D1-02 | 거래 CRUD | 거래 추가(수동)/편집/조회. 계좌·시장·자산유형 필터. JSON 파일 기반 영구 저장 | ✅ |
| D1-03 | 실현손익 계산 | FIFO 가중평균단가 추적. 순매도수익(수수료 차감) 기준 실현손익·손익률 계산. **avgCost는 수수료 제외 기준으로 종목별 탭과 동일하게 통일** | ✅ |
| D1-04 | 종목별 이력 accordion | stockCode+stockName+accountNo 복합 키 그룹핑. 2컬럼 그리드 72px 고정 헤더. 소계(매수/매도/잔량 평균단가/실현손익/배당) | ✅ |
| D1-05 | 펀드 계좌(8654) 지원 | Fund Trading 시트 파서(A=펀드명/B=날짜/C=Bid·Ask/D=좌수/E=NAV). 8654 계좌 자동 분류 | ✅ |
| D1-06 | 현재가 실시간 자동 조회 | KR 종목: Naver Finance API(closePrice 필드, curl 기반). US 종목: Yahoo Finance v8 chart API(meta.regularMarketPrice, curl 기반, v7 quote는 401 차단). FUND 타입 제외(notFound 처리). KR 코드 보정 맵(오기 보정: 005939→005930). 5분 TTL 캐시. 새로고침 버튼 + 조회 시각 표시 + 로딩 스피너. 수동 오버라이드 연필 아이콘 유지. `/api/portfolio/longterm/prices` | ✅ |
| D1-07 | 보유 포지션 합계 행 | 평가금액·평가손익·수익률(총평가손익/총매입원가)·누적실현손익·비중(100%) 합계 표시. 현재가 없는 종목 제외 후 계산 | ✅ |
| D1-08 | JSON 백업/복원 | 자동 일별 서버 백업(data/backups/YYYY-MM-DD.json, 30일 보관) + UI에서 JSON 다운로드(오프사이트 보관용) + JSON 복원(overwrite: 전체 교체 / merge: dedup 키 기준 신규 건만 추가). `/api/portfolio/longterm/backup` | ✅ |
| D1-09 | 포트폴리오 성과 분석 | Jan~Apr 2026 Bootstrap JSON + May 2026+ 거래내역 동적 계산. Modified Dietz MoM%. TWR 누적수익률. KR/US 분리. KOSPI/S&P500/NASDAQ 벤치마크 비교. 완료 월 24h / 현재 월 5min TTL 캐시. `/dashboard/portfolio/performance`, `/api/portfolio/performance` | ✅ |
| D1-10 | 보유 종목별 성과 분석 | Performance Analysis 탭 — TWR/Alpha/연환산Alpha/MDR(Modified Dietz)/Hit Rate/MDD/Up·Down Capture 7대 지표 테이블(KRW/USD 분리). Alpha vs 벤치마크 수평 바 차트. 벤치마크: KRW→KOSPI(^KS11), USD→S&P500(^GSPC). `/api/portfolio/longterm/holdings-performance`, `HoldingsPerformanceTable.tsx`, `HoldingsAlphaBarChart.tsx` | ✅ |

#### 교육 계좌 (`/dashboard/portfolio/education`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| D2-01 | 포지션 관리 | 포지션 추가(`AddPositionDialog`) / 매도(`SellPositionDialog`) / 편집(`EditPositionDialog`). 현재가 자동 조회(Naver Finance KR). 계좌 총합/손익 실시간 표시. `data/education-account.json` 파일 기반 저장 | ✅ |
| D2-02 | 거래내역 관리 | 거래 추가(`AddTradeDialog`) / 편집(`EditTradeDialog`). 성과 요약 상단(승률/손익비/EV/평균수익/평균손실/거래수). 날짜·결과별 정렬/필터 기능 | ✅ |
| D2-03 | 리스크 관리 탭 | `RiskManagementPanel`(시장 단계 1~5 / 투자 가능금액 / 여유자금 / 2% 룰) + `PositionRiskTable`(손절가 / 주당리스크 / nR 수량 / 투자금 / 계좌손절비중 자동 계산). localStorage 설정 영구 저장 | ✅ |
| D2-04 | 백업/복원 | `/api/portfolio/education/backup` — JSON 다운로드(오프사이트 보관용) + JSON 복원(overwrite: 전체 교체 / merge: 신규 건만 추가) | ✅ |

#### 연금 계좌 (`/dashboard/portfolio/pension`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| D4-01 | 거래 CRUD | BUY/SELL/DIVIDEND 거래 추가/편집/삭제. 계좌별(퇴직연금/연금저축/IRP) 분류. `data/pension-transactions.json` 파일 기반 저장 | ✅ |
| D4-02 | 포지션 계산 | 거래내역 → 현재 보유 포지션 동적 계산. 가중평균단가(avgCost) FIFO 추적. SELL 시 realizedPL 자동 계산. 카테고리(채권형/주식형) 분리 | ✅ |
| D4-03 | 현재가 자동 조회 | `/api/portfolio/risk/prices` 연동. KRX 알파뉴메릭 ETF 코드(`0023A0` 등) 지원. 포지션 로드 시 자동 실행 | ✅ |
| D4-04 | 월평균 기하수익률 | `(1+총수익률)^(1/보유개월)-1`. 보유기간이 다른 ETF 간 공정 비교 지표. 포지션 테이블 + 종목별 비중 설정 테이블 적용. evalAmount 기반 가중평균 합계 | ✅ |
| D4-05 | 리밸런싱 분석 | 퇴직연금·연금저축 각각 독립적인 채권형/주식형 목표 비중 설정 및 저장. 현재가 기반 클라이언트 사이드 재계산. 보유 현금 포함 총평가금액 기준. 종목별 목표 비중 설정 테이블(현재금액/현재비중/월평균/목표%/목표금액/필요금액). `PensionRebalancingConfig { RETIREMENT, SAVINGS }` 계좌별 독립 저장 | ✅ |
| D4-06 | 백업/복원 | `/api/portfolio/pension/backup` — JSON 다운로드(파일명: pension-backup-YYYY-MM-DD.json) + 복원(overwrite: 전체 교체 / merge: 중복 제외 신규 건만 추가). 자동 일별 서버 백업(data/pension-backups/, 30일 보관) | ✅ |
| D4-07 | 종목별 탭 | 계좌·카테고리별 ETF 목록 accordion. 보유 포지션 현황 + 실현손익 표시 | ✅ |

#### 단중기 계좌 (`/dashboard/portfolio/shortterm`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| D3-01 | 대시보드 인프라 | `/api/portfolio/shortterm/*` API 라우트(positions/sell/trades/backup) + `ShorttermAccountDashboardClient.tsx` + `data/shortterm-account.json` + `lib/portfolio/shorttermData.ts`. 교육 계좌와 동일 구조(파일 기반 3탭). 페이지 미구현 | 🔄 |

#### 재무제표 통합 대시보드 (`/dashboard/portfolio/financial`)

> 전체 포트폴리오의 월별 재무 현황을 엑셀 Asset Management 시트와 동일한 구조로 추적·관리하는 통합 대시보드. DRAFT(실시간 집계)/CONFIRMED(고정 저장) 상태 관리로 월말 확정 워크플로우 지원.

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| F-01 | 재무 타입 시스템 | `types/financial.ts` — FinancialSnapshot(DRAFT/CONFIRMED 상태), ExchangeRates, MonthlyCFEntry, FinancialStatementData, AssetManagementSectionData(cumBid/cumAskBv YTD 누적 필드 포함) | ✅ |
| F-02 | 월별 스냅샷 관리 API | GET/POST(`/api/portfolio/financial/snapshot`) — 스냅샷 목록·생성. PUT/GET 단일월(`[month]`) — 조회·수정. POST 확정(`[month]/confirm`) — DRAFT→CONFIRMED 전환 시 포트폴리오·연금·교육 포지션 자동 집계 | ✅ |
| F-03 | 실시간 집계 API | `/api/portfolio/financial/live-data` — DRAFT 상태 실시간 포지션 집계. `/api/portfolio/financial/tx-summary` — 거래내역 월별 bid/askBv/fixedPnl 집계. `/api/portfolio/financial/monthly-cf` — 월별 현금흐름 CRUD | ✅ |
| F-04 | 환율 실시간 조회 | `/api/exchange-rates` — yfinance 기반 USD/KRW·CAD/KRW 실시간 환율 조회. `lib/fetchers/exchange-rate.ts` 환율 페처 | ✅ |
| F-05 | 재무 계산 모듈 | `lib/portfolio/financial-calc.ts` — buildConfirmedStatementData(재무제표 집계), buildAssetManagementYearlyData(연간 테이블·YTD 계산), calcMonthlyCFSummary/History(현금흐름 집계). 엑셀 Asset Management 시트 수식 동일 구현 | ✅ |
| F-06 | 재무제표 탭 | 대차대조표(CURRENT/NON-CURRENT/INVESTMENT 섹션) + 부채 + 순자산. Net Worth 추세 차트(recharts). 월별 스냅샷 선택기 + DRAFT/CONFIRMED 상태 배지 표시 | ✅ |
| F-07 | 자산관리 탭 | 엑셀 Asset Management 시트 구조 동일 연간 테이블. FUND/KOR Stocks/US Stocks/KRW Total 4개 섹션. Baseline(Dec) + Jan~Dec 월별 컬럼. YTD 컬럼: Bid/Ask(BV)/Fixed P/L/Principal은 cumBid/cumAskBv 누적값, Cum P/L % 분모=DecBalance+cumBid(엑셀 Q21 수식 동일). Stock Deposit/Cash/Summary YTD는 `-` 공란 처리. 연도 전환 자동화(매년 12월을 신년 baseline으로). 엑셀 Dec-25~Apr-26 데이터 복원 완료(35개 수치 100% 일치 검증) | ✅ |
| F-08 | 연금·교육 탭 | 월별 스냅샷 기준 연금 계좌(퇴직연금/연금저축) + 교육 계좌 포지션 현황 요약 | ✅ |
| F-09 | 현금흐름 탭 | `MonthlyCFView` — 월별 현금흐름 입력폼(`MonthlyCFForm`) + 집계 요약. `data/monthly-cf.json` 파일 기반 저장 | ✅ |
| F-10 | 월말 확정 다이얼로그 | `MonthEndConfirmDialog` — DRAFT→CONFIRMED 전환 전 확인 UI. 포지션 집계 결과 미리보기 | ✅ |
| F-11 | 스냅샷 수정 다이얼로그 | `SnapshotEditDialog` — CONFIRMED 스냅샷 수동 수정. 항목별 인라인 편집 | ✅ |
| F-12 | JSON 백업/복원 | `/api/portfolio/financial/backup` — GET 다운로드 + POST overwrite/merge 복원(중복 기준: month 필드). `data/financial-snapshots.json` git 추적 등록(재발 방지) | ✅ |
| F-13 | 통합 백업/복원 | `/api/backup/full` — 5개 모듈(재무/연금/중장기/교육/단기) 단일 JSON 통합 백업(GET: investment-backup-YYYY-MM-DD.json) + 선택적 복원(POST: modules 배열 + overwrite/merge 모드). `components/settings/BackupRestorePanel.tsx` — `/dashboard/settings` 백업/복원 탭: 전체 통합 다운로드·복원 + 모듈별 개별 백업/복원 카드(기존 개별 API 활용). 덮어쓰기 경고 표시 | ✅ |

---

### (구) ACTION 2 · 추적 관찰

> 아래 기능은 Phase 9에서 "포트폴리오 관리"로 교체되었으나, 향후 재구현 예정으로 요구사항 보존.

**공통 UI**: 모든 Step 페이지 상단에 `[1 Thesis관리]→[2 Catalyst캘린더]→[3 실적채점]` 진행 표시 (에메랄드 테마)

#### Step 1 — Thesis 관리 (`/dashboard/thesis`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| B1-01 | Thesis 목록 | 보유 종목별 Thesis 카드 그리드. 상태(Active/Review/Exit), 수익률, 핵심 가정 진행률 | ⬜ |
| B1-02 | Thesis 작성 | 표준 템플릿 Sheet — 종목명/티커, 매수가/목표가, 핵심 가정 4개, 베어 케이스 조건, 손절 기준(-15%) | ⬜ |
| B1-03 | 핵심 가정 채점 | 가정별 Hit/Miss 토글. 2개 이상 Miss 시 자동 경고 배지 | ⬜ |
| B1-04 | localStorage 저장 | Thesis 데이터 브라우저 로컬 저장 CRUD | ⬜ |
| B1-05 | Notion 연동 | Notion Investment Thesis DB 저장/동기화 (Phase 11) | ⬜ |

#### Step 2 — Catalyst 캘린더 (`/dashboard/catalysts`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| B2-01 | 월별 캘린더 뷰 | 보유 종목별 이벤트 월별 캘린더 컴포넌트 | ⬜ |
| B2-02 | 이벤트 등록 | 종목명, 유형(실적/IR/규제/제품), 예정일, 중요도(H/M/L) | ⬜ |
| B2-03 | 타임라인 리스트 | 가까운 이벤트 순 (7일/30일/90일 필터) | ⬜ |
| B2-04 | Google Calendar 연동 | 등록 이벤트 → Google Calendar MCP 자동 동기화 (Phase 11) | ⬜ |
| B2-05 | 이벤트 결과 기록 | 이벤트 후 결과 입력 + Thesis 영향도 평가 | ⬜ |

#### Step 3 — 실적 채점 (`/dashboard/earnings`)

> ACTION 1 Step 4 체크포인트(`/dashboard/earnings-preview`)에서 채점 기준 준비 후 진입

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| B3-01 | 실적 발표 당일 분석 | 발표 EPS/매출 실제값 입력 + Claude API Beat/Miss 즉시 분석 | ⬜ |
| B3-02 | Thesis 채점 | 핵심 가정 4개 대비 결과 자동 채점. Thesis 상태 업데이트 | ⬜ |
| B3-03 | Notion 저장 | 채점 결과 → Notion Catalyst Calendar DB 자동 기록 (Phase 11) | ⬜ |

---

### ACTION 3 · 자동화 루틴

**공통 UI**: 모든 Step 페이지 상단에 `[1 MorningNote]→[2 주간리뷰]→[3 월간보고서]→[4 자동화설정]` 진행 표시 (앰버 테마) ✅

#### Step 1 — Morning Note (`/dashboard/morning-note`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| C1-01 | Morning Note 수동 생성 | "오늘 Morning Note 생성" 버튼 + Claude API 스트리밍 | ⬜ |
| C1-02 | 시장 동향 섹션 | FRED+Yahoo 시장 지수 + 거시경제 지표 요약 | ⬜ |
| C1-03 | 섹터 이슈 섹션 | WebSearch 기반 주요 섹터 뉴스 수집 | ⬜ |
| C1-04 | 보유 종목 영향 섹션 | Thesis 보유 종목별 당일 뉴스/가격 영향 체크 | ⬜ |
| C1-05 | 이력 조회 | 날짜별 Morning Note 목록 (localStorage) | ⬜ |
| C1-06 | Notion 저장 | Morning Notes DB 자동 저장 (Phase 11) | ⬜ |
| C1-07 | Gmail 발송 | 요약 이메일 자동 발송 (Phase 11) | ⬜ |

#### Step 2 — 주간 포트폴리오 리뷰 (`/dashboard/weekly-review`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| C2-01 | 주간 성과 요약 | 보유 종목별 주간 수익률 + 벤치마크 대비 알파 | ⬜ |
| C2-02 | Catalyst 결과 확인 | 지난 주 이벤트 체크리스트 | ⬜ |
| C2-03 | Thesis 재검토 알림 | 주간 변화 기준 재검토 필요 종목 하이라이트 | ⬜ |

#### Step 3 — 월간 성과 보고서 (`/dashboard/monthly-report`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| C3-01 | 월간 수익률 | 포트폴리오 월간 수익률 + KOSPI/S&P500 대비 알파 | ⬜ |
| C3-02 | Thesis 정확도 | 핵심 가정 월간 Hit Rate 바 차트 | ⬜ |
| C3-03 | 교훈 기록 | 이번 달 매매 복기 + 교훈 자유 입력 (localStorage) | ⬜ |
| C3-04 | Google Drive 저장 | 보고서 .md 자동 저장 (Phase 11) | ⬜ |

#### Step 4 — 자동화 설정 (`/dashboard/automation`)

| ID | 기능 | 설명 | 상태 |
|----|------|------|------|
| C4-01 | 스케줄 관리 | Morning Note 생성 시각, 주간 리뷰 요일 설정 | ⬜ |
| C4-02 | 조건 트리거 | 손절 경고(-15%), 목표가 도달 알림 조건 설정 | ⬜ |
| C4-03 | MCP 연결 상태 | Notion/Google Drive/Gmail/Calendar 연결 상태 카드 | ⬜ |

---

## 4. 의사결정 프레임워크

### 매수 기준 (5개 항목)

| 기준 | 요건 | 가중치 |
|------|------|--------|
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

### 표준 Thesis 구조

```
핵심 가정 4개:
  1. 성장 드라이버 — 확인 지표
  2. 수익성 개선 — 확인 지표
  3. 밸류에이션 Re-rating — 확인 지표
  4. Catalyst Timeline — 확인 지표

베어 케이스 조건 2~3개
손절 기준: 매수가 대비 -15%
```

---

## 5. Skills 활용 매핑

| Skill | 워크플로우 위치 | 주요 출력물 |
|-------|-------------|-----------|
| sector-research | ACTION 1 Step 1 | 섹터 개요 보고서 (6단계: Macro → 경쟁 → 밸류 → 투자 시사점) |
| equity-screen | ACTION 1 Step 2 | 스크리닝 종목 리스트 + 투자 아이디어 보고서 |
| earnings-analysis | ACTION 1 Step 3 | 분기 실적 Beat/Miss + KPI 트렌드 |
| earnings-preview | ACTION 1 Step 4 / ACTION 2 Step 3 | 실적 채점 기준 5가지 + 가이던스 예측 |
| initiating-coverage | ACTION 1 Step 5 | 30페이지 종합 분석 보고서 + 목표가 |
| /dcf | Step 5 내 보조 | DCF 기반 내재가치 + 시나리오 3개 |
| /comps | Step 5 내 보조 | 유사 기업 EV/EBITDA·P/E 비교 밸류에이션 |
| thesis | ACTION 2 Step 1 | 투자 thesis + 핵심 가정 4개 |
| catalysts | ACTION 2 Step 2 | Catalyst 캘린더 + 이벤트 타임라인 |
| morning-note | ACTION 3 Step 1 | 시장 5분 브리핑 + 보유 종목 영향 |

---

## 6. MCP 연동 요구사항

| MCP | 목적 | 주요 활용 기능 |
|-----|------|-------------|
| Notion MCP | 지식베이스 허브 | Thesis 저장, Morning Note, Catalyst 기록, Performance DB |
| Google Drive MCP | 문서 저장소 | 분석 보고서 자동 저장, 월간 보고서 |
| Gmail MCP | 알림 시스템 | Morning Note 요약, 실적 발표 전 알림, 손절 경고 |
| Google Calendar MCP | 이벤트 관리 | Catalyst 캘린더 자동 동기화 |

### Notion DB 스키마

| DB | 주요 필드 | 연동 출처 |
|----|---------|---------|
| Investment Thesis DB | 종목명, 섹터, 매수일, 목표가, 핵심가정4, Thesis상태, 수익률 | /initiating-coverage → 자동 생성 |
| Catalyst Calendar DB | 종목명, 이벤트명, 예정일, 중요도, 결과, Thesis영향 | /catalysts → Google Calendar 동기화 |
| Morning Notes DB | 날짜, 시장요약, 섹터이슈, 보유종목영향 | /morning-note → 매일 자동 생성 |
| Performance DB | 종목명, 매수/매도일가, 수익률, Thesis정확도, 교훈 | 월간 자동 집계 |

---

## 7. 데이터 소스 & 흐름

### 데이터 소스 우선순위

| 용도 | 한국 | 미국 |
|------|------|------|
| 시장 지수 | Yahoo Finance (^KS11, ^KQ11) | Yahoo Finance (^GSPC, ^IXIC, ^VIX) |
| 거시경제 | FRED API | FRED API |
| ETF 가격/RS | Yahoo Finance (.KS/.KQ) | Yahoo Finance (SPY 등 38종) |
| 섹터 ETF 수익률 | Yahoo Finance (KrSectorTable) | Yahoo Finance (UsSectorTable) |
| 기업 재무 | DART API + Korea Stock MCP | Yahoo Finance + Alpha Vantage |
| 경제지표 | ECOS API | FRED + Alpha Vantage |
| 금리/채권 | KoFiaBond | Yahoo Finance |
| AI 분석 | Claude API (claude-sonnet-4-6) + web_search | 동일 |

### ACTION 1 데이터 흐름

```
/dashboard/market (선행)
  ├── lib/fetchers/fred.ts + lib/fetchers/yahoo.ts → MarketEnvironmentClient (거시지표 차트)
  └── /api/market/economic-index → EconomicIndexCharts

/dashboard/sector (Step 1)
  ├── lib/fetchers/fred.ts + lib/fetchers/yahoo.ts → MarketSyncCharts
  ├── lib/etf/sector-returns.ts → KrSectorTable
  ├── lib/etf/us-sector-returns.ts → UsSectorTable
  └── lib/sector-report/data-collector.ts + lib/sector-report/llm-client.ts → SectorReportClient

/dashboard/screen (Step 2 — 탭 3개)
  ├── [탭1 주가 성과 분석] lib/fetchers/krx.ts + lib/fetchers/yahoo.ts → StockPerformanceClient → /api/stock-performance, /api/stock-performance/search
  ├── [탭2 개별주식 스크리너] lib/stock-screener/* → StockScreenerClient → /api/equity-research/screen
  ├── [탭3 실적 채점] lib/earnings-analysis/prompts.ts → /api/earnings-analysis → EarningsAnalysisClient
  └── [미구현 탭] lib/etf/rs.ts + lib/etf/momentum.ts → EtfRsTable + EtfMomentumChart
/dashboard/earnings-analysis → redirect → /dashboard/screen

/dashboard/earnings-preview (Step 3)
  └── lib/fundamental-screening/data-fetcher.ts → /api/fundamental-screening (SSE, dataOnly)
      → FundamentalScreeningClient → FinancialRawDataTable (원시 계정 테이블)
      → Checkpoint1Client (비영업자산 vs 금융부채 recharts 차트)
      → Checkpoint2Client (매출/영업이익/순이익 트렌드, YoY/QoQ, CCC)
      → Checkpoint3Client (ROA/ROE/ROIC, DuPont 분해, 비용구조)
      → Checkpoint4Client (CCR, 현금흐름 트렌드, Capex 계정 설정)

/dashboard/initiating-coverage (Step 4)
  └── lib/company-analysis/prompts.ts → /api/company-analysis → CompanyAnalysisClient
```

### ACTION 2 재무제표 대시보드 데이터 흐름

```
/dashboard/portfolio/financial (재무 통합 대시보드)
  ├── [재무제표 탭] /api/portfolio/financial/snapshot (GET) → FinancialStatementView
  │   └── lib/portfolio/financial-calc.ts buildConfirmedStatementData → 대차대조표·순자산 집계
  ├── [자산관리 탭] /api/portfolio/financial/snapshot + /api/portfolio/financial/tx-summary
  │   └── lib/portfolio/financial-calc.ts buildAssetManagementYearlyData → YTD 연간 테이블 렌더링
  ├── [연금·교육 탭] /api/portfolio/financial/live-data (DRAFT) / /api/portfolio/financial/snapshot[month] (CONFIRMED)
  │   └── EduPensionView → 연금·교육 계좌 포지션 요약
  ├── [현금흐름 탭] /api/portfolio/financial/monthly-cf → MonthlyCFView + MonthlyCFForm
  ├── [환율] /api/exchange-rates → lib/fetchers/exchange-rate.ts (yfinance) → RateCell
  ├── [확정] /api/portfolio/financial/snapshot/[month]/confirm → DRAFT→CONFIRMED 전환·집계
  └── [백업] /api/portfolio/financial/backup (GET/POST) → data/financial-snapshots.json
```

---

## 8. 미결 결정사항

| # | 항목 | 선택지 | 상태 |
|---|------|--------|------|
| OQ-01 | 한국 ETF 유니버스 | 현재 ~35종 유지 / 추가 종목 검토 | ⏳ |
| OQ-02 | ETF RS 필터 임계값 | Rolling Percentile 50 / 70 / 80 중 선택 | ⏳ |
| OQ-03 | 배포 환경 | 로컬 전용 / Vercel / 자체 서버 | ⏳ |
| OQ-04 | Notion MCP 연동 시기 | Phase 9 동시 / Phase 11 별도 | ⏳ |
| OQ-05 | Morning Note 스케줄러 | Claude Code schedule skill / Vercel Cron / GitHub Actions | ⏳ |
| OQ-06 | 레거시 라우트 처리 | Next.js redirect / 페이지 삭제 | ⏳ |

---

## 9. 성공 지표

| 카테고리 | 측정 항목 | 목표 |
|---------|---------|------|
| 시간 효율 | 종목 발굴 → 매수 결정 소요 시간 | 기존 대비 -70% |
| 시간 효율 | Daily 시장 파악 소요 시간 | 5분 이내 |
| 분석 품질 | 매수 종목 Thesis 문서화율 | 100% |
| 분석 품질 | Catalyst 캘린더 커버리지 | 보유 종목 주요 이벤트 100% |
| 의사결정 | 사전 정의 기준 준수율 | 매수/매도의 90% 이상 |
| 성과 추적 | Thesis 정확도 측정 | 분기별 핵심 가정 Hit Rate 추적 |
| 자동화 | Daily 루틴 자동 완료율 | 80% 이상 |

---

## 10. 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| v1.0 | 2026.03 | 최초 작성 (ETF RS 분석 플랫폼) |
| v3.0 | 2026.04.14 | 1인 투자 하우스 시스템으로 전면 재구성 — 3개 Action 워크플로우 기반 |
| v3.4 | 2026.04.24 | ACTION 1 Step 1~4 전체 구현 완료. Step 5 기본 기능 + 개선 3종(MD/PDF 저장, 상태 유지, 이전 분석 참고) 완료 |
| v4.0 | 2026.04.24 | **전면 재작성** — 코드베이스 현황 기반으로 PRD 재구성. 기능 ID 체계 통일(H/M/A/B/C). 구현 상태 열 추가. 중복 제거 |
| v4.1 | 2026.04.24 | ACTION 1 퍼널 5단계→4단계 반영. Step 2 명칭 "종목 압축"→"종목 분석". 실적 채점 Step 2 탭 통합. 체크포인트 Step 4→3, 매수 결정 Step 5→4. 페이지 맵 earnings-analysis 제거(redirect) |
| v4.2 | 2026.05.13 | Step 3 체크포인트 전면 재구성 반영 — 재무제표 수집 인프라 완료, 4대 질문 탭 구조(1/4 구현 중). A3-01~A3-04(기존 실적 채점 기준 생성 방식) → A3-01~A3-06(재무제표 수집+테이블+4대 질문 탭)으로 기능 ID 전면 재작성. 페이지 맵 earnings-preview 상태 ✅→🔄 수정. 섹션 7 데이터 흐름도 earnings-preview 업데이트 |
| v4.3 | 2026.05.14 | Step 3 체크포인트 4대 질문 탭 전체 완성 — A3-03(체크포인트 1) ✅, A3-04(체크포인트 2: 이익/YoY/QoQ/CCC) ✅, A3-05(체크포인트 3: ROA/ROE/ROIC/DuPont/비용구조) ✅, A3-06(체크포인트 4: CCR/CF트렌드/FCF) ✅. A3-01 ratioItems 수집 추가, 기업명 자동 추출 반영. 페이지 맵 earnings-preview 🔄→✅. 섹션 7 Checkpoint2~4Client 데이터 흐름도 추가 |
| v4.4 | 2026.05.16 | `/dashboard/screen` 주가 성과 분석 탭(A2-00) 요구사항 추가 — 6개 차트/10개 성과 지표/종목 자동완성/sessionStorage 상태 유지. 페이지 맵 3탭 구조 반영. 섹션 7 데이터 흐름도 탭1 주가 성과 분석 추가 |
| v4.5 | 2026.05.18 | ACTION 2 포트폴리오 관리 — 장기투자 계좌 대시보드 기능 추가(D1-01~D1-05). 페이지 맵 portfolio/longterm·trend 추가 |
| v4.6 | 2026.05.18 | 장기투자 계좌 개선 — D1-03 avgCost 수수료 제외 기준 통일(calcPositions/enrichSellTransaction BUY 누적 기준 동일화). D1-06 현재가 실시간 자동 조회(Naver Finance KR / Yahoo v8 US, 5분 TTL 캐시, KR 코드 보정 맵). D1-07 보유 포지션 합계 행 확장(평가손익·수익률·누적실현·비중). 포지션 탭 KR/US 분리(전체 탭 제거, 통화 혼산 방지) |
| v4.7 | 2026.05.19 | 장기투자 계좌 추가 구현(D1-08~D1-09) — JSON 백업 시스템(자동 일별 서버 백업+UI 다운로드/복원, overwrite/merge 모드). 포트폴리오 성과 분석 전용 페이지(Jan~Apr Bootstrap JSON + May+ 동적 계산, Modified Dietz MoM%, TWR 누적수익률, KR/US 분리, KOSPI/S&P500/NASDAQ 벤치마크, 엑셀 런타임 의존성 제거). 페이지 맵 `/dashboard/portfolio/performance` 추가 |
| v4.8 | 2026.05.19 | 장기투자 계좌 보유 종목별 성과 분석(D1-10) 추가 — TWR/Alpha/연환산Alpha/MDR(Modified Dietz)/Hit Rate/MDD/Up·Down Capture 7대 지표 테이블(KRW/USD 분리). Alpha vs 벤치마크 수평 바 차트(HoldingsAlphaBarChart). MDR(Modified Dietz Return) 도입(XIRR 대체, 반복 수렴 불필요·수치 안정성 향상). Performance Analysis 탭 "실현손익 성과 분석" 섹션 제거 및 탭명 "Portfolio Analysis" → "Performance Analysis" 변경 |
| v4.9 | 2026.05.20 | 교육 계좌 대시보드(D2-01~D2-04) — 파일 기반 포지션/거래내역/리스크 관리 3탭, PositionRiskTable(손절가·nR 자동 계산), 공유 다이얼로그(EditPosition/EditTrade). 단중기 계좌(D3-01) 인프라 준비(API+컴포넌트, 페이지 미구현). 페이지 맵 education 추가. 사이드바 계좌명 변경 반영 |
| v5.0 | 2026.05.20 | 연금 계좌 대시보드(D4-01~D4-07) — 거래 기반 포지션 계산, 3탭(리밸런싱/거래내역/종목별), 퇴직연금·연금저축 계좌별 독립 리밸런싱(채권/주식 비중·현금 포함·현재가 기반), 월평균 기하수익률 컬럼, JSON 백업/복원. `/api/portfolio/risk/prices` KRX 알파뉴메릭 ETF 코드 지원·개수 제한 제거 |
| v5.1 | 2026.05.21 | 재무제표 통합 대시보드(F-01~F-12) — `/dashboard/portfolio/financial` 신규 페이지. 4탭(재무제표/자산관리/연금·교육/현금흐름). 월별 스냅샷 DRAFT/CONFIRMED 관리 시스템(DRAFT=실시간 집계, CONFIRMED=고정 저장). 엑셀 Asset Management 시트 동일 YTD 수식(cumBid/cumAskBv 누적, Cum P/L % 분모=DecBalance+cumBid). yfinance 환율 실시간 조회(USD/KRW·CAD/KRW). 재무 데이터 JSON 백업/복원 및 git 추적 등록. 페이지 맵·데이터 흐름도 업데이트 |
| v5.2 | 2026.05.21 | EduPensionView 자산관리 II 개선 — Education/Shortterm 실시간 잔고 업데이트(Naver 가격 fetch 확장), CONFIRMED 월 선택 시 liveData 항상 유지 버그 수정, 다이얼로그 UI 정리(Pension placeholder 제거·Stock Balance 필드 제거). 통합 백업/복원 시스템(F-13) 신규: `/api/backup/full` 5개 모듈 단일 JSON API + `BackupRestorePanel` + `/dashboard/settings` 백업/복원 탭. 페이지 맵 settings 설명 업데이트 |

---

*v5.2 | 2026.05.21 | Living Document — 워크플로우/기능 추가 시 수시 업데이트*
