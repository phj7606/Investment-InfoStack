// lib/etf/screener.ts 단위 테스트
// joinScreenerData 순수 함수 + 클라이언트 필터 로직 검증

import { describe, it, expect, beforeEach } from "vitest";
import { joinScreenerData } from "@/lib/etf/screener";
import type { EtfRsResponse, EtfMomentumResponse, ScreenerFilters, ScreenerResult } from "@/types";

// ────────────────────────────────────────────────────────────────
// 테스트 픽스처
// ────────────────────────────────────────────────────────────────

function makeRsResponse(overrides: Partial<EtfRsResponse> = {}): EtfRsResponse {
  return {
    market: "us",
    rankings: [
      { symbol: "SMH",  name: "Semiconductor ETF", category: "semiconductor", rsRaw: 10, rsPercentile: 85, rsRaw63: 15, rsPercentile63: 90, rank: 1, rsRawHistory: null, rsRawHistory63: null, rsAccelerationHistory: null, adx: null, compositeSignal: null, adxHistory: null },
      { symbol: "QQQ",  name: "NASDAQ-100 ETF",     category: "broad_market",  rsRaw: 5,  rsPercentile: 70, rsRaw63: 8,  rsPercentile63: 75, rank: 2, rsRawHistory: null, rsRawHistory63: null, rsAccelerationHistory: null, adx: null, compositeSignal: null, adxHistory: null },
      { symbol: "XLE",  name: "Energy ETF",         category: "energy",        rsRaw: -3, rsPercentile: 30, rsRaw63: -5, rsPercentile63: 20, rank: 3, rsRawHistory: null, rsRawHistory63: null, rsAccelerationHistory: null, adx: null, compositeSignal: null, adxHistory: null },
      { symbol: "ARKG", name: "Genomic ETF",         category: "healthcare",    rsRaw: null, rsPercentile: null, rsRaw63: null, rsPercentile63: null, rank: 4, rsRawHistory: null, rsRawHistory63: null, rsAccelerationHistory: null, adx: null, compositeSignal: null, adxHistory: null },
    ],
    meta: {
      calculatedAt: "2026-03-31T00:00:00Z",
      benchmark: "SPY",
      windowDays: 252,
      dataStartDate: "2024-01-01",
      dataEndDate: "2026-03-31",
      totalSymbols: 4,
      validSymbols: 3,
    },
    ...overrides,
  };
}

function makeMomentumResponse(overrides: Partial<EtfMomentumResponse> = {}): EtfMomentumResponse {
  return {
    market: "us",
    topRankings: [
      { symbol: "SMH", name: "Semiconductor ETF", category: "semiconductor", rank: 1, score: 2.5, periods: { m3: 3.0, m6: 2.5, m12: 2.0 } },
      { symbol: "QQQ", name: "NASDAQ-100 ETF",    category: "broad_market",  rank: 2, score: 1.8, periods: { m3: 2.0, m6: 1.8, m12: 1.6 } },
      // XLE, ARKG는 Top N 밖 (모멘텀 데이터 없음)
    ],
    meta: {
      calculatedAt: "2026-03-31T00:00:00Z",
      topN: 2,
      lookbackDays: 10,
      dataStartDate: "2024-01-01",
      dataEndDate: "2026-03-31",
    },
    ...overrides,
  };
}

function makeMaFlags(overrides: Record<string, { aboveMa10: boolean|null; aboveMa20: boolean|null; aboveMa50: boolean|null; currentPrice: number|null }> = {}): Map<string, { aboveMa10: boolean|null; aboveMa20: boolean|null; aboveMa50: boolean|null; currentPrice: number|null }> {
  const defaults: Record<string, { aboveMa10: boolean|null; aboveMa20: boolean|null; aboveMa50: boolean|null; currentPrice: number|null }> = {
    SMH:  { aboveMa10: true,  aboveMa20: true,  aboveMa50: true,  currentPrice: 250 },
    QQQ:  { aboveMa10: true,  aboveMa20: false, aboveMa50: false, currentPrice: 480 },
    XLE:  { aboveMa10: false, aboveMa20: false, aboveMa50: false, currentPrice: 85  },
    ARKG: { aboveMa10: null,  aboveMa20: null,  aboveMa50: null,  currentPrice: null },
  };
  return new Map(Object.entries({ ...defaults, ...overrides }));
}

// ────────────────────────────────────────────────────────────────
// joinScreenerData 순수 함수 테스트
// ────────────────────────────────────────────────────────────────

describe("joinScreenerData", () => {
  it("RS + 모멘텀 모두 있는 종목은 모든 필드 채워짐", () => {
    const result = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
    const smh = result.find((r) => r.symbol === "SMH")!;

    expect(smh.rsRank).toBe(1);
    expect(smh.rsPercentile).toBe(85);
    expect(smh.momentumScore).toBe(2.5);
    expect(smh.momentumRank).toBe(1);
    expect(smh.momentumPeriods).toEqual({ m3: 3.0, m6: 2.5, m12: 2.0 });
    expect(smh.aboveMa50).toBe(true);
    expect(smh.currentPrice).toBe(250);
  });

  it("모멘텀 Top N 밖 종목은 momentumRank, momentumScore, momentumPeriods가 null", () => {
    const result = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
    const xle = result.find((r) => r.symbol === "XLE")!;

    expect(xle.momentumRank).toBeNull();
    expect(xle.momentumScore).toBeNull();
    expect(xle.momentumPeriods).toBeNull();
  });

  it("rsPercentile가 null인 종목도 ScreenerResult에 포함", () => {
    const result = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
    const arkg = result.find((r) => r.symbol === "ARKG");

    expect(arkg).toBeDefined();
    expect(arkg!.rsPercentile).toBeNull();
    expect(arkg!.rsRaw).toBeNull();
  });

  it("MA 플래그 없는 종목은 aboveMa* 모두 null", () => {
    const result = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
    const arkg = result.find((r) => r.symbol === "ARKG")!;

    expect(arkg.aboveMa10).toBeNull();
    expect(arkg.aboveMa20).toBeNull();
    expect(arkg.aboveMa50).toBeNull();
    expect(arkg.currentPrice).toBeNull();
  });

  it("결과 배열 길이는 RS rankings 수와 동일", () => {
    const result = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
    expect(result.length).toBe(4);
  });

  it("RS 순위 순서 유지 (rsRank 오름차순)", () => {
    const result = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
    const ranks = result.map((r) => r.rsRank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });
});

// ────────────────────────────────────────────────────────────────
// 클라이언트 필터 로직 테스트
// applyScreenerFilters를 ScreenerResultTable과 동일한 방식으로 구현
// ────────────────────────────────────────────────────────────────

// 실제 클라이언트 필터 로직 (ScreenerResultTable.tsx와 동일하게 유지해야 함)
function applyFilters(data: ScreenerResult[], filters: ScreenerFilters): ScreenerResult[] {
  return data.filter((r) => {
    // RS Percentile 임계값
    if (r.rsPercentile === null || r.rsPercentile < filters.rsPercentileMin) return false;
    // 모멘텀 Top N (topNMomentum=0이면 비활성)
    if (filters.topNMomentum > 0) {
      if (r.momentumRank === null || r.momentumRank > filters.topNMomentum) return false;
    }
    // MA 필터
    if (filters.requireMa10 && r.aboveMa10 !== true) return false;
    if (filters.requireMa20 && r.aboveMa20 !== true) return false;
    if (filters.requireMa50 && r.aboveMa50 !== true) return false;
    // 카테고리 필터
    if (filters.categoryFilter !== "" && r.category !== filters.categoryFilter) return false;
    return true;
  });
}

const DEFAULT_FILTERS: ScreenerFilters = {
  rsPercentileMin: 0,
  topNMomentum: 0,
  requireMa10: false,
  requireMa20: false,
  requireMa50: false,
  categoryFilter: "",
};

describe("applyFilters (클라이언트 필터 로직)", () => {
  let baseData: ScreenerResult[];

  beforeEach(() => {
    baseData = joinScreenerData(makeRsResponse(), makeMomentumResponse(), makeMaFlags());
  });

  it("기본값(all-pass) → 전체 종목 반환", () => {
    // rsPercentile null인 ARKG는 rsPercentileMin=0이어도 null 체크로 제외됨
    // rsPercentileMin=0 설정 시 rsPercentile >= 0인 종목만 통과 (null 제외)
    const result = applyFilters(baseData, DEFAULT_FILTERS);
    // ARKG(rsPercentile=null)는 제외, 나머지 3개
    expect(result.length).toBe(3);
  });

  it("rsPercentileMin=70 → rsPercentile < 70인 종목(XLE=30) 제외", () => {
    const result = applyFilters(baseData, { ...DEFAULT_FILTERS, rsPercentileMin: 70 });
    const symbols = result.map((r) => r.symbol);
    expect(symbols).not.toContain("XLE");
    expect(symbols).toContain("SMH");
    expect(symbols).toContain("QQQ");
  });

  it("topNMomentum=1 → momentumRank > 1인 종목(QQQ=2) 제외", () => {
    const result = applyFilters(baseData, { ...DEFAULT_FILTERS, topNMomentum: 1 });
    const symbols = result.map((r) => r.symbol);
    expect(symbols).not.toContain("QQQ");
    expect(symbols).toContain("SMH");
  });

  it("topNMomentum=0 → 모멘텀 필터 비활성 (모멘텀 없는 종목도 통과)", () => {
    const result = applyFilters(baseData, { ...DEFAULT_FILTERS, topNMomentum: 0 });
    const symbols = result.map((r) => r.symbol);
    // XLE는 모멘텀 없지만 rsPercentile=30 >= 0이므로 통과
    expect(symbols).toContain("XLE");
  });

  it("requireMa50=true → aboveMa50가 false인 종목(QQQ, XLE) 제외", () => {
    const result = applyFilters(baseData, { ...DEFAULT_FILTERS, requireMa50: true });
    const symbols = result.map((r) => r.symbol);
    expect(symbols).toContain("SMH");   // aboveMa50=true
    expect(symbols).not.toContain("QQQ");  // aboveMa50=false
    expect(symbols).not.toContain("XLE");  // aboveMa50=false
  });

  it("categoryFilter='semiconductor' → 해당 카테고리만 통과", () => {
    const result = applyFilters(baseData, { ...DEFAULT_FILTERS, categoryFilter: "semiconductor" });
    expect(result.length).toBe(1);
    expect(result[0].symbol).toBe("SMH");
  });

  it("복합 필터: rsPercentileMin=70 AND topNMomentum=1 → SMH만 통과", () => {
    const result = applyFilters(baseData, {
      ...DEFAULT_FILTERS,
      rsPercentileMin: 70,
      topNMomentum: 1,
    });
    expect(result.length).toBe(1);
    expect(result[0].symbol).toBe("SMH");
  });
});
