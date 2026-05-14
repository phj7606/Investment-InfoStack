---
name: Step 3 체크포인트 구조 재설계 및 완성
description: /dashboard/earnings-preview Step 3의 구현 방향이 Claude 스트리밍 → 재무제표 시각화 탭으로 전환, 4대 질문 탭 전체 완성(2026.05.14)
type: project
---

Step 3 체크포인트(`/dashboard/earnings-preview`)의 구현 방식이 Claude 보고서 스트리밍에서 재무제표 원시 데이터 수집 + 4대 질문별 시각화 탭으로 전면 재구성됨 (2026.05.13, PRD v4.2, ROADMAP v4.3). 2026.05.14 기준 4대 질문 탭 전체 완성 (PRD v4.3, ROADMAP v4.4).

**Why:** Claude API로 재무 분석을 스트리밍하는 방식은 원시 데이터 검증이 어렵고, 수치 오류 발생 시 추적이 불가능함. 재무제표 원시 항목을 직접 파싱하여 시각화하면 데이터 출처가 명확하고, 사용자가 계정 매칭 결과를 직접 확인할 수 있음.

**How to apply:**
- Step 3 관련 기능 논의 시 "실적 채점 기준 생성"이 아닌 "재무제표 원시 데이터 수집 + 4대 질문 탭"으로 안내할 것
- 4대 질문 (전체 완성): ①돈이 많은 기업인가(BS) → ②이익을 내는가(IS/YoY/CCC) → ③극대화 가능한가(ROA/ROE/ROIC/DuPont/비용구조) → ④현금을 버는가(CCR/CF트렌드/FCF)
- PRD 기능 ID: A3-01(수집) / A3-02(테이블) / A3-03(CP1) / A3-04(CP2) / A3-05(CP3) / A3-06(CP4) — 모두 ✅
- ROADMAP 태스크 ID: P8-14(수집) / P8-15(테이블) / P8-16(CP1) / P8-17(CP2) / P8-18(CP3) / P8-19(CP4) — 모두 ✅
- 데이터 소스: FnGuide(KR) HTML 파싱(ratioItems 포함), Alpha Vantage(US) API. 30일 TTL 캐시 + 연도 증분 업데이트
- 주요 구현 세부사항: BS exactOnly 로직(자산/자본 총계 FnGuide 표기 차이 대응), FnGuide `<title>` 기업명 자동 추출, Capex 계정과목 설정 패널(AccountSelector 패턴), CCR 3단계 색상(에메랄드/앰버/레드)
