---
name: Step 2 주가 성과 분석 탭 추가 (2026.05.16)
description: /dashboard/screen Step 2가 2탭→3탭으로 확장됨. P8-12 주가 성과 분석 탭 신규 구현 완료
type: project
---

Step 2 종목 분석 페이지(`/dashboard/screen`)가 2탭(개별주식 스크리너+실적 채점) → 3탭(주가 성과+개별주식 스크리너+실적 채점) 구조로 확장됨. PRD v4.4 / ROADMAP v4.5에 반영.

**P8-12 구현 내용:**
- 구현 파일: `StockPerformanceClient.tsx`, `/api/stock-performance`, `/api/stock-performance/search`
- 6개 차트 탭: 정규화 가격 / 누적수익률 / 변동성항력 / MDD / 월별수익률 / 누적월별
- 성과 요약 카드 10개 지표: CAGR / 총수익률 / MDD / 변동성 / Sharpe / Sortino / Calmar / 월승률 / Beta / 상관계수
- 자동완성 종목 검색: KRX(네이버 금융) / US(Yahoo Finance)
- sessionStorage 기반 분석 상태 유지 (메뉴 이동 후 복원)
- 벤치마크: KOSPI(KRX) / S&P500+NASDAQ(US)
- lib/fetchers/krx.ts: Naver fchart EUC-KR 디코딩 + KOSPI 장기 데이터(sise.nhn) 지원
- lib/fetchers/yahoo.ts: ETF quoteType 허용

**동반 변경:**
- Checkpoint2/4 차트 라인 monotone→linear 직선화
- lib/fundamental-screening/merge.ts 분리(mergeStatements 독립 모듈화)

**Why:** Step 2에서 종목 분석 전 히스토리컬 성과를 먼저 확인하는 워크플로우 추가
**How to apply:** Step 2 탭 개수 언급 시 반드시 3탭(주가 성과+개별주식 스크리너+실적 채점)으로 표현. 기능 ID는 A2-00(주가 성과) / A2-01(스크리너) / A2-02(실적 채점). ROADMAP ID는 P8-12.
