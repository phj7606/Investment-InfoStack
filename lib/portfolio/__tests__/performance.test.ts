/**
 * 성과 계산 모듈 단위 테스트
 *
 * 투자 성과 수치는 오류 시 잘못된 의사결정으로 이어지므로
 * 정상 케이스 + 경계값(0건, 전부WIN, 전부LOSS, 동일날짜) 모두 검증.
 */

import { describe, it, expect } from "vitest";
import {
  calcStockPerformances,
  buildEquityCurve,
  calcMDD,
  buildMonthlyReturns,
  calcPerformanceSummary,
} from "../performance";
import type { StockPerformance, Trade } from "@/types/portfolio";

// ─────────────────────────────────────────
// 픽스처 헬퍼
// ─────────────────────────────────────────

function makePerf(
  opts: Partial<StockPerformance> & { profitLoss: number; profitLossPct: number }
): StockPerformance {
  return {
    stockCode: "000001",
    stockName: "테스트종목",
    exitDate: "2026-01-10",
    holdingDays: 10,
    result: opts.profitLossPct > 0 ? "WIN" : "LOSS",
    ...opts,
  };
}

function makeTrade(
  opts: Partial<Trade> & {
    tradeType: "BUY" | "SELL";
    profitLoss?: number | null;
    profitLossPct?: number | null;
  }
): Trade {
  return {
    date: "2026-01-10",
    stockCode: "000001",
    stockName: "테스트종목",
    quantity: 100,
    price: 10000,
    amount: 1000000,
    profitLoss: null,
    profitLossPct: null,
    ...opts,
  };
}

// ─────────────────────────────────────────
// 표준 샘플 데이터
// 5건: WIN 3건 / LOSS 2건
// WIN:  +10% (+100,000), +5% (+50,000), +15% (+150,000)
// LOSS: -8% (-80,000),  -3% (-30,000)
// ─────────────────────────────────────────
const samplePerfs: StockPerformance[] = [
  makePerf({ exitDate: "2026-01-05", profitLoss: 100_000, profitLossPct: 10 }),
  makePerf({ exitDate: "2026-01-08", profitLoss: 50_000, profitLossPct: 5 }),
  makePerf({ exitDate: "2026-01-12", profitLoss: -80_000, profitLossPct: -8 }),
  makePerf({ exitDate: "2026-01-15", profitLoss: -30_000, profitLossPct: -3 }),
  makePerf({ exitDate: "2026-01-20", profitLoss: 150_000, profitLossPct: 15 }),
];

// ─────────────────────────────────────────
// calcStockPerformances
// ─────────────────────────────────────────

describe("calcStockPerformances", () => {
  it("매도 거래만 StockPerformance로 변환한다", () => {
    const trades: Trade[] = [
      makeTrade({ tradeType: "BUY", profitLoss: null, profitLossPct: null }),
      makeTrade({ tradeType: "SELL", profitLoss: 50_000, profitLossPct: 5 }),
      makeTrade({ tradeType: "SELL", profitLoss: -20_000, profitLossPct: -2 }),
    ];
    const result = calcStockPerformances(trades);
    expect(result).toHaveLength(2);
  });

  it("수익률 > 0 이면 WIN, ≤ 0 이면 LOSS", () => {
    const trades: Trade[] = [
      makeTrade({ tradeType: "SELL", profitLoss: 10_000, profitLossPct: 5 }),
      makeTrade({ tradeType: "SELL", profitLoss: 0, profitLossPct: 0 }),    // 0% = LOSS
      makeTrade({ tradeType: "SELL", profitLoss: -5_000, profitLossPct: -2 }),
    ];
    const result = calcStockPerformances(trades);
    expect(result[0].result).toBe("WIN");
    expect(result[1].result).toBe("LOSS"); // 0%는 LOSS
    expect(result[2].result).toBe("LOSS");
  });

  it("손익과 수익률이 정수·2자리 소수점으로 반올림된다", () => {
    const trades: Trade[] = [
      makeTrade({
        tradeType: "SELL",
        profitLoss: 10_000.6789,
        profitLossPct: 5.6789,
      }),
    ];
    const result = calcStockPerformances(trades);
    expect(result[0].profitLoss).toBe(10_001);   // Math.round
    expect(result[0].profitLossPct).toBe(5.68);  // 2자리 반올림
  });

  it("거래 없으면 빈 배열 반환", () => {
    expect(calcStockPerformances([])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// calcPerformanceSummary — 정상 케이스
// ─────────────────────────────────────────

describe("calcPerformanceSummary — 정상 케이스 (5건)", () => {
  const summary = calcPerformanceSummary(samplePerfs);

  it("totalTrades = 5", () => {
    expect(summary.totalTrades).toBe(5);
  });

  it("winCount = 3, lossCount = 2", () => {
    expect(summary.winCount).toBe(3);
    expect(summary.lossCount).toBe(2);
  });

  it("승률 = 3/5 = 0.6", () => {
    expect(summary.winRate).toBeCloseTo(0.6, 5);
  });

  it("손익비 = 300,000 / 110,000 ≈ 2.73", () => {
    // 총 WIN 손익: 100,000 + 50,000 + 150,000 = 300,000
    // 총 LOSS 손익: 80,000 + 30,000 = 110,000
    expect(summary.profitFactor).toBeCloseTo(300_000 / 110_000, 2);
  });

  it("평균 수익률 = (10 + 5 + 15) / 3 = 10%", () => {
    expect(summary.avgWinPct).toBeCloseTo(10, 5);
  });

  it("평균 손실률 = (8 + 3) / 2 = 5.5% (양수)", () => {
    expect(summary.avgLossPct).toBeCloseTo(5.5, 5);
  });

  it("기대값 EV = 0.6×10 − 0.4×5.5 = 3.8%", () => {
    // winRate=0.6, lossRate=0.4
    // EV = 0.6×10 - 0.4×5.5 = 6 - 2.2 = 3.8
    expect(summary.expectedValue).toBeCloseTo(3.8, 1);
  });

  it("누적 손익 = +190,000", () => {
    expect(summary.cumulativeProfitLoss).toBe(190_000);
  });

  it("Equity Curve가 날짜 오름차순이고 최종값 = 190,000", () => {
    const curve = summary.equityCurve;
    expect(curve.length).toBeGreaterThan(0);

    // 날짜 오름차순 검증
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].date >= curve[i - 1].date).toBe(true);
    }

    // 최종 누적값
    expect(curve[curve.length - 1].value).toBe(190_000);
  });
});

// ─────────────────────────────────────────
// calcPerformanceSummary — 경계값
// ─────────────────────────────────────────

describe("calcPerformanceSummary — 거래 0건", () => {
  const summary = calcPerformanceSummary([]);

  it("모든 수치가 0이고 NaN이 없다", () => {
    expect(summary.totalTrades).toBe(0);
    expect(summary.winRate).toBe(0);
    expect(summary.profitFactor).toBe(0);
    expect(summary.avgWinPct).toBe(0);
    expect(summary.avgLossPct).toBe(0);
    expect(summary.expectedValue).toBe(0);
    expect(summary.cumulativeProfitLoss).toBe(0);
    expect(summary.mdd).toBe(0);
    expect(summary.equityCurve).toHaveLength(0);

    // NaN 검사
    for (const val of Object.values(summary)) {
      if (typeof val === "number") {
        expect(Number.isNaN(val)).toBe(false);
      }
    }
  });
});

describe("calcPerformanceSummary — 전부 WIN", () => {
  const allWins: StockPerformance[] = [
    makePerf({ profitLoss: 100_000, profitLossPct: 10 }),
    makePerf({ profitLoss: 50_000, profitLossPct: 5 }),
  ];
  const summary = calcPerformanceSummary(allWins);

  it("승률 = 1.0", () => {
    expect(summary.winRate).toBe(1);
  });

  it("손익비 = Infinity (손실 거래 없음)", () => {
    expect(summary.profitFactor).toBe(Infinity);
  });

  it("avgLossPct = 0", () => {
    expect(summary.avgLossPct).toBe(0);
  });
});

describe("calcPerformanceSummary — 전부 LOSS", () => {
  const allLosses: StockPerformance[] = [
    makePerf({ profitLoss: -50_000, profitLossPct: -5 }),
    makePerf({ profitLoss: -30_000, profitLossPct: -3 }),
  ];
  const summary = calcPerformanceSummary(allLosses);

  it("승률 = 0", () => {
    expect(summary.winRate).toBe(0);
  });

  it("손익비 = 0 (WIN 손익 없음)", () => {
    expect(summary.profitFactor).toBe(0);
  });

  it("avgWinPct = 0", () => {
    expect(summary.avgWinPct).toBe(0);
  });

  it("누적 손익이 음수", () => {
    expect(summary.cumulativeProfitLoss).toBe(-80_000);
  });
});

// ─────────────────────────────────────────
// buildEquityCurve
// ─────────────────────────────────────────

describe("buildEquityCurve", () => {
  it("날짜 오름차순으로 정렬된다", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-03-01", profitLoss: 10_000, profitLossPct: 1 }),
      makePerf({ exitDate: "2026-01-01", profitLoss: 20_000, profitLossPct: 2 }),
    ];
    const curve = buildEquityCurve(perfs);
    expect(curve[0].date).toBe("2026-01-01");
    expect(curve[1].date).toBe("2026-03-01");
  });

  it("같은 날짜 복수 거래는 단일 포인트로 합산된다", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-01-10", profitLoss: 10_000, profitLossPct: 1 }),
      makePerf({ exitDate: "2026-01-10", profitLoss: 20_000, profitLossPct: 2 }),
    ];
    const curve = buildEquityCurve(perfs);
    expect(curve).toHaveLength(1);
    expect(curve[0].value).toBe(30_000); // 합산
  });

  it("누적값이 단조 증가하지 않아도 된다 (손실 반영)", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-01-05", profitLoss: 100_000, profitLossPct: 10 }),
      makePerf({ exitDate: "2026-01-10", profitLoss: -150_000, profitLossPct: -15 }),
    ];
    const curve = buildEquityCurve(perfs);
    expect(curve[0].value).toBe(100_000);
    expect(curve[1].value).toBe(-50_000); // 100,000 - 150,000
  });

  it("빈 입력이면 빈 배열 반환", () => {
    expect(buildEquityCurve([])).toHaveLength(0);
  });
});

// ─────────────────────────────────────────
// calcMDD
// ─────────────────────────────────────────

describe("calcMDD", () => {
  it("항상 우상향이면 MDD = 0", () => {
    const curve = [
      { date: "2026-01-01", value: 10_000 },
      { date: "2026-01-02", value: 20_000 },
      { date: "2026-01-03", value: 30_000 },
    ];
    expect(calcMDD(curve)).toBe(0);
  });

  it("낙폭이 있으면 음수 반환", () => {
    // 최고점 100,000 → 50,000으로 하락: MDD = -50%
    const curve = [
      { date: "2026-01-01", value: 100_000 },
      { date: "2026-01-02", value: 50_000 },
      { date: "2026-01-03", value: 80_000 },
    ];
    const mdd = calcMDD(curve);
    expect(mdd).toBeLessThan(0);
    expect(mdd).toBeCloseTo(-50, 1);
  });

  it("전체 손실 구간 중 최대 낙폭을 선택한다", () => {
    // 구간 1: 100,000 → 70,000 (−30%)
    // 구간 2: 150,000 → 90,000 (−40%) ← MDD
    const curve = [
      { date: "2026-01-01", value: 100_000 },
      { date: "2026-01-02", value: 70_000 },
      { date: "2026-01-03", value: 150_000 },
      { date: "2026-01-04", value: 90_000 },
    ];
    const mdd = calcMDD(curve);
    expect(mdd).toBeCloseTo(-40, 1);
  });

  it("빈 Equity Curve이면 0 반환", () => {
    expect(calcMDD([])).toBe(0);
  });
});

// ─────────────────────────────────────────
// buildMonthlyReturns
// ─────────────────────────────────────────

describe("buildMonthlyReturns", () => {
  it("월별로 손익을 합산한다", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-01-05", profitLoss: 50_000, profitLossPct: 5 }),
      makePerf({ exitDate: "2026-01-20", profitLoss: 30_000, profitLossPct: 3 }),
      makePerf({ exitDate: "2026-02-10", profitLoss: -20_000, profitLossPct: -2 }),
    ];
    const result = buildMonthlyReturns(perfs);
    const jan = result.find((r) => r.year === 2026 && r.month === 1);
    const feb = result.find((r) => r.year === 2026 && r.month === 2);

    expect(jan?.profitLoss).toBe(80_000);
    expect(feb?.profitLoss).toBe(-20_000);
  });

  it("원금 제공 시 returnPct를 계산한다", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-01-10", profitLoss: 100_000, profitLossPct: 10 }),
    ];
    // 총 원금 1,000,000원 기준 → 10%
    const result = buildMonthlyReturns(perfs, 1_000_000);
    expect(result[0].returnPct).toBeCloseTo(10, 2);
  });

  it("원금 없으면 returnPct = 0", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-01-10", profitLoss: 100_000, profitLossPct: 10 }),
    ];
    const result = buildMonthlyReturns(perfs);
    expect(result[0].returnPct).toBe(0);
  });

  it("결과가 날짜 오름차순이다", () => {
    const perfs: StockPerformance[] = [
      makePerf({ exitDate: "2026-03-01", profitLoss: 10_000, profitLossPct: 1 }),
      makePerf({ exitDate: "2026-01-01", profitLoss: 20_000, profitLossPct: 2 }),
    ];
    const result = buildMonthlyReturns(perfs);
    expect(result[0].month).toBe(1);
    expect(result[1].month).toBe(3);
  });

  it("빈 입력이면 빈 배열 반환", () => {
    expect(buildMonthlyReturns([])).toHaveLength(0);
  });
});
