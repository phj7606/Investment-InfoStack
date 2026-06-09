/**
 * 보유 종목별 성과 계산 모듈
 *
 * TWR (Time-Weighted Return) 기반 지표:
 *   - TWR: 현재가 / 최초 매입단가 - 1 (가격 수익률, 시간 가중으로 현금흐름 영향 제거)
 *   - 벤치마크 TWR: 동일 캘린더 기간 ^KS11 / ^GSPC 수익률
 *   - Alpha: 종목 TWR - 벤치마크 TWR
 *   - 연환산 Alpha: (1+Alpha)^(365/보유일수) - 1
 *   - Hit Rate: 벤치마크 초과 월 비율
 *   - MDD: 보유기간 중 peak-to-trough 최대 낙폭
 *   - Up/Down Capture: 상승/하락 구간 포착 비율
 *
 * Modified Dietz Return (MDR) — 시간가중 투입자본 대비 수익률:
 *   매수/매도 거래 전체 현금흐름 + 현재 평가금액을 입력으로 직접 공식으로 계산.
 *   TWR이 "가격이 얼마나 올랐는가"라면 MDR은 "내 돈이 연 몇 %로 불어났는가".
 *   추가 매수 타이밍과 금액이 모두 반영되며, 반복 계산 없이 단순 공식으로 구한다.
 *
 * TWR 단일 종목 수학적 특성:
 *   BUY가 여러 번 있어도 TWR = (P_now / P_first_buy) - 1 로 단순화됨.
 *   이유: 각 구간 수익률 기하 연쇄 시 분자·분모가 상쇄되어 telescope 발생.
 */

import type { LongtermTransaction, LongtermPosition } from "@/types/portfolio";
import type { YahooHistoricalBar } from "@/lib/fetchers/yahoo";

// ─────────────────────────────────────────
// 반환 타입
// ─────────────────────────────────────────

export interface HoldingPerformance {
  stockCode: string;
  stockName: string;
  market: "KR" | "US";
  currency: "KRW" | "USD";
  accountNo: string;
  assetType: "STOCK" | "FUND" | "ETF";

  // ── 기간 ──────────────────────────────
  firstBuyDate: string;          // 최초 BUY 날짜 (YYYY-MM-DD)
  holdingDays: number;           // firstBuyDate ~ today (일수)

  // ── 가격 ──────────────────────────────
  firstBuyPrice: number;         // 최초 BUY 거래 단가
  currentPrice?: number;         // 현재가 (포지션에서)

  // ── 수익률 (단위: %) ──────────────────
  cumulativeReturn?: number;     // (현재평가 + SELL수익금) / BUY총액 − 1 × 100
  benchmarkTwr?: number;         // 동기간 벤치마크 HPR (%)
  benchmarkCagr?: number;        // 벤치마크 연환산 CAGR (%)
  alpha?: number;                // MDR(연환산) − benchmarkCagr (% 포인트)

  // ── 평가손익 (positions에서) ───────────
  evalPL: number;                // 현재 평가손익 (절대금액)
  evalPLPct: number;             // 현재 평가손익률 (%)
  currentWeight: number;         // 포트폴리오 내 현재 비중 (0~1)

  // ── 기여도 (전체 집계 후 주입) ─────────
  portfolioContributionPct?: number;  // evalPL / 전체 evalPL 합 × 100

  // ── Modified Dietz Return (연환산 %) ──
  // 시간가중 투입자본 대비 수익률. 반복 계산 없는 직접 공식.
  // 현재가 없거나 보유 기간이 0일이면 undefined.
  mdr?: number;

  // ── 고급 지표 (종목 월별 가격 시계열 필요) ──
  hitRate?: number;              // 벤치마크 초과 월 비율 (%)
  mdd?: number;                  // 최대 낙폭 (%, 0 이하)
  upCapture?: number;            // Up Capture Ratio (%)
  downCapture?: number;          // Down Capture Ratio (%)
}

// ─────────────────────────────────────────
// 날짜 유틸
// ─────────────────────────────────────────

/** 두 날짜(YYYY-MM-DD) 사이 일수 */
function daysBetween(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

// ─────────────────────────────────────────
// 가격 조회 유틸
// ─────────────────────────────────────────

/**
 * OHLCV 배열에서 특정 날짜에 가장 가까운 종가를 반환
 *
 * 우선순위:
 *  1. 정확히 일치하는 날짜
 *  2. 해당 날짜 이후 가장 이른 거래일 (영업일 맞추기)
 *  3. 해당 날짜 이전 가장 늦은 거래일
 */
export function findClosestClose(
  bars: YahooHistoricalBar[],
  targetDate: string
): number | undefined {
  if (bars.length === 0) return undefined;

  const exact = bars.find((b) => b.date === targetDate);
  if (exact) return exact.close;

  const after = bars
    .filter((b) => b.date > targetDate)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (after) return after.close;

  const before = bars
    .filter((b) => b.date < targetDate)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return before?.close;
}

// ─────────────────────────────────────────
// 월별 가격 변환
// ─────────────────────────────────────────

/**
 * 일별 OHLCV → 월말 종가 배열 변환
 *
 * 각 월의 마지막 거래일 종가를 사용한다.
 * 정렬된 bars를 순회하면서 같은 월이면 덮어쓰기로 마지막 값이 남는다.
 */
export function toMonthlyPrices(
  bars: YahooHistoricalBar[]
): { period: string; close: number }[] {
  if (bars.length === 0) return [];

  const monthMap = new Map<string, number>();
  for (const bar of bars) {
    const period = bar.date.slice(0, 7); // YYYY-MM
    // 정렬된 bars 순회 → 마지막 날짜 값으로 자연스럽게 갱신됨
    monthMap.set(period, bar.close);
  }

  return Array.from(monthMap.entries())
    .map(([period, close]) => ({ period, close }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// ─────────────────────────────────────────
// Modified Dietz Return
// ─────────────────────────────────────────

/**
 * Modified Dietz Return (MDR) — 시간가중 투입자본 대비 연환산 수익률 (%)
 *
 * 반복 계산 없는 직접 공식. 동일한 개념을 XIRR은 할인율로 역산하지만
 * MDR은 "평균 투입자본 대비 수익"으로 직접 구한다.
 *
 *   기간 수익률 = 순이익 / 시간가중 투입자본
 *
 *   순이익       = Σ(모든 CF)  ← BUY(음수) + SELL(양수) + 현재평가(양수)의 합
 *
 *   시간가중 투입자본 = Σ(-CF_i × W_i)
 *   W_i = (D − d_i) / D  ← i번째 CF가 전체 기간 중 얼마나 오래 운용됐는지
 *   D   = 전체 보유 일수
 *   d_i = 첫 매수일 기준 CF 발생까지 경과 일수
 *
 * 부호 규칙 (XIRR과 동일):
 *   amount < 0: 매수 (투자금 유출)
 *   amount > 0: 매도 또는 현재 평가금액 (투자금 회수)
 *
 * 마지막 CF(오늘 평가금액)는 d = D 이므로 W = 0 → 분모에 기여하지 않음.
 * 즉 분모는 "운용된 자본의 시간 합산"이고, 분자는 최종 손익.
 *
 * 연환산: (1 + 기간수익률)^(365/D) − 1
 */
export function calcModifiedDietz(
  cashflows: { date: string; amount: number }[]
): number | undefined {
  if (cashflows.length < 2) return undefined;

  // 날짜 오름차순 정렬
  const sorted = [...cashflows].sort((a, b) => a.date.localeCompare(b.date));
  const startMs = new Date(sorted[0].date).getTime();
  const endMs   = new Date(sorted[sorted.length - 1].date).getTime();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  // 전체 보유 일수 (최소 1일 보장)
  const D = Math.max(1, Math.round((endMs - startMs) / MS_PER_DAY));

  // 순이익 = 모든 CF의 합 (BUY는 음수이므로 자동으로 차감됨)
  const gain = sorted.reduce((sum, cf) => sum + cf.amount, 0);

  // 시간가중 투입자본 = Σ(-CF_i × W_i)
  // BUY(-) → -CF > 0 → 분모 증가 (자본 투입)
  // SELL(+) → -CF < 0 → 분모 감소 (자본 회수로 이후 운용자본 축소)
  // 마지막 평가금액(d=D, W=0) → 기여 없음
  let weightedCapital = 0;
  for (const cf of sorted) {
    const d_i = Math.round((new Date(cf.date).getTime() - startMs) / MS_PER_DAY);
    const w_i = (D - d_i) / D;
    weightedCapital += -cf.amount * w_i;
  }

  // 분모가 0 이하면 계산 불가 (환급금이 투자금보다 이른 시점에 더 클 때 등 극단 케이스)
  if (weightedCapital <= 0) return undefined;

  // 기간 수익률
  const periodReturn = gain / weightedCapital;

  // 연환산 기하수익률: (1 + R)^(365/D) − 1
  // 단기 보유는 연환산 시 극단값 발생 → 최소 365일(1년)로 클램핑
  // 이전 7일 클램핑: 지수 = 365/7 = 52 → 10% 기간수익 → 1,246% 연환산 극단값 발생
  // 1년 클램핑: 단기 보유 종목은 "1년 보유했다면 얼마" 기준으로 표준화
  if (D < 30) return undefined; // 30일 미만 보유는 연환산 의미 없음 → undefined 반환
  const annualized = Math.pow(1 + periodReturn, 365 / D) - 1;

  if (!isFinite(annualized)) return undefined;

  return Math.round(annualized * 10000) / 100;
}

// ─────────────────────────────────────────
// 고급 성과 지표
// ─────────────────────────────────────────

/**
 * Hit Rate: 벤치마크보다 높은 MoM 수익률 달성 월 비율 (%)
 *
 * 각 월의 MoM 수익률(종가 기준)을 비교하여 종목이 앞선 월의 비율을 반환.
 * 데이터 부족(≤1 월) 시 undefined 반환.
 */
export function calcHitRate(
  stockMonthly: { period: string; close: number }[],
  benchMonthly: { period: string; close: number }[]
): number | undefined {
  if (stockMonthly.length < 2 || benchMonthly.length < 2) return undefined;

  const benchMap = new Map(benchMonthly.map((b) => [b.period, b.close]));
  let wins = 0;
  let total = 0;

  for (let i = 1; i < stockMonthly.length; i++) {
    const prev = stockMonthly[i - 1];
    const curr = stockMonthly[i];
    const benchPrev = benchMap.get(prev.period);
    const benchCurr = benchMap.get(curr.period);

    if (benchPrev == null || benchCurr == null || prev.close <= 0 || benchPrev <= 0) continue;

    const stockMoM = curr.close / prev.close - 1;
    const benchMoM = benchCurr / benchPrev - 1;

    total++;
    if (stockMoM > benchMoM) wins++;
  }

  return total > 0 ? Math.round((wins / total) * 10000) / 100 : undefined;
}

/**
 * MDD (Max Drawdown): 보유기간 중 고점 대비 최대 낙폭 (%, 음수)
 *
 * 일별 종가를 순서대로 추적하여 누적 최고점(peak)에서 현재 종가까지의
 * 낙폭이 최대인 지점을 찾는다.
 */
export function calcMDD(bars: YahooHistoricalBar[]): number | undefined {
  if (bars.length < 2) return undefined;

  let peak = bars[0].close;
  let maxDrawdown = 0;

  for (const bar of bars) {
    if (bar.close > peak) peak = bar.close;
    const dd = (bar.close - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  // 소수점 2자리 %로 반환 (음수 또는 0)
  return Math.round(maxDrawdown * 10000) / 100;
}

/**
 * Up/Down Capture Ratio (%)
 *
 * Up Capture = 벤치마크 상승 월 평균 종목 수익 / 벤치마크 평균 수익
 * Down Capture = 벤치마크 하락 월 평균 종목 수익 / 벤치마크 평균 수익
 * 100%이면 벤치마크와 동일, 100% 초과면 해당 구간 더 많이 포착한다는 의미.
 *
 * Up Capture 높고 Down Capture 낮을수록 이상적인 종목.
 */
export function calcCapture(
  stockMonthly: { period: string; close: number }[],
  benchMonthly: { period: string; close: number }[]
): { upCapture?: number; downCapture?: number } {
  if (stockMonthly.length < 2 || benchMonthly.length < 2) {
    return { upCapture: undefined, downCapture: undefined };
  }

  const benchMap = new Map(benchMonthly.map((b) => [b.period, b.close]));
  const upStock: number[] = [];
  const upBench: number[] = [];
  const downStock: number[] = [];
  const downBench: number[] = [];

  for (let i = 1; i < stockMonthly.length; i++) {
    const prev = stockMonthly[i - 1];
    const curr = stockMonthly[i];
    const benchPrev = benchMap.get(prev.period);
    const benchCurr = benchMap.get(curr.period);

    if (benchPrev == null || benchCurr == null || prev.close <= 0 || benchPrev <= 0) continue;

    const stockMoM = curr.close / prev.close - 1;
    const benchMoM = benchCurr / benchPrev - 1;

    if (benchMoM > 0) {
      upStock.push(stockMoM);
      upBench.push(benchMoM);
    } else if (benchMoM < 0) {
      downStock.push(stockMoM);
      downBench.push(benchMoM);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const upCapture =
    upBench.length > 0 && Math.abs(avg(upBench)) > 0.0001
      ? Math.round((avg(upStock) / avg(upBench)) * 10000) / 100
      : undefined;

  const downCapture =
    downBench.length > 0 && Math.abs(avg(downBench)) > 0.0001
      ? Math.round((avg(downStock) / avg(downBench)) * 10000) / 100
      : undefined;

  return { upCapture, downCapture };
}

// ─────────────────────────────────────────
// 메인 계산 함수
// ─────────────────────────────────────────

/**
 * 단일 보유 포지션의 성과 지표 계산
 *
 * @param position  - 현재 보유 포지션 (currentPrice 있으면 TWR 계산 가능)
 * @param txs       - 전체 거래 내역 (firstBuyDate/Price 추출용)
 * @param benchBars - 벤치마크 OHLCV (^KS11 또는 ^GSPC), 비어있어도 무방
 * @param stockBars - 해당 종목 OHLCV (undefined이면 고급 지표 건너뜀)
 * @param today     - 기준일 YYYY-MM-DD
 */
export function calcHoldingPerformance(
  position: LongtermPosition,
  txs: LongtermTransaction[],
  benchBars: YahooHistoricalBar[],
  stockBars: YahooHistoricalBar[] | undefined,
  today: string
): HoldingPerformance {
  // 해당 종목의 최초 BUY 거래 추출 (날짜 오름차순 정렬 후 첫 번째)
  const firstBuyTx = txs
    .filter(
      (t) =>
        t.stockCode === position.stockCode &&
        t.accountNo === position.accountNo &&
        t.tradeType === "BUY"
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  const firstBuyDate = firstBuyTx?.date ?? today;
  // 최초 매입단가: 거래 단가 우선, 없으면 평균단가 fallback
  const firstBuyPrice = firstBuyTx?.price ?? position.avgCost;
  const holdingDays = daysBetween(firstBuyDate, today);

  // ── 누적수익률 계산 ───────────────────────────────────
  // (현재평가금액 + Σ SELL수익금) / Σ BUY금액 − 1
  // 모든 매수 투입금 대비 현재 평가 + 회수 금액의 누적 수익률
  const currentPrice = position.currentPrice;
  const stockTxsAll = txs.filter(
    (t) => t.stockCode === position.stockCode && t.accountNo === position.accountNo
  );
  const totalBuyAmount = stockTxsAll
    .filter((t) => t.tradeType === "BUY")
    .reduce((sum, t) => sum + t.price * t.quantity, 0);
  const totalSellProceeds = stockTxsAll
    .filter((t) => t.tradeType === "SELL")
    .reduce((sum, t) => sum + t.price * t.quantity, 0);
  const currentEvalAmount = currentPrice != null ? currentPrice * position.quantity : null;
  const cumulativeReturn =
    currentEvalAmount != null && totalBuyAmount > 0
      ? Math.round(((currentEvalAmount + totalSellProceeds) / totalBuyAmount - 1) * 10000) / 100
      : undefined;

  // ── 벤치마크 TWR 계산 ─────────────────────────────────
  // 동일 캘린더 기간(firstBuyDate ~ today)의 벤치마크 HPR
  const benchAtBuy = findClosestClose(benchBars, firstBuyDate);
  const benchAtNow = findClosestClose(benchBars, today);
  const benchmarkTwr =
    benchAtBuy != null && benchAtNow != null && benchAtBuy > 0
      ? Math.round(((benchAtNow / benchAtBuy - 1) * 10000)) / 100
      : undefined;

  // ── Modified Dietz Return 계산 ───────────────────────
  // 해당 종목(stockCode + accountNo) 거래내역 전체를 현금흐름으로 변환.
  // BUY: -(단가 × 수량), SELL: +(단가 × 수량)
  // 마지막 항목: 오늘 날짜의 현재 평가금액 (잔여 수량 × 현재가)
  let mdr: number | undefined;
  if (currentPrice != null && position.quantity > 0) {
    const cashflows: { date: string; amount: number }[] = [];

    for (const tx of stockTxsAll) {
      if (tx.tradeType === "BUY") {
        cashflows.push({ date: tx.date, amount: -(tx.price * tx.quantity) });
      } else if (tx.tradeType === "SELL") {
        cashflows.push({ date: tx.date, amount: tx.price * tx.quantity });
      }
    }

    // 오늘 평가금액: "지금 청산한다면 받을 금액" → 마지막 현금흐름
    cashflows.push({ date: today, amount: currentPrice * position.quantity });

    mdr = calcModifiedDietz(cashflows);
  }

  // ── 벤치마크 CAGR + Alpha 계산 ───────────────────────
  // benchmarkCagr: benchmarkTwr(기간 HPR)를 보유기간 기준 연환산
  const benchmarkCagr =
    benchmarkTwr != null && holdingDays >= 1
      ? Math.round((Math.pow(1 + benchmarkTwr / 100, 365 / holdingDays) - 1) * 10000) / 100
      : undefined;
  // Alpha = MDR(연환산) − 벤치마크 CAGR (MDR이 이미 연환산이므로 직접 차이)
  const alpha =
    mdr != null && benchmarkCagr != null
      ? Math.round((mdr - benchmarkCagr) * 100) / 100
      : undefined;

  // ── 고급 지표 (종목 월별 가격 시계열 필요) ────────────
  let hitRate: number | undefined;
  let mdd: number | undefined;
  let upCapture: number | undefined;
  let downCapture: number | undefined;

  if (stockBars && stockBars.length > 1 && benchBars.length > 1) {
    // 보유 기간 내 데이터만 슬라이싱
    const holdingBars = stockBars.filter(
      (b) => b.date >= firstBuyDate && b.date <= today
    );
    const holdingBenchBars = benchBars.filter(
      (b) => b.date >= firstBuyDate && b.date <= today
    );

    const stockMonthly = toMonthlyPrices(holdingBars);
    const benchMonthly = toMonthlyPrices(holdingBenchBars);

    hitRate = calcHitRate(stockMonthly, benchMonthly);
    mdd = calcMDD(holdingBars);
    const capture = calcCapture(stockMonthly, benchMonthly);
    upCapture = capture.upCapture;
    downCapture = capture.downCapture;
  }

  return {
    stockCode: position.stockCode,
    stockName: position.stockName,
    market: position.market,
    currency: position.currency,
    accountNo: position.accountNo,
    assetType: position.assetType,
    firstBuyDate,
    holdingDays,
    firstBuyPrice,
    currentPrice,
    cumulativeReturn,
    benchmarkTwr,
    benchmarkCagr,
    alpha,
    evalPL: position.evalPL,
    evalPLPct: position.evalPLPct,
    currentWeight: position.currentWeight,
    mdr,
    hitRate,
    mdd,
    upCapture,
    downCapture,
  };
}

/**
 * 포트폴리오 기여도 주입 — 전체 holdings 집계 후 각 종목에 기여도 계산
 *
 * KRW/USD 통화 내에서만 의미가 있으므로 통화별로 분리 계산.
 * "총 PnL = 0"이면 기여도 계산 불가 → undefined 그대로 둔다.
 */
export function injectContributions(
  holdings: HoldingPerformance[]
): HoldingPerformance[] {
  // 통화별 총 evalPL 합산
  const krTotal = holdings
    .filter((h) => h.currency === "KRW")
    .reduce((sum, h) => sum + h.evalPL, 0);
  const usTotal = holdings
    .filter((h) => h.currency === "USD")
    .reduce((sum, h) => sum + h.evalPL, 0);

  return holdings.map((h) => {
    const total = h.currency === "KRW" ? krTotal : usTotal;
    // 총 evalPL이 0이면 기여도 undefined (0 나눗셈 방지)
    const portfolioContributionPct =
      Math.abs(total) > 0
        ? Math.round((h.evalPL / total) * 10000) / 100
        : undefined;
    return { ...h, portfolioContributionPct };
  });
}
