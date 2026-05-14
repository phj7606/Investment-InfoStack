// 서버 전용 — /api/equity-research/screen Route에서만 import
// idea-generation SKILL.md 원문을 직접 읽어 시스템 프롬프트에 삽입
// 요약·재해석 없이 SKILL 워크플로우를 그대로 Claude에게 전달

import { readFileSync } from "fs";
import { join } from "path";

// ── 스크리닝 필터 인터페이스 ──────────────────────────────────────────────────

export interface ScreenerFilters {
  market: "KR" | "US" | "ALL";
  direction: "Long" | "Short" | "Both";
  style: "Value" | "Growth" | "Quality" | "Short" | "Special Situation";
  theme?: string;                    // 선택 입력 — Step 3 가치사슬 분석 트리거
  // 필터 게이트 — Phase C 서버 사이드 검증에 사용
  minROE?: number;                   // 최소 ROE (%)
  minOperatingMargin?: number;       // 최소 영업이익률 (%)
  maxDebtRatio?: number;             // 최대 부채비율 (%)
  maxPER?: number;                   // 최대 PER (배)
  maxPBR?: number;                   // 최대 PBR (배)
  maxEVEBITDA?: number;              // 최대 EV/EBITDA (배)
}

// 실제 API로 수집한 종목 데이터 (Phase B → Phase D 컨텍스트로 전달)
export interface CollectedStockData {
  ticker: string;
  exchange: string;
  companyName: string;
  marketCap: number | null;    // KR: 억원, US: USD
  per: number | null;
  pbr: number | null;
  roe: number | null;
  operatingMargin: number | null;
  debtRatio: number | null;    // KR: debtRatio, US: debtToEquity
  evToEbitda: number | null;
  revenueGrowth: number | null;
  freeCashflowYield: number | null;
}

// ── SKILL.md 직접 읽기 ────────────────────────────────────────────────────────
// SKILL 원문을 요약·재해석 없이 시스템 프롬프트에 그대로 삽입
// SKILL 파일이 업데이트되면 자동으로 반영됨

function loadSkillMd(): string {
  try {
    const skillPath = join(
      process.env.HOME ?? "/Users/mac",
      ".claude/plugins/cache/financial-services-plugins",
      "equity-research/0.1.0/skills/idea-generation/SKILL.md"
    );
    return readFileSync(skillPath, "utf-8");
  } catch {
    // SKILL 파일 읽기 실패 시 빈 문자열 — Additional Instructions만으로 동작
    return "";
  }
}

// ── 시스템 프롬프트 ───────────────────────────────────────────────────────────

export function buildScreenerSystemPrompt(): string {
  const skill = loadSkillMd();

  return `You are a senior equity research analyst executing a stock screening and idea generation workflow.

Follow the workflow below EXACTLY as written — do not skip, summarize, or reinterpret any step.
Output in Korean, except company names, tickers, and financial metrics (keep in English).

${skill}

---
## Additional Instructions

1. **Step 1 is pre-defined**: The user has already provided all Step 1 criteria in the message. Do NOT ask the user for parameters — proceed directly to Step 2.

2. **Use provided real data first**: A table of real financial data collected from official APIs (Naver Finance, DART, Yahoo Finance, Alpha Vantage) is provided in the user message. Use these figures to populate Step 4 metric tables. Use web_search only to fill gaps (NTM forward estimates, peer comparison benchmarks, FCF yield if missing).

3. **Step 4 format is MANDATORY for every idea**:
   - Bold header: **[Company Name] — [Long/Short] — [One-Line Thesis in Korean]**
   - Metrics table with "vs. Peers" column (populated via web_search if needed)
   - Thesis section: exactly 3–5 Korean bullets covering (왜 잘못 평가됐나 / 시장이 놓치는 것 / 가치 실현 촉매제)
   - Key Risks: at least 2 bullets
   - Suggested Next Steps: specific actionable recommendation

4. **Step 5 format is MANDATORY**:
   - Shortlist of 5–10 ideas with priority ranking
   - Screening methodology documentation (criteria used, sources)
   - Comparison table across ALL ideas (use the same metrics as Step 4)
   - Prioritized list with rationale for ordering

5. **Important notes from the SKILL apply strictly** — especially:
   - "Screens surface candidates, not conclusions"
   - "Short ideas need higher conviction"
   - "Contrarian ideas need a catalyst"`;
}

// ── 사용자 프롬프트 (실제 수치 컨텍스트 주입) ────────────────────────────────

// 필터 조건 텍스트 생성 헬퍼
function buildConditionText(filters: ScreenerFilters): string {
  const conditions: string[] = [];
  if (filters.minROE !== undefined)             conditions.push(`ROE ≥ ${filters.minROE}%`);
  if (filters.minOperatingMargin !== undefined) conditions.push(`영업이익률 ≥ ${filters.minOperatingMargin}%`);
  if (filters.maxDebtRatio !== undefined)       conditions.push(`부채비율 ≤ ${filters.maxDebtRatio}%`);
  if (filters.maxPER !== undefined)             conditions.push(`PER ≤ ${filters.maxPER}x`);
  if (filters.maxPBR !== undefined)             conditions.push(`PBR ≤ ${filters.maxPBR}x`);
  if (filters.maxEVEBITDA !== undefined)        conditions.push(`EV/EBITDA ≤ ${filters.maxEVEBITDA}x`);
  return conditions.length > 0 ? conditions.join(", ") : "없음 (전체 우량주)";
}

// 숫자 포맷 헬퍼 — null이면 "N/A"
function fmtVal(val: number | null, digits = 1): string {
  if (val === null) return "N/A";
  return val.toFixed(digits);
}

export function buildScreenerPrompt(
  filters: ScreenerFilters,
  stockData: CollectedStockData[],
  previousReport?: string
): string {
  const today = new Date().toISOString().slice(0, 10);

  const marketLabel = {
    KR:  "한국 (KOSPI/KOSDAQ)",
    US:  "미국 (NYSE/NASDAQ)",
    ALL: "한국 + 미국",
  }[filters.market];

  // 실제 수치 컨텍스트 테이블 — Phase D에서 Step 4 메트릭 테이블에 직접 사용
  const dataSection = stockData.length > 0
    ? `## Real Financial Data (Official API — Use These Figures in Step 4 Metric Tables)

| Ticker | Exchange | Company | ROE% | OpMargin% | DebtRatio | PER | PBR | EV/EBITDA | RevGrowth% | FCFYield% | MarketCap |
|--------|----------|---------|------|-----------|----------|-----|-----|-----------|-----------|----------|-----------|
${stockData.map(s =>
  `| ${s.ticker} | ${s.exchange} | ${s.companyName} | ${fmtVal(s.roe)} | ${fmtVal(s.operatingMargin)} | ${fmtVal(s.debtRatio)} | ${fmtVal(s.per)} | ${fmtVal(s.pbr)} | ${fmtVal(s.evToEbitda)} | ${fmtVal(s.revenueGrowth)} | ${fmtVal(s.freeCashflowYield)} | ${s.marketCap ?? "N/A"} |`
).join("\n")}

For any N/A values, use web_search to fill in the gaps, especially NTM forward estimates and peer benchmarks.`
    : `## No pre-collected data available
Use web_search to gather all financial metrics for the candidate stocks.`;

  // 이전 분석 보고서가 있으면 컨텍스트 블록 생성
  // 스크리너가 이전 분석 결과를 참고해 스크리닝 방향 / 투자 thesis 보완에 활용
  const prevReportBlock = previousReport?.trim()
    ? `\n## Previous Analysis Report (Reference Context)\n\n> 아래 이전 분석 보고서를 참고하여 이번 스크리닝에 활용하라.\n> 이전 분석에서 언급된 종목, 섹터, thesis, 리스크 요인을 Step 2~5에 반영하라.\n> 특히 이전 분석의 관심 섹터/테마와 현재 스크리닝 방향이 일치하면 명시적으로 연결하라.\n\n${previousReport.trim()}\n\n---\n`
    : "";

  return `Today: ${today}
${prevReportBlock}
## Step 1 Criteria (Pre-defined — Proceed Directly to Step 2)

- **Direction**: ${filters.direction}
- **Market**: ${marketLabel}
- **Style**: ${filters.style}
- **Theme**: ${filters.theme ?? "없음"}
- **Financial Gates**: ${buildConditionText(filters)}

${dataSection}

---

Now execute the idea-generation workflow starting from Step 2.
Remember: Step 4 and Step 5 formats are MANDATORY as specified in the Additional Instructions.`;
}
