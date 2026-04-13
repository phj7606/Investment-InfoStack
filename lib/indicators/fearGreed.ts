/**
 * 한국 Fear & Greed Oscillator v2 지표 계산 모듈
 *
 * 7개 구성 요소:
 *   1. Momentum     — KOSPI SMA125 괴리율
 *   2. Volatility   — VKOSPI (반전: 높을수록 공포)
 *   3. CreditSpread — BBB+ - AA- 신용스프레드 (반전: 축소→탐욕)
 *   4. PCRatio      — Put/Call 거래량 비율 5일 MA (반전: 높을수록 공포)
 *   5. ADLine       — (상승-하락) 20일 롤링합 (Breadth)
 *   6. ForeignNet   — 외국인 순매수 20일 누적
 *   7. MarginBalance— 신용잔고 20일 변화율
 *
 * 버그 수정 (v1 대비):
 *   - RSI: 단순 Rolling Mean → Wilder's EMA 방식으로 수정 (2-1)
 *   - 정규화: MinMaxScaler 전체 기간 → Rolling Z-score (look-ahead 제거) (2-2)
 *
 * 모든 함수는 look-ahead bias 없는 순수 함수
 */

import { sma, mean, stdDev } from "@/lib/indicators/utils";
import type { MarketRegime } from "@/types";

// ────────────────────────────────────────────────────────────────
// 지표 계산 함수
// ────────────────────────────────────────────────────────────────

/**
 * RSI 계산 — Wilder's EMA 방식 (v1의 단순 Rolling Mean 버그 수정)
 *
 * Wilder's EMA: alpha = 1/period
 * 초기값(seed): 첫 period개의 gain/loss 단순 평균
 *
 * @param prices - 종가 시계열 (시간 오름차순)
 * @param period - RSI 기간 (기본: 10)
 */
export function calcRSI(
  prices: number[],
  period: number = 10
): (number | null)[] {
  const result: (number | null)[] = new Array(prices.length).fill(null);

  if (prices.length < period + 1) return result;

  // 일간 delta (현재 - 전일)
  const deltas = prices.map((p, i) => (i === 0 ? 0 : p - prices[i - 1]));

  // gain = max(delta, 0), loss = max(-delta, 0)
  const gains = deltas.map((d) => Math.max(d, 0));
  const losses = deltas.map((d) => Math.max(-d, 0));

  // 첫 period개의 단순 평균으로 Wilder's EMA seed 초기화
  let avgGain = gains.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((s, v) => s + v, 0) / period;

  // seed 위치(period번째 인덱스)에 첫 RSI 값 기록
  const firstRsi =
    avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result[period] = parseFloat(firstRsi.toFixed(4));

  // Wilder's EMA 업데이트: alpha = 1/period
  const alpha = 1 / period;

  for (let i = period + 1; i < prices.length; i++) {
    avgGain = alpha * gains[i] + (1 - alpha) * avgGain;
    avgLoss = alpha * losses[i] + (1 - alpha) * avgLoss;

    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result[i] = parseFloat(rsi.toFixed(4));
  }

  return result;
}

/**
 * Momentum — KOSPI 종가와 SMA125의 괴리율
 * 양수: 지수가 125일 이동평균 위에 있음 → 탐욕 방향
 *
 * @param prices    - KOSPI 종가 시계열
 * @param smaPeriod - 이동평균 기간 (기본: 125)
 */
export function calcMomentum(
  prices: number[],
  smaPeriod: number = 125
): (number | null)[] {
  const smaValues = sma(prices, smaPeriod);

  return prices.map((price, i) => {
    const smaVal = smaValues[i];
    if (smaVal === null || smaVal === 0) return null;
    return (price - smaVal) / smaVal;
  });
}

/**
 * A/D Line (Advance-Decline) — 20일 롤링 합산
 *
 * 원시 누적합 대신 20일 롤링합을 사용하여 정상성(stationarity) 확보.
 * Rolling Z-score 정규화와의 구조적 충돌(드리프트 문제) 해결.
 *
 * @param advancing - 일별 상승 종목수
 * @param declining - 일별 하락 종목수
 * @param period    - 롤링합 기간 (기본: 20)
 */
export function calcADLine(
  advancing: number[],
  declining: number[],
  period: number = 20
): (number | null)[] {
  if (advancing.length !== declining.length) {
    throw new Error("advancing, declining 배열 길이가 다릅니다");
  }

  // 일별 순상승 종목수 (상승 - 하락)
  const dailyNet = advancing.map((adv, i) => adv - declining[i]);

  return dailyNet.map((_, i) => {
    if (i < period - 1) return null;
    // i-period+1 ~ i 구간의 합산 (현재 포함)
    return dailyNet.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0);
  });
}

/**
 * P/C 거래량 비율 — Put/Call 거래량 5일 이동평균
 *
 * @param putVolume  - 일별 Put 옵션 거래량
 * @param callVolume - 일별 Call 옵션 거래량
 * @param maPeriod   - 이동평균 기간 (기본: 5)
 */
export function calcPCRatio(
  putVolume: number[],
  callVolume: number[],
  maPeriod: number = 5
): (number | null)[] {
  if (putVolume.length !== callVolume.length) {
    throw new Error("putVolume, callVolume 배열 길이가 다릅니다");
  }

  // 원시 P/C 비율 (Call 거래량 0인 날 제외)
  const rawRatio = putVolume.map((put, i) => {
    const call = callVolume[i];
    return call > 0 ? put / call : null;
  });

  // 5일 이동평균 적용 (null 제외하고 계산)
  return rawRatio.map((_, i) => {
    if (i < maPeriod - 1) return null;
    const window = rawRatio.slice(i - maPeriod + 1, i + 1);
    const valid = window.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return valid.reduce((s, v) => s + v, 0) / valid.length;
  });
}

/**
 * 외국인 순매수 누적 — 20일 롤링 합산
 *
 * @param netBuying - 일별 외국인 순매수 금액 (백만원, 양수: 매수, 음수: 매도)
 * @param period    - 롤링합 기간 (기본: 20)
 */
export function calcForeignNet(
  netBuying: number[],
  period: number = 20
): (number | null)[] {
  return netBuying.map((_, i) => {
    if (i < period - 1) return null;
    return netBuying.slice(i - period + 1, i + 1).reduce((s, v) => s + v, 0);
  });
}

/**
 * 신용잔고 변화율 — 20일 전 대비 변화율
 *
 * 급증 → 레버리지 탐욕, 급감 → 강제청산 공포
 *
 * @param balance - 일별 신용잔고 금액 (백만원)
 * @param period  - 비교 기간 (기본: 20)
 */
export function calcMarginChange(
  balance: number[],
  period: number = 20
): (number | null)[] {
  return balance.map((current, i) => {
    if (i < period) return null;
    const prev = balance[i - period];
    if (prev === 0) return null;
    return (current - prev) / prev;
  });
}

// ────────────────────────────────────────────────────────────────
// 정규화
// ────────────────────────────────────────────────────────────────

/**
 * Rolling Z-score 정규화 — 0~1 스케일 변환 (look-ahead bias 없음)
 *
 * v1의 MinMaxScaler(전체 기간 fit)을 대체하여 미래 정보 누출 제거.
 *
 * 알고리즘:
 *   1. 과거 window 기간의 mean, std 계산 (시점 i 자신 미포함)
 *   2. z = (current - mean) / std
 *   3. clip: z = clamp(z, -sigmaClip, +sigmaClip)
 *   4. 0~1 변환: normalized = (z + sigmaClip) / (2 * sigmaClip)
 *
 * @param series     - 정규화할 시계열 (null 포함 가능)
 * @param window     - 롤링 윈도우 (기본: 252일)
 * @param minPeriods - 최소 유효 관측값 수 (기본: 60)
 * @param sigmaClip  - 클리핑 시그마 범위 (기본: 3.0)
 * @returns 0~1 사이 정규화된 값, 초기 구간 및 데이터 부족 시 null
 */
export function normalizeRollingZScore(
  series: (number | null)[],
  window: number = 252,
  minPeriods: number = 60,
  sigmaClip: number = 3.0
): (number | null)[] {
  return series.map((current, i) => {
    if (current === null) return null;

    // look-ahead 방지: 과거 window 기간만 참조 (i 자신 미포함)
    const startIdx = Math.max(0, i - window);
    const lookback = series
      .slice(startIdx, i)
      .filter((v): v is number => v !== null);

    if (lookback.length < minPeriods) return null;

    const avg = mean(lookback);
    const std = stdDev(lookback);

    // 표준편차 0이면 분포가 없다는 의미 → 중립값(0.5) 반환
    if (std === 0) return 0.5;

    const z = (current - avg) / std;
    const clipped = Math.max(-sigmaClip, Math.min(sigmaClip, z));
    return (clipped + sigmaClip) / (2 * sigmaClip);
  });
}

// ────────────────────────────────────────────────────────────────
// F&G 지수 합산
// ────────────────────────────────────────────────────────────────

/** 7개 구성 요소 시계열 입력 */
export interface FGInputSeries {
  momentum: (number | null)[];
  volatility: (number | null)[];
  creditSpread: (number | null)[];
  pcRatio: (number | null)[];
  adLine: (number | null)[];
  foreignNet: (number | null)[];
  marginBalance: (number | null)[];
}

/** 7개 구성 요소 가중치 */
export interface FGWeights {
  momentum: number;
  volatility: number;
  creditSpread: number;
  pcRatio: number;
  adLine: number;
  foreignNet: number;
  marginBalance: number;
}

/** 정규화 파라미터 */
export interface FGNormParams {
  window: number;
  minPeriods: number;
  sigmaClip: number;
}

/**
 * F&G 지수 합산 계산
 *
 * 반전 대상 (값이 높을수록 공포):
 *   Volatility, CreditSpread, PCRatio → 1 - normalized 적용
 *
 * null 처리: 유효한 구성 요소만 가중 평균 (null 변수의 가중치를 비례 재배분)
 * 유효 구성 요소가 3개 미만이면 null 반환
 *
 * @returns 0~100 F&G 지수 시계열 (소수점 1자리)
 */
export function calcFearGreedIndex(
  inputs: FGInputSeries,
  weights: FGWeights,
  normParams: FGNormParams
): (number | null)[] {
  const { window, minPeriods, sigmaClip } = normParams;

  // 각 구성 요소 정규화 (0~1)
  const normMomentum    = normalizeRollingZScore(inputs.momentum,    window, minPeriods, sigmaClip);
  const normVolatility  = normalizeRollingZScore(inputs.volatility,  window, minPeriods, sigmaClip);
  const normCredit      = normalizeRollingZScore(inputs.creditSpread,window, minPeriods, sigmaClip);
  const normPC          = normalizeRollingZScore(inputs.pcRatio,     window, minPeriods, sigmaClip);
  const normAD          = normalizeRollingZScore(inputs.adLine,      window, minPeriods, sigmaClip);
  const normForeign     = normalizeRollingZScore(inputs.foreignNet,  window, minPeriods, sigmaClip);
  const normMargin      = normalizeRollingZScore(inputs.marginBalance,window, minPeriods, sigmaClip);

  const length = inputs.momentum.length;

  // 반전 여부 플래그: true = 높을수록 공포 → 1 - norm 적용
  const inverted = [false, true, true, true, false, false, false];
  const normArrays = [normMomentum, normVolatility, normCredit, normPC, normAD, normForeign, normMargin];
  const weightValues = [
    weights.momentum, weights.volatility, weights.creditSpread, weights.pcRatio,
    weights.adLine, weights.foreignNet, weights.marginBalance,
  ];

  return Array.from({ length }, (_, i) => {
    const components: { value: number; weight: number }[] = [];

    for (let k = 0; k < normArrays.length; k++) {
      const raw = normArrays[k][i];
      if (raw === null) continue;
      // 반전 대상 지표: 1 - normalized (낮을수록 탐욕)
      components.push({ value: inverted[k] ? 1 - raw : raw, weight: weightValues[k] });
    }

    // 최소 3개 이상의 유효 구성 요소가 있어야 지수 계산
    if (components.length < 3) return null;

    // 유효 가중치 합산 후 비례 재배분
    const totalWeight = components.reduce((s, c) => s + c.weight, 0);
    const weightedSum = components.reduce((s, c) => s + c.value * (c.weight / totalWeight), 0);

    return Math.round(weightedSum * 1000) / 10; // 0~100, 소수점 1자리
  });
}

// ────────────────────────────────────────────────────────────────
// F&G MACD Oscillator (Track 2)
// ────────────────────────────────────────────────────────────────

/** F&G MACD Oscillator 결과 */
export interface FGMacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/**
 * F&G 지수에 MACD 오실레이터 적용
 * Track 2 차트의 타이밍 보조 지표 역할
 *
 * 제로선 교차 = F&G 심리 전환 시작 신호
 *
 * @param fgSeries - F&G 지수 시계열 (0~100)
 * @param fast     - 단기 EMA 기간 (기본: 12)
 * @param slow     - 장기 EMA 기간 (기본: 26)
 * @param signal   - Signal 라인 EMA 기간 (기본: 9)
 */
export function calcFGMomentum(
  fgSeries: (number | null)[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): FGMacdResult {
  const length = fgSeries.length;
  const macd:      (number | null)[] = new Array(length).fill(null);
  const signalArr: (number | null)[] = new Array(length).fill(null);
  const histogram: (number | null)[] = new Array(length).fill(null);

  // EMA 계산 내부 헬퍼
  // null 구간은 이전 EMA 값을 유지 (체인 단절 방지)
  function calcEma(
    series: (number | null)[],
    period: number
  ): (number | null)[] {
    const alpha = 2 / (period + 1);
    const result: (number | null)[] = new Array(series.length).fill(null);
    let ema: number | null = null;

    for (let i = 0; i < series.length; i++) {
      const v = series[i];
      if (v === null) {
        result[i] = ema; // 이전 EMA 유지
        continue;
      }
      if (ema === null) {
        ema = v; // 첫 유효값으로 초기화
      } else {
        ema = alpha * v + (1 - alpha) * ema;
      }
      result[i] = parseFloat(ema.toFixed(4));
    }
    return result;
  }

  const emaFast = calcEma(fgSeries, fast);
  const emaSlow = calcEma(fgSeries, slow);

  // MACD = EMA(fast) - EMA(slow)
  for (let i = 0; i < length; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    macd[i] = f !== null && s !== null
      ? parseFloat((f - s).toFixed(4))
      : null;
  }

  // Signal = EMA(MACD, signal)
  const signalEma = calcEma(macd, signal);

  for (let i = 0; i < length; i++) {
    signalArr[i] = signalEma[i];
    const m = macd[i];
    const sg = signalArr[i];
    histogram[i] = m !== null && sg !== null
      ? parseFloat((m - sg).toFixed(4))
      : null;
  }

  return { macd, signal: signalArr, histogram };
}

// ────────────────────────────────────────────────────────────────
// 보조 유틸리티
// ────────────────────────────────────────────────────────────────

/**
 * F&G 지수값을 MarketRegime으로 분류
 *
 * | 구간      | Regime         | 의미               |
 * |-----------|----------------|--------------------|
 * | 0 ~ 20   | extreme_fear   | 극단적 공포 (저점 후보) |
 * | 20 ~ 40  | fear           | 공포 심리 우세      |
 * | 40 ~ 60  | neutral        | 중립               |
 * | 60 ~ 80  | greed          | 탐욕 심리 우세      |
 * | 80 ~ 100 | extreme_greed  | 극단적 탐욕 (과열)  |
 */
export function valueToRegime(value: number): MarketRegime {
  if (value < 20) return "extreme_fear";
  if (value < 40) return "fear";
  if (value < 60) return "neutral";
  if (value < 80) return "greed";
  return "extreme_greed";
}

/**
 * 정규화된 구성 요소 값 추출 (FearGreedHistoryPoint.components 조립용)
 * 반전 적용된 값을 반환한다.
 */
export interface FGComponentNormalized {
  momentum: number | null;
  volatility: number | null;
  creditSpread: number | null;
  pcRatio: number | null;
  adLine: number | null;
  foreignNet: number | null;
  marginBalance: number | null;
}

export function extractComponentsAt(
  normMomentum: (number | null)[],
  normVolatility: (number | null)[],
  normCredit: (number | null)[],
  normPC: (number | null)[],
  normAD: (number | null)[],
  normForeign: (number | null)[],
  normMargin: (number | null)[],
  i: number
): FGComponentNormalized {
  const inv = (v: number | null) => (v !== null ? 1 - v : null);
  return {
    momentum:      normMomentum[i] ?? null,
    volatility:    inv(normVolatility[i] ?? null),
    creditSpread:  inv(normCredit[i] ?? null),
    pcRatio:       inv(normPC[i] ?? null),
    adLine:        normAD[i] ?? null,
    foreignNet:    normForeign[i] ?? null,
    marginBalance: normMargin[i] ?? null,
  };
}
