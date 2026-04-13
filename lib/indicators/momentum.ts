// 변동성 조정 모멘텀 (Volatility-Adjusted Momentum) 계산 모듈
//
// Sharpe-ratio 방식으로 모멘텀을 계산한다.
// 단순 수익률이 높더라도 변동성이 크면 불리하게 반영되므로,
// 진정한 강세 ETF(수익률은 높고 변동성은 낮은)를 걸러낼 수 있다.
//
// 공식: 모멘텀점수 = (수익률_3M/변동성_3M + 수익률_6M/변동성_6M + 수익률_12M/변동성_12M) / 3
// 기간: 63 / 126 / 252 거래일 (표준 거래일 수 기준)

import { logReturns, stdDev, mean } from "./utils";
import type { MomentumScore, RankedMomentum } from "../../types";

// 표준 거래일 기준 3M/6M/12M 기간 (off-by-one 방지)
const MOMENTUM_PERIODS = {
  m3:  63,   // 3개월 = 63 거래일
  m6:  126,  // 6개월 = 126 거래일
  m12: 252,  // 12개월 = 252 거래일
} as const;

/**
 * 단일 기간 변동성 조정 모멘텀 점수 계산
 *
 * 수익률을 변동성으로 나누어 Sharpe-like 점수를 산출한다.
 * 변동성이 0이거나 데이터가 부족하면 null을 반환한다.
 *
 * @param prices - 종가 배열 (시간 오름차순)
 * @param period - 기간 (거래일 수)
 * @returns 변동성 조정 점수 (단위 없음), 계산 불가 시 null
 */
function calcPeriodMomentum(prices: number[], period: number): number | null {
  // period+1개 이상이 있어야 수익률과 변동성 모두 계산 가능
  if (prices.length < period + 1) return null;

  const last = prices[prices.length - 1];
  const base = prices[prices.length - 1 - period];

  // 기준가가 0이면 수익률 계산 불가
  if (base === 0) return null;

  // 단순 수익률 (Simple Return): 기간 전후 가격 차이
  const ret = (last - base) / base;

  // 기간 내 로그 수익률로 일간 변동성 계산 (연율화)
  const periodPrices = prices.slice(prices.length - period - 1);
  const rets = logReturns(periodPrices).filter((r): r is number => r !== null);

  if (rets.length === 0) return null;

  // 일간 표준편차를 연율화 (√252) — 다른 기간 간 비교 가능하도록 통일
  const vol = stdDev(rets) * Math.sqrt(252);

  if (vol === 0) return null;

  return ret / vol;
}

/**
 * 3개 기간(3M/6M/12M) 변동성 조정 모멘텀 점수 계산
 *
 * 세 기간의 평균을 내어 단기 노이즈에 덜 민감하게 만든다.
 * 세 기간 중 하나라도 계산 불가 시 null 반환 — 불완전한 데이터로 잘못된 랭킹 방지.
 *
 * @param prices - 종가 배열 (시간 오름차순, 최소 253개 이상 권장)
 * @returns MomentumScore 객체, 데이터 부족 시 null
 */
export function momentumScore(prices: number[]): MomentumScore | null {
  const m3  = calcPeriodMomentum(prices, MOMENTUM_PERIODS.m3);
  const m6  = calcPeriodMomentum(prices, MOMENTUM_PERIODS.m6);
  const m12 = calcPeriodMomentum(prices, MOMENTUM_PERIODS.m12);

  // 세 기간 모두 유효해야 최종 점수 계산 가능
  if (m3 === null || m6 === null || m12 === null) return null;

  return {
    score:   mean([m3, m6, m12]),
    periods: { m3, m6, m12 },
  };
}

/**
 * 여러 ETF를 대상으로 모멘텀 점수를 계산하고 상위 N개를 랭킹으로 반환
 *
 * 최근 lookbackDays 거래일 각각에서 점수를 계산한 후 평균을 내어 안정화한다.
 * 단일 날짜의 노이즈(이상치)가 랭킹을 왜곡하는 것을 방지하기 위함이다.
 *
 * @param pricesMap    - { 티커: 종가배열 } 맵
 * @param topN         - 반환할 상위 종목 수 (기본: 15)
 * @param lookbackDays - 안정화를 위한 최근 거래일 수 (기본: 10)
 * @returns RankedMomentum 배열 (1위부터 topN위, 점수 내림차순)
 */
export function momentumRanking(
  pricesMap: Record<string, number[]>,
  topN: number = 15,
  lookbackDays: number = 10
): RankedMomentum[] {
  const symbolScores: { symbol: string; score: number }[] = [];

  for (const [symbol, prices] of Object.entries(pricesMap)) {
    const dailyScores: number[] = [];

    // 최근 lookbackDays 각 시점에서 점수 계산 (오늘 포함 과거 방향)
    for (let i = 0; i < lookbackDays; i++) {
      // i=0: 전체 데이터, i=1: 마지막 1일 제외, ...
      const subPrices = i === 0 ? prices : prices.slice(0, prices.length - i);
      const s = momentumScore(subPrices);
      if (s !== null) dailyScores.push(s.score);
    }

    // 유효한 점수가 하나라도 있으면 평균 점수로 랭킹에 포함
    if (dailyScores.length > 0) {
      symbolScores.push({ symbol, score: mean(dailyScores) });
    }
  }

  // 점수 내림차순 정렬 후 Top N 추출
  symbolScores.sort((a, b) => b.score - a.score);

  return symbolScores.slice(0, topN).map((item, index) => ({
    symbol: item.symbol,
    rank:   index + 1,
    score:  item.score,
  }));
}
