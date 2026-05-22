---
name: Phase 9 재무제표 통합 대시보드
description: /dashboard/portfolio/financial — 4탭(재무제표/자산관리/연금·교육/현금흐름), DRAFT/CONFIRMED 스냅샷, 엑셀 YTD 수식+BS 엑셀 형식 재구성+crypto/CAD fallback, P9-38~P9-49 완료 (2026.05.22, PRD v5.6/ROADMAP v5.6)
type: project
---

## Phase 9 재무제표 통합 대시보드 (P9-38~P9-49) 완료

**완료일**: 2026.05.22 | PRD v5.6 / ROADMAP v5.6

### 핵심 구현

**라우트 및 API**
- `/dashboard/portfolio/financial` — 재무 통합 대시보드 페이지
- `/api/portfolio/financial/snapshot` — 월별 스냅샷 CRUD (DRAFT/CONFIRMED 상태 관리)
- `/api/portfolio/financial/snapshot/[month]/confirm` — DRAFT→CONFIRMED 확정 (포트폴리오·연금·교육 포지션 자동 집계)
- `/api/portfolio/financial/live-data` — DRAFT용 실시간 포지션 집계
- `/api/portfolio/financial/tx-summary` — 거래내역 월별 bid/askBv/fixedPnl 집계
- `/api/portfolio/financial/monthly-cf` — 월별 현금흐름 CRUD
- `/api/portfolio/financial/monthly-cf/import-excel` — OneDrive FS 2026.xlsx "Monthly CF" 시트 Jan-Apr 데이터 가져오기
- `/api/portfolio/financial/monthly-cf/backup` — GET: monthly-cf.json+monthly-cf-balance.json 단일 JSON 다운로드. POST: overwrite/merge 복원
- `/api/portfolio/financial/backup` — JSON 백업/복원 (overwrite/merge, 중복 기준: month 필드)
- `/api/exchange-rates` — yfinance 기반 USD/KRW·CAD/KRW 실시간 환율 조회

**핵심 라이브러리**
- `lib/portfolio/financial-calc.ts` — buildConfirmedStatementData, buildAssetManagementYearlyData, calcMonthlyCFSummary/History
- `lib/fetchers/exchange-rate.ts` — 환율 페처 (yfinance)
- `types/financial.ts` — FinancialSnapshot, AssetManagementSectionData(cumBid/cumAskBv 필드), ExchangeRates, MonthlyCFEntry

**핵심 설정 파일**
- `lib/portfolio/cf-table-config.ts` — CFTableRowDef 행 정의 배열 (rowType: section-header/input/calc-*)

**데이터 파일**
- `data/financial-snapshots.json` — 월별 재무 스냅샷 (git 추적 등록 완료)
- `data/monthly-cf.json` — 월별 현금흐름 항목 데이터
- `data/monthly-cf-balance.json` — Account Balance 월별 잔고 데이터

### 자산관리 탭 YTD 계산 특이사항

엑셀 Asset Management 시트 수식을 동일하게 구현:
- **cumBid/cumAskBv**: 누적 매수금/매도장부가 추적 필드 — FinancialSnapshot에 추가
- **Cum P/L % 분모 수정**: `cumPnl / (DecBalance + cumBid)` — 엑셀 Q21 수식과 동일
- **YTD 공란 처리**: Stock Deposit / Cash / Summary YTD 컬럼은 `-`로 표시
- **연간 자동 전환**: 매년 12월을 신년 baseline으로 자동 설정
- **데이터 복원**: 엑셀 Dec-25~Apr-26 데이터 35개 수치 100% 일치 검증 완료

### DRAFT/CONFIRMED 상태 관리 워크플로우

- **DRAFT 상태**: 해당 월 실시간 포지션 집계 → live-data API 호출
- **CONFIRMED 상태**: 고정 저장된 스냅샷 값 사용 → 수정 시 SnapshotEditDialog
- **월말 확정**: MonthEndConfirmDialog → confirm API → 포트폴리오·연금·교육 포지션 일괄 스냅샷 저장

**Why**: 월말 확정 후 소급 변경 방지 + 실시간 조회 비용 절감

**How to apply**: 재무 대시보드 관련 API 설계 시 DRAFT/CONFIRMED 이중 경로 고려. live-data는 DRAFT 전용, snapshot[month]는 CONFIRMED 조회용으로 분리.

### Monthly CF 탭 v2 특이사항 (2026.05.21 전면 개편)

- **config-driven 구조**: `cf-table-config.ts`의 CFTableRowDef 배열로 행 정의 — 코드 변경 없이 행 추가/수정 가능
- **셀 클릭 다이얼로그**: MonthlyCFSubItemDialog v3 — 항목 추가/인라인 편집(✏️ 버튼)/삭제 지원, PUT /api/portfolio/financial/monthly-cf?id=xxx
- **영문 레이블 섹션**: Income / Fixed Expense / Credit Card / Cash / Tax / Account Transfer
- **색상 규칙**: Income 섹션(녹색/적색), 지출 섹션(검정), Expenses Total(붉은색)
- **Account Balance 계산**: Account Balance = Account Balance(prev) + Income - Expenses Total
- **Refresh·Import 버튼 제거**: 불필요 UI 간소화 (v2 개편 시 제거)
- **통합 백업**: BackupRestorePanel 6번째 모듈 카드 "월별 현금흐름" 추가 — ModuleKey 타입에 "monthly-cf" 포함

### Balance Sheet 엑셀 형식 재구성 특이사항 (2026.05.22, P9-47~P9-49)

**P9-47 — FinancialStatementView 전면 재작성**
- 엑셀 FS-May 2026 시트와 동일한 구조로 전면 재작성
- 라벨 전체 영문화: Cash and cash equivalent / Marketable securities (KR) / Fund/Derivatives 등
- `BSRowUsd` 신규 컴포넌트: US Stocks/ETF USD 원본 값 표시 (KRW 환산 별도)
- Pension fund / Education Savings: INVESTMENT 섹션 아래로 이동
- INVESTMENT & PENSION TOTAL 합계 행 추가
- CAPITAL 변동 5개 하위 항목 세분화:
  - Change in Current Asset / Non-Current Asset / Investment Asset / Pension/Education / Liability
- 상단 KPI 카드 4개 + Net Worth 추세 차트 제거 (Balance Sheet에만 집중)

**타입 확장 (`types/financial.ts`)**
- `FinancialStatementData.capital` 섹션 신규: prevNetWorth / netChanges / changeInCurrentAsset / changeInNonCurrentAsset / changeInInvestmentAsset / changeInPensionEducation / changeInLiability
- `investmentAsset.usStocksUsd` / `usStocksDepositUsd` 필드 추가
- `assets.investmentPensionTotal` 필드 추가

**계산 로직 (`lib/portfolio/financial-calc.ts`)**
- `buildFinancialStatementData` / `buildConfirmedStatementData` 에 `prevData?: FinancialStatementData` 파라미터 추가
- 전월 데이터 기반 CAPITAL 변동(netChanges, 각 항목별 change) 자동 계산

**P9-48 — Education Savings crypto 잔액 포함**
- `snapshot.crypto.upbit`/`korbit` (KRW) + `binance` (USD→KRW 환산) → `educationKrw` 합산
- 수정 함수 3개: buildDraftStatementFromSnapshot / buildFinancialStatementData / buildConfirmedStatementData

**P9-49 — Pension fund Canadian RESP/RRSP CAD→KRW fallback**
- `confirmedPortfolio.canadianPensionKrw === 0` 인 과거 스냅샷 데이터 대응
- fallback: `snapshot.canadianPension.balanceCad × cadKrw` 로 재계산

**Why**: 엑셀 FS 시트와 UI 구조를 일치시켜 월말 수동 검증 효율 향상. crypto 자산과 캐나다 연금을 누락 없이 집계하기 위한 데이터 정합성 보완.

**How to apply**: Balance Sheet 관련 타입 수정 시 `capital` 섹션 5개 항목 유지 필요. buildFinancialStatementData 호출 시 `prevData` 전달 여부에 따라 CAPITAL 변동 계산 활성화됨.
