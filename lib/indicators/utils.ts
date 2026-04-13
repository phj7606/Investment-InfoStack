// 투자 지표 계산 순수 함수 모음
// 모든 함수는 사이드 이펙트 없는 순수 함수로 서버/클라이언트 양측에서 실행 가능
//
// ⚠️ 룩어헤드 바이어스(Look-ahead Bias) 방지 원칙:
//   - 시점 i의 계산에는 series[0 ... i-1] 데이터만 사용
//   - 시점 i 자신(series[i])을 포함하는 경우 명시적으로 문서화
//   - 미래 데이터가 과거 계산에 유입되지 않도록 슬라이딩 윈도우 사용

// ─────────────────────────────────────────────
// 기초 통계 함수
// ─────────────────────────────────────────────

/**
 * 배열의 평균값
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 배열의 표준편차 (모표준편차)
 */
export function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * 정렬된 배열에서 p번째 백분위수를 선형 보간으로 계산
 * @param sortedValues - 오름차순 정렬된 숫자 배열
 * @param p            - 백분위 (0~100)
 */
export function percentile(sortedValues: number[], p: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  if (n === 1) return sortedValues[0];

  const index = (p / 100) * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  // 정수 인덱스라면 보간 없이 직접 반환
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

// ─────────────────────────────────────────────
// 이동 통계 함수 (룩어헤드 없음)
// ─────────────────────────────────────────────

/**
 * 단순 이동평균 (SMA)
 * - 시점 i의 결과는 series[i-period+1 ... i] 사용 (현재값 포함, 미래값 미포함)
 * - 초기 period-1개 시점은 null 반환
 *
 * @param series - 시계열 데이터 (시간 오름차순)
 * @param period - 이동평균 기간
 */
export function sma(series: number[], period: number): (number | null)[] {
  return series.map((_, i) => {
    if (i < period - 1) return null;
    const window = series.slice(i - period + 1, i + 1);
    return mean(window);
  });
}

/**
 * Rolling Percentile Rank (룩어헤드 없는 구조)
 *
 * 각 시점 i에서 "현재 값이 과거 window 기간 대비 몇 퍼센타일인가"를 계산한다.
 *
 * 룩어헤드 방지 메커니즘:
 *   - 시점 i 계산 시 lookback: series[i-window ... i-1] (i 자신 미포함)
 *   - 현재값 series[i]를 lookback 내에서의 순위로 정규화
 *   - 초기 window개 시점은 데이터 부족으로 null 반환
 *
 * @param series - 시계열 데이터 (시간 오름차순)
 * @param window - 룩백 윈도우 크기 (기본: 252 거래일 = 약 1년)
 * @returns 각 시점의 퍼센타일 랭크 (0~100), 초기 구간은 null
 */
export function rollingPercentileRank(
  series: number[],
  window: number = 252
): (number | null)[] {
  return series.map((currentValue, i) => {
    // 룩어헤드 방지: 과거 window개의 데이터가 없으면 계산 불가
    if (i < window) return null;

    // 과거 window 기간만 추출 (i 자신 미포함)
    const lookback = series.slice(i - window, i);

    // 현재값보다 작은 값의 개수 / 전체 = 백분위 순위
    const below = lookback.filter((v) => v < currentValue).length;
    return (below / window) * 100;
  });
}

/**
 * Rolling Z-Score (룩어헤드 없는 구조)
 *
 * Fear & Greed Oscillator의 ±1σ / ±2σ 극단값 밴드 계산에 사용.
 * z = (현재값 - 과거 window 평균) / 과거 window 표준편차
 *
 * @param series - 시계열 데이터 (시간 오름차순)
 * @param window - 룩백 윈도우 크기 (기본: 52 거래주 = 약 1년)
 * @returns 각 시점의 z-score, 초기 구간은 null
 */
export function rollingZScore(
  series: number[],
  window: number = 52
): (number | null)[] {
  return series.map((currentValue, i) => {
    if (i < window) return null;

    const lookback = series.slice(i - window, i);
    const avg = mean(lookback);
    const std = stdDev(lookback);

    // 표준편차가 0이면 z-score 정의 불가 → 0 반환
    if (std === 0) return 0;
    return (currentValue - avg) / std;
  });
}

// ─────────────────────────────────────────────
// 지수 이동평균 (EMA)
// ─────────────────────────────────────────────

/**
 * 지수이동평균 (EMA, Exponential Moving Average)
 * adjust=False 방식 — 엑셀 EMA 수식과 동일
 *
 *   alpha = 2 / (span + 1)
 *   EMA_0 = series[0]
 *   EMA_t = series[t] × α + EMA_{t-1} × (1 − α)
 *
 * Sector Flow Oscillator의 EMA12 / EMA26 / Signal9 계산에 사용.
 * 첫 번째 원소를 초기값으로 사용하므로 워밍업 없이 전체 배열 길이를 반환한다.
 *
 * NaN 전파: series[i]가 NaN이거나 직전 EMA가 NaN이면 결과[i]도 NaN
 *
 * @param series - 시계열 데이터 (시간 오름차순)
 * @param span   - EMA 기간 (1 이상)
 * @returns series와 동일 길이의 EMA 배열
 */
export function ema(series: number[], span: number): number[] {
  if (span < 1) throw new Error(`span은 1 이상이어야 합니다 (입력값: ${span})`);
  if (series.length === 0) return [];

  // 평활 계수: 기간이 길수록 α가 작아져 과거 가중치가 높아짐
  const alpha = 2 / (span + 1);
  const result: number[] = [series[0]];

  for (let i = 1; i < series.length; i++) {
    const prev = result[i - 1];
    const curr = series[i];
    // 현재값 또는 직전 EMA가 NaN이면 이후도 NaN 전파
    if (isNaN(curr) || isNaN(prev)) {
      result.push(NaN);
    } else {
      result.push(curr * alpha + prev * (1 - alpha));
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// 수익률 계산 함수
// ─────────────────────────────────────────────

/**
 * 단순 수익률 (Simple Return)
 * r_t = (P_t - P_{t-1}) / P_{t-1}
 *
 * @param prices - 종가 배열 (시간 오름차순)
 * @returns 수익률 배열 (첫 번째 원소는 null)
 */
export function simpleReturns(prices: number[]): (number | null)[] {
  return prices.map((price, i) => {
    if (i === 0) return null;
    const prev = prices[i - 1];
    if (prev === 0) return null;
    return (price - prev) / prev;
  });
}

/**
 * 로그 수익률 (Log Return)
 * r_t = ln(P_t / P_{t-1})
 * 정규분포 가정 및 Sortino Ratio 계산에 사용
 *
 * @param prices - 종가 배열 (시간 오름차순)
 * @returns 로그 수익률 배열 (첫 번째 원소는 null)
 */
export function logReturns(prices: number[]): (number | null)[] {
  return prices.map((price, i) => {
    if (i === 0) return null;
    const prev = prices[i - 1];
    if (prev <= 0 || price <= 0) return null;
    return Math.log(price / prev);
  });
}

// ─────────────────────────────────────────────
// Mansfield 상대강도 (Relative Strength)
// ─────────────────────────────────────────────

/**
 * Mansfield Relative Strength
 *
 * 공식 (PRD 2.4 기준):
 *   relative    = price / benchmark
 *   RS_raw      = (relative / relative.rolling(window).mean() - 1) * 100
 *   RS_pct      = RS_raw.rolling(252).rank(pct=True) * 100  (Rolling Percentile)
 *
 * 이 함수는 RS_raw까지만 계산하며, RS_pct는 rollingPercentileRank(RS_raw)로 구한다.
 *
 * @param prices      - 종목 종가 배열 (시간 오름차순)
 * @param benchPrices - 벤치마크 종가 배열 (동일 길이 및 동일 날짜 기준)
 * @param window      - 이동평균 기간 (기본: 252 거래일 = 연간 1년 MA)
 *                      ETF 섹터 로테이션 사이클(6~18개월)을 포착하려면 252일 MA가 필수.
 *                      52주×5일=260이 아닌 실제 연간 거래일 수 252를 사용한다.
 * @returns Mansfield RS Raw 점수 배열, 초기 window개는 null
 */
export function mansfieldRS(
  prices: number[],
  benchPrices: number[],
  window: number = 252
): (number | null)[] {
  if (prices.length !== benchPrices.length) {
    throw new Error("prices와 benchPrices의 길이가 일치해야 합니다");
  }

  // 1단계: 상대가격(relative) 계산 = 종목가격 / 벤치마크가격
  const relative = prices.map((price, i) => {
    const bench = benchPrices[i];
    if (bench === 0) return null;
    return price / bench;
  });

  // 2단계: RS_raw = (relative / relative의 window기간 이동평균 - 1) * 100
  return relative.map((rel, i) => {
    if (rel === null) return null;
    if (i < window) return null;

    // 과거 window 기간의 relative 값 (이동평균 계산 — i 포함)
    const windowSlice = relative
      .slice(i - window + 1, i + 1)
      .filter((v): v is number => v !== null);

    if (windowSlice.length < window * 0.8) return null; // 결측치 20% 초과 시 제외
    const windowMean = mean(windowSlice);
    if (windowMean === 0) return null;

    return (rel / windowMean - 1) * 100;
  });
}

// ─────────────────────────────────────────────
// 변동성 지표
// ─────────────────────────────────────────────

/**
 * 실현 변동성 (연율화된 일간 표준편차)
 * 변동성 조정 모멘텀 및 Sortino Ratio 계산의 기초
 *
 * @param prices  - 종가 배열
 * @param window  - 룩백 기간 (거래일)
 * @returns 각 시점의 연율화 변동성 (%), 초기 구간은 null
 */
export function rollingVolatility(
  prices: number[],
  window: number = 60
): (number | null)[] {
  const returns = logReturns(prices);

  return returns.map((_, i) => {
    if (i < window) return null;

    const windowReturns = returns
      .slice(i - window + 1, i + 1)
      .filter((r): r is number => r !== null);

    if (windowReturns.length < window * 0.8) return null;

    // 일간 표준편차를 연율화 (√252)
    const dailyStd = stdDev(windowReturns);
    return dailyStd * Math.sqrt(252) * 100;
  });
}

/**
 * Downside Deviation (하방 편차)
 * Sortino Ratio 계산 분모에 사용
 * 수익률이 target 미만인 경우만 집계
 *
 * @param returns    - 수익률 배열
 * @param target     - 기준 수익률 (기본: 0, MAR)
 * @returns 연율화된 하방 편차
 */
export function downsideDeviation(
  returns: number[],
  target: number = 0
): number {
  const downside = returns
    .filter((r) => r < target)
    .map((r) => (r - target) ** 2);

  if (downside.length === 0) return 0;
  return Math.sqrt(downside.reduce((sum, v) => sum + v, 0) / returns.length) * Math.sqrt(252);
}
