/**
 * 포트폴리오 성과 계산 모듈
 *
 * 투자 성과 수치는 오류 시 잘못된 의사결정으로 이어지므로,
 * 각 지표를 엄밀한 공식에 따라 계산하고 경계값(0건, 전부WIN 등)을 명시적으로 처리한다.
 *
 * [공식 정의]
 * - 승률      = WIN 거래 수 / 전체 거래 수 (profitLossPct > 0 → WIN, ≤ 0 → LOSS)
 * - 손익비    = sum(WIN 손익) / |sum(LOSS 손익)| (손실 없으면 Infinity)
 * - 기대값 EV = winRate × avgWinPct − (1 − winRate) × avgLossPct
 * - MDD       = max((Peak − Trough) / max(Peak, 1)) × 100 (Equity Curve 기준)
 */

import type {
  Trade,
  StockPerformance,
  PerformanceSummary,
  EquityCurvePoint,
  MonthlyReturn,
} from "@/types/portfolio";

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

/**
 * 부동소수점 오차를 방지하기 위해 비율(%)은 소수점 2자리에서 반올림.
 * 금액(원)은 정수 반올림.
 */
function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundAmount(value: number): number {
  return Math.round(value);
}

// ─────────────────────────────────────────
// 공개 함수
// ─────────────────────────────────────────

/**
 * 거래 이력에서 매도 완료 거래를 추출하여 종목별 성과를 계산한다.
 *
 * 키움 REST API는 매도 거래에 손익/수익률을 직접 제공하므로,
 * API 값을 신뢰하되 정수·2자리 소수점으로 정규화한다.
 *
 * WIN 기준: profitLossPct > 0 (0%는 LOSS로 분류)
 */
export function calcStockPerformances(trades: Trade[]): StockPerformance[] {
  // 매도 거래만 필터링 (매수는 성과 집계에 불포함)
  const sellTrades = trades.filter(
    (t) => t.tradeType === "SELL" && t.profitLoss !== null && t.profitLossPct !== null
  );

  return sellTrades.map((t) => {
    const pl = roundAmount(t.profitLoss!);
    const plPct = roundPct(t.profitLossPct!);

    return {
      stockCode: t.stockCode,
      stockName: t.stockName,
      exitDate: t.date,
      // 보유 일수: API에서 제공하지 않으므로 0으로 초기화 (추후 매수일 매핑 시 갱신)
      holdingDays: 0,
      profitLoss: pl,
      profitLossPct: plPct,
      result: plPct > 0 ? "WIN" : "LOSS",
    } satisfies StockPerformance;
  });
}

/**
 * Equity Curve 시계열을 생성한다.
 *
 * - 날짜 오름차순 정렬
 * - 같은 날 복수 거래는 당일 손익 합산 후 단일 포인트로 기록
 * - 기준점: 0원 (첫 거래 이전)
 */
export function buildEquityCurve(perfs: StockPerformance[]): EquityCurvePoint[] {
  if (perfs.length === 0) return [];

  // 날짜 오름차순 정렬
  const sorted = [...perfs].sort((a, b) => a.exitDate.localeCompare(b.exitDate));

  // 날짜별 손익 합산
  const dailyMap = new Map<string, number>();
  for (const p of sorted) {
    dailyMap.set(p.exitDate, (dailyMap.get(p.exitDate) ?? 0) + p.profitLoss);
  }

  // 누적 합산하여 Equity Curve 생성
  let cumulative = 0;
  const curve: EquityCurvePoint[] = [];

  for (const [date, daily] of dailyMap.entries()) {
    cumulative = roundAmount(cumulative + daily);
    curve.push({ date, value: cumulative });
  }

  return curve;
}

/**
 * MDD(Maximum Drawdown)를 계산한다.
 *
 * MDD = max((Peak − Trough) / max(Peak, 1)) × 100 (%)
 * - Equity Curve의 각 시점에서 이전 최고점 대비 낙폭을 추적
 * - 반환값은 음수 (예: -15.3%)
 * - Equity Curve가 없거나 항상 우상향이면 0 반환
 */
export function calcMDD(curve: EquityCurvePoint[]): number {
  if (curve.length === 0) return 0;

  let peak = curve[0].value;
  let maxDrawdown = 0;

  for (const point of curve) {
    if (point.value > peak) {
      peak = point.value;
    }
    // peak가 0 이하이면 낙폭 의미 없음 (원금 기준으로 계산하지 않으므로 스킵)
    if (peak <= 0) continue;

    const drawdown = ((point.value - peak) / peak) * 100;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return roundPct(maxDrawdown);
}

/**
 * 월별 수익률 히트맵 데이터를 생성한다.
 *
 * 월별 수익률 = (해당 월 손익 합계 / max(월초 누적 잔고 + 원금 대체값, 1)) × 100
 * - 비율 계산에 원금이 필요하지만 키움 API에서 원금을 직접 제공하지 않으므로,
 *   월별 손익 합계를 절대값으로 제공하고 UI에서 원금 대비 환산은 옵션으로 처리
 * - 거래 없는 월은 returnPct = 0
 */
export function buildMonthlyReturns(
  perfs: StockPerformance[],
  totalCapital?: number
): MonthlyReturn[] {
  if (perfs.length === 0) return [];

  // 연·월별 손익 합산
  const monthMap = new Map<string, number>();
  for (const p of perfs) {
    const [year, month] = p.exitDate.split("-");
    const key = `${year}-${month}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + p.profitLoss);
  }

  // Equity Curve의 월초 누적 잔고를 추적하여 수익률 계산
  // 원금이 제공된 경우: 수익률 = 손익 / 원금 × 100
  // 원금이 없는 경우: returnPct = 0 (UI에서 "원금 미입력" 표시)
  const results: MonthlyReturn[] = [];

  for (const [key, pl] of [...monthMap.entries()].sort()) {
    const [yearStr, monthStr] = key.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    let returnPct = 0;
    if (totalCapital && totalCapital > 0) {
      returnPct = roundPct((pl / totalCapital) * 100);
    }

    results.push({
      year,
      month,
      returnPct,
      profitLoss: roundAmount(pl),
    });
  }

  return results;
}

/**
 * 최대 연속 손실 횟수를 계산한다.
 * 날짜 오름차순 기준으로 LOSS가 연속된 최대 구간을 반환.
 */
function calcMaxConsecutiveLoss(perfs: StockPerformance[]): number {
  if (perfs.length === 0) return 0;

  const sorted = [...perfs].sort((a, b) => a.exitDate.localeCompare(b.exitDate));

  let maxStreak = 0;
  let current = 0;

  for (const p of sorted) {
    if (p.result === "LOSS") {
      current++;
      if (current > maxStreak) maxStreak = current;
    } else {
      current = 0;
    }
  }

  return maxStreak;
}

/**
 * 계좌 전체 성과 요약을 계산한다.
 *
 * 거래가 0건인 경우 모든 수치를 0으로 초기화하여 NaN을 방지한다.
 */
export function calcPerformanceSummary(perfs: StockPerformance[]): PerformanceSummary {
  const totalTrades = perfs.length;

  // 거래 없을 때 빈 요약 반환
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      profitFactor: 0,
      payoffRatio: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      expectedValue: 0,
      maxConsecutiveLoss: 0,
      cumulativeProfitLoss: 0,
      mdd: 0,
      equityCurve: [],
      monthlyReturns: [],
    };
  }

  const wins = perfs.filter((p) => p.result === "WIN");
  const losses = perfs.filter((p) => p.result === "LOSS");

  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = roundPct(winCount / totalTrades);

  // 손익비: 총 WIN 손익 / |총 LOSS 손익|
  const totalWinPL = wins.reduce((sum, p) => sum + p.profitLoss, 0);
  const totalLossPL = losses.reduce((sum, p) => sum + Math.abs(p.profitLoss), 0);

  // 손실 거래가 없으면 Infinity
  const profitFactor = totalLossPL === 0
    ? (winCount > 0 ? Infinity : 0)
    : roundPct(totalWinPL / totalLossPL);

  // 평균 수익률 (WIN only)
  const avgWinPct = winCount === 0
    ? 0
    : roundPct(wins.reduce((sum, p) => sum + p.profitLossPct, 0) / winCount);

  // 평균 손실률 (LOSS only, 양수로 표현)
  const avgLossPct = lossCount === 0
    ? 0
    : roundPct(losses.reduce((sum, p) => sum + Math.abs(p.profitLossPct), 0) / lossCount);

  // 기대값 EV = winRate × avgWinPct − (1 − winRate) × avgLossPct
  const lossRate = roundPct(1 - winRate);
  const expectedValue = roundPct(winRate * avgWinPct - lossRate * avgLossPct);

  // 누적 손익
  const cumulativeProfitLoss = roundAmount(
    perfs.reduce((sum, p) => sum + p.profitLoss, 0)
  );

  // Equity Curve + MDD
  const equityCurve = buildEquityCurve(perfs);
  const mdd = calcMDD(equityCurve);

  // 최대 연속 손실
  const maxConsecutiveLoss = calcMaxConsecutiveLoss(perfs);

  // 월별 수익률 (원금 없으면 profitLoss만 제공, returnPct는 0)
  const monthlyReturns = buildMonthlyReturns(perfs);

  return {
    totalTrades,
    winCount,
    lossCount,
    winRate,
    profitFactor,
    payoffRatio: avgLossPct > 0 ? roundPct(avgWinPct / avgLossPct) : (avgWinPct > 0 ? Infinity : 0),
    avgWinPct,
    avgLossPct,
    expectedValue,
    maxConsecutiveLoss,
    cumulativeProfitLoss,
    mdd,
    equityCurve,
    monthlyReturns,
  };
}
