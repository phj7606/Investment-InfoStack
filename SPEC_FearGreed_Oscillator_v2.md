# SPEC: 한국 Fear & Greed Oscillator v2 개선 구현

> Claude Code 구현용 스펙 문서
> 작성 기준: 코드 리뷰 + CNN Fear & Greed Index 비교 분석 결과
> 원본 파일: `한국 피어앤그리드오실레이터 코드.txt`

---

## 1. 배경 및 목표

KOSPI/KOSDAQ 대상의 Fear & Greed Index를 CNN 방법론 기준으로 재검토하여,
변수 타당성·알고리즘 정확성·시각화 구조를 개선한 v2를 구현한다.

- 실행 환경: Google Colab (Python 3.x)
- 입력 데이터: 기존과 동일한 엑셀 파일 (KOSPI / KOSDAQ 시트)
- 출력 파일: `KoreaFearGreed_v2.py`

---

## 2. 코드 버그 수정 (필수 — 옵션 없음)

### 2-1. RSI Wilder's Smoothing 적용

현재 코드는 단순 Rolling Mean으로 RSI를 계산하고 있어 과도하게 민감하게 반응함.
표준 RSI는 Wilder's EMA(지수이동평균)를 사용해야 함.

```python
# 현재 (오류): 단순 Rolling Mean
gain = delta.where(delta > 0, 0).rolling(window).mean()
loss = -delta.where(delta < 0, 0).rolling(window).mean()

# 수정: Wilder's EMA
gain = delta.where(delta > 0, 0).ewm(alpha=1/window, adjust=False).mean()
loss = -delta.where(delta < 0, 0).ewm(alpha=1/window, adjust=False).mean()
```

### 2-2. Data Leakage 제거 (MinMaxScaler → Rolling Z-score)

현재 코드는 전체 기간의 최대/최솟값으로 스케일링하므로 미래 데이터가 과거 정규화에
영향을 미침 (백테스팅 결과 낙관 왜곡). Walk-forward 방식으로 교체 필요.

```python
# 현재 (오류): 전체 기간 fit → 미래 정보 누출
scaler = MinMaxScaler()
df.loc[valid, features] = scaler.fit_transform(df.loc[valid, features])

# 수정: Rolling 252일 Z-score
for f in features:
    rolling_mean = df[f].rolling(252, min_periods=60).mean()
    rolling_std  = df[f].rolling(252, min_periods=60).std()
    df[f'{f}_norm'] = (df[f] - rolling_mean) / rolling_std.replace(0, np.nan)
    # ±3 시그마 클리핑 후 0~1 변환
    df[f'{f}_norm'] = df[f'{f}_norm'].clip(-3, 3).add(3).div(6)
```

### 2-3. get_impulse_colors() 벡터화

현재 Python 루프로 구현되어 있어 데이터 증가 시 성능 저하 발생.

```python
# 수정: numpy vectorize
def get_impulse_colors(df, ema_col, macd_col):
    ema_up  = df[ema_col].diff() > 0
    macd_up = df[macd_col].diff() > 0
    conditions = [ema_up & macd_up, ~ema_up & ~macd_up]
    choices    = ['green', 'red']
    return list(np.select(conditions, choices, default='blue'))
```

---

## 3. 변수 구성 재설계

### CNN Fear & Greed Index 7개 항목 대비 현재 코드 커버리지

| CNN 항목 | 현재 코드 변수 | 상태 |
|----------|--------------|------|
| Stock Price Momentum | Momentum (지수 - MA125) | ✅ 유지 |
| Put/Call Ratio | PutCall (ATM 가격비) | ⚠️ 교체 권고 |
| Market Volatility | Volatility (VKOSPI) | ✅ 유지 |
| Junk Bond / Safe Haven | BondDiff (장단기 금리차) | 🔴 교체 필수 |
| RSI_10 | RSI_10 | ⚠️ 중복 — 교체 또는 제거 권고 |
| Stock Price Strength | ❌ 없음 | ➕ 추가 권고 |
| Stock Price Breadth | ❌ 없음 | ➕ 추가 권고 |

---

### 3-1. BondDiff 교체 [옵션 선택 필요]

**문제:** 현재 `10년채 선물 - 5년채 선물`은 수익률 곡선 기울기로,
경기 낙관(탐욕)과 인플레이션 공포(공포) 모두에서 값이 커지므로 단방향 해석 불가.
CNN이 의도한 "위험선호도(Risk Appetite)" 측정값이 아님.

> 2022년 사례: 금리 급등으로 BondDiff 상승 → 코드 탐욕 신호 출력 → 실제 KOSPI 폭락

**[옵션 A] 회사채 신용스프레드 (권장)**
- 정의: `BBB+ 회사채 금리 - AA- 회사채 금리`
- 해석: 스프레드 축소 → 위험선호 → 탐욕 신호
- Fear/Greed 방향: `(1 - CreditSpread_norm)` — 스프레드 낮을수록 탐욕
- 데이터: 금융투자협회 채권정보센터 (kofiabond.or.kr), 일별 무료 제공
- 장점: CNN Junk Bond Demand와 개념 동일, 가장 직접적인 위험선호 지표
- 단점: 별도 데이터 수집 필요

**[옵션 B] 주식 대비 국채 상대수익률 (데이터 추가 불필요)**
- 정의: `KOSPI 20일 수익률 - KTB 10년 20일 수익률`
- 해석: 주식이 국채보다 초과수익 → 위험선호 → 탐욕 신호
- Fear/Greed 방향: `RelativeReturn_norm` — 값 높을수록 탐욕
- 데이터: 기존 KOSPI 데이터 + KTB 수익률 컬럼 추가만으로 계산 가능
- 장점: CNN Safe Haven Demand와 개념 동일, 추가 수집 최소화
- 단점: KTB 수익률 데이터 1개 컬럼 추가 필요

**[옵션 C] 현행 유지 (비권장)**
- 변수명을 `YieldCurveSlope`로 명확히 변경
- F&G 지수의 구성 요소가 아닌 보조 참고 지표로 역할 한정
- 해석 주의 주석 추가

---

### 3-2. PutCall 처리 [옵션 선택 필요]

**문제:** ATM 옵션 가격 비율은 내재변동성(IV)을 이미 포함하고 있어
VKOSPI(Volatility 변수)와 정보 중복 발생 가능. 투자자 포지셔닝을
순수하게 보려면 거래량 기반이 적합.

**[옵션 A] P/C 거래량 비율로 교체 (권장)**
- 정의: `KOSPI200 Put 옵션 거래량 / Call 옵션 거래량` (5일 이동평균)
- Fear/Greed 방향: `(1 - PCRatio_norm)` — P/C 낮을수록 탐욕
- 데이터: KRX 정보데이터시스템 (data.krx.co.kr), 무료 다운로드
- 장점: CNN Put/Call 지표와 동일 방법론, 변동성 중복 제거
- 단점: 별도 데이터 수집 필요

**[옵션 B] 현행 ATM 가격비 유지 + 가중치 조정**
- Volatility(VKOSPI)와 상관계수 계산 후 가중치 재배분
- PutCall 가중치: 0.20 → 0.10
- Volatility 가중치: 0.20 → 0.30
- 장점: 데이터 추가 불필요
- 단점: 근본적 중복 문제는 남음

---

### 3-3. RSI_10 처리 [옵션 선택 필요]

**문제:** RSI는 가격 모멘텀 지표로 이미 존재하는 Momentum(MA125 괴리율)과
같은 방향 신호. 동일 가중치(0.2) 부여 시 모멘텀 계열이 전체의 40% 차지.

**[옵션 A] A/D Line으로 교체 (권장)**
- 정의: `(상승종목수 - 하락종목수)` 일별 누적합의 20일 변화율
- 해석: 넓은 종목 상승 → 탐욕 신호 (CNN Breadth와 동일 개념)
- 데이터: KRX 시장정보 일별 상승/하락/보합 종목 수
- 장점: 지수 상승 뒤에 개별 종목 하락하는 내부 균열 포착 가능
- 단점: KRX 데이터 추가 수집 필요

**[옵션 B] 52주 신고가 비율로 교체**
- 정의: `신고가 종목수 / (신고가 + 신저가 종목수)` (KOSPI 기준)
- 해석: 신고가 종목 多 → 탐욕 신호 (CNN Strength와 동일 개념)
- 데이터: KRX 정보데이터시스템
- 장점: CNN Stock Price Strength와 동일 방법론
- 단점: KRX 데이터 추가 수집 필요

**[옵션 C] RSI 유지 + 가중치 축소**
- RSI 가중치: 0.20 → 0.10
- Momentum과 합산이 전체 30% 이하 유지
- 장점: 데이터 추가 불필요
- 단점: 근본적 중복 문제는 남음

---

### 3-4. 한국 특화 변수 추가 [선택사항]

**외국인 순매수 누적 (강력 권장)**
- 정의: 외국인 KOSPI 순매수금액 20일 누적합
- 해석: 순매수 지속 → 탐욕, 순매도 지속 → 공포
- 데이터: KRX 투자자별 매매동향 (무료)
- 근거: KOSPI 외국인 지분율 ~30%, 외국인 매매가 지수 방향 강하게 견인
- CNN 대응 없음 — 한국 시장 고유 신호

**신용잔고 변화율 (선택)**
- 정의: `(금일 신용잔고 - 20일전 신용잔고) / 20일전 신용잔고`
- 해석: 급증 → 레버리지 탐욕, 급감 → 강제청산 공포
- 데이터: 금융감독원 또는 증권사 API
- 근거: 한국 시장 고점/저점의 선행 지표로 검증된 데이터

> 변수 추가 시 전체 가중치 균등 재배분 (6변수 기준 각 0.167)

---

## 4. 시각화 구조 재설계

### 현재 구조의 문제

현재 코드는 F&G Index 원값에 MACD를 씌운 `Oscillator`를 출력함.
- MACD는 방향 전환 감지에 유리하지만 "현재 공포/탐욕 수준"이라는 핵심 정보 소실
- F&G Index는 이미 MA·EWM으로 스무딩 → 여기에 MACD EMA를 추가하면 3~4겹 지연
- 차트 제목이 "Fear & Greed Oscillator"이지만 실제로는 F&G의 2차 도함수를 표시

### 권장: 2-Track 구조

**Track 1 — Level Chart (수준 파악): 주 패널**

F&G Index 원값을 0~100으로 변환해 표시. 포지션 규모 결정 기준.

| 구간 | 색상 | 의미 |
|------|------|------|
| 0 ~ 20 | 🔴 빨강 | 극단적 공포 |
| 20 ~ 40 | 🟠 주황 | 공포 |
| 40 ~ 60 | ⬜ 회색 | 중립 |
| 60 ~ 80 | 🟡 연두 | 탐욕 |
| 80 ~ 100 | 🟢 초록 | 극단적 탐욕 |

우측 보조 축: 지수 가격 (기존 구조 유지)

**Track 2 — Momentum Chart (타이밍 포착): 보조 패널**

현재의 MACD Oscillator 유지. 타이밍 보조 지표로 역할 한정.
제로선 교차 = 심리 전환 시작 신호.
레이블 변경: 'Oscillator' → 'F&G Momentum (MACD)'

**[옵션] 단일 패널 유지**
- F&G Level + 가격을 하나의 패널에 표시 (현재 구조 유지)
- 단, Oscillator 레이블을 'F&G Momentum (MACD)'로 명확히 변경

---

## 5. 가중치 설계

### 현재: 5개 변수 동일 가중치 (각 0.20)

### 권장 재배분안 (변수 재구성 후 5변수 기준)

| 변수 | 가중치 | 근거 |
|------|--------|------|
| Momentum (MA125 괴리율) | 0.25 | CNN 핵심 지표, 한국 시장 검증 강함 |
| Volatility (VKOSPI) | 0.25 | 가장 직접적인 공포 측정값 |
| BondDiff 대체 변수 | 0.20 | 위험선호도 직접 측정 |
| PutCall 대체/유지 변수 | 0.15 | 변동성 중복 고려 축소 |
| RSI 대체 변수 (Breadth 등) | 0.15 | 모멘텀 중복 고려 축소 |
| **합계** | **1.00** | |

> 외국인 순매수 추가 시 6변수 균등 배분: 각 0.167

---

## 6. 구현 우선순위

### Phase 1 — 즉시 구현 (추가 데이터 불필요)
1. RSI Wilder's Smoothing 수정
2. Data Leakage 제거 (Rolling Z-score)
3. get_impulse_colors() 벡터화
4. BondDiff → 주식/국채 상대수익률 교체 (옵션 B)
5. PutCall → 가중치 조정 (옵션 B)
6. 시각화 2-Track 구조 적용 또는 레이블 명확화

### Phase 2 — KRX 데이터 추가 후
1. PutCall → P/C 거래량 비율 교체 (옵션 A)
2. RSI → A/D Line 또는 52주 신고가 비율 교체 (옵션 A or B)
3. 외국인 순매수 변수 추가

### Phase 3 — 고도화
1. BondDiff → 회사채 신용스프레드 교체 (옵션 A)
2. 신용잔고 변화율 추가
3. KOSDAQ 전용 실현변동성 분리 적용

---

## 7. Claude Code 실행 프롬프트 예시

Claude Code 터미널에서 이 파일을 참조하며 아래 프롬프트로 구현 지시:

```
SPEC_FearGreed_Oscillator_v2.md 파일을 읽고 다음 조건으로 구현해줘:

[Phase 1 기준]
- BondDiff 교체: 옵션 B (주식/국채 상대수익률, KTB 컬럼 추가 가정)
- PutCall: 옵션 B (현행 유지, 가중치 0.10으로 조정)
- RSI 처리: 옵션 C (가중치 0.10으로 축소)
- 시각화: 2-Track 구조 (Level + Momentum 분리)
- 가중치: 스펙 섹션 5 기준 재배분

원본 파일 구조(Google Colab, 엑셀 업로드)는 그대로 유지.
Elder Impulse System과 DeMark TD Setup은 현행 유지.
출력 파일명: KoreaFearGreed_v2.py
```

---

## 8. 참고 데이터 소스

| 데이터 | 출처 | URL |
|--------|------|-----|
| KOSPI200 옵션 P/C 거래량 | KRX 정보데이터시스템 | data.krx.co.kr |
| 상승/하락 종목 수 (A/D) | KRX 시장정보 | data.krx.co.kr |
| 52주 신고가/신저가 종목 수 | KRX 정보데이터시스템 | data.krx.co.kr |
| 회사채 신용스프레드 | 금융투자협회 채권정보센터 | kofiabond.or.kr |
| 외국인 순매수 | KRX 투자자별 매매동향 | data.krx.co.kr |
| 신용잔고 | 금융감독원 | fss.or.kr |

---

*문서 생성: Cowork mode (Claude) | 기준일: 2026-03-28*
