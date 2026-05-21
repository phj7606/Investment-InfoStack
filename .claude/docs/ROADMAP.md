# ROADMAP — Investment+ (1인 투자 하우스 시스템)

> **버전**: v5.4 | **작성일**: 2026.03.31 | **최종 수정**: 2026.05.21 | **상태**: Living Document

---

## 현재 진행 상황 (2026.05.21 기준)

| Phase | 내용 | 상태 |
|-------|------|------|
| Phase 0~6 | 기반 구축 (ETF RS/모멘텀, 시장 분석, 기업 분석) | ✅ 완료 |
| Phase 7 | UI/UX Shell — 3개 Action 워크플로우 앱 재구성 | 🔄 95% 완료 |
| **Phase 8** | **ACTION 1 · 종목 탐색 구현** | **🔄 진행 중** |
| **Phase 9** | **ACTION 2 · 포트폴리오 관리 구현** | **🔄 99% 완료** |
| Phase 10 | ACTION 3 · 자동화 루틴 구현 | ⬜ 예정 |
| Phase 11 | MCP 연동 완성 | ⬜ 예정 |

---

## [완료] Phase 0~6 — 기반 구축

> ✅ **2026.03.31 ~ 2026.04.13 완료**

| 완료 기능 | 파일/컴포넌트 |
|---------|-------------|
| Mansfield RS 계산 (한국/미국 ETF) | `lib/etf/rs.ts` |
| 변동성 조정 모멘텀 (63/126/252일) | `lib/etf/momentum.ts` |
| ETF RS + 모멘텀 복합 스크리너 | `lib/etf/screener.ts`, `components/screener/` |
| Mansfield RS 랭킹 테이블 | `components/charts/EtfRsTable.tsx` |
| 모멘텀 바 차트 | `components/charts/EtfMomentumChart.tsx` |
| FRED+Yahoo 7개 동기화 차트 | `components/charts/MarketSyncCharts.tsx` |
| Claude API 기업 분석 모듈 | `lib/company-analysis/`, `components/company-analysis/` |
| JSON 캐시 | `lib/cache.ts` |
| 데이터 페처 전체 | `lib/fetchers/` (fred, yahoo, krx, ecos, kofiabond, alpha-vantage, sector-flow) |
| 지표 유틸리티 | `lib/indicators/` (fearGreed, momentum, utils) |

---

## [완료 95%] Phase 7 — UI/UX Shell

> **목표**: Investment+ 브랜딩 + 3개 Action 워크플로우 기반 사이드바/페이지 구조 완성

| ID | 태스크 | 상태 |
|----|--------|------|
| P7-01 | 앱 이름/브랜딩 변경 (`lib/constants.ts` — "Investment+") | ✅ |
| P7-02 | 사이드바 전면 재편 (4개 그룹 + Action별 컬러 테마) | ✅ |
| P7-03 | 홈 페이지 — 3개 Action 워크플로우 카드 | ✅ |
| P7-04 | Step 진행 컴포넌트 (Action 1/2/3 각 인디고/에메랄드/앰버 테마) | ✅ |
| P7-05 | ACTION 1 신규 페이지 쉘 — sector, screen, earnings-analysis, earnings-preview, initiating-coverage | ✅ |
| P7-06 | ACTION 2 신규 페이지 쉘 — thesis, catalysts, earnings | ✅ |
| P7-07 | ACTION 3 신규 페이지 쉘 — morning-note, weekly-review, monthly-report, automation | ✅ |
| P7-08 | 레거시 라우트 redirect — kr-market→sector, us-market→sector, screener→screen, relative-strength→screen, company-analysis→initiating-coverage, portfolio→thesis | ⬜ |
| P7-09 | 불필요 페이지 삭제 (analytics, users) | ✅ |
| P7-10 | 빌드 검증 (`npm run build` 37개 페이지 오류 없음) | ✅ |
| P7-11 | 사이드바 아이콘 중복 제거 (시장 환경 Globe 아이콘) | ✅ |
| P7-12 | LLM 유틸리티 모듈 (`lib/llm/client.ts`, `types.ts`) | ✅ |

**미완료**: P7-08 (레거시 라우트 redirect) — 다음 기회에 처리

---

## [진행 중] Phase 8 — ACTION 1 · 종목 탐색

> **목표**: 4단계 퍼널 전체 구현 — 섹터 조감 → 종목 분석 → 체크포인트 → 매수 결정
>
> **퍼널 변경 이력**: 5단계(종목압축→실적채점) → 4단계(종목분석 탭으로 통합). `/dashboard/earnings-analysis`는 `/dashboard/screen`으로 redirect 처리.

### 선행 — 시장 환경 (`/dashboard/market`) ✅ 완료

| ID | 태스크 | 상태 |
|----|--------|------|
| P8-05 | 시장 환경 전용 페이지 (`MarketEnvironmentClient.tsx`) | ✅ |
| P8-06 | 경제지수 차트 (`EconomicIndexCharts.tsx`, `/api/market/economic-index`) | ✅ |

### Step 1 — 섹터 조감 (`/dashboard/sector`) ✅ 완료

| ID | 태스크 | 상태 |
|----|--------|------|
| P8-01 | 시장 환경 차트 탭 (Phase 6 MarketSyncCharts 이전) | ✅ |
| P8-02 | 한국 섹터 ETF 수익률 탭 (`KrSectorTable`, `/api/sector/kr-returns`) | ✅ | <!-- 개선 필요: KR ETF 데이터 정확도 및 종목 유니버스 확대 검토 --> |
| P8-03 | 미국 섹터 ETF 수익률 탭 (`UsSectorTable`, `/api/sector/us-returns`) | ✅ | <!-- 개선 필요: US ETF 수익률 계산 기간 옵션(1W/1M/3M/YTD) 추가 검토 --> |
| P8-04 | AI 섹터 보고서 탭 — 멀티 LLM(Claude/GPT/Gemini) + web_search 스트리밍. Q&A. Export. sector-research SKILL.md 6단계 워크플로우 엄격 준수. `lib/sector-report/context.tsx` React Context로 페이지 이탈 후 상태 유지 | ✅ |

### Step 2 — 종목 분석 (`/dashboard/screen`) 🔄 부분 완료

> 주가 성과 + 개별주식 스크리너 + 실적 채점을 3개 탭으로 통합한 페이지. (구 Step 2 종목 압축 + 구 Step 3 실적 채점 통합 + 주가 성과 분석 탭 신규 추가)
> `/dashboard/earnings-analysis`는 이 페이지로 redirect 처리됨.

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P8-12 | 주가 성과 분석 탭 — 히스토리컬 성과 분석 (정규화 가격/누적수익률/변동성항력/MDD/월별수익률/누적월별 6개 차트). 성과 요약 카드 10개 지표(CAGR/MDD/Sharpe/Sortino/Calmar/Beta/상관계수/월승률). 자동완성 종목 검색(KRX·US). sessionStorage 분석 상태 유지. `StockPerformanceClient.tsx`, `/api/stock-performance`, `/api/stock-performance/search`, `lib/fetchers/krx.ts` EUC-KR 디코딩+KOSPI 장기 지원, `lib/fetchers/yahoo.ts` ETF quoteType 허용. 벤치마크: KOSPI(KRX)/S&P500+NASDAQ(US) | 🔴 | ✅ |
| P8-07 | 개별주식 스크리너 탭 — screen SKILL 기반 4단계 처리(Phase A~D). 이전 분석 참고(파일 업로드/.md + 분석 이력 선택). `StockScreenerClient.tsx`, `lib/stock-screener/*`, `/api/equity-research/screen` | 🔴 | ✅ |
| P8-11 | 실적 채점 탭 — Beat/Miss 분석 + KPI 트렌드 차트. `EarningsAnalysisClient.tsx`, `/api/earnings-analysis`, `lib/earnings-analysis/prompts.ts` | 🔴 | ✅ |
| P8-08 | ETF RS 스크리너 탭 이전 — 레거시 `components/screener/` → `/dashboard/screen` 탭으로 통합 | 🟡 | ⬜ |
| P8-09 | Mansfield RS 랭킹 탭 이전 — `EtfRsTable` 통합 | 🟡 | ⬜ |
| P8-10 | 변동성 조정 모멘텀 탭 이전 — `EtfMomentumChart` 통합 | 🟡 | ⬜ |

### Step 3 — 체크포인트 (`/dashboard/earnings-preview`) ✅ 완료

> Claude 보고서 스트리밍 방식을 버리고, 4대 질문별 시각화 탭으로 재구성. 재무제표 수집 인프라 + 테이블 + 4대 질문 탭 전체 완성.

| ID | 태스크 | 상태 |
|----|--------|------|
| P8-14 | 재무제표 수집 인프라 — FnGuide(KR) HTML 파싱 / Alpha Vantage(US) API. 30일 TTL 캐시 + 연도 증분 업데이트. `FundamentalScreeningClient.tsx`, `lib/fundamental-screening/*`, `/api/fundamental-screening` (`dataOnly` 플래그 포함). FnGuide `<title>` 태그에서 기업명 자동 추출(`companyName` 필드). 캐시 키 fs4→fs5, `mergeStatements` 개선. `lib/fundamental-screening/merge.ts` 분리(mergeStatements 독립 모듈화) | ✅ |
| P8-15 | 재무제표 테이블 — sj_div별 섹션(IS/BS/CF/CIS/SCE) 접기/펼치기. 연간/분기 탭 전환(FnGuide KR 전용). 종목별 localStorage 저장/불러오기. 페이지 이동 후 sessionStorage 데이터 복원. `FinancialRawDataTable.tsx` | ✅ |
| P8-16 | 체크포인트 1: 돈이 많은 기업인가 — BS 재무상태표 기반 비영업자산(유동금융자산+현금및현금성자산+장기금융자산+관계기업등지분관련투자자산) vs 금융부채(단기사채+단기차입금+유동성장기부채+유동금융부채+장기차입금+비유동금융부채) 연도별 합산. recharts ComposedChart: 비영업자산 vs 금융부채 grouped bar + 차이 bar(양수=순현금/초록, 음수=순차입/빨강). 매칭 계정 목록 표시. `Checkpoint1Client.tsx` | ✅ |
| P8-17 | 체크포인트 2: 이익을 내는가 — IS 손익계산서 기반 매출액/영업이익/순이익 트렌드 Line 차트, 영업이익률 추이, YoY/QoQ 성장률. CCC(현금전환주기) 활동성 지표. Naver API 기반 계정 수집. `Checkpoint2Client.tsx`. 증감율 Line(매출액/영업이익 트렌드) + CCC Line → monotone에서 linear 직선으로 변경 | ✅ |
| P8-18 | 체크포인트 3: 극대화 가능한가 — FnGuide SVD_FinanceRatio.asp에서 ratioItems 자동 추출. ROA/ROE/ROIC 트렌드 Line 차트. DuPont 분해: 순이익률 × 자산회전율 × 레버리지(3개 독립 미니차트). 비용구조 비율: 매출원가율+판관비율(Bar)+영업이익률(Line). BS 계정 exactOnly 로직 추가(자산/자본 총계 FnGuide 표기 차이 대응). `Checkpoint3Client.tsx`, `types/fundamental-screening.ts` `ratioItems`/`quarterlyRatioItems` 필드 추가 | ✅ |
| P8-19 | 체크포인트 4: 현금을 버는가 — CCR(Cash Conversion Ratio = 영업CF/당기순이익) Bar 차트(에메랄드/앰버/레드 3단계 색상). 현금흐름 트렌드 Line 차트: 영업CF/Capex(음수)/재무CF/FCF. Capex 계정과목 설정 패널(Checkpoint1 AccountSelector 패턴, 기본값: 유형자산의증가+무형자산의증가). `Checkpoint4Client.tsx`. CCR Line + FCF 구성 Line → monotone에서 linear 직선으로 변경 | ✅ |

### Step 4 — 매수 결정 (`/dashboard/initiating-coverage`) 🔄 부분 완료

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P8-20 | 기업 분석 보고서 (Claude API + web_search 스트리밍). Phase 5 모듈 이전 | 🔴 | ✅ |
| P8-21 | LLM Q&A 패널 (보고서 컨텍스트 기반) | 🔴 | ✅ |
| P8-22 | MD/PDF 저장 (`window.print` 방식, 외부 라이브러리 없음) | 🟡 | ✅ |
| P8-23 | 페이지 이탈 시 분석 결과 유지 (localStorage auto-save/restore) | 🟡 | ✅ |
| P8-24 | 이전 분석 참고 (파일 업로드/.md + 분석 이력 선택 → 비교 분석 섹션 자동 추가) | 🟡 | ✅ |
| P8-25 | 매수 기준 자동 채점 — 5개 기준(Thesis 강도/밸류에이션/모멘텀/리스크/유동성) 체크리스트 UI + AI 평가 | 🔴 | ⬜ |
| P8-26 | Thesis 자동 생성 — 분석 결과 기반 표준 Thesis 초안(핵심 가정 4개 + 베어 케이스 + 손절 기준). `/dashboard/thesis`로 저장 | 🟡 | ⬜ |
| P8-27 | 보고서 Google Drive 자동 저장 (Phase 11 MCP 연동 후 활성화) | 🟢 | ⬜ |

### Phase 8 완료 기준

- [x] 선행 시장 환경 전용 페이지
- [x] Step 1 섹터 조감 전체 기능 (시장 환경/한국 섹터/미국 섹터/AI 보고서)
- [x] Step 2 주가 성과 분석 탭
- [x] Step 2 개별주식 스크리너 탭 + 실적 채점 탭
- [ ] Step 2 ETF 스크리너/RS/모멘텀 `/dashboard/screen` 통합
- [x] Step 3 체크포인트 — 재무제표 수집 인프라 + 테이블 ✅
- [x] Step 3 체크포인트 — 4대 질문 탭 전체 완성 (4/4 완료) ✅
- [x] Step 4 기업 분석 기본 기능 + 개선 3종
- [ ] Step 4 매수 기준 채점 + Thesis 자동 생성
- [ ] `npm run build` 오류 없음

---

## [95% 완료] Phase 9 — ACTION 2 · 포트폴리오 관리

> **목표**: 키움 REST API 연동 기반 계좌별 대시보드 구현.
> 1차: 추세추종 계좌(Account 1470) — 보유 포지션 + 리스크 관리 + 거래 이력 + 성과 분석.
> 이후 장기투자·단중기·연금 계좌 대시보드 동일 구조로 추가.
>
> **사이드바**: ACTION 2 "추적 관찰(Thesis/Catalyst/실적채점)" → "포트폴리오 관리"로 완전 교체.
> 구 URL(/dashboard/thesis, /catalysts, /earnings) → `/dashboard/portfolio` redirect 처리.

### 인프라 — 키움 REST API 연동

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P9-01 | 키움 REST API 클라이언트 — 토큰 발급·갱신·캐시 (`lib/fetchers/kiwoom.ts`) | 🔴 | ✅ |
| P9-02 | 보유 포지션 API 라우트 + 타입 정의 (`/api/portfolio/kiwoom/positions`, `types/portfolio.ts`) | 🔴 | ✅ |
| P9-03 | 거래 이력 API 라우트 + 성과 연산 위임 (`/api/portfolio/kiwoom/trades`) | 🔴 | ✅ |
| P9-04 | 성과 계산 모듈 + Vitest 34개 단위 테스트 전체 통과 (`lib/portfolio/performance.ts`) | 🔴 | ✅ |

### 추세추종 계좌 대시보드 (`/dashboard/portfolio/trend`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P9-05 | 리스크 관리 패널 — 시장 단계 1~5 + 투자 가능금액·여유자금·2% 룰 (localStorage 설정) | 🔴 | ✅ |
| P9-06 | 보유 포지션 테이블 — 평가손익·수익률 색상, 계좌 비중 | 🔴 | ✅ |
| P9-07 | 거래 이력 테이블 — 종목별 성과·WIN/LOSS 배지·기간/결과 필터 | 🔴 | ✅ |
| P9-08 | 성과 지표 카드 8개 — 승률·손익비·EV·평균수익·평균손실·거래수·연속손실·MDD | 🔴 | ✅ |
| P9-09 | Equity Curve 차트 (recharts LineChart, 0 기준선 점선) | 🔴 | ✅ |
| P9-10 | 월별 수익률 히트맵 (연·월 그리드, 초록/빨강 색상) | 🟡 | ✅ |
| P9-11 | 사이드바 ACTION 2 재편 + next.config.ts redirect | 🔴 | ✅ |
| P9-12 | 포트폴리오 허브 페이지 재작성 (`/dashboard/portfolio`) | 🟡 | ✅ |

### 장기투자 계좌 대시보드 (`/dashboard/portfolio/longterm`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P9-13 | LongtermTransaction 타입 정의 (`types/portfolio.ts`) | 🔴 | ✅ |
| P9-14 | 거래 CRUD API (`/api/portfolio/longterm/transactions` GET/POST/PUT) — 파일 기반 저장(`data/longterm-transactions.json`) + 서버사이드 dedup | 🔴 | ✅ |
| P9-15 | Excel 계층구조 파서 (`lib/portfolio/excel.ts`) — Stock Trading(B=종목명/C=날짜/D=Bid·Ask) + Fund Trading(A=펀드명/B=날짜/C=Bid·Ask) 이중 파서. Stock Investment 시트 lookup으로 계좌번호·시장·자산유형 자동 매핑 | 🔴 | ✅ |
| P9-16 | 실현손익 계산 모듈 (`lib/portfolio/longterm-calc.ts`) — FIFO 가중평균단가, 수수료 차감 순매도수익 기준 P&L | 🔴 | ✅ |
| P9-17 | 거래 내역 탭 — 계좌·시장·자산유형 필터, 날짜 내림차순 정렬, 편집 다이얼로그(TransactionForm) | 🔴 | ✅ |
| P9-18 | 종목별 탭 — stockCode+stockName+accountNo 복합 키 그룹핑, Collapsible accordion 2컬럼 그리드(72px 고정 헤더), 소계(매수/매도/잔량 평균단가/실현손익/배당) | 🔴 | ✅ |
| P9-19 | Excel 가져오기 — `parseHierarchicalExcel` 클라이언트 호출, 전체 거래 기반 dedup, 임포트 결과 알림(KR매수/매도/US매수/매도/배당 건수) | 🔴 | ✅ |
| P9-20 | 8654 펀드 계좌 지원 — Fund Trading 시트 파서(좌수·NAV 컬럼 구조), 8654 계좌 기본값 적용 | 🟡 | ✅ |
| P9-21 | 포지션 탭 KR/US 분리 + avgCost 수수료 제외 통일 — 전체 탭 제거(통화 혼산 방지), 기본값 KR. `calcPositions()` BUY 누적 시 `tx.amount`만 사용(수수료 제외)으로 종목별 탭 기준과 통일. `enrichSellTransaction()` BUY 누적도 동일 기준 적용. tfoot 합계 행 단일 통화 표시 | 🔴 | ✅ |
| P9-22 | 현재가 실시간 자동 조회 API (`/api/portfolio/longterm/prices`) — KR 종목: Naver Finance `m.stock.naver.com/api/stock/{code}/basic` closePrice 필드. US 종목: Yahoo Finance v8/finance/chart `meta.regularMarketPrice`(curl 기반, v7 quote는 401 차단). FUND 타입 제외(notFound). KR 코드 보정 맵(005939→005930). 5분 TTL 캐시(readCache/writeCache). `lib/fetchers/yahoo.ts` `fetchYahooCurrentPrices()` 추가. 대시보드 마운트 시 자동 실행, 새로고침 버튼 + 조회 시각 표시 + 로딩 스피너 | 🔴 | ✅ |
| P9-23 | 보유 포지션 합계 행 확장 — tfoot에 평가손익 합계·수익률(총평가손익/총매입원가)·누적실현손익·비중(100%) 4개 컬럼 추가 | 🟡 | ✅ |
| P9-24 | JSON 백업 시스템 — 자동 일별 서버 백업(writeTransactions 직전 data/backups/YYYY-MM-DD.json, 30일 보관) + GET /api/portfolio/longterm/backup 다운로드 + POST /api/portfolio/longterm/backup 복원(overwrite/merge, dedup 키: date::stockCode::tradeType::quantity::price) + LongtermDashboardClient.tsx "JSON 백업"/"JSON 복원" 버튼 추가 | 🔴 | ✅ |
| P9-25 | 포트폴리오 성과 분석 전용 페이지 (`/dashboard/portfolio/performance`) — Jan~Apr 2026 Bootstrap JSON + May 2026+ 거래내역 동적 계산(Modified Dietz MoM%, TWR rechainCumPct() 누적수익률). KR/US 분리. KOSPI/S&P500/NASDAQ 벤치마크 비교. 완료 월 24h / 현재 월 5min TTL 캐시. 엑셀 런타임 의존성 제거(Option B 전환). `PerformanceDashboardClient.tsx`, `performance-benchmark.ts`, `performance-excel.ts`, `data/performance-bootstrap.json` | 🔴 | ✅ |
| P9-26 | 보유 종목별 성과 분석 — TWR/Alpha/연환산α/MDR(Modified Dietz)/Hit Rate/MDD/Up·Down Capture 7대 지표. KRW/USD 탭 분리. Alpha vs 벤치마크 수평 바 차트(HoldingsAlphaBarChart). 벤치마크: ^KS11(KR)/^GSPC(US). Performance Analysis 탭 "실현손익 성과 분석" 섹션 제거 → 보유 종목별 성과로 대체. `lib/portfolio/holdings-performance.ts`, `HoldingsPerformanceTable.tsx`, `HoldingsAlphaBarChart.tsx`, `/api/portfolio/longterm/holdings-performance` | 🔴 | ✅ |

### 교육 계좌 대시보드 (`/dashboard/portfolio/education`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P9-27 | 교육 계좌 대시보드 — 파일 기반 3탭(포지션/거래내역/리스크 관리). `AddPositionDialog`/`SellPositionDialog`/`AddTradeDialog`. 현재가 자동 조회(Naver Finance KR). `data/education-account.json` 파일 기반 저장. `RiskManagementPanel` + `PositionRiskTable` 리스크 탭. 백업/복원 API. `/api/portfolio/education/*`, `lib/portfolio/educationData.ts` | 🔴 | ✅ |
| P9-28 | `PositionRiskTable` — 손절가(bidPrice × (1-cutoff)) / 주당리스크 / nR 수량(min(nR손실한도, 1회투자한도)) / 투자금 / 계좌손절비중 자동 계산. `/api/portfolio/risk/prices` 현재가 조회 연동. `components/portfolio/PositionRiskTable.tsx` | 🔴 | ✅ |
| P9-29 | 공유 다이얼로그 컴포넌트(`components/portfolio/shared/`) — `EditPositionDialog`, `EditTradeDialog`. Education/Shortterm 계좌 공통 재사용 | 🟡 | ✅ |
| P9-30 | 단중기 계좌(Account 2805) 인프라 — `/api/portfolio/shortterm/*` API 라우트 + `ShorttermAccountDashboardClient.tsx` + `data/shortterm-account.json` + `lib/portfolio/shorttermData.ts`. 페이지(`/dashboard/portfolio/shortterm`) 미구현 | 🔴 | 🔄 |

### 재무제표 통합 대시보드 (`/dashboard/portfolio/financial`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P9-38 | 재무 타입 정의 (`types/financial.ts`) — FinancialSnapshot(DRAFT/CONFIRMED 상태 관리), ExchangeRates, MonthlyCFEntry, FinancialStatementData, AssetManagementSectionData(cumBid/cumAskBv YTD 누적 필드 포함) | 🔴 | ✅ |
| P9-39 | 월별 스냅샷 API — GET/POST(`/api/portfolio/financial/snapshot`), PUT/GET 단일월(`[month]`), POST 확정(`[month]/confirm`). DRAFT/CONFIRMED 상태 관리. DRAFT는 실시간 집계, CONFIRMED는 고정 저장. 확정 시 포트폴리오·연금·교육 포지션 자동 집계 | 🔴 | ✅ |
| P9-40 | 실시간 집계 API — `/api/portfolio/financial/live-data`(DRAFT용 실시간 포지션 집계), `/api/portfolio/financial/tx-summary`(거래내역 월별 bid/askBv/fixedPnl 집계), `/api/portfolio/financial/monthly-cf`(월별 현금흐름 CRUD), `/api/exchange-rates`(yfinance 기반 USD/KRW·CAD/KRW 실시간 환율 조회) | 🔴 | ✅ |
| P9-41 | 재무 계산 모듈 (`lib/portfolio/financial-calc.ts`) — buildConfirmedStatementData(재무제표 집계), buildAssetManagementYearlyData(연간 테이블·YTD 계산), calcMonthlyCFSummary/History(현금흐름 집계). 엑셀 Asset Management 시트 수식 동일 구현(cumBid/cumAskBv 누적 추적, Cum P/L % 분모=DecBalance+cumBid) | 🔴 | ✅ |
| P9-42 | 재무제표 탭 (`FinancialStatementView`) — 대차대조표(CURRENT/NON-CURRENT/INVESTMENT 섹션) + 부채 + 순자산 + Net Worth 추세 차트(recharts). 월별 스냅샷 선택기 + DRAFT/CONFIRMED 상태 표시 | 🔴 | ✅ |
| P9-43 | 자산관리 탭 (`AssetManagementView`) — 엑셀 Asset Management 시트 구조 동일 연간 테이블. FUND/KOR Stocks/US Stocks/KRW Total 4개 섹션. Baseline(Dec) + Jan~Dec 월별 컬럼. YTD 컬럼(cumBid/cumAskBv 누적, Cum P/L % 분모=DecBalance+cumBid). Stock Deposit/Cash/Summary YTD 공란(-) 처리. 연도 전환 자동화(매년 12월을 신년 baseline으로). 엑셀 Dec-25~Apr-26 데이터 복원 완료(35개 수치 100% 일치 검증) | 🔴 | ✅ |
| P9-44 | 연금·교육 탭 (`EduPensionView`) + 현금흐름 탭 (`MonthlyCFView`) + 월말 확정 다이얼로그(`MonthEndConfirmDialog`) + 스냅샷 수정 다이얼로그(`SnapshotEditDialog`) + 현금흐름 입력폼(`MonthlyCFForm`) + 환율 셀 컴포넌트(`RateCell`) + 자산관리 II 개선(Education/Shortterm 실시간 잔고: Naver 가격 fetch 포함, CONFIRMED 월 선택 시 liveData 항상 유지, 입력 다이얼로그 UI 정리) | 🔴 | ✅ |
| P9-45 | JSON 백업/복원 (`/api/portfolio/financial/backup`) — GET 백업 다운로드 + POST overwrite/merge 복원(중복 기준: month 필드). 재무 대시보드 UI 내 복원/백업 버튼. `data/financial-snapshots.json` git 추적 등록(재발 방지). `data/monthly-cf.json` 현금흐름 데이터 저장 | 🔴 | ✅ |
| P9-46 | 통합 백업/복원 UI — `/api/backup/full`(5개 모듈 단일 JSON GET/POST, overwrite/merge 모드) + `components/settings/BackupRestorePanel.tsx`(전체 통합 백업 다운로드·모듈 선택 복원·모듈별 개별 백업/복원 카드) + `/dashboard/settings` "백업/복원" 탭 추가. 덮어쓰기 경고 표시 | 🔴 | ✅ |

### 연금 계좌 대시보드 (`/dashboard/portfolio/pension`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P9-31 | 연금 계좌 타입 정의 (`types/portfolio.ts`) — PensionTransaction(BUY/SELL/DIVIDEND), PensionPosition, PensionAccountSummary, PensionRebalancingConfig(RETIREMENT/SAVINGS 계좌별 독립) | 🔴 | ✅ |
| P9-32 | 거래 CRUD API (`/api/portfolio/pension/transactions`) + 저장소(`lib/portfolio/pension-store.ts`) — BUY/SELL/DIVIDEND 추가/편집/삭제. `data/pension-transactions.json` 파일 기반. 자동 일별 백업(pension-backups/, 30일 보관) | 🔴 | ✅ |
| P9-33 | 포지션 계산 모듈 (`lib/portfolio/pension-calc.ts`) — 거래내역 → 현재 보유 포지션 동적 계산. 가중평균단가 FIFO 추적. SELL 시 realizedPL 자동 계산. firstBuyDate 추출로 보유기간·월평균 기하수익률 계산 | 🔴 | ✅ |
| P9-34 | 연금 계좌 대시보드 3탭 UI — 리밸런싱 탭(계좌별 포지션 테이블 + 리밸런싱 분석) / 거래내역 탭(BUY/SELL/DIVIDEND 이력 + 편집/삭제) / 종목별 탭(계좌·카테고리별 accordion). 월평균 기하수익률 컬럼((1+r)^(1/months)-1). 현재가 자동 조회 | 🔴 | ✅ |
| P9-35 | 리밸런싱 분석 (`/api/portfolio/pension/rebalancing`) — 퇴직연금·연금저축 각각 독립적인 채권형/주식형 목표 비중 설정·저장. 현재가 기반 클라이언트 사이드 재계산. 보유 현금 포함 총평가금액 기준. 종목별 목표 비중 설정 테이블(월평균 수익률 포함). 구형 포맷 자동 마이그레이션 | 🔴 | ✅ |
| P9-36 | JSON 백업/복원 (`/api/portfolio/pension/backup`) — GET 다운로드(pension-backup-YYYY-MM-DD.json) + POST 복원(overwrite/merge, dedup 키: date::stockCode::accountType::tradeType::quantity::price). 리밸런싱 탭·거래내역 탭 모두 복원/백업 버튼 배치 | 🔴 | ✅ |
| P9-37 | `/api/portfolio/risk/prices` 개선 — KRX 알파뉴메릭 ETF 코드 지원(6자리+숫자포함=KR 판별, 기존 순수 숫자만 KR 판별 버그 수정). 10개 종목 제한 완전 제거 | 🔴 | ✅ |

### Phase 9 완료 기준
- [x] 키움 REST API 토큰 발급·캐시
- [x] 보유 포지션 조회 API
- [x] 거래 이력 조회 + 성과 계산 API
- [x] 성과 계산 Vitest 단위 테스트 34개 전체 통과
- [x] 추세추종 계좌 대시보드 4탭 UI (개요/보유포지션/거래이력/성과분석)
- [x] 사이드바 ACTION 2 → "포트폴리오 관리" 교체
- [x] 구 URL redirect (thesis/catalysts/earnings → portfolio)
- [x] 장기투자 계좌 대시보드 — Excel 임포트 + 거래 CRUD + 종목별 이력 accordion
- [x] 펀드(8654 계좌) Fund Trading 시트 파서
- [x] 장기투자 계좌 포지션 탭 현재가 실시간 조회 (KR/US 자동 조회, 5분 TTL 캐시)
- [x] JSON 백업 시스템 (자동 서버 백업 + UI 다운로드/복원)
- [x] 포트폴리오 성과 분석 전용 페이지 (KR/US 분리, KOSPI/S&P500/NASDAQ 벤치마크)
- [x] 보유 종목별 성과 분석 (TWR/Alpha/MDR/Hit Rate/MDD/Up·Down Capture + Alpha 바 차트)
- [x] 교육 계좌 대시보드 (포지션/거래내역/리스크 관리 3탭, 현재가 조회, 백업/복원)
- [x] PositionRiskTable — 손절가·nR 자동 계산
- [x] 연금 계좌 대시보드 (거래 기반 포지션 계산, 3탭, 리밸런싱 분석)
- [x] 연금 계좌 퇴직연금·연금저축 계좌별 독립 리밸런싱
- [x] 재무제표 통합 대시보드 (4탭: 재무제표/자산관리/연금·교육/현금흐름)
- [x] 월별 스냅샷 DRAFT/CONFIRMED 관리 시스템
- [x] Asset Management 연간 테이블 — 엑셀 수식 동일 YTD 계산 (cumBid/cumAskBv 누적, Cum P/L % 분모 수정)
- [x] 재무 스냅샷 JSON 백업/복원 시스템
- [x] 통합 백업/복원 UI (5개 모듈 단일 JSON, 설정 페이지 백업 탭)
- [ ] 단중기 계좌 대시보드 페이지 구현
- [ ] 키움 API 실제 연동 검증 (HTS 데이터 대조)
- [ ] `npm run build` 오류 없음

---

## [예정] Phase 10 — ACTION 3 · 자동화 루틴

> **목표**: Morning Note 자동 생성 + 주간/월간 리뷰 + 자동화 스케줄 설정

### Morning Note (`/dashboard/morning-note`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P10-01 | Morning Note 생성 API — FRED+Yahoo 시장 + WebSearch 뉴스 + Claude API 종합 스트리밍 | 🔴 | ⬜ |
| P10-02 | 렌더링 UI — 시장 동향 / 섹터 이슈 / 보유 종목 영향 3개 섹션 카드 | 🔴 | ⬜ |
| P10-03 | 이력 조회 — 날짜별 목록 (localStorage) | 🟡 | ⬜ |

### 주간 리뷰 (`/dashboard/weekly-review`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P10-04 | 주간 성과 요약 테이블 (보유 종목 주간 수익률 + 벤치마크 대비 알파) | 🟡 | ⬜ |
| P10-05 | Catalyst 결과 확인 체크리스트 | 🟡 | ⬜ |
| P10-06 | Thesis 재검토 알림 (주간 변화 기준) | 🟡 | ⬜ |

### 월간 보고서 (`/dashboard/monthly-report`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P10-07 | 월간 수익률 + KOSPI/S&P500 대비 알파 | 🟡 | ⬜ |
| P10-08 | Thesis 정확도 통계 (핵심 가정 월간 Hit Rate 바 차트) | 🟡 | ⬜ |
| P10-09 | 교훈 기록 (자유 텍스트 + localStorage) | 🟡 | ⬜ |

### 자동화 설정 (`/dashboard/automation`)

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P10-10 | 스케줄 설정 UI (Morning Note 시각, 주간 리뷰 요일) | 🟡 | ⬜ |
| P10-11 | 조건 트리거 설정 (손절 경고 -15%, 목표가 도달 알림) | 🟡 | ⬜ |
| P10-12 | MCP 연결 상태 카드 (Notion/Drive/Gmail/Calendar) | 🟡 | ⬜ |

### Phase 10 완료 기준
- [ ] Morning Note 수동 생성 + 스트리밍 렌더링
- [ ] Morning Note 이력 조회
- [ ] 주간 리뷰 성과 테이블
- [ ] 월간 Thesis 정확도 통계
- [ ] `npm run build` 오류 없음

---

## [예정] Phase 11 — MCP 연동 완성

> **목표**: Notion / Google Drive / Gmail / Google Calendar MCP 전체 연결 + 자동화 파이프라인 활성화

| ID | 태스크 | 우선순위 | 상태 |
|----|--------|---------|------|
| P11-01 | Notion DB 스키마 생성 4개 — Investment Thesis DB, Catalyst Calendar DB, Morning Notes DB, Performance DB | 🔴 | ⬜ |
| P11-02 | Thesis ↔ Notion Investment Thesis DB 양방향 동기화 | 🔴 | ⬜ |
| P11-03 | Morning Note → Notion Morning Notes DB 자동 저장 | 🔴 | ⬜ |
| P11-04 | Catalyst → Google Calendar MCP 자동 동기화 | 🔴 | ⬜ |
| P11-05 | 실적 알림 → Gmail (T-7일, T-1일 자동 발송) | 🟡 | ⬜ |
| P11-06 | Morning Note 요약 → Gmail 매일 자동 발송 | 🟡 | ⬜ |
| P11-07 | 기업 분석 보고서 → Google Drive .md 자동 저장 | 🟡 | ⬜ |
| P11-08 | 손절 경고(-15%) + 목표가 도달 알림 자동화 | 🟡 | ⬜ |
| P11-09 | Notion 동기화 API 연결 (`app/api/notion-sync/` 기반 구현 완료 → UI 연동) | 🟡 | ⬜ |

### Phase 11 완료 기준
- [ ] Notion 4개 DB 연결 + CRUD 동작
- [ ] Catalyst → Google Calendar 동기화
- [ ] Morning Note 자동 생성 + Notion 저장 + Gmail 발송 파이프라인
- [ ] 손절/목표가 알림 동작

---

## 미결 결정사항

| # | 항목 | 선택지 | 상태 |
|---|------|--------|------|
| OQ-01 | 한국 ETF 유니버스 | 현재 ~35종 유지 / 추가 종목 검토 | ⏳ |
| OQ-02 | ETF RS 필터 임계값 | Rolling Percentile 50 / 70 / 80 | ⏳ |
| OQ-03 | 배포 환경 | 로컬 전용 / Vercel / 자체 서버 | ⏳ |
| OQ-04 | Notion MCP 연동 시기 | Phase 9 동시 / Phase 11 별도 | ⏳ |
| OQ-05 | Morning Note 스케줄러 | Claude Code schedule skill / Vercel Cron / GitHub Actions | ⏳ |
| OQ-06 | 레거시 라우트 처리 | Next.js redirect 추가 / 페이지 삭제 | ⏳ |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| v1.0 | 2026.03 | 최초 작성 (ETF RS 분석 플랫폼 Phase 0~3) |
| v3.0 | 2026.04.14 | Investment+ 전면 재구성 — 3개 Action 워크플로우 기반 Phase 7~11 신규 추가 |
| v3.4 | 2026.04.24 | Phase 8 Step 1~4 전체, Step 5 일부 완료 반영 |
| v4.0 | 2026.04.24 | **전면 재작성** — 코드베이스 현황 기반으로 Phase 구조 재정립. Phase ID 체계 통일(P7~P11). 완료/진행/예정 명확히 분리. 레거시 Phase 0~6 요약 통합 |
| v4.1 | 2026.04.24 | Phase 8 퍼널 구조 수정 — 5단계→4단계 반영. Step 2 명칭 "종목 압축"→"종목 분석". 실적 채점 Step 2 탭 통합. 체크포인트 Step 4→3, 매수 결정 Step 5→4로 재정렬 |
| v4.2 | 2026.04.28 | Step 3 체크포인트 미구현 상태로 정정(✅→⬜). P8-14/15/16 상태 정정. P8-02 KR ETF 개선 비고, P8-03 US ETF 개선 비고 추가 |
| v4.3 | 2026.05.13 | Step 3 체크포인트 전면 재구성 — Claude 스트리밍 방식 폐기, 4대 질문별 시각화 탭 구조로 전환. P8-14(재무제표 수집 인프라) ✅, P8-15(재무제표 테이블) ✅, P8-16(체크포인트 1: 돈이 많은 기업인가) 🔄, P8-17~19(체크포인트 2~4) ⬜ 신규 세분화. Step 4 태스크 ID P8-17~24 → P8-20~27로 재정렬. Phase 8 완료 기준 Step 3 항목 2개로 분리 |
| v4.4 | 2026.05.14 | P8-18(체크포인트 3: 극대화 가능한가) + P8-19(체크포인트 4: 현금을 버는가) 구현 완료. Step 3 4대 질문 탭 전체 완성(4/4). FnGuide 기업명 자동 추출(`<title>` 태그), BS 계정 exactOnly 로직 추가(자산/자본 총계 표기 차이 대응). `ratioItems`/`quarterlyRatioItems` 타입 필드 추가. P8-16 상태 🔄→✅, P8-17 상태 ⬜→✅. Phase 8 Step 3 완료 기준 반영 |
| v4.5 | 2026.05.16 | P8-12 주가 성과 분석 탭 구현 완료(6개 차트+10개 성과 지표+종목 자동완성 검색+sessionStorage 상태 유지). Checkpoint2/4 차트 라인 monotone→linear 직선화. 펀더멘털 스크리닝 merge.ts 독립 모듈 분리. Step 2 설명 3탭 구조(주가 성과+개별주식 스크리너+실적 채점) 반영. Phase 8 완료 기준 Step 2 주가 성과 분석 탭 추가 |
| v4.6 | 2026.05.17 | Phase 9 ACTION 2 "추적 관찰" → "포트폴리오 관리" 전면 교체. 키움 REST API 클라이언트(토큰·잔고·거래내역), 성과 계산 모듈(승률·손익비·EV·Equity Curve·MDD) + Vitest 34개 단위 테스트, 추세추종 계좌 대시보드 4탭 UI, 사이드바 재편, redirect 추가 |
| v4.7 | 2026.05.18 | Phase 9 장기투자 계좌 대시보드 구현 완료(P9-13~P9-20) — Excel 계층구조 이중 파서(Stock/Fund Trading), 거래 CRUD API + 파일 기반 저장, FIFO 실현손익 계산, 종목별 accordion 2컬럼 그리드, 펀드(8654 계좌) 지원 |
| v4.8 | 2026.05.18 | Phase 9 장기투자 계좌 추가 개선(P9-21~P9-23) — 포지션 탭 KR/US 분리(전체 탭 제거, 통화 혼산 방지) + avgCost 수수료 제외 기준 통일. 현재가 실시간 자동 조회 API(Naver Finance KR / Yahoo v8 US, FUND 제외, KR 코드 보정 맵, 5분 TTL 캐시, 마운트 시 자동 실행). 보유 포지션 합계 행 확장(평가손익·수익률·누적실현손익·비중 4개 컬럼 추가) |
| v4.9 | 2026.05.19 | Phase 9 장기투자 계좌 추가 구현(P9-24~P9-25) — JSON 백업 시스템(자동 일별 서버 백업+UI 다운로드/복원, overwrite/merge 모드). 포트폴리오 성과 분석 전용 페이지(Jan~Apr Bootstrap JSON + May+ 동적 계산, Modified Dietz MoM%, TWR 누적수익률, KR/US 분리, KOSPI/S&P500/NASDAQ 벤치마크, 엑셀 런타임 의존성 제거) |
| v5.0 | 2026.05.19 | Phase 9 P9-26 완료 — 장기투자 계좌 보유 종목별 성과 분석(TWR/Alpha/연환산α/MDR/Hit Rate/MDD/Up·Down Capture + HoldingsAlphaBarChart). MDR(Modified Dietz Return) 도입(XIRR 대체). Performance Analysis 탭 개선: 실현손익 섹션 제거, 보유 종목 성과 뷰 추가. 탭명 "Portfolio Analysis" → "Performance Analysis" |
| v5.1 | 2026.05.20 | Phase 9 P9-27~P9-29 완료 — 교육 계좌 대시보드(3탭/현재가 조회/백업), PositionRiskTable(손절가·nR 계산), 공유 다이얼로그(EditPosition/EditTrade). P9-30 단중기 계좌 인프라 준비(API+컴포넌트+데이터, 페이지 미구현). 사이드바 Short-term/Education Account 메뉴 추가 |
| v5.2 | 2026.05.20 | Phase 9 P9-31~P9-37 완료 — 연금 계좌 대시보드(3탭/거래 기반 포지션 계산/리밸런싱 분석/백업). 퇴직연금·연금저축 계좌별 독립 리밸런싱(채권/주식 비중 + 현금 포함 + 현재가 기반). 월평균 기하수익률 컬럼. `/api/portfolio/risk/prices` KRX 알파뉴메릭 코드 지원·개수 제한 제거 |
| v5.3 | 2026.05.21 | Phase 9 P9-38~P9-45 완료 — 재무제표 통합 대시보드(`/dashboard/portfolio/financial`) 구현. 4탭(재무제표/자산관리/연금·교육/현금흐름). 월별 스냅샷 DRAFT/CONFIRMED 관리 시스템. 엑셀 Asset Management 시트 동일 YTD 수식(cumBid/cumAskBv 누적, Cum P/L % 분모=DecBalance+cumBid). 환율 실시간 조회(yfinance USD/KRW·CAD/KRW). 재무 데이터 JSON 백업/복원 및 `data/financial-snapshots.json` git 추적 등록. Phase 9 현황 98% 완료 갱신 |
| v5.4 | 2026.05.21 | EduPensionView 자산관리 II 개선(P9-44) — Education/Shortterm 실시간 잔고 업데이트(Naver 가격 fetch 확장), CONFIRMED 월 선택 시 liveData 유지 버그 수정, 다이얼로그 UI 정리(Pension placeholder 제거·Stock Balance 필드 제거). P9-46 신규: 통합 백업/복원 시스템 구현(`/api/backup/full` 5개 모듈 단일 JSON API + `BackupRestorePanel` + `/dashboard/settings` 백업/복원 탭). Phase 9 현황 99% 완료 갱신 |

---

*v5.4 | 2026.05.21 | Living Document*
