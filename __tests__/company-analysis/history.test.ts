// P5-10 단위 테스트 — AnalysisHistory 순수 함수
import { describe, it, expect } from "vitest";
import { mergeHistory, removeFromHistory } from "@/components/company-analysis/AnalysisHistory";
import type { AnalysisHistoryItem } from "@/types/company-analysis";

function makeItem(id: string, ticker = "AAPL"): AnalysisHistoryItem {
  return {
    id,
    ticker,
    companyName: ticker,
    exchange: "NASDAQ",
    generatedAt: new Date().toISOString(),
    reportMarkdown: "# 보고서",
    summary: "요약",
  };
}

describe("mergeHistory", () => {
  it("새 항목을 목록 앞에 추가해야 한다", () => {
    const prev = [makeItem("1"), makeItem("2")];
    const item = makeItem("3");
    const result = mergeHistory(prev, item);
    expect(result[0].id).toBe("3");
  });

  it("동일 id 항목은 덮어써야 한다 (중복 없음)", () => {
    const prev = [makeItem("1"), makeItem("2")];
    const updated = makeItem("1", "GOOG");
    const result = mergeHistory(prev, updated);
    expect(result.filter((h) => h.id === "1")).toHaveLength(1);
    expect(result.find((h) => h.id === "1")?.ticker).toBe("GOOG");
  });

  it("MAX_HISTORY(20)건 초과 시 오래된 항목을 제거해야 한다", () => {
    const prev = Array.from({ length: 20 }, (_, i) => makeItem(String(i)));
    const item = makeItem("new");
    const result = mergeHistory(prev, item);
    expect(result).toHaveLength(20);
    expect(result[0].id).toBe("new");
    // 가장 오래된 항목(19번)이 제거되었는지 확인
    expect(result.find((h) => h.id === "19")).toBeUndefined();
  });
});

describe("removeFromHistory", () => {
  it("id에 해당하는 항목을 제거해야 한다", () => {
    const prev = [makeItem("1"), makeItem("2"), makeItem("3")];
    const result = removeFromHistory(prev, "2");
    expect(result).toHaveLength(2);
    expect(result.find((h) => h.id === "2")).toBeUndefined();
  });

  it("존재하지 않는 id 제거 시 원본 반환해야 한다", () => {
    const prev = [makeItem("1"), makeItem("2")];
    const result = removeFromHistory(prev, "999");
    expect(result).toHaveLength(2);
  });

  it("전체 항목 제거 시 빈 배열 반환해야 한다", () => {
    const prev = [makeItem("1")];
    const result = removeFromHistory(prev, "1");
    expect(result).toHaveLength(0);
  });
});
