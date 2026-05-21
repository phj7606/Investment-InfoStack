---
name: Phase 9 재무제표 통합 대시보드
description: /dashboard/portfolio/financial — 4탭(재무제표/자산관리/연금·교육/현금흐름), DRAFT/CONFIRMED 스냅샷, 엑셀 YTD 수식 동일 구현, P9-38~P9-45 완료 (2026.05.21, PRD v5.1/ROADMAP v5.3)
type: project
---

## Phase 9 재무제표 통합 대시보드 (P9-38~P9-45) 완료

**완료일**: 2026.05.21 | PRD v5.1 / ROADMAP v5.3

### 핵심 구현

**라우트 및 API**
- `/dashboard/portfolio/financial` — 재무 통합 대시보드 페이지
- `/api/portfolio/financial/snapshot` — 월별 스냅샷 CRUD (DRAFT/CONFIRMED 상태 관리)
- `/api/portfolio/financial/snapshot/[month]/confirm` — DRAFT→CONFIRMED 확정 (포트폴리오·연금·교육 포지션 자동 집계)
- `/api/portfolio/financial/live-data` — DRAFT용 실시간 포지션 집계
- `/api/portfolio/financial/tx-summary` — 거래내역 월별 bid/askBv/fixedPnl 집계
- `/api/portfolio/financial/monthly-cf` — 월별 현금흐름 CRUD
- `/api/portfolio/financial/backup` — JSON 백업/복원 (overwrite/merge, 중복 기준: month 필드)
- `/api/exchange-rates` — yfinance 기반 USD/KRW·CAD/KRW 실시간 환율 조회

**핵심 라이브러리**
- `lib/portfolio/financial-calc.ts` — buildConfirmedStatementData, buildAssetManagementYearlyData, calcMonthlyCFSummary/History
- `lib/fetchers/exchange-rate.ts` — 환율 페처 (yfinance)
- `types/financial.ts` — FinancialSnapshot, AssetManagementSectionData(cumBid/cumAskBv 필드), ExchangeRates, MonthlyCFEntry

**데이터 파일**
- `data/financial-snapshots.json` — 월별 재무 스냅샷 (git 추적 등록 완료)
- `data/monthly-cf.json` — 월별 현금흐름 데이터

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
