// P5-10 단위 테스트 — prompts.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildAnalysisPrompt, SECTION_HEADINGS } from "@/lib/company-analysis/prompts";

describe("buildSystemPrompt", () => {
  it("빈 문자열이 아니어야 한다", () => {
    expect(buildSystemPrompt().length).toBeGreaterThan(0);
  });

  it("6개 섹션 헤딩을 모두 포함해야 한다", () => {
    const prompt = buildSystemPrompt();
    Object.values(SECTION_HEADINGS).forEach((heading) => {
      expect(prompt).toContain(heading);
    });
  });

  it("역할 지침을 포함해야 한다", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("수석 애널리스트");
    expect(prompt).toContain("웹 검색");
  });
});

describe("buildAnalysisPrompt", () => {
  it("ticker가 포함되어야 한다", () => {
    const prompt = buildAnalysisPrompt({ ticker: "AAPL", exchange: "NASDAQ" });
    expect(prompt).toContain("AAPL");
  });

  it("exchange가 포함되어야 한다", () => {
    const prompt = buildAnalysisPrompt({ ticker: "005930", exchange: "KRX" });
    expect(prompt).toContain("KRX");
  });

  it("companyName이 제공되면 포함되어야 한다", () => {
    const prompt = buildAnalysisPrompt({
      ticker: "005930",
      exchange: "KRX",
      companyName: "삼성전자",
    });
    expect(prompt).toContain("삼성전자");
  });

  it("KRX 거래소는 한국어 검색 힌트를 포함해야 한다", () => {
    const prompt = buildAnalysisPrompt({ ticker: "005930", exchange: "KRX" });
    expect(prompt).toContain("한국어");
  });

  it("KRX 외 거래소는 영어 검색 힌트를 포함해야 한다", () => {
    const prompt = buildAnalysisPrompt({ ticker: "AAPL", exchange: "NASDAQ" });
    expect(prompt).toContain("영어");
  });
});
