---
name: Phase 9 연금 계좌 대시보드 (2026.05.20)
description: /dashboard/portfolio/pension 연금 계좌 대시보드 P9-31~P9-37 완료. /api/portfolio/risk/prices KRX 알파뉴메릭 ETF 코드 지원. PRD v5.0 / ROADMAP v5.2 반영
type: project
---

Phase 9에 연금 계좌 대시보드(`/dashboard/portfolio/pension`) P9-31~P9-37이 추가됨. PRD v5.0 / ROADMAP v5.2에 반영.

**구현 파일 (P9-31~P9-36 연금 계좌 대시보드):**
- `app/(dashboard)/dashboard/portfolio/pension/page.tsx` — 연금 계좌 페이지
- `app/api/portfolio/pension/transactions/route.ts` — 거래내역 CRUD
- `app/api/portfolio/pension/positions/route.ts` — 포지션 조회
- `app/api/portfolio/pension/rebalancing/route.ts` — 리밸런싱 설정 GET/POST
- `app/api/portfolio/pension/backup/route.ts` — JSON 백업/복원
- `components/portfolio/pension/PensionAccountDashboardClient.tsx` — 3탭 대시보드
- `components/portfolio/pension/PensionTransactionForm.tsx` — 거래 추가/편집 폼
- `lib/portfolio/pension-calc.ts` — 포지션 계산 모듈 (FIFO 가중평균단가, 월평균 기하수익률)
- `lib/portfolio/pension-store.ts` — 파일 기반 저장소 (자동 일별 백업 포함)
- `data/pension-transactions.json` — 거래내역 저장소
- `data/pension-rebalancing.json` — 리밸런싱 설정 저장소
- `data/pension-backups/` — 자동 일별 백업 디렉토리 (30일 보관)

**구현 파일 (P9-37 /api/portfolio/risk/prices 개선):**
- KRX 알파뉴메릭 ETF 코드(`0023A0`, `0038A0` 등) 지원
- 판별 로직: `c.length === 6 && /[0-9]/.test(c)` → KR 판별 (기존 순수 숫자만 KR 판별하던 버그 수정)
- 10개 종목 제한 완전 제거

**연금 계좌 타입 (`types/portfolio.ts`):**
- `PensionTransaction` — tradeType: BUY/SELL/DIVIDEND, accountType: RETIREMENT/SAVINGS/IRP
- `PensionPosition` — avgCost(가중평균단가), realizedPL, firstBuyDate, monthlyReturn(월평균 기하수익률)
- `PensionAccountSummary` — 계좌별 포지션 요약
- `PensionRebalancingConfig` — RETIREMENT/SAVINGS 계좌별 독립 설정 (채권형/주식형 목표 비중, 보유 현금)

**3탭 구조:**
- **리밸런싱 탭**: 계좌별 포지션 테이블(월평균 기하수익률 컬럼 포함) + 리밸런싱 분석(목표/현재 비중 비교, 필요 매수/매도 금액)
- **거래내역 탭**: BUY/SELL/DIVIDEND 이력 + 편집/삭제 + 백업/복원
- **종목별 탭**: 계좌·카테고리별 ETF accordion, 보유 포지션 현황 + 실현손익

**월평균 기하수익률 계산:**
- 공식: `(1+총수익률)^(1/보유개월)-1`
- firstBuyDate로 보유기간 산출 → 보유기간이 다른 ETF 간 공정 비교
- 포지션 테이블 + 종목별 비중 설정 테이블 모두 적용
- evalAmount 기반 가중평균 합계 행 표시

**리밸런싱 설정 저장 구조:**
- `PensionRebalancingConfig { RETIREMENT: { bondRatio, stockRatio, cash, positions[] }, SAVINGS: { ... } }`
- 퇴직연금(RETIREMENT)·연금저축(SAVINGS) 계좌별 독립 저장
- 구형 포맷(단일 계좌 구조) 자동 마이그레이션 지원

**백업/복원 dedup 키:** `date::stockCode::accountType::tradeType::quantity::price`

**PRD 기능 ID 체계 (D4-xx 연금 계좌):**
- D4-01: 거래 CRUD
- D4-02: 포지션 계산 (FIFO 가중평균단가)
- D4-03: 현재가 자동 조회 (KRX 알파뉴메릭 ETF 코드 지원)
- D4-04: 월평균 기하수익률
- D4-05: 리밸런싱 분석 (계좌별 독립)
- D4-06: 백업/복원 (JSON 다운로드 + overwrite/merge)
- D4-07: 종목별 탭

**ROADMAP 태스크 ID: P9-31~P9-37**

**Why:** 퇴직연금·연금저축·IRP 계좌별로 ETF 포트폴리오를 관리하고, 채권형/주식형 목표 비중 대비 현재 비중을 비교하여 리밸런싱 필요 금액을 자동 산출. 월평균 기하수익률로 보유기간이 다른 ETF 간 공정 비교 가능.
**How to apply:** 연금 계좌는 거래내역 기반 포지션 동적 계산 방식(장기투자 계좌와 동일 철학). 리밸런싱 설정은 RETIREMENT/SAVINGS 계좌별 완전 독립 저장. /api/portfolio/risk/prices는 이제 KRX 알파뉴메릭 ETF 코드도 지원하므로 연금 계좌뿐 아니라 교육 계좌 PositionRiskTable에서도 해당 코드 조회 가능.
