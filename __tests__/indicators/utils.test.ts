// lib/indicators/utils.ts 단위 테스트
// mansfieldRS, rollingPercentileRank 핵심 함수 검증

import { describe, it, expect } from "vitest";
import { mansfieldRS, rollingPercentileRank, sma, mean, stdDev } from "@/lib/indicators/utils";

// ────────────────────────────────────────────────────────────────
// 헬퍼: 일정한 수익률로 가격 시계열 생성
// ────────────────────────────────────────────────────────────────

function makeLinearPrices(length: number, start = 100, step = 1): number[] {
  return Array.from({ length }, (_, i) => start + i * step);
}

function makeConstantPrices(length: number, value = 100): number[] {
  return Array.from({ length }, () => value);
}

// ────────────────────────────────────────────────────────────────
// mean / stdDev 기초 함수
// ────────────────────────────────────────────────────────────────

describe("mean", () => {
  it("빈 배열 → 0", () => expect(mean([])).toBe(0));
  it("[1,2,3] → 2", () => expect(mean([1, 2, 3])).toBe(2));
  it("[5] → 5", () => expect(mean([5])).toBe(5));
});

describe("stdDev", () => {
  it("빈 배열 → 0", () => expect(stdDev([])).toBe(0));
  it("모두 같은 값 → 0", () => expect(stdDev([3, 3, 3])).toBe(0));
  it("[1,1,1,1,2] 표준편차 양수", () => expect(stdDev([1, 1, 1, 1, 2])).toBeGreaterThan(0));
});

// ────────────────────────────────────────────────────────────────
// mansfieldRS
// ────────────────────────────────────────────────────────────────

describe("mansfieldRS", () => {
  const window = 10;

  it("길이 불일치 시 오류 발생", () => {
    expect(() => mansfieldRS([1, 2, 3], [1, 2], window)).toThrow();
  });

  it("동일 가격 → RS Raw ≈ 0 (같은 움직임이라 상대강도 없음)", () => {
    // 종목 = 벤치마크 → relative = 1 → MA도 1 → RS = 0
    const prices = makeConstantPrices(30, 100);
    const result = mansfieldRS(prices, prices, window);
    const validValues = result.filter((v): v is number => v !== null);
    validValues.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-9));
  });

  it("종목 가격이 벤치마크의 2배 상승하면 RS Raw > 0", () => {
    // 벤치마크: 선형 상승, 종목: 2배 빠른 상승 → relative 증가 → RS > 0
    const bench = makeLinearPrices(50, 100, 1);
    const etf   = makeLinearPrices(50, 100, 2); // 2배 빠른 상승
    const result = mansfieldRS(etf, bench, window);
    const validValues = result.filter((v): v is number => v !== null);
    // 충분한 데이터가 있을 때 양수
    expect(validValues.length).toBeGreaterThan(0);
    expect(validValues[validValues.length - 1]).toBeGreaterThan(0);
  });

  it("초기 window개 값은 null", () => {
    const prices = makeLinearPrices(30, 100, 1);
    const result = mansfieldRS(prices, prices, window);
    result.slice(0, window).forEach((v) => expect(v).toBeNull());
  });

  it("충분한 데이터 후 null이 아닌 값 존재", () => {
    const prices = makeLinearPrices(50, 100, 1);
    const result = mansfieldRS(prices, prices, window);
    const validValues = result.filter((v) => v !== null);
    expect(validValues.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────
// rollingPercentileRank
// ────────────────────────────────────────────────────────────────

describe("rollingPercentileRank", () => {
  it("초기 window개 값은 null (룩어헤드 없음)", () => {
    const series = makeLinearPrices(300, 1, 1);
    const result = rollingPercentileRank(series, 252);
    result.slice(0, 252).forEach((v) => expect(v).toBeNull());
  });

  it("단조 증가 시계열 → 최신값은 100에 근접", () => {
    // 단조 증가: 현재값이 과거 252일 중 항상 최대 → 퍼센타일 ≈ 100
    const series = makeLinearPrices(400, 1, 1);
    const result = rollingPercentileRank(series, 252);
    const lastValid = result.filter((v) => v !== null);
    expect(lastValid[lastValid.length - 1]).toBeGreaterThan(90);
  });

  it("단조 감소 시계열 → 최신값은 0에 근접", () => {
    // 단조 감소: 현재값이 과거 252일 중 항상 최소 → 퍼센타일 ≈ 0
    const series = makeLinearPrices(400, 400, -1);
    const result = rollingPercentileRank(series, 252);
    const lastValid = result.filter((v) => v !== null);
    expect(lastValid[lastValid.length - 1]).toBeLessThan(10);
  });

  it("반환 배열 길이는 입력과 동일", () => {
    const series = makeLinearPrices(300, 1, 1);
    const result = rollingPercentileRank(series, 252);
    expect(result.length).toBe(series.length);
  });
});

// ────────────────────────────────────────────────────────────────
// sma
// ────────────────────────────────────────────────────────────────

describe("sma", () => {
  it("period-1개 이전은 null", () => {
    const series = [1, 2, 3, 4, 5];
    const result = sma(series, 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBe(2); // (1+2+3)/3
  });

  it("마지막 값 검증", () => {
    const series = [2, 4, 6, 8, 10];
    const result = sma(series, 3);
    expect(result[4]).toBe(8); // (6+8+10)/3
  });
});
