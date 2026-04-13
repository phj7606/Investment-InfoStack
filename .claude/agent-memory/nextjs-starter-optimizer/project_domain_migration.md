---
name: 투자 분석 플랫폼 도메인 전환 기록
description: NextJS 스타터킷을 Investment InfoStack 투자 분석 플랫폼으로 전환할 때 적용한 패턴과 주의사항
type: project
---

이 프로젝트는 범용 Next.js 스타터킷을 투자 분석 플랫폼(Investment InfoStack)으로 전환한 결과물이다.

**Why:** 거시환경 분석(M1) → 섹터/테마 강도(M2) → 포트폴리오 관리(M3)의 탑다운 투자 프로세스를 디지털화하는 개인용 분석 시스템 구축이 목적.

**How to apply:** 향후 실제 데이터 연동 시 다음 순서로 접근한다:
1. `types/index.ts`의 `FearGreedData`, `TickerData`, `SectorData`, `PortfolioPosition` 타입을 기반으로 API 클라이언트 작성
2. 각 페이지의 스켈레톤/EmptyState를 실제 컴포넌트로 교체
3. recharts 클라이언트 격리 패턴(`components/common/visitors-chart.tsx` 참고) 유지 필수

**전환된 라우트 구조:**
- `/dashboard` — 시장 환경 개요 (Fear & Greed, VIX, 업종 쏠림)
- `/dashboard/kr-market` — 한국 시장 (KOSPI/KOSDAQ F&G Oscillator)
- `/dashboard/us-market` — 미국 시장 (S&P500/NASDAQ, SPDR 섹터 ETF)
- `/dashboard/relative-strength` — Mansfield RS, ETR Comfort Rank
- `/dashboard/screener` — 종목 스크리너 통합뷰
- `/dashboard/portfolio` — 보유 종목 + IRP 포트폴리오
- `/dashboard/settings` — 티커 관리, API 키 설정

**미사용 라우트(삭제 예정):**
- `/dashboard/analytics` — 스타터킷 잔존, 사이드바에 없음
- `/dashboard/users` — 스타터킷 잔존, 사이드바에 없음
