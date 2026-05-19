---
name: Phase 9 장기투자 계좌 대시보드 구현 완료 (2026.05.19 최종)
description: /dashboard/portfolio/longterm 장기투자 계좌 대시보드 P9-13~P9-25 구현 완료. PRD v4.7 / ROADMAP v4.9 반영
type: project
---

Phase 9에 장기투자 계좌 대시보드(`/dashboard/portfolio/longterm`) + 성과 분석 전용 페이지(`/dashboard/portfolio/performance`)가 추가됨. PRD v4.7 / ROADMAP v4.9에 반영.

**구현 파일:**
- `types/portfolio.ts` — LongtermTransaction 타입 정의
- `app/api/portfolio/longterm/transactions/` — GET/POST/PUT CRUD API
- `app/api/portfolio/longterm/prices/route.ts` — 현재가 실시간 조회 API (신규)
- `data/longterm-transactions.json` — 파일 기반 영구 저장소
- `lib/portfolio/excel.ts` — Excel 계층구조 이중 파서
- `lib/portfolio/longterm-calc.ts` — FIFO 실현손익 계산 모듈 (avgCost 수수료 제외 기준 통일)
- `lib/portfolio/longterm-store.ts` — JSON 파일 기반 저장 모듈
- `lib/fetchers/yahoo.ts` — `fetchYahooCurrentPrices()` 함수 추가
- `components/portfolio/longterm/LongtermDashboardClient.tsx` — 탭 기반 대시보드 (현재가 자동 조회 연동)
- `components/portfolio/longterm/LongtermPositionsTable.tsx` — KR/US 분리 탭 + 합계 행 확장
- `components/portfolio/longterm/StockHistoryTable.tsx` — accordion 2컬럼 그리드
- `components/portfolio/longterm/TransactionForm.tsx` — 거래 추가/편집 폼
- `components/portfolio/longterm/TransactionTable.tsx` — 거래 내역 테이블

**Excel 파서 구조 (P9-15):**
- Stock Trading: B=종목명, C=날짜, D=Bid/Ask, E=수량, F=단가, G=수수료, H=금액
- Fund Trading: A=펀드명(섹션헤더), B=날짜, C=Bid/Ask, D=좌수, E=NAV, F=수수료, G=금액
- Stock Investment 시트에서 종목명 → {ticker, accountNo, market, assetType} lookup 구성
- 서버사이드 dedup + 클라이언트 dedup 이중 중복 방지

**현재가 실시간 조회 API (P9-22):**
- KR 종목: Naver Finance `m.stock.naver.com/api/stock/{code}/basic` closePrice 필드
- US 종목: Yahoo Finance v8/finance/chart `meta.regularMarketPrice` (v7 quote는 401 차단됨)
- FUND 타입 제외 (notFound 처리)
- KR 코드 보정 맵: 005939 → 005930 (삼성전자 오기 보정)
- 5분 TTL 캐시 (readCache/writeCache)

**PRD 기능 ID 체계 (D1-01~D1-09):**
- D1-01: Excel 계층구조 임포트 (Stock+Fund 이중 파서)
- D1-02: 거래 CRUD (수동 추가/편집, JSON 파일 저장)
- D1-03: FIFO 실현손익 계산. avgCost는 수수료 제외 기준으로 종목별 탭과 통일
- D1-04: 종목별 이력 accordion (2컬럼 그리드, 72px 고정 헤더)
- D1-05: 펀드 계좌(8654) 지원
- D1-06: 현재가 실시간 자동 조회 (Naver KR / Yahoo v8 US, 5분 TTL 캐시)
- D1-07: 보유 포지션 합계 행 (평가손익·수익률·누적실현·비중 합계)
- D1-08: JSON 백업/복원 (자동 일별 서버 백업, UI 다운로드/복원, overwrite/merge 모드)
- D1-09: 포트폴리오 성과 분석 (Modified Dietz MoM%, TWR 누적수익률, KR/US 분리, 벤치마크 비교)

**P9-24 JSON 백업 시스템:**
- `lib/portfolio/longterm-store.ts` — `autoBackup()` + `pruneOldBackups()` 추가 (writeTransactions 직전 당일 첫 백업 자동 생성, 30일 보관)
- `app/api/portfolio/longterm/backup/route.ts` — GET(download) / POST(restore: overwrite|merge)
- dedup 키: date::stockCode::tradeType::quantity::price
- `.gitignore` — /data/backups/ 추가

**P9-25 포트폴리오 성과 분석:**
- `app/(dashboard)/dashboard/portfolio/performance/page.tsx`
- `app/api/portfolio/performance/route.ts`
- `components/portfolio/performance/PerformanceDashboardClient.tsx` (+ 하위 차트 컴포넌트 4개)
- `lib/portfolio/performance-benchmark.ts`, `lib/portfolio/performance-excel.ts`
- `data/performance-bootstrap.json` (Jan~Apr 2026 스냅샷, 불변)
- Jan~Apr 2026: bootstrap JSON / May 2026+: longterm-transactions.json 동적 계산
- 캐시: 완료 월 24h TTL / 현재 월 5min TTL
- 사이드바에 "성과 분석" 링크 추가 (`components/layout/dashboard-sidebar.tsx`)

**ROADMAP 태스크 ID: P9-13~P9-25**

**Why:** 장기투자 계좌의 주식+ETF+펀드(8654 계좌)를 엑셀에서 임포트하고 종목별 실현손익을 추적하기 위한 전용 대시보드 필요. 현재가 실시간 조회로 평가손익 계산 자동화. JSON 백업으로 데이터 안전성 확보. 성과 분석으로 KR/US 계좌별 수익률을 벤치마크 대비 추적.
**How to apply:** 포트폴리오 관련 기능 언급 시 추세추종(P9-05~P9-12)과 장기투자(P9-13~P9-25) 두 계좌 체계를 구분. D1-xx는 PRD 기능 ID, P9-xx는 ROADMAP 태스크 ID. avgCost 계산은 수수료 제외 기준. 성과 분석은 Modified Dietz + TWR 방식.
