---
name: 한국 Fear & Greed Oscillator v2 설계
description: P1-01 태스크, FGI 합성 지표 구조 및 미결 옵션 검토 결과
type: project
---

## 현재 FGI 수식 (PRD 기준)

```
FGI_t = 0.2×Momentum + 0.2×(1-PutCall) + 0.2×(1-Volatility) + 0.2×BondDiff + 0.2×RSI_10
Oscillator_t = MACD(FGI) - Signal(FGI)   # MACD(12,26,9)
```

- 정규화: MinMaxScaler 전구간 → Rolling Percentile 252일로 교체 예정 (룩어헤드 제거)
- RSI: Wilder's Smoothing으로 수정 예정

## 미결 옵션 검토 결과 (2026-03-27 기준)

### OQ-1 BondDiff 교체
- 권고: 옵션 A (회사채 신용스프레드, BBB+ - AA- 금리차)
- 근거: 방향성 단조로움, CNN F&G 설계 원형과 일치, 가격 시장과 독립된 신호
- 구현 필요: kofiabond.or.kr API 수집
- 주의: 스탈레 데이터(5거래일 이상 동일값) 보간 처리 필요
- 임시 대체(API 미구현 시): KOSPI 20일 수익률 - KTB10Y 20일 수익률 (모멘텀 중복 감수)

### OQ-2 PutCall 처리
- 권고: 옵션 A (P/C 거래량 비율)
- 근거: VKOSPI와 ATM 가격비는 실질적으로 중복(상관계수 추정 0.7+), 거래량은 독립 정보
- 구현 필요: KRX data.krx.co.kr P/C 거래량 수집
- 주의: 만기일 효과로 만기 전 주간 풋 거래량 급증 → 5일 이동평균 스무딩 또는 만기주 보정 필수

### OQ-3 RSI_10 교체
- 권고: 옵션 B (52주 신고가/신저가 비율) — A/D Line 대비 우위 확인 완료
- 근거: 계산 단순, rollingPercentileRank와 직접 호환, 시장 강도(Breadth) 독립 신호
- A/D Line 배제 이유: 누적합 특성으로 Rolling Z-score에서 선형 드리프트 발생, 20일 변화율 변환 시 단기 모멘텀 지표로 퇴화
- 수식: (신고가수 - 신저가수) / (신고가수 + 신저가수)
- 구현 필요: KRX 신고가/신저가 종목수 수집
- OQ-2와 동일 KRX 수집 경로에서 추출 가능 → 하나의 배치 잡으로 통합 가능

### OQ-4 가중치
- SPEC 제안: Momentum 0.25 / Volatility 0.25 / PutCall 0.15 / BondDiff대체 0.20 / RSI대체 0.15
- 권고안: Momentum 0.20 / Volatility 0.20 / PutCall(P/C거래량) 0.20 / BondDiff대체(신용스프레드) 0.25 / Breadth(52주신고가비율) 0.15
- 근거: 독립성 기준 배분 (신용스프레드가 다른 지표와 상관 최저)
- 한국 시장 외국인 수급 집중 위험: Momentum+VKOSPI가 동시 반응 → 합산 50% 초과 금지, 신용스프레드 가중치 확대로 완화
- SPEC 제안 Momentum 0.25+Volatility 0.25=0.50은 외국인 수급 이벤트 단일 노출 위험 → 각 0.20으로 하향 검토 완료

### OQ-5 시각화
- 권고: 2-Track 채택 (FGI Level 0-100 + MACD Oscillator)
- 근거: Level(역추세 타이밍) + Oscillator(추세 추종 타이밍) 복합 신호가 의사결정 품질 향상
- 복합 신호: Level낮음+Oscillator상향반전=강한매수, 두 트랙 상충=중립(대기)

## 최종 확정 수식 (2026-03-30)

```
FGI_v2_t =
  0.20 × Momentum_norm                   // D1: KOSPI vs SMA125 괴리율
+ 0.20 × (1 - Volatility_norm)           // D2: VKOSPI 내재변동성
+ 0.20 × (1 - CreditSpread_norm)         // D3: BBB+ - AA- 금리차
+ 0.10 × (1 - PCRatio_norm)              // D4-기관헤저: P/C 거래량 5일 MA
+ 0.10 × MarketBreadth_norm              // D5: (신고가수 - 신저가수) / (신고가수 + 신저가수)
+ 0.10 × ForeignNet_norm                 // D4-외국인: 순매수 20일 누적
+ 0.10 × (1 - MarginBalance_norm)        // D4-개인레버리지: 신용잔고 20일 변화율

Oscillator = MACD(12,26,9) on FGI_v2_t
정규화 = rollingPercentileRank(252일)  // MinMaxScaler 금지 (룩어헤드 바이어스)
D4 합산 = 30% (상한 준수)
```

### 변수 구성 최종 확정 (7변수)

| 순서 | 변수명 | 차원 | 소스 | 비고 |
|------|--------|------|------|------|
| 1 | Momentum | D1 | Yahoo Finance ^KS11 | SMA125 괴리율 |
| 2 | Volatility | D2 | KRX data.krx.co.kr | VKOSPI, 실현변동성 아님 |
| 3 | CreditSpread | D3 | ECOS API | BBB+ - AA- 금리차 |
| 4 | PCRatio | D4-기관헤저 | KRX data.krx.co.kr | P/C 거래량 5일 MA |
| 5 | MarketBreadth | D5 | KRX data.krx.co.kr | 52주 신고가 비율 — ADLine 아님 |
| 6 | ForeignNet | D4-외국인 | KRX data.krx.co.kr | 순매수 20일 누적 |
| 7 | MarginBalance | D4-개인레버리지 | kofia.or.kr | 신용잔고 20일 변화율, T+2 지연 처리 |

SPEC 3-3항 정정 사항: RSI_10 교체는 옵션 A(ADLine)가 아닌 옵션 B(52주 신고가 비율)로 최종 채택.
ADLine은 20일 롤링합 변환 시 D1 퇴화 문제로 배제 확정.

## 구현 로드맵

- Phase 1 (즉시): 2변수 MVP (Momentum + 실현변동성) — 내부 파이프라인/시각화/정규화 검증 전용. 공개 출시 금지.
- Phase 2 (1~2일): ECOS API 발급 → 신용스프레드 추가 → 3변수 최소 공개 기준 충족. 이 단계 완료 후 출시.
- Phase 3 (단기): KRX P/C 거래량 수집 (OQ-2 해소) → 4변수 구성
- Phase 4 (중기): KRX 신고가/신저가 + kofiabond 신용스프레드 수집 (OQ-1,3 완전 해소)
- Phase 5 (검증): 3개월 롤링 백테스트, 기여도 분석, 가중치 재최적화

**Why:** 한국 시장 특성(외국인 수급 집중, 지수 대형주 집중도)을 반영한 독립성 중심 설계
**How to apply:** 구현 시 각 구성 요소를 별도 함수로 분리하여 Phase별 교체가 가능하도록 설계

## 2변수 타당성 평가 결과 (2026-03-30)

### 핵심 결론
"가용 데이터만으로 2변수 출시"는 내부 검증 목적으로는 타당하나, 사용자 공개용 Fear & Greed 신호로는 타당하지 않음.

### 2변수 구성의 구조적 문제
- Momentum(KOSPI-SMA125)과 실현변동성(20일 σ) 모두 `^KS11` 단일 소스 파생
- 공포 국면에서 상관계수 -0.65 ~ -0.80 추정 (동일 급락 이벤트를 두 번 측정)
- 두 변수 모두 후행 지표 — 선행/동행 변수 전혀 없음
- "다양한 시장 차원 통합"이라는 합성 지수 전제 충족 불가

### VKOSPI vs. 실현변동성 차이
- VKOSPI: 선행/동행, 항복(Capitulation) 포착 가능, 저점 2~5일 전 스파이크
- 실현변동성: 후행, 저점 이후 5~15일 후 최고값. 개념적으로 열등한 대체재

### 최소 공개 기준
신용스프레드(CreditSpread)가 세 번째 변수로 반드시 포함되어야 함.
- 가격 시장과 독립적 정보 소스 (채권 시장)
- 2~4주 선행 경보 역할
- ECOS API 무료, 즉시 발급 가능 — 출시 지연 비용 1~2일

### 3변수 권고 가중치 (VKOSPI 미확보 시)
Momentum 40% / 실현변동성(VKOSPI 대용) 30% / 신용스프레드 30%
- 공선성 있는 두 가격 변수(Momentum+실현변동성) 합산 70% 상한 유지
- 독립 소스(신용스프레드) 30%로 다각화 최소 확보

## 3변수 이론적 타당성 평가 결과 (2026-03-30)

### 핵심 결론
3변수 구성(Momentum + 실현변동성 + 신용스프레드)은 이론적 요건을 충족하지 못함. "Fear & Greed Index" 명칭으로 공개 게시 부적합.

### 이론적 결함 3가지
1. 투자자 행동 포착 변수 전무 — P/C Ratio, 외국인 순매수 없이 "심리 지수" 명칭 개념적 오류
2. 실현변동성 후행성으로 시장 저점보다 5~15일 지연된 공포 정점 신호 발생
3. 2024년 유형(수급 이탈 중심 하락) 구조적 포착 불가 — 신용스프레드가 안정적 유지될 때 공포 과소평가

### F&G 지수 이론적 5대 차원 (이번 평가에서 도출)
- D1: 가격 모멘텀 — 탐욕의 자기강화 추격 매수
- D2: 시장 변동성 — 공포의 강도와 지속성 (VKOSPI가 실현변동성보다 우위)
- D3: 위험선호도 — 자산 배분 행동 (신용스프레드)
- D4: 투자자 포지셔닝 — 심리의 행동화 여부 (P/C Ratio, 외국인 순매수)
- D5: 시장 폭(Breadth) — 탐욕의 지속 가능성 vs 내부 균열

3변수 구성은 D4, D5 완전 부재.

### 시나리오별 실패 패턴
- 2020년 3월: 실현변동성 후행으로 저점 10일 후에야 공포 정점 신호 → 최적 역추세 매수 시점 놓침
- 2022년 금리 충격: 낮은 변동성 동반 완만한 하락 → 실현변동성이 공포 신호 미발생 → 중립 신호 오류
- 2024년 외국인 이탈: 신용스프레드 안정 유지 → 공포 과소평가 치명적 오류

### 최소 충족 가능 조합 (이론적 권고)
```
FGI_최소충족 (5변수):
  0.20 × Momentum(MA125)
  0.20 × VKOSPI
  0.20 × CreditSpread(BBB+-AA-)
  0.20 × PCRatio_Volume
  0.20 × MarketBreadth(52주신고가비율)
```
D1~D5 모두 커버, 단일 소스 최대 20% 제한.

### 3변수 버전 게시 시 필수 조치
1. 명칭 변경: "Fear & Greed" → "시장 심리 압력 지수(Market Stress Indicator)"
2. 투자자 행동 변수 미포함, 실현변동성 후행성, 수급 이탈 포착 불가 면책 명시
3. VKOSPI 별도 확인 지표로 병행 사용 권고 문구 포함
4. 공개 이전 ECOS 신용스프레드 + P/C 거래량 또는 VKOSPI 중 하나 추가하여 4변수 이상으로 확장 강력 권고

### Rolling Z-score 정규화 품질 문제
- 실현변동성: 로그정규 분포 → +3σ 클리핑으로 극단 공포 구간 심각도 구분 불가
- 신용스프레드: 스탈레 데이터로 Rolling std 왜곡 → 선형 보간이 신용 이벤트 충격 희석
- Momentum (MA125 기반): 252일 창 내 추세장/횡보장 구간 혼재로 분산 불안정

## 7변수 설계의 이론적 차원 분류 분석 (2026-03-30)

### 차원-변수 매핑

| 변수 | 차원 | 원천 | 핵심 여부 |
|------|------|------|----------|
| Momentum (KOSPI vs SMA125) | D1 | 주식 가격 | 핵심 (D1 유일 대표) |
| VKOSPI | D2 | 옵션 내재변동성 | 핵심 (D2 유일 대표) |
| CreditSpread (BBB+ - AA-) | D3 | 채권 시장 | 핵심 (D3 유일 대표, 가장 독립적) |
| PCRatio (P/C 거래량 5일 MA) | D4 | 옵션 거래량 | 핵심 (D4 주요 대표) |
| ForeignNet (외국인 순매수 20일 누적) | D4 | 주식 수급 | 핵심 (한국 시장 고유, D4 보완) |
| MarginBalance (신용잔고 20일 변화율) | D4 | 주식 레버리지 수급 | 보완 (D4 내 개인 레버리지 측면) |
| ADLine (상승-하락 20일 롤링합) | D5 | 주식 시장폭 | 보완 (D5, 단 52주 신고가 비율로 교체 권고) |

### 7변수 설계의 구조적 문제

**D4 집중(동일 가중치 시 42.9%):**
- PCRatio + ForeignNet + MarginBalance 모두 동일 가중치 적용 시 D4가 전체의 3/7 차지
- 해결안: D4 전체 상한 30%, D4 내 개별 변수 각 10%로 조정
- 나머지 70%는 D1(20%), D2(20%), D3(20%), D5(10%) 배분

**ADLine의 D5 적합성 문제:**
- 누적합 특성 → Rolling Z-score에서 선형 드리프트 발생
- 20일 롤링합으로 변환 시 단기 모멘텀 지표로 퇴화 (D5 기능 상실)
- 52주 신고가 비율로 교체 시 D5 이론적 적합성 복원 가능

### 이론적 최소 유효 구성 (D4 포함 기준)

**Fear & Greed 명칭 최소 조건 충족 4변수:**
- Momentum (D1) + VKOSPI (D2) + CreditSpread (D3) + PCRatio 또는 ForeignNet (D4)
- 한국 시장 특화: ForeignNet이 PCRatio보다 KOSPI 방향성 설명력 높음

**D5 누락 시 오류:**
- 탐욕 고점 탐지 지연 — 대형주 집중 상승 시 내부 균열 포착 불가
- 오류 방향: 탐욕 과대 표시, 역추세 매도 신호 발생 지연

### 차원 다양성 원칙

같은 차원의 변수 N개 추가 효과 < 독립 차원 1개 추가 효과.
D4 변수를 3개로 늘리는 것보다 D1~D5 각 1개씩 배분이 노이즈 감소 및 오류 감지에 우월.
D4 내 변수 3개는 서로 다른 투자자군(기관 헤저/외국인/개인 레버리지)을 커버할 경우에만 정당화 가능.

### ForeignNet vs. MarginBalance 역분리 구간

2021~2022년 한국 시장: 외국인 매도 + 개인 신용 매수 동시 진행 ("동학 개미" 현상).
이 구간에서 ForeignNet(공포)과 MarginBalance(탐욕)가 상충 신호 → 지수 중립화 효과.
이것이 올바른 신호(실제 시장이 분열 상태)인지, 아니면 오류인지는 전략에 따라 다름.

## D5 이론적 위상 확정 (2026-03-30)

### ADLine vs 52주 신고가 비율 최종 결론

52주 신고가 비율이 D5 측정에 이론적으로 우월. 근거:
- ADLine 누적합 특성: Rolling Z-score에서 선형 드리프트 → 정규화 실패
- ADLine 차분화(20일 롤링합): D1(모멘텀)과 동형으로 퇴화
- 52주 신고가 비율: path-independent 단면 상태값 → rollingPercentileRank 직접 투입 가능
- CNN F&G 수식: (신고가수 - 신저가수) / (신고가수 + 신저가수) — 방향성 + 활성 경계 정규화

### D5 독립성 핵심 근거

KOSPI200은 시가총액 가중 → 상위 10종목이 지수 변동 50% 이상 설명.
- D1(KOSPI vs SMA125): 대형주가 오르면 양(+) 신호
- D5(52주 신고가 비율): 나머지 중소형주가 실제로 따라가는지 측정
→ 대형주 집중 랠리 시 D1=탐욕, D5=공포 신호 분리 가능. 이것이 D5 포함 핵심 근거.

### D5 없을 때 오류 시나리오 (한국 시장 특화)

1. 대형주 집중 랠리: D1~D4 모두 탐욕 → FGI 75~80. D5 있으면 60~65로 보정.
   오류 유형: False Greed (탐욕 과대 표시)
2. 반등 초기 내부 확인 부재: D1~D4 공포 해소 신호. D5 여전히 극단 저수준.
   오류 유형: Premature Recovery Signal (조기 공포 해소)
3. 섹터 순환 장세: D1~D4 중립. D5만 특정 방향 감지.
   오류 유형: 수면 아래 섹터 탐욕 과열 미감지

## 한국 공개 데이터 소스 매핑 (2026-03-30)

### 각 변수별 추천 수집 경로

| 변수 | 추천 소스 | 접근 방식 |
|------|----------|----------|
| VKOSPI | KRX data.krx.co.kr | HTTP POST, bld=dbms/MDC/STAT/standard/MDCSTAT13601 |
| 신용스프레드 BBB+-AA- | ECOS API | GET /StatisticSearch/{KEY}/json/kr/1/100/817Y002/D/.../5040000 vs 5041000 |
| P/C 거래량 비율 | KRX data.krx.co.kr | HTTP POST, bld=dbms/MDC/STAT/standard/MDCSTAT12501, mktId=O |
| 52주 신고가 비율 | KRX data.krx.co.kr | HTTP POST, bld=dbms/MDC/STAT/standard/MDCSTAT01702, mktId=STK |
| 외국인 순매수 | KRX data.krx.co.kr | HTTP POST, bld=dbms/MDC/STAT/standard/MDCSTAT02203, invstTpCd=4000 |
| 신용잔고 | kofia.or.kr freesis | HTTP POST JSON (엔드포인트 불안정, 사전 검증 필수) |

### KRX 수집 파이프라인 통합 패턴

VKOSPI + P/C 거래량 + 52주 신고가 + 외국인 순매수 → 동일 KRX POST 인터페이스, bld만 교체.
단일 fetchKrxData(bld, params) 함수로 Phase 3~4 데이터 4개 통합 수집 가능.
필수 헤더: Referer: https://data.krx.co.kr, User-Agent 브라우저 문자열.

### KRX bld 코드 신뢰도 주의사항

KRX는 공개 API 문서 없음. bld 코드는 역공학 추출값. 구현 전 반드시 브라우저 Network 탭으로 실제 bld 파라미터 캡처 검증 필요.

### 신용잔고 수집 주의사항

T+2 결제 특성 → 2영업일 지연 공시. FGI 계산 시 lag 처리 또는 20일 변화율 사용으로 흡수.
kofia.or.kr 엔드포인트 구조 변경 잦음 → 헬스체크 로직 필수.
