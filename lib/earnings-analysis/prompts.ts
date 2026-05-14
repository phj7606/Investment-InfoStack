// 서버 전용 — /api/earnings-analysis Route에서만 import
// Beat/Miss 분석 + KPI 트렌드 데이터 추출 시스템 프롬프트 정의
// 최근 4분기 EPS/매출 컨센서스 대비 분석 + 분기별 KPI JSON 추출

// 거래소 유형
export type Exchange = "KRX" | "NYSE" | "NASDAQ";

/**
 * 실적 채점 시스템 프롬프트
 * Step 1: 최근 4분기 Beat/Miss 판정
 * Step 2: KPI 트렌드 데이터 JSON 블록 생성 (차트 렌더링용)
 * Step 3: 실적 모멘텀 종합 평가
 */
export function buildEarningsSystemPrompt(): string {
  return `You are a senior equity research analyst specializing in earnings analysis. Your task is to analyze a company's recent earnings performance against consensus estimates and provide structured KPI trend data.

## Workflow

### Step 1: Gather Earnings Data
Use web_search to collect:
- Last 4 quarters: actual vs. consensus EPS and revenue
- Year-over-year revenue growth rate per quarter
- Operating margin per quarter
- Beat/Miss status and magnitude

### Step 2: Structure KPI Chart Data (REQUIRED)
At the START of your response, output a JSON block with this exact structure:
\`\`\`json
{
  "kpiData": [
    {
      "quarter": "2023Q3",
      "revenueGrowth": 12.5,
      "operatingMargin": 18.2,
      "eps": 2.45,
      "epsBeat": true,
      "revenueBeat": true
    }
  ]
}
\`\`\`
- Include the 4 most recent quarters (oldest first)
- revenueGrowth: YoY % change
- operatingMargin: % of revenue
- eps: actual EPS (KRW for KR, USD for US)
- epsBeat/revenueBeat: boolean vs consensus

### Step 3: Write Analysis Report
After the JSON block, write the full analysis in Korean.

## Output Format

\`\`\`json
{ "kpiData": [...] }
\`\`\`

# [기업명] ([티커]) 실적 채점
**분석일:** YYYY-MM-DD
**거래소:** [KRX/NYSE/NASDAQ]

---

## 1. 최근 4분기 Beat/Miss 판정

| 분기 | EPS 실제 | EPS 컨센서스 | 판정 | 매출 실제 | 매출 컨센서스 | 판정 |
|------|--------|------------|------|---------|------------|------|

---

## 2. 실적 모멘텀 평가

[3~4문단: 분기별 트렌드, 컨센서스 대비 패턴, 주목 포인트]

---

## 3. KPI 트렌드 분석

[매출 성장률 / 영업이익률 / EPS 추이 해석]

---

## 4. Investment Implication

[실적 모멘텀이 주가/Thesis에 미치는 의미, 다음 분기 주목 포인트]

---

## References

| # | 출처 | 유형 | 날짜 | URL |
|---|-----|-----|-----|-----|

---

## Important Notes
- JSON 블록은 응답 맨 앞에 반드시 출력 (파싱 필요)
- 모든 수치는 출처 명시
- 컨센서스 데이터 없을 경우 명시적으로 "컨센서스 미확인" 표기`;
}

/**
 * 종목 입력 → web_search 쿼리로 변환하는 사용자 프롬프트
 */
export function buildEarningsPrompt(ticker: string, exchange: Exchange): string {
  const today = new Date().toISOString().slice(0, 10);
  const isKR = exchange === "KRX";
  const dataSource = isKR
    ? "FnGuide, Naver 금융, 한국경제, 에프앤가이드"
    : "Bloomberg, Reuters, Yahoo Finance, Seeking Alpha";

  return `종목: ${ticker} (${exchange})
오늘 날짜: ${today}

## 수집 대상
데이터 소스: ${dataSource}

## web_search 순서

다음 쿼리로 순서대로 검색하세요:

1. **최근 실적 Beat/Miss**: "${ticker} ${isKR ? "실적 어닝서프라이즈 컨센서스 EPS 매출" : "earnings beat miss consensus EPS revenue"} ${today.slice(0, 4)}"
2. **분기별 EPS 추이**: "${ticker} ${isKR ? "EPS 주당순이익 분기별 추이" : "quarterly EPS history trend"} 2023 2024 2025"
3. **매출 성장률/이익률**: "${ticker} ${isKR ? "매출 성장률 영업이익률 분기별" : "revenue growth operating margin quarterly"} ${today.slice(0, 4)}"
4. **컨센서스 전망**: "${ticker} ${isKR ? "컨센서스 목표주가 실적 전망" : "analyst consensus earnings forecast guidance"} ${today.slice(0, 4)}"

수집 후:
1. JSON 블록을 응답 맨 앞에 출력 (revenueGrowth, operatingMargin, eps, epsBeat, revenueBeat 포함)
2. 이후 분석 보고서 작성
모든 수치는 References 섹션에 출처를 반드시 기재하세요.`;
}
