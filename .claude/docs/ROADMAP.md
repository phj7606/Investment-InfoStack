# ROADMAP — ETF 상대강도 분석 플랫폼

> **버전**: v2.9 | **작성일**: 2026.03.31 | **최종 수정**: 2026.04.13 | **상태**: Living Document
> PRD와 함께 관리. 새로운 기능/수정사항 추가 시 수시 반영.

---

## 전체 Phase 구조

```
Phase 0        Phase 1        Phase 2        Phase 3        Phase 4        Phase 5        Phase 6
기반 + 알고리즘 → 지표 계산 → 스크리너 → 대시보드 통합 → Sector Flow → 기업 분석 모듈 → 시장 분석 탭
~1주            ~3주           ~2주           ~3주           ~2주           ~3주           ~1주
```

---

## Phase 0 — 기반 구축 + 알고리즘 수정 ✅ 완료

**목표**: 프로젝트 디렉토리 구조 완성 + ETF 코드 알고리즘 버그 수정 + 데이터 파이프라인 구축

> ✅ **2026.03.31 완료** — 10개 태스크 전체 완료

### 디렉토리 구조

```
Investment-InfoStack/
├── app/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── page.tsx                  # 대시보드 홈 (요약)
│   │       ├── kr-market/                # 한국 ETF RS 랭킹
│   │       ├── us-market/                # 미국 ETF RS 랭킹
│   │       ├── relative-strength/        # 상대강도 상세
│   │       ├── screener/                 # 복합 조건 스크리너
│   │       └── settings/                 # 티커/파라미터 관리
│   └── api/
│       └── price/
│           ├── kr-etf/route.ts           # 한국 ETF 가격 수집
│           └── us-etf/route.ts           # 미국 ETF 가격 수집
├── lib/
│   ├── indicators/
│   │   ├── utils.ts                      # Rolling Percentile 등 공통 유틸
│   │   ├── rs.ts                         # Mansfield RS 계산 (MA 252일)
│   │   └── momentum.ts                   # 변동성 조정 모멘텀 (63/126/252)
│   └── fetchers/
│       └── yahoo.ts                      # Yahoo Finance API 클라이언트
├── config/
│   ├── tickers_kr_etf.json               # 한국 ETF 국내 (~35종, 개별주식 제외)
│   ├── tickers_us_etf_themes.json        # 미국 직접 상장 테마 ETF (38종)
│   └── params.json                       # 지표 파라미터 (MA 기간, Top N 등)
├── data/
│   ├── cache/                            # 일간 가격 데이터 JSON 캐시
│   └── indicators/                       # 지표 계산 결과 JSON 캐시
└── components/
    ├── charts/                           # recharts 지표 차트
    └── common/                           # 재사용 컴포넌트
```

### 태스크 목록

| ID | 태스크 | 설명 | 완료 근거 | 상태 |
|----|--------|------|---------|---------|
| P0-01 | 레포 디렉토리 구조 | `app/api/`, `lib/indicators/`, `lib/fetchers/`, `config/`, `data/` 생성 | 모든 폴더 존재 확인 | ✅ |
| P0-02 | Mansfield RS MA 수정 | `ma_period=260` → `252` (연간 실제 거래일 수 기준) | `utils.ts` window=252, `params.json` mansfieldPeriodDays=252 | ✅ |
| P0-03 | 모멘텀 기간 파라미터 수정 | `62/125/251` → `63/126/252` (표준 거래일 수) | `momentum.ts` MOMENTUM_PERIODS 63/126/252 확인 | ✅ |
| P0-04 | 한국 ETF 개별주식 제거 | 6종 제거 (SK하이닉스, 삼성전자, 알테오젠 등) | `tickers_kr_etf.json` 순수 ETF 40종만 포함 확인 | ✅ |
| P0-05 | 예외 처리 개선 | `except: continue` → 구조화된 예외처리 | TypeScript fetchers 전체 `try/catch` 패턴 사용 | ✅ |
| P0-06 | 출력 방식 개선 | `display()` → 범용 출력 | TypeScript 환경 — 해당 없음 (Next.js API Routes로 대체) | ✅ |
| P0-07 | 티커 JSON 파일 생성 | `tickers_kr_etf.json`, `tickers_us_etf_themes.json` (38종) | 두 파일 모두 존재, 38종 필드 완비 확인 | ✅ |
| P0-08 | Yahoo fetcher 구현 | 한국/미국 ETF + 벤치마크 가격 수집. `auto_adjust=True` | `lib/fetchers/yahoo.ts` 완전 구현 확인 | ✅ |
| P0-09 | JSON 캐시 구현 | `data/cache/` JSON 저장/로드. hit/miss TTL 관리 | `lib/cache.ts` 완전 구현 확인 | ✅ |
| P0-10 | Rolling Percentile 함수 | `lib/indicators/utils.ts` — 룩어헤드 없는 정규화 함수 | `rollingPercentileRank()` 구현 확인 | ✅ |

**추가 완료 (이번 세션)**

| 항목 | 설명 | 완료 근거 |
|-----|------|---------|
| `data/indicators/` 디렉토리 | 지표 계산 결과 저장 디렉토리 | `.gitkeep` 생성 완료 |
| `lib/indicators/momentum.ts` | `momentumScore()`, `momentumRanking()` 구현 | 파일 존재, `tsc --noEmit` 통과 |
| `types/index.ts` 도메인 타입 | `MomentumScore`, `RankedMomentum` 추가 | 타입 정의 확인 |
| `config/params.json` momentum 섹션 | `periods: [63,126,252]`, `lookbackDays: 10`, `topN: 15` | 파라미터 확인 |

---

## Phase 1 — 핵심 지표 계산 ✅ 완료

**목표**: Mansfield RS + 변동성 조정 모멘텀 TypeScript 구현 완성. 기본 차트 출력.

> ✅ **2026.03.31 완료** — 7개 태스크 전체 완료

### 태스크 목록

| ID | 태스크 | 설명 | 완료 근거 | 상태 |
|----|--------|------|---------|------|
| P1-01 | Mansfield RS — 한국 ETF | 국내 40종. 벤치마크 ^KS11. MA 252일. Rolling Percentile. | `lib/etf/rs.ts` `calcEtfRs("kr")` 구현, `kr-market/page.tsx` 연결 | ✅ |
| P1-02 | Mansfield RS — 미국 ETF | 38종. 벤치마크 SPY. MA 252일. Rolling Percentile. | `lib/etf/rs.ts` `calcEtfRs("us")` 구현, `us-market/page.tsx` 연결 | ✅ |
| P1-03 | 변동성 조정 모멘텀 — 한국 ETF | 기간 63/126/252. 최근 10 거래일 평균. 상위 15 추출. | `lib/etf/momentum.ts` `calcEtfMomentum("kr")` 구현 | ✅ |
| P1-04 | 변동성 조정 모멘텀 — 미국 ETF | 기간 63/126/252. 데이터 기간 756일(2y+) 확보. | `lib/etf/momentum.ts` `calcEtfMomentum("us")` 구현 | ✅ |
| P1-05 | RS 랭킹 테이블 컴포넌트 | shadcn Table + Progress 바. 컬럼 정렬 토글 내장. | `components/charts/EtfRsTable.tsx` 구현 | ✅ |
| P1-06 | 모멘텀 바 차트 컴포넌트 | recharts BarChart. 종합 score / 3M·6M·12M 상세 뷰 토글. | `components/charts/EtfMomentumChart.tsx` 구현 | ✅ |
| P1-07 | 단위 테스트 | Vitest 도입. mansfieldRS, rollingPercentileRank, momentumScore, momentumRanking 엣지케이스 검증. | `npm test` 29개 전체 통과 | ✅ |

**추가 완료 (Phase 3 선행)**

| 항목 | 설명 | 완료 근거 |
|-----|------|---------|
| `app/api/etf/rs/route.ts` | `GET /api/etf/rs?market=kr\|us` API Route | 파일 존재, tsc 통과 |
| `app/api/etf/momentum/route.ts` | `GET /api/etf/momentum?market=kr\|us` API Route | 파일 존재, tsc 통과 |
| `relative-strength/page.tsx` 전면 수정 | US/KR 탭 전환, RS 테이블 + 모멘텀 차트 실 데이터 연결 | RSC에서 `calcEtfRs` + `calcEtfMomentum` 직접 호출 |
| `us-market/page.tsx` 전면 수정 | RS 랭킹 테이블 + 모멘텀 Top 15 바 차트 연결 | 실 데이터 렌더링 구현 완료 |
| `kr-market/page.tsx` ETF RS 섹션 추가 | 기존 F&G 차트 아래 ETF RS 테이블 추가 | `calcEtfRs("kr")` 병렬 호출로 연결 |
| `vitest.config.ts` + `package.json` test 스크립트 | `npm test`, `npm run test:coverage` 명령어 | 설정 파일 생성 완료 |

### 완료 기준
- [x] 한국 ETF Mansfield RS 테이블 렌더링 (MA 252일 적용 확인)
- [x] 미국 ETF 38종 Mansfield RS 테이블 렌더링
- [x] 변동성 조정 모멘텀 Top 15 출력
- [x] Rolling Percentile 정규화 적용 확인 (룩어헤드 없음)

---

## Phase 2 — 스크리너 구현 ✅ 완료

**목표**: RS + 모멘텀 복합 필터링 스크리너 완성

> ✅ **2026.04.01 완료** — 4개 태스크 전체 완료 (P2-05 Phase 3 이연)

### 태스크 목록

| ID | 태스크 | 설명 | 완료 근거 | 상태 |
|----|--------|------|---------|------|
| P2-01 | 스크리너 통합뷰 | RS ≥ 임계값 AND 모멘텀 Top N 복합 필터. 결과 테이블. | `lib/etf/screener.ts` `calcScreener()` — RS + 모멘텀 + MA 조인. `screener/page.tsx` RSC 연결 | ✅ |
| P2-02 | 필터 UI | shadcn/ui Input[number] + Checkbox + Select로 임계값/Top N/카테고리 설정 | `ScreenerFilterPanel.tsx` — rsPercentileMin, topNMomentum, MA10/20/50 체크박스, 카테고리 Select | ✅ |
| P2-03 | MA 필터 옵션 | 10/20/50일 이평 위 여부 조건 추가 | `calcMaFlags()` — 60일 가격 기반 sma(10/20/50) 계산. `requireMa10/20/50` 필터 동작 | ✅ |
| P2-04 | CSV 내보내기 | 스크리너 결과 BOM(UTF-8) CSV 다운로드 — Excel 한글 깨짐 없음 | `exportToCsv()` in `ScreenerResultTable.tsx` — `\uFEFF` BOM, 현재 필터 결과만 다운로드 | ✅ |
| P2-05 | 날짜별 이력 | 특정 날짜 기준 Top 15 이력 조회 | Phase 3 이연 — 과거 캐시 누적 + DatePicker 필요 | ⏳ |

**추가 완료**

| 항목 | 설명 | 완료 근거 |
|-----|------|---------|
| `lib/constants/categories.ts` | `CATEGORY_LABELS` 상수 분리 — `EtfRsTable`/`ScreenerResultTable` 공유 | 파일 존재, import 교체 완료 |
| `app/api/etf/screener/route.ts` | `GET /api/etf/screener?market=kr\|us` API Route | 파일 존재, tsc 통과 |
| `components/screener/` 디렉토리 | `ScreenerClient`, `ScreenerFilterPanel`, `ScreenerResultTable` 3개 컴포넌트 | 클라이언트 즉시 반응 필터링 동작 |
| `__tests__/etf/screener.test.ts` | `joinScreenerData` + `applyScreenerFilters` 13개 단위 테스트 | `npm test` 42개 전체 통과 |
| `types/index.ts` Phase 2 타입 | `ScreenerResult`, `ScreenerResponse`, `ScreenerFilters` 추가 | `npx tsc --noEmit` 오류 없음 |

### 완료 기준
- [x] 한국/미국 ETF 스크리닝 결과 테이블 출력
- [x] 복합 조건(RS + 모멘텀 + MA) 필터 동작 — 서버 왕복 없이 클라이언트 즉시 반응
- [x] Top N 일관성 있는 출력
- [x] CSV 내보내기 (Excel 한글 호환)

---

## Phase 3 — 대시보드 통합 ✅ 완료

**목표**: Next.js App Router 기반 대시보드 페이지 완성. API 데이터 연결.

> ✅ **2026.04.01 완료** — 잔여 4개 태스크 전체 완료

### 화면 구성

| 화면 | 라우트 | 내용 |
|-----|--------|-----|
| 홈 | `/dashboard` | 시장 요약 (한국/미국 ETF RS 상위 5종, 최근 갱신 시각) |
| 한국 시장 | `/dashboard/kr-market` | 한국 ETF Mansfield RS 랭킹 + 모멘텀 Top 15 |
| 미국 시장 | `/dashboard/us-market` | 미국 ETF 38종 RS 랭킹 + 모멘텀 Top 15 |
| 상대강도 | `/dashboard/relative-strength` | RS 테이블 + 모멘텀 바 차트 (US/KR 탭) |
| 스크리너 | `/dashboard/screener` | 복합 조건 필터링 결과 |
| 설정 | `/dashboard/settings` | 티커 목록(한국/미국) + 파라미터 읽기 전용 |

### 태스크 목록

| ID | 태스크 | 우선순위 | 완료 근거 | 상태 |
|----|--------|---------|---------|------|
| P3-01 | 사이드바 네비게이션 완성 | 🔴 | 7개 메뉴 + active state(`startsWith`) 이미 구현 완료 — tsc 통과 확인 | ✅ |
| P3-02 | 홈 화면 — 시장 요약 대시보드 | 🔴 | `dashboard/page.tsx` async RSC 전환. `calcEtfRs("us"/"kr")` 병렬 호출 → Top 5 + 기준일 표시 | ✅ |
| P3-03 | 한국 시장 화면 — RS 랭킹 테이블 + 모멘텀 바 차트 연결 | 🔴 | Phase 1에서 선행 완료 | ✅ |
| P3-04 | 미국 시장 화면 — 38종 RS 랭킹 테이블 + 모멘텀 바 차트 연결 | 🔴 | Phase 1에서 선행 완료 | ✅ |
| P3-05 | 스크리너 화면 — 복합 조건 UI + 결과 테이블 | 🟡 | Phase 2에서 선행 완료 | ✅ |
| P3-06 | 설정 화면 — 티커 목록 + 파라미터 읽기 전용 | 🟡 | `settings/page.tsx` 전면 교체. RSC에서 JSON 파일 직접 읽기. Tabs 3개(한국 ETF / 미국 ETF / 파라미터) | ✅ |
| P3-07 | API Route → 차트 데이터 연결 | 🔴 | Phase 1에서 선행 완료 | ✅ |
| P3-08 | 반응형 레이아웃 | 🟢 | 전 페이지 `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` 패턴 + `overflow-x-auto` 이미 적용 확인 | ✅ |

**추가 완료**

| 항목 | 설명 | 완료 근거 |
|-----|------|---------|
| `types/index.ts` Phase 3 타입 | `KrTicker`, `UsTicker` 추가 | `npx tsc --noEmit` 오류 없음 |

### 완료 기준
- [x] `npm run dev` 실행 후 전체 라우트 정상 접근
- [x] 사이드바 네비게이션 동작
- [x] 한국/미국 ETF RS 랭킹 테이블 실 데이터 렌더링
- [x] 스크리너 복합 필터 동작
- [x] 홈 화면 RS Top 5 실 데이터 + 기준일 표시
- [x] 설정 화면 티커 목록 + 파라미터 표시

---

## Phase 4 — Sector Flow Oscillator 탭 구현

**목표**: KOSPI 19개 업종의 기관/외국인 수급 모멘텀을 MACD 구조로 측정하는 새 대시보드 탭 구현

> 상태: 계획 중 (2026.04.08 추가)

### 알고리즘 개요

```
오실레이터 = MACD_수급 − Signal_수급
           = [EMA12(수급비율) − EMA26(수급비율)] − EMA9(MACD_수급)
```

**계산 흐름**:
1. 원본 데이터: 기관/외국인 일별 순매수, 업종 시가총액 (pykrx)
2. 시가총액 안정화: 20일 Rolling Mean
3. 수급 비율: (기관 + 외국인) / 시가총액_stable
4. 롤링 Z-score 표준화 (252일 윈도우) — 업종 간 비교 공정성
5. EMA12(flow_z), EMA26(flow_z) — adjust=False
6. MACD = EMA12 − EMA26
7. Signal = EMA9(MACD)
8. Oscillator = MACD − Signal
9. 워밍업 마스킹: 첫 52일 NaN 처리

### 대상 섹터 (KOSPI 19개)

| 코드 | 업종명 | 코드 | 업종명 |
|-----|--------|-----|--------|
| 1001 | KOSPI 전체 | 1016 | 유통업 |
| 1005 | 음식료품 | 1018 | 건설업 |
| 1006 | 섬유의복 | 1020 | 통신업 |
| 1008 | 화학 | 1021 | 금융업 |
| 1009 | 의약품 | 1022 | 은행 |
| 1011 | 철강금속 | 1024 | 증권 |
| 1012 | 기계 | 1025 | 보험 |
| 1013 | 전기전자 | 1026 | 서비스업 |
| 1015 | 운수장비 | 1028 | 반도체 |
| — | — | 1029 | IT하드웨어 |

### 태스크 목록

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P4-01 | pykrx 업종 수급 fetcher 구현 | `lib/fetchers/pykrx.ts` — KOSPI 19개 섹터 기관/외국인 순매수 + 시가총액 | 🔴 | ⬜ |
| P4-02 | SectorFlowOscillator 로직 구현 | `lib/indicators/sectorFlow.ts` — Z-score + EMA(12,26,9) + 52일 마스킹 | 🔴 | ⬜ |
| P4-03 | 업종 수급 캐시 | `data/cache/sector-flow/` — 일별 수급 데이터 JSON 캐시 | 🔴 | ⬜ |
| P4-04 | API Route 구현 | `app/api/sector-flow/route.ts` — `GET /api/sector-flow` | 🔴 | ⬜ |
| P4-05 | 업종 랭킹 테이블 컴포넌트 | `components/charts/SectorFlowTable.tsx` — Oscillator 기준 정렬 | 🔴 | ⬜ |
| P4-06 | 대시보드 탭 페이지 | `app/(dashboard)/dashboard/sector-flow/page.tsx` | 🔴 | ⬜ |
| P4-07 | 0선 돌파 시그널 표시 | 직전 거래일 대비 상향/하향 돌파 업종 뱃지 표시 | 🟡 | ⬜ |
| P4-08 | 시장 강도 요약 카드 | 양수비율, 중앙값, 상위/하위 분위 요약 StatsCard 4종 | 🟡 | ⬜ |
| P4-09 | 사이드바 네비게이션 추가 | `components/layout/dashboard-sidebar.tsx`에 "Sector Flow" 메뉴 추가 | 🔴 | ⬜ |
| P4-10 | 단위 테스트 | `__tests__/indicators/sectorFlow.test.ts` — EMA, Z-score, 워밍업 케이스 | 🟡 | ⬜ |

### 완료 기준
- [ ] `/dashboard/sector-flow` 라우트 정상 접근
- [ ] KOSPI 19개 업종 오실레이터 랭킹 테이블 렌더링
- [ ] 0선 돌파 업종 뱃지 표시
- [ ] 시장 강도 요약 카드 4종 표시
- [ ] 사이드바 "Sector Flow" 메뉴 연결

---

## Phase 5 — 기업 분석 모듈

**목표**: Claude API를 활용한 company-analysis skill 기반 기업 심층 분석 탭 구현. LLM Q&A + 문서 저장.

> 상태: 계획 중 (2026.04.12 추가)

### 화면 구성

| 화면 | 라우트 | 내용 |
|-----|--------|-----|
| 기업 분석 | `/dashboard/company-analysis` | Ticker/기업명 입력 → 분석 리포트 생성 → Q&A → 저장 |

### 분석 리포트 섹션 구조 (company-analysis skill 기반)

| 섹션 | 내용 |
|-----|-----|
| Executive Summary | 투자의견 요약, 핵심 투자 포인트 3가지 |
| 1. 기업 개요 및 사업현황 | 기업정보 테이블, 지주구조, 핵심 사업부문, 신성장동력, 매출 구성 |
| 2. 실적 분석 및 재무 현황 | 분기 확정 실적(4분기), 연간 전망, 재무 건전성(부채비율/ROE/현금흐름) |
| 3. 투자 모멘텀 및 리스크 | Bull Case(단기/중기/장기), Bear Case 리스크 테이블, 밸류에이션(PER/PBR/EV/EBITDA) |
| 4. 기술적 분석 | 이동평균선 배열, RSI/MACD/볼린저밴드, 지지/저항선 |
| 5. 종합 의견 | 투자의견/목표주가/투자기간, 핵심 체크포인트 |

### 태스크 목록

| ID | 태스크 | 설명 | 우선순위 | 상태 |
|----|--------|------|---------|------|
| P5-01 | 기업 분석 입력 UI | `company-analysis/page.tsx` — Ticker/기업명 Input + 거래소 Select + 분석 시작 버튼. 로딩 스켈레톤 | 🔴 | ⬜ |
| P5-02 | Claude API Route 구현 | `app/api/company-analysis/route.ts` — company-analysis 프롬프트 구성, claude-sonnet-4-6 호출, 스트리밍 응답 | 🔴 | ⬜ |
| P5-03 | 분석 리포트 렌더링 컴포넌트 | `components/company-analysis/ReportView.tsx` — 5개 섹션 탭/아코디언. react-markdown 또는 커스텀 Markdown 렌더러 | 🔴 | ⬜ |
| P5-04 | LLM Q&A 컴포넌트 | `components/company-analysis/QnaChat.tsx` — 분석 리포트를 system context로 포함. 채팅 UI. 스트리밍 응답 | 🔴 | ⬜ |
| P5-05 | Q&A API Route | `app/api/company-analysis/chat/route.ts` — 분석 내용 + 대화 이력 포함 Claude API 호출 | 🔴 | ⬜ |
| P5-06 | 문서 저장 기능 | `components/company-analysis/SaveActions.tsx` — Markdown Blob 다운로드 + localStorage JSON 저장 (기업명, 티커, 분석일, 내용) | 🟡 | ⬜ |
| P5-07 | 분석 이력 관리 | `components/company-analysis/HistoryPanel.tsx` — localStorage 이력 목록. 재열람/삭제. 최대 20건 | 🟡 | ⬜ |
| P5-08 | 사이드바 네비게이션 추가 | `components/layout/dashboard-sidebar.tsx`에 "기업 분석" 메뉴 추가 | 🔴 | ⬜ |
| P5-09 | 환경 변수 설정 | `ANTHROPIC_API_KEY` 환경 변수 설정 가이드. `.env.local.example` 업데이트 | 🔴 | ⬜ |
| P5-10 | 단위 테스트 | `__tests__/company-analysis/` — 프롬프트 생성 함수, 저장 유틸리티 테스트 | 🟢 | ⬜ |

### 완료 기준
- [ ] `/dashboard/company-analysis` 라우트 정상 접근
- [ ] Ticker 또는 기업명 입력 → 분석 리포트 생성 (스트리밍)
- [ ] 5개 섹션 렌더링 (Executive Summary 포함)
- [ ] LLM Q&A 동작 (분석 컨텍스트 기반 답변)
- [ ] Markdown 파일 다운로드 동작
- [ ] 분석 이력 목록에서 이전 분석 재열람
- [ ] 사이드바 "기업 분석" 메뉴 연결

---

## Phase 6 — 시장 분석 탭 구현 ✅ 완료

**목표**: `/dashboard` 홈을 시장 환경 분석 화면으로 전면 교체. Yahoo Finance + FRED API 병렬 수집으로 S&P500, NASDAQ, VIX, SDEX, HY Spread 5개 동기화 차트 구현.

> ✅ **2026.04.13 완료** — 8개 태스크 전체 완료

### 화면 구성

| 화면 | 라우트 | 내용 |
|-----|--------|-----|
| 시장 분석 | `/dashboard` | 5개 동기화 차트 — S&P500/NASDAQ, VIX/SDEX, VIX/VVIX, VVIX/VIX Ratio, HY Spread |

### 데이터 소스

| 지표 | 소스 | 설명 |
|-----|-----|-----|
| ^GSPC (S&P 500) | Yahoo Finance | 미국 대형주 지수 |
| ^IXIC (NASDAQ) | Yahoo Finance | 나스닥 종합지수 |
| ^VIX | Yahoo Finance | CBOE 변동성 지수 |
| ^VVIX | Yahoo Finance | VIX of VIX (변동성의 변동성) |
| ^SDEX | Yahoo Finance | S&P 500 Crash Risk Index (꼬리 리스크) — `fetchYahooHistory("^SDEX")` |
| ^MOVE | Yahoo Finance | ICE BofA MOVE Index (채권 변동성) — `fetchYahooHistory("^MOVE")` |
| BAMLH0A0HYM2 | FRED | ICE BofA 하이일드 스프레드 (신용 리스크) |
| SOFR | FRED | Secured Overnight Financing Rate (단기 금리) |
| DGS10 | FRED | US 10-Year Treasury Yield (장기 국채 수익률) |
| DFEDTARU | FRED | Fed Funds Target Rate Upper Bound (계단형 금리 정책) |

### 차트 구성 (Recharts syncId="market-analysis")

| 차트 | 지표 | 설명 |
|-----|-----|-----|
| 차트 1 | S&P 500 + NASDAQ | 주요 지수 추세 비교 |
| 차트 2 | VIX + SDEX | 변동성 vs 꼬리 리스크 |
| 차트 3 | VIX + VVIX | 변동성 vs 변동성의 변동성 |
| 차트 4 | VVIX/VIX Ratio | 변동성 구조 비율 신호 (y=3·6 기준선) |
| 차트 5 | HY Spread | 하이일드 신용 스프레드 |
| 차트 6 | SOFR + 10Y Yield + FED Funds Rate | SOFR·국채수익률·금리정책 비교 (FED 계단형 점선) |
| 차트 7 | 10Y Yield + MOVE Index + FED Funds Rate | 국채수익률과 채권 변동성 (FED 계단형 점선) |

### 태스크 목록

| ID | 태스크 | 우선순위 | 설명 | 상태 |
|----|--------|---------|------|------|
| P6-01 | 사이드바 이름 변경 | 🔴 | "시장 환경" → "시장 분석" (`dashboard-sidebar.tsx`) | ✅ |
| P6-02 | FRED fetcher | 🔴 | `lib/fetchers/fred.ts` — `fetchFredSeries()` 구현 | ✅ |
| P6-03 | us-analysis API Route | 🔴 | `GET /api/market/us-analysis?startDate&endDate` — Yahoo(^GSPC,^IXIC,^VIX,^VVIX,^SDEX) + FRED(BAMLH0A0HYM2) 병렬 수집. SDEX는 `fetchYahooHistory("^SDEX")`로 수집 (FRED `SDEX` 시리즈 미존재 확인) | ✅ |
| P6-04 | DateRangeControl 컴포넌트 | 🟡 | `SyncChartDateControl.tsx` — 1M/3M/6M/1Y/2Y/5Y 기간 버튼 + 직접 날짜 입력 | ✅ |
| P6-05 | 5개 동기화 차트 | 🔴 | `MarketSyncCharts.tsx` — Recharts ComposedChart × 5, `syncId="market-analysis"` 공유 | ✅ |
| P6-06 | /dashboard 페이지 교체 | 🔴 | `app/(dashboard)/dashboard/page.tsx` — RSC → `MarketAnalysisClient` 렌더링으로 전면 교체 | ✅ |
| P6-07 | 타입 정의 | 🟡 | `types/market-analysis.ts` — `UsAnalysisBar`, `UsAnalysisResponse`, `DateRange`, `PeriodLabel` | ✅ |
| P6-08 | 환경 변수 | 🔴 | `.env.local` `FRED_API_KEY=` 항목 추가 | ✅ |

### 완료 기준
- [x] `/dashboard` 시장 분석 5개 동기화 차트 렌더링
- [x] Recharts `syncId` 기반 X축 동기화 동작
- [x] 날짜 범위 버튼(1M~5Y) + 직접 입력 동작
- [x] FRED API 데이터(HY Spread) 정상 수집
- [x] 사이드바 "시장 분석" 메뉴 연결
- [x] SDEX Yahoo Finance(^SDEX) 데이터 정상 수집
- [x] Y축 자동 스케일 (domain: auto) 적용
- [x] 레전드 토글(on/off) — Chart 1·2·3 적용
- [x] 채권 차트 2개 렌더링 (SOFR+10Y / 10Y+MOVE)
- [x] FED Funds Rate 계단형(stepAfter) 점선 표시
- [x] VIX 차트 y=20 기준선 / VVIX/VIX 차트 y=3·6 기준선

---

## 미결 결정사항 추적 (Open Questions)

| # | 항목 | 상태 | 결정 내용 |
|---|-----|------|---------|
| OQ-01 | 한국 ETF 최종 유니버스 | ⏳ 미결 | |
| OQ-02 | RS 필터 임계값 (Rolling Percentile 기준) | ⏳ 미결 | |
| OQ-03 | MA 기간 단일(252) vs 멀티윈도우(60/120/252) | ⏳ 미결 | |
| OQ-04 | 대시보드 배포 환경 | ⏳ 미결 | |
| OQ-05 | Top N 기본값 | ⏳ 미결 | |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|-----|-----|---------|
| v1.0 | 2026.03 | 최초 작성 (Python + Streamlit 스택 기준) |
| v1.1 | 2026.03.27 | 기술스택 전환 — Next.js App Router, Phase 재편 |
| v2.0 | 2026.03.31 | 전면 재작성 — ETF 상대강도 분석 코드 가이드 반영. Phase 0에 알고리즘 수정 태스크 통합, 미국 직접 상장 ETF 38종 대체, Phase 수 4→3으로 축소 |
| v2.1 | 2026.03.31 | Phase 0 완료 처리 — 10개 태스크 전체 완료. Mansfield RS MA 252일 확정, momentum.ts 신규 구현(63/126/252), tickers_us_etf_themes.json 38종 생성, MomentumScore/RankedMomentum 타입 추가 |
| v2.2 | 2026.03.31 | Phase 1 완료 처리 — 7개 태스크 전체 완료. lib/etf/rs.ts + momentum.ts 서버 함수 신규, API Route /api/etf/rs + /api/etf/momentum 신규, EtfRsTable + EtfMomentumChart 컴포넌트 신규, Vitest 도입(29개 테스트 통과), Phase 3 P3-03/P3-04/P3-07 선행 완료 |
| v2.3 | 2026.04.01 | Phase 2 완료 처리 — 4개 태스크 전체 완료(P2-05 Phase 3 이연). lib/etf/screener.ts 서버 함수(joinScreenerData 순수함수), API Route /api/etf/screener 신규, ScreenerClient + FilterPanel + ResultTable 컴포넌트 3종 신규, CATEGORY_LABELS 상수 분리, 42개 테스트 전체 통과, Phase 3 P3-05 선행 완료 |
| v2.4 | 2026.04.01 | Phase 3 완료 처리 — 잔여 4개 태스크 전체 완료. 홈 대시보드 RS Top 5 실 데이터 연결(async RSC 전환), 설정 화면 티커 목록+파라미터 읽기 전용 표시(Tabs 3개), KrTicker/UsTicker 타입 추가, 반응형 레이아웃 전 페이지 확인 완료 |
| v2.5 | 2026.04.08 | Phase 4 신규 추가 — Sector Flow Oscillator 탭. KOSPI 19개 업종 기관/외국인 수급 MACD 지표. pykrx fetcher(P4-01), SectorFlowOscillator 로직(P4-02), 캐시(P4-03), API Route(P4-04), 업종 랭킹 UI(P4-05~06), 0선 돌파 시그널(P4-07), 시장 강도 요약(P4-08), 사이드바(P4-09), 단위 테스트(P4-10) 10개 태스크. 전체 Phase 구조 다이어그램 업데이트 |
| v2.6 | 2026.04.12 | Phase 5 신규 추가 — 기업 분석 모듈. Claude API 기반 company-analysis skill 연동(P5-01~02), 분석 리포트 렌더링(P5-03), LLM Q&A(P5-04~05), 문서 저장(P5-06), 이력 관리(P5-07), 사이드바(P5-08), 환경 변수(P5-09), 테스트(P5-10) 10개 태스크. 전체 Phase 구조 다이어그램 업데이트 |
| v2.7 | 2026.04.13 | Phase 6 완료 처리 — 시장 분석 탭 전면 교체. FRED API 통합(SDEX+HY Spread), 5개 동기화 차트(Recharts syncId="market-analysis"), 날짜 범위 컨트롤(1M~5Y 버튼+직접 입력), /dashboard 페이지 MarketAnalysisClient로 교체, 사이드바 "시장 환경"→"시장 분석" 변경. 전체 Phase 구조 다이어그램 업데이트 |
| v2.8 | 2026.04.13 | Phase 6 버그 수정 및 UX 개선 — SDEX 데이터 소스 FRED→Yahoo Finance(^SDEX) 수정, 차트 Y축 자동 스케일(domain: auto) 적용, X축 정렬 통일, Y축 레이블 제거, 레전드 토글 기능(Chart 1·2·3) 추가. 데이터 소스 테이블 SDEX 행 Yahoo Finance로 수정, P6-03 SDEX Yahoo 수집으로 업데이트, 완료 기준 3개 항목 추가 |
| v2.9 | 2026.04.13 | 채권/금리 차트 2개 추가 — Chart 6(SOFR+10Y Yield+FED Funds Rate), Chart 7(10Y Yield+MOVE Index+FED Funds Rate). FRED SOFR/DGS10/DFEDTARU + Yahoo ^MOVE 신규 수집. VIX 차트 y=20 기준선, VVIX/VIX 차트 y=3·6 기준선 추가. 차트 구성 테이블 차트 6·7 행 추가, 데이터 소스 테이블 4개 행 추가, 완료 기준 3개 항목 추가 |

---

*v2.9 | 2026.04.13 | Living Document — 지표/기능 추가 시 수시 업데이트*
