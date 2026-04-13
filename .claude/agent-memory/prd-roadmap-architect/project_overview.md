---
name: 투자 분석 플랫폼 프로젝트 개요
description: Investment-InfoStack 프로젝트의 핵심 목적, 분석 범위, 주요 기능 모듈 요약
type: project
---

한국 및 미국 주식시장 투자 의사결정을 체계적으로 지원하는 개인 투자 분석 시스템.
거시환경 분석 → 섹터/테마 강도 → 개별 종목 선별까지 일관된 프레임워크로 통합 제공.

**분석 프레임워크:**
- 시장 환경: Fear & Greed Oscillator (한국/미국), VIX, Bond Spread
- 투자 시점: F&G Oscillator 0선, Elder Impulse, TD Setup
- 섹터/테마: Mansfield RS, 변동성 조정 모멘텀, 쏠림지수
- 개별 종목: Sortino, ETR Comfort, RS Rank

**주요 기능 모듈:**
- M1: 데이터 수집 — Yahoo Finance, 티커 관리, 캐시
- M2: 지표 계산 — Mansfield RS (MA252), 변동성 조정 모멘텀 (63/126/252)
- M3: 대시보드 UI — kr-market, us-market, screener, relative-strength, settings, 시장 분석(/dashboard)
- M4: 인프라 — Next.js API Routes, 자동 갱신, Excel 출력
- M5: Sector Flow Oscillator — KOSPI 19개 업종 기관/외국인 수급 MACD (pykrx, Phase 4)
- M6: 기업 분석 — Claude API 기반 company-analysis, LLM Q&A, 문서 저장 (Phase 5)
- M7: 시장 분석 — Yahoo+FRED API 5개 동기화 차트 (^GSPC,^IXIC,^VIX,^VVIX,SDEX,HY Spread), Phase 6 완료

**커버리지:** KOSPI/KOSDAQ, 한국 ETF (~40종), 한국상장 해외ETF (~38종), S&P500+NASDAQ100, SPDR 섹터 ETF, 미국 시장 환경 지표(VIX/VVIX/SDEX/HY Spread)

**핵심 품질 원칙:** 룩어헤드 바이어스 제거 (MinMaxScaler 전구간 → Rolling Percentile 252일)

**현재 Phase 진행 상태 (2026.04.13):** Phase 0~3 완료, Phase 4~5 계획 중, Phase 6 완료

**How to apply:** PRD 기능 요구사항 검토 시 위 모듈 구조(M1~M7)와 태스크 ID(P0~P6) 체계를 기준으로 우선순위를 판단할 것.
