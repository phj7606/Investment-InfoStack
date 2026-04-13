// lib/indicators/momentum.ts 단위 테스트
// momentumScore, momentumRanking 핵심 함수 검증

import { describe, it, expect } from "vitest";
import { momentumScore, momentumRanking } from "@/lib/indicators/momentum";

// ────────────────────────────────────────────────────────────────
// 헬퍼: 테스트용 가격 시계열 생성
// ────────────────────────────────────────────────────────────────

function makeLinearPrices(length: number, start = 100, step = 0.5): number[] {
  return Array.from({ length }, (_, i) => start + i * step);
}

function makeConstantPrices(length: number, value = 100): number[] {
  return Array.from({ length }, () => value);
}

// ────────────────────────────────────────────────────────────────
// momentumScore
// ────────────────────────────────────────────────────────────────

describe("momentumScore", () => {
  it("데이터 252개 미만 → null 반환 (12M 모멘텀 계산 불가)", () => {
    const prices = makeLinearPrices(252); // 252개는 period+1=253 미만
    expect(momentumScore(prices)).toBeNull();
  });

  it("데이터 253개 이상 → null이 아닌 값 반환", () => {
    const prices = makeLinearPrices(300);
    expect(momentumScore(prices)).not.toBeNull();
  });

  it("단조 상승 → 양수 score (수익률 > 0, 분자 양수)", () => {
    // 선형 상승: 수익률 > 0, 변동성 > 0 → score > 0
    const prices = makeLinearPrices(300, 100, 0.5);
    const result = momentumScore(prices);
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0);
  });

  it("단조 하락 → 음수 score", () => {
    // 선형 하락: 수익률 < 0 → score < 0
    const prices = makeLinearPrices(300, 200, -0.3);
    const result = momentumScore(prices);
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(0);
  });

  it("상수 가격 → null 반환 (변동성 = 0이면 나눗셈 불가)", () => {
    // 변동성 = 0 → calcPeriodMomentum이 null 반환 → momentumScore null
    const prices = makeConstantPrices(300);
    expect(momentumScore(prices)).toBeNull();
  });

  it("반환 객체에 score + periods(m3, m6, m12) 포함", () => {
    const prices = makeLinearPrices(300, 100, 0.5);
    const result = momentumScore(prices);
    expect(result).not.toBeNull();
    expect(typeof result!.score).toBe("number");
    expect(typeof result!.periods.m3).toBe("number");
    expect(typeof result!.periods.m6).toBe("number");
    expect(typeof result!.periods.m12).toBe("number");
  });

  it("score는 m3/m6/m12의 평균과 일치", () => {
    const prices = makeLinearPrices(300, 100, 0.5);
    const result = momentumScore(prices);
    expect(result).not.toBeNull();
    const expected = (result!.periods.m3 + result!.periods.m6 + result!.periods.m12) / 3;
    expect(result!.score).toBeCloseTo(expected, 10);
  });
});

// ────────────────────────────────────────────────────────────────
// momentumRanking
// ────────────────────────────────────────────────────────────────

describe("momentumRanking", () => {
  // 서로 다른 성과를 내는 3개 ETF 가격 데이터
  const strongPrices  = makeLinearPrices(300, 100, 1.0);  // 강한 상승
  const mediumPrices  = makeLinearPrices(300, 100, 0.5);  // 중간 상승
  const weakPrices    = makeLinearPrices(300, 100, 0.1);  // 약한 상승

  const pricesMap = {
    STRONG: strongPrices,
    MEDIUM: mediumPrices,
    WEAK:   weakPrices,
  };

  it("topN 초과하는 결과 반환하지 않음", () => {
    const result = momentumRanking(pricesMap, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("rank=1이 가장 높은 점수 (내림차순 정렬)", () => {
    const result = momentumRanking(pricesMap, 3);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].rank).toBe(1);
    if (result.length > 1) {
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
    }
  });

  it("rank는 1부터 순차 증가 (gaps 없음)", () => {
    const result = momentumRanking(pricesMap, 3);
    result.forEach((item, idx) => {
      expect(item.rank).toBe(idx + 1);
    });
  });

  it("빈 pricesMap → 빈 배열 반환", () => {
    expect(momentumRanking({}, 10)).toEqual([]);
  });

  it("데이터 부족 종목(252개 미만)은 랭킹에서 제외", () => {
    const shortPrices = makeLinearPrices(200, 100, 1); // 252개 미만 → 제외
    const result = momentumRanking(
      { SHORT: shortPrices, STRONG: strongPrices },
      10
    );
    // SHORT는 모멘텀 계산 불가 → 결과에 없어야 함
    expect(result.find((r) => r.symbol === "SHORT")).toBeUndefined();
    expect(result.find((r) => r.symbol === "STRONG")).toBeDefined();
  });
});
