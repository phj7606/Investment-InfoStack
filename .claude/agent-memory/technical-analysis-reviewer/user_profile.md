---
name: 사용자 프로필
description: Next.js 투자 분석 플랫폼을 개발 중인 사용자의 역할과 기술 수준
type: user
---

Next.js + TypeScript 기반 투자 분석 플랫폼(Investment-InfoStack)을 개발하는 개발자.

- 기술적 분석 지표를 실제 프로덕트로 구현하는 역할 담당
- 지표 설계의 이론적 타당성과 구현 가능성(데이터 수집 API, 계산 함수) 양쪽을 모두 고려함
- KOSPI/KOSDAQ 한국 시장 중심의 분석 도구 개발에 집중
- PRD/SPEC 기반으로 태스크를 체계적으로 관리하며 P1 우선순위 태스크부터 구현
- 기존 구현된 유틸 함수: rollingPercentileRank(), rollingZScore(), sma(), logReturns(), simpleReturns()
- 미구현 함수: EMA, MACD, RSI(Wilder's) — 이번 F&G 구현 시 추가 필요
- 즉시 사용 가능 데이터: Yahoo Finance(KOSPI/KOSDAQ), KRX(VKOSPI), ECOS(KTB 국고채)
- 추가 구현 필요 데이터: KRX P/C 거래량, KRX 신고가/신저가, kofiabond 회사채 금리
