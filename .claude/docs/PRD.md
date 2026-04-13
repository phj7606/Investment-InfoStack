# PRD — ETF 상대강도 분석 플랫폼 (ETF Relative Strength Analytics)

> **버전**: v2.9 | **작성일**: 2026.03.31 | **최종 수정**: 2026.04.13 | **상태**: Living Document

---

## 1. 프로젝트 개요

### 1.1 목적
한국 및 미국 ETF 유니버스를 대상으로 **변동성 조정 모멘텀**과 **Mansfield 상대강도(RS)** 두 가지 핵심 알고리즘으로 강세 테마/섹터를 스크리닝하는 투자 분석 대시보드.

- 절대 모멘텀(Sharpe-like)과 상대강도(시장 대비 아웃퍼폼)를 동시 측정
- 시장 노이즈를 제거한 중장기 섹터 로테이션 신호 포착
- Next.js 웹 대시보드로 데이터 수집 → 지표 계산 → 시각화 전 과정 통합

### 1.2 분석 대상

| 유니버스 | 종목 수 | 벤치마크 | 데이터 소스 |
|---------|--------|---------|------------|
| 한국 산업/테마 ETF | ~35종 (개별주식 제외) | KOSPI (^KS11) | Yahoo Finance (.KS/.KQ) |
| 미국 직접 상장 테마 ETF | 38종 (us_theme_etfs) | S&P 500 (SPY) | Yahoo Finance |

---

## 2. 핵심 알고리즘

### 2.1 변동성 조정 모멘텀 (두 유니버스 공통)

단순 수익률 대신 Sharpe-ratio 방식으로 계산. 수익률이 높더라도 변동성이 크면 불리하게 반영.

```
모멘텀 점수 = (수익률_3M/변동성_3M + 수익률_6M/변동성_6M + 수익률_12M/변동성_12M) / 3
```

**처리 흐름**
1. 최근 10 거래일 각각에 대해 3M/6M/12M 수익률 및 표준편차 계산
2. 각 기간의 변동성 조정 수익률(수익률 ÷ 표준편차)을 평균 → 모멘텀 점수 산출
3. 모멘텀 점수 기준 상위 15개 ETF를 일자별로 추출

**기간 파라미터 (확정)**

| 기간 | 표준 거래일 수 | 비고 |
|-----|-------------|------|
| 3개월 | **63일** | 이전 코드 62일은 off-by-one 오류 |
| 6개월 | **126일** | 이전 코드 125일은 off-by-one 오류 |
| 12개월 | **252일** | 이전 코드 251일은 off-by-one 오류 |

### 2.2 Mansfield RS (상대강도)

개별 ETF가 벤치마크 대비 얼마나 강하게 움직이는지 수치화. 단순 수익률이 높은 것이 아니라 '시장 대비 자체적으로 강한' 섹터를 발굴.

```python
# 계산 단계
relative  = etf_price / benchmark_price         # 상대비율(RR)
MA        = relative.rolling(252).mean()         # 1년 이동평균 (일봉 기준)
RS_raw    = (relative / MA - 1) * 100            # Mansfield RS
RS_pct    = RS_raw.rolling(252).rank(pct=True) * 100  # Rolling Percentile 정규화
```

**MA 기간 확정: 252일 (일봉 1년)**

| 상황 | MA 52일 (기존 오류) | MA 252일 (수정 후) |
|-----|-----------------|-----------------|
| ETF 특성 | 내부 분산으로 움직임이 부드러움 | — |
| 신호 특성 | 단기 노이즈 반응, RS 진폭 작음 | 섹터 로테이션(6~18개월) 정확 포착 |
| 결론 | 권장하지 않음 | **확정 적용** |

**벤치마크 정의**

| 유니버스 | 벤치마크 |
|---------|---------|
| 한국 ETF (국내) | KOSPI (^KS11) |
| 미국 직접 상장 ETF | SPY (S&P 500) |

**Mansfield RS 해석**
- RS > 0: 벤치마크 아웃퍼폼 (강세)
- RS < 0: 벤치마크 언더퍼폼 (약세)
- Rolling Percentile ≥ 70: 상위 30% 강세 — 매수 후보군

---

## 3. 수정 사항 (기존 코드 → 개선 코드)

### 3.1 한국 ETF 코드

| 우선순위 | 문제 | 수정 내용 |
|--------|-----|---------|
| 🔴 필수 | Mansfield RS MA 기간 오류 (`ma_period=52`) | `ma_period=252`로 수정 — 일봉 1년 MA |
| 🔴 필수 | 모멘텀 기간 off-by-one (62/125/251) | 63/126/252로 수정 |
| 🔴 필수 | ETF 목록에 개별주식 6종 혼재 | 아래 6종 제거 |
| 🟡 권장 | `except: continue` 광범위 예외처리 | `except Exception as e: print(f'[ERROR] {ticker}: {e}')` |
| 🟡 권장 | `display()` Jupyter 전용 출력 | `print(df.to_string())` + `df.to_excel('output.xlsx')` |

**제거 대상 개별주식 6종**
```
000660.KS — SK하이닉스
005930.KS — 삼성전자
196170.KQ — 알테오젠
005490.KS — POSCO홀딩스
036460.KS — 한국가스공사
015760.KS — 한국전력
```

### 3.2 해외 ETF 코드 — 미국 직접 상장 ETF로 대체

기존 한국 상장 래퍼 ETF 38종의 구조적 한계:
- **유동성 열위**: 원자산 대비 거래량 현저히 낮아 괴리율 발생
- **환헤지 혼재**: 동일 기초자산에 헤지(H)/비헤지 혼재, 수익률 비교 왜곡
- **벤치마크 부재**: 절대 모멘텀만 측정, 상대강도 측정 불가
- **추적오차**: 합성(Synthetic) ETF는 스왑 구조로 원자산과 괴리

**대체 방향**: 미국 직접 상장 ETF 38종, 벤치마크 SPY, 데이터 기간 2y

| 항목 | 기존 (한국 상장) | 변경 후 (미국 직접 상장) |
|-----|--------------|---------------------|
| 유니버스 | 한국 상장 래퍼 ETF ~38종 | 미국 직접 상장 테마 ETF 38종 |
| 벤치마크 | 없음 | SPY (S&P 500) |
| 데이터 기간 | 1y | 2y (MA 252일 확보) |
| Mansfield RS | 미적용 | 252일 MA 적용 |
| 환율 | 헤지/비헤지 혼재 | USD 기준 통일 |

### 3.3 미국 직접 상장 ETF 38종 (us_theme_etfs)

| 티커 | 설명 | 테마 |
|-----|-----|-----|
| KWEB | KraneShares CSI China Internet | 중국 인터넷/기술 |
| LIT | Global X Lithium & Battery Tech | 전기차/배터리 |
| CQQQ | Invesco China Technology | 차이나 반도체/기술 |
| EWJ | iShares MSCI Japan | 일본 전체 |
| IGV | iShares Expanded Tech-Software | AI 소프트웨어 |
| BUG | Global X Cybersecurity | 사이버보안 |
| CLOU | Global X Cloud Computing | 클라우드 |
| BOTZ | Global X Robotics & AI | 온디바이스AI/로보틱스 |
| SMH | VanEck Semiconductor | 반도체 (파운드리/HBM 포함) |
| SOXX | iShares Semiconductor | 반도체 광범위 |
| SOXQ | Invesco PHLX Semiconductor | 고성장 반도체 |
| PSI | Invesco Dynamic Semiconductors | 반도체 MV |
| ITA | iShares U.S. Aerospace & Defense | 우주/항공/방산 |
| XAR | SPDR S&P Aerospace & Defense | 항공방산 |
| XLE | Energy Select Sector SPDR | 미국 원유에너지 |
| URA | Global X Uranium | 글로벌 원자력 |
| GRID | First Trust NASDAQ Clean Edge Smart Grid | AI 전력인프라 |
| GNR | SPDR S&P Global Natural Resources | 글로벌 자원생산 |
| REMX | VanEck Rare Earth/Strategic Metals | 희토류/전략자원 |
| MOO | VanEck Agribusiness | 글로벌 농업경제 |
| XLV | Health Care Select Sector SPDR | 미국 헬스케어 |
| XBI | SPDR S&P Biotech | 바이오테크/의약품 |
| ARKG | ARK Genomic Revolution | 비만치료제/유전체 혁신 |
| DRIV | Global X Autonomous & Electric Vehicles | 자율주행/전기차 |
| KARS | KraneShares Electric Vehicles | 스마트모빌리티 |
| ICLN | iShares Global Clean Energy | 글로벌 클린에너지 |
| ACES | ALPS Clean Energy | 미국 친환경 |
| HYDR | Global X Hydrogen | 글로벌 수소경제 |
| QQQ | Invesco NASDAQ-100 | 미국 나스닥100 |
| XLK | Technology Select Sector SPDR | 미국 빅테크 |
| MAGS | Roundhill Magnificent Seven | 빅테크 TOP7 |
| IWM | iShares Russell 2000 | 미국 소형주 |
| NOBL | ProShares S&P 500 Dividend Aristocrats | 배당귀족 |
| SCHD | Schwab U.S. Dividend Equity | 배당 다우존스 |
| DVY | iShares Select Dividend | 고배당 |
| IGF | iShares Global Infrastructure | S&P 글로벌 인프라 |
| XLP | Consumer Staples Select Sector SPDR | 미국 필수소비재 |
| ARKK | ARK Innovation | 서학개미 선호 이노베이션 |

---

## 4. 기능 요구사항

### M1. 데이터 수집 모듈

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M1-01 | Yahoo Finance 가격 수집 | 한국 ETF (.KS/.KQ) + 미국 ETF 일간 종가. `auto_adjust=True` | P1 |
| M1-02 | 티커 파일 관리 | JSON 정적 파일로 분리 (`config/`). 수동 수정 가능 구조. | P1 |
| M1-03 | 데이터 캐시 | 일간 가격 데이터 JSON 캐시 (`data/cache/`). 일 1회 갱신 | P1 |
| M1-04 | 벤치마크 수집 | KOSPI (^KS11), SPY 각각 수집 | P1 |

### M2. 지표 계산 모듈

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M2-01 | Mansfield RS 한국 ETF | 국내 ETF ~35종. 벤치마크 KOSPI. MA 252일. Rolling Percentile. | P1 |
| M2-02 | Mansfield RS 미국 ETF | 38종. 벤치마크 SPY. MA 252일. Rolling Percentile. | P1 |
| M2-03 | 변동성 조정 모멘텀 | 3/6/12M Sharpe-like 평균. 기간 파라미터 63/126/252. | P1 |
| M2-04 | Rolling Percentile 공통 함수 | 전 지표 정규화. 룩어헤드 없는 구조. | P1 |
| M2-05 | 스크리너 통합 | RS + 모멘텀 복합 필터링. Top N 출력. | P1 |

### M3. 대시보드 UI

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M3-01 | 한국 ETF RS 랭킹 테이블 | `/dashboard/kr-market` — Mansfield RS 순위, 모멘텀 점수 | P1 |
| M3-02 | 홈 대시보드 — 시장 분석 | `/dashboard` — 시장 분석 5개 동기화 차트 (기존 Stats Card + ETF Top5 목업에서 전면 교체, v2.7) | P1 |
| M3-03 | 스크리너 화면 | `/dashboard/screener` — 복합 조건 필터 UI | P1 |
| M3-04 | 상대강도 상세 화면 | `/dashboard/relative-strength` — RS 추세 차트 | P2 |
| M3-05 | 설정 화면 | `/dashboard/settings` — 티커 JSON 관리 UI, 파라미터 조정 | P2 |
| M3-06 | 기업 분석 화면 | `/dashboard/company-analysis` — Ticker/기업명 입력, 분석 리포트 출력 | P2 |

### M4. 인프라

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M4-01 | Next.js API Routes | 외부 API 격리. 서버 사이드 데이터 수집. | P1 |
| M4-02 | 일일 자동 갱신 | GitHub Actions cron 또는 Vercel Cron Jobs (장마감 후) | P2 |
| M4-03 | Excel 출력 | `to_excel()` 결과 파일 다운로드 기능 | P2 |

### M5. Sector Flow Oscillator 모듈

> **추가**: v2.1 (2026.04.08) — KOSPI 19개 업종 기관/외국인 수급 MACD 오실레이터

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M5-01 | pykrx 업종 수급 데이터 수집 | KOSPI 19개 섹터 기관/외국인 일별 순매수 + 시가총액 수집 | P1 |
| M5-02 | SectorFlowOscillator 계산 | 개선판 구현: Z-score 정규화, 52일 워밍업 마스킹, EMA(12,26,9) 적용 | P1 |
| M5-03 | 업종 Flow 대시보드 탭 | `/dashboard/sector-flow` — 업종 랭킹 테이블 + 오실레이터 차트 | P1 |
| M5-04 | 업종 랭킹 테이블 | 19개 업종 오실레이터 값 기준 정렬. MACD/Signal/Oscillator 컬럼 표시 | P1 |
| M5-05 | 0선 돌파 시그널 | 직전 거래일 대비 0선 상향/하향 돌파 업종 강조 표시 | P2 |
| M5-06 | 시장 강도 요약 | 전체 업종 오실레이터의 양수비율, 중앙값, 상위/하위 10% 요약 카드 | P2 |

### M6. 기업 분석 모듈

> **추가**: v2.2 (2026.04.12) — Claude API 기반 기업 심층 분석 + LLM Q&A + 문서 저장

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M6-01 | 기업 분석 입력 UI | Ticker 또는 기업명 입력. 거래소 선택(KOSPI/KOSDAQ/NASDAQ/NYSE). 분석 시작 버튼 | P2 |
| M6-02 | Claude API 분석 리포트 생성 | company-analysis skill 기반 5개 섹션 보고서 생성. 스트리밍 응답 지원 | P2 |
| M6-03 | 분석 리포트 섹션 렌더링 | Executive Summary + 5개 섹션 아코디언/탭 UI. Markdown 렌더링 | P2 |
| M6-04 | LLM Q&A 기능 | 생성된 분석 리포트를 system context로 하는 대화형 Q&A. 스트리밍 응답 | P2 |
| M6-05 | 문서 저장 기능 | Markdown 파일 다운로드. JSON 형식 로컬 저장 (분석 날짜, 기업명, 티커, 내용 포함) | P2 |
| M6-06 | 분석 이력 관리 | 이전 분석 목록 표시. localStorage 기반. 재열람 및 삭제 기능 | P3 |

### M7. 시장 분석 모듈

> **추가**: v2.7 (2026.04.13) — Yahoo Finance + FRED API 기반 미국 시장 환경 지표 동기화 차트
> **업데이트**: v2.9 (2026.04.13) — 채권/금리 차트 2개 추가(Chart 6·7), 신규 데이터 소스 4개, 기준선 추가

| ID | 기능 | 설명 | 우선순위 |
|----|-----|-----|---------|
| M7-01 | 시장 데이터 수집 통합 | `lib/fetchers/fred.ts` — `fetchFredSeries()`. BAMLH0A0HYM2(HY Spread), SOFR(단기 금리), DGS10(미국 10년물 국채 수익률), DFEDTARU(Fed Funds Target Rate Upper Bound) 수집. SDEX(꼬리 리스크)는 Yahoo Finance `^SDEX` 심볼로 직접 수집 (`fetchYahooHistory("^SDEX")`). MOVE Index는 Yahoo Finance `^MOVE` 심볼로 수집 (`fetchYahooHistory("^MOVE")`) | P1 |
| M7-02 | 7개 동기화 차트 | `MarketSyncCharts.tsx` — S&P500+NASDAQ / VIX+SDEX / VIX+VVIX / VVIX/VIX Ratio / HY Spread / SOFR+10Y Yield+FED Funds Rate / 10Y Yield+MOVE Index+FED Funds Rate. Recharts ComposedChart × 7. 2개 이상 라인 차트(Chart 1·2·3·6·7)에서 레전드 항목 클릭으로 개별 라인 on/off 토글 (비활성 시 취소선+회색+opacity 처리). VVIX/VIX 차트 y=3·6 회색 점선 기준선, VIX 차트 y=20 회색 점선 기준선 | P1 |
| M7-03 | 날짜 범위 컨트롤 | `SyncChartDateControl.tsx` — 1M/3M/6M/1Y/2Y/5Y 기간 버튼 + 직접 날짜 입력 (date input) | P1 |
| M7-04 | Recharts syncId 차트 동기화 | `syncId="market-analysis"` 공유 — 전체 차트 X축 동기화. 마우스 호버 시 동일 날짜 크로스헤어 표시 | P1 |

---

## 5. 데이터 흐름

### ETF RS/모멘텀 파이프라인 (Yahoo Finance)

```
클라이언트 (React 대시보드)
  ↓ fetch / SWR
Next.js API Routes (app/api/)
  ↓
Yahoo Finance (yfinance / fetch)
  ↓ 응답 캐시
JSON 파일 (data/cache/)
  ↓
lib/indicators/ (RS 계산, 모멘텀 계산)
  ↓
JSON 파일 (data/indicators/)
  ↓
대시보드 차트/테이블 렌더링
```

### Sector Flow Oscillator 파이프라인 (pykrx) — v2.1 신규

> Yahoo Finance와 별도 파이프라인. pykrx는 한국 장 전용 무료 라이브러리로 기관/외국인 수급 데이터 제공.

```
클라이언트 (React 대시보드 /dashboard/sector-flow)
  ↓ fetch
Next.js API Routes (app/api/sector-flow/)
  ↓
pykrx (Python 스크립트 또는 별도 배치)
  KOSPI 19개 섹터 기관/외국인 일별 순매수 + 시가총액
  ↓ 응답 캐시
JSON 파일 (data/cache/sector-flow/)
  ↓
lib/indicators/sectorFlow.ts
  (시가총액 20일 Rolling Mean → 수급비율 → Z-score → EMA(12,26,9) → Oscillator)
  ↓
대시보드 업종 랭킹 테이블 + 차트 렌더링
```

### 기업 분석 파이프라인 (Claude API) — v2.2 신규

```
클라이언트 (기업 분석 탭 /dashboard/company-analysis)
  ↓ Ticker/기업명 입력
Next.js API Routes (app/api/company-analysis/)
  ↓ company-analysis 프롬프트 구성
Claude API (claude-sonnet-4-6)
  ↓ 스트리밍 응답
분석 리포트 렌더링 (5개 섹션)
  ↓ 사용자 Q&A
Claude API (분석 컨텍스트 포함)
  ↓
localStorage (JSON 이력 저장) + Markdown 파일 다운로드
```

### 시장 분석 파이프라인 (Yahoo Finance + FRED) — v2.7 신규

```
클라이언트 (시장 분석 탭 /dashboard)
  ↓ fetch (startDate, endDate)
Next.js API Routes (app/api/market/us-analysis/)
  ↓ 병렬 수집
  ├── Yahoo Finance: ^GSPC, ^IXIC, ^VIX, ^VVIX, ^SDEX, ^MOVE
  └── FRED API: BAMLH0A0HYM2, SOFR, DGS10, DFEDTARU
  ↓
MarketAnalysisClient (클라이언트 조율)
  ├── SyncChartDateControl (날짜 범위 컨트롤)
  └── MarketSyncCharts (5개 Recharts ComposedChart, syncId 공유)
```

### 캐시 전략

| 데이터 | 캐시 방식 | 갱신 주기 |
|--------|---------|---------|
| 일간 가격 데이터 | JSON (`data/cache/`) | 일 1회 (장마감 후) |
| 지표 계산 결과 | JSON (`data/indicators/`) | 가격 갱신 후 자동 |
| 티커 목록 | 정적 JSON (`config/`) | 수동 (분기별) |
| 업종 수급 데이터 (pykrx) | JSON (`data/cache/sector-flow/`) | 일 1회 (장마감 후) |
| 기업 분석 결과 | localStorage (브라우저) | 수동 (사용자가 분석 실행 시) |
| 시장 분석 데이터 (Yahoo + FRED) | 없음 (요청 시 실시간 수집) | 날짜 범위 변경 시마다 |

---

## 6. 미결 결정사항 (Open Questions)

| # | 항목 | 선택지 | 영향도 | 상태 |
|---|-----|--------|--------|------|
| OQ-01 | 한국 ETF 최종 유니버스 확정 | 현재 ~35종 (개별주식 제거 후) — 추가 ETF 검토 필요 | 중 | ⏳ |
| OQ-02 | 미국 ETF Mansfield RS 필터 임계값 | Rolling Percentile 기준 50/70/80 중 선택 | 중 | ⏳ |
| OQ-03 | MA 기간 멀티윈도우 | 252일 단일 vs 60/120/252 멀티윈도우 평균 | 낮음 | ⏳ |
| OQ-04 | 대시보드 배포 환경 | ① 로컬 전용 ② Vercel ③ 자체 서버 | 낮음 | ⏳ |
| OQ-05 | Top N 기본값 | Top 10 / Top 15 / Top 20 | 낮음 | ⏳ |

---

## 7. 향후 확장

| 영역 | 내용 | 시기 |
|-----|-----|-----|
| Sector Flow Oscillator | KOSPI 19개 업종 기관/외국인 수급 MACD 오실레이터 (M5) | **Phase 4** |
| 기업 분석 모듈 | Claude API 기반 company-analysis skill 연동, LLM Q&A, 문서 저장 (M6) | **Phase 5** |
| 시장 분석 캐시 | 날짜 범위별 FRED+Yahoo 데이터 JSON 캐시 추가 | Phase 6 이후 |
| Fear & Greed Oscillator | KOSPI/KOSDAQ + S&P500/NASDAQ 심리지수 | Phase 7 이후 |
| Elder Impulse + SuperMA | EMA13 + MACD 동조 신호, 이평 괴리율 | Phase 7 이후 |
| 포트폴리오 모듈 | 보유 종목 RS 추적 + 교체 신호 | Phase 7 이후 |
| 자동 알림 | RS 급락 시 Slack/이메일 알림 | Phase 7 이후 |
| 백테스트 | 각 신호의 과거 성과 검증 | 별도 프로젝트 |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|-----|-----|---------|
| v1.0 | 2026.03 | 최초 작성 (Python + Streamlit 스택 기준) |
| v1.1 | 2026.03.27 | 기술스택 전환 — Next.js API Routes, OQ 항목 정비 |
| v2.0 | 2026.03.31 | 전면 재작성 — ETF 상대강도 분석 코드 가이드 반영. 해외ETF 미국 직접 상장 38종 대체, Mansfield RS MA 252일 확정, 모멘텀 기간 63/126/252 확정, 한국ETF 개별주식 6종 제거 |
| v2.1 | 2026.04.08 | M5 Sector Flow Oscillator 모듈 추가 — 업종별 기관/외국인 수급 MACD 오실레이터, pykrx 데이터소스, KOSPI 19개 섹터 대상. 데이터 흐름 섹션에 pykrx 파이프라인 추가. 향후 확장 섹션에서 Sector Flow를 Phase 4로 편입 |
| v2.2 | 2026.04.12 | M6 기업 분석 모듈 추가 — Claude API 기반 company-analysis skill 연동, LLM Q&A, 문서 저장, 분석 이력 관리. M3-06 기업 분석 화면 추가. 데이터 흐름 섹션에 Claude API 파이프라인 추가 |
| v2.7 | 2026.04.13 | Phase 6 완료 처리 — 시장 분석 탭 전면 교체. FRED API 통합(SDEX+HY Spread), 5개 동기화 차트(Recharts syncId), 날짜 범위 컨트롤, /dashboard 페이지 교체, 사이드바 "시장 환경"→"시장 분석". M7 시장 분석 모듈 신규 추가(M7-01~04), M3-02 홈 대시보드 범위 업데이트(목업→시장 분석 차트), 데이터 흐름 섹션에 시장 분석 파이프라인 추가, 캐시 전략 항목 추가, 향후 확장 Phase 번호 조정 |
| v2.8 | 2026.04.13 | Phase 6 버그 수정 및 UX 개선 — SDEX 데이터 소스 FRED→Yahoo Finance(^SDEX) 수정, 차트 Y축 자동 스케일(domain: auto) 적용, X축 정렬 통일, Y축 레이블 제거, 레전드 토글 기능(Chart 1·2·3) 추가. M7-01 SDEX 소스 정정, M7-02 레전드 토글 기능 추가, 시장 분석 파이프라인 ^SDEX Yahoo Finance로 이동 |
| v2.9 | 2026.04.13 | 채권/금리 차트 2개 추가 — Chart 6(SOFR+10Y Yield+FED Funds Rate), Chart 7(10Y Yield+MOVE Index+FED Funds Rate). FRED SOFR/DGS10/DFEDTARU + Yahoo ^MOVE 신규 수집. VIX 차트 y=20 기준선, VVIX/VIX 차트 y=3·6 기준선 추가. M7-01 신규 데이터 소스 4개 추가, M7-02 "5개→7개" 동기화 차트로 업데이트, 시장 분석 파이프라인 신규 시리즈 반영 |

---

*v2.9 | 2026.04.13 | Living Document — 지표/기능 추가 시 수시 업데이트*
