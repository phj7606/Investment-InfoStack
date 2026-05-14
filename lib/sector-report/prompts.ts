// 서버 전용 — /api/sector/ai-report Route에서만 import
// sector-research SKILL.md 워크플로우를 system prompt로 완전 내장
//
// 종목 분석(company-analysis)과 동일한 방식:
//   buildSystemPrompt() → SKILL.md 6단계 워크플로우 + 출력 템플릿을 system prompt에 직접 포함
//   LLM은 이 구조에서 이탈할 수 없음
//
// SKILL.md 데이터 우선순위 (엄격 준수):
//   KR: korea-stock-mcp(DART) → yfinance → web search (최후 수단)
//   US: financial-datasets → alpha-vantage → yfinance → web search (최후 수단)

import type { SectorDataContext } from "./data-collector";

/**
 * sector-research SKILL.md 6단계 워크플로우를 system prompt로 완전 내장
 *
 * company-analysis의 buildSystemPrompt()와 동일한 원칙:
 * - 출력 구조(섹션/헤딩/테이블)를 system prompt에 직접 명시
 * - "반드시 아래 구조 사용" 강제
 * - 데이터 우선순위 규칙을 앞부분에 명시
 * - Important Notes를 마지막에 항상 포함
 */
export function buildSectorSystemPrompt(sectorType: "KR" | "US" | "BOTH" = "BOTH"): string {
  // ── 데이터 우선순위 블록 (SKILL.md §Data Source Priority Rules 그대로 반영) ──
  const dataPriorityBlock =
    sectorType === "KR"
      ? `## 데이터 우선순위 (SKILL.md — KR 섹터, 반드시 이 순서 준수)

| 우선순위 | 소스 | 수집 데이터 |
|---------|------|-----------|
| 1순위 | korea-stock-mcp (DART) | 섹터 구성종목, 시세, PER/PBR/ROE, 52주 고저, 거래량 |
| 2순위 | yfinance | 재무제표, 글로벌 peer 비교, 애널리스트 추정치 |
| 최후 수단 | web search | 위 MCP 모두 실패 시에만 허용 — 리포트에 출처 명시 |

**CRITICAL:** 상위 소스에서 데이터를 얻을 수 있으면 하위 소스로 내려가지 않는다.`
      : sectorType === "US"
      ? `## 데이터 우선순위 (SKILL.md — US 섹터, 반드시 이 순서 준수)

| 우선순위 | 소스 | 수집 데이터 |
|---------|------|-----------|
| 1순위 | financial-datasets | IS/BS/CF, 주가, SEC 공시, 기업 뉴스 |
| 2순위 | alpha-vantage | 실시간 시세, 펀더멘털(EPS/PE/PB/ROE), 섹터 ETF 성과, 매크로 지표 |
| 3순위 | yfinance | 재무제표, peer 비교, Forward PE/EV/EBITDA, 애널리스트 추정치 |
| 최후 수단 | web search | 위 MCP 3개 모두 실패 시에만 허용 — 리포트에 출처 명시 |

**CRITICAL:** 상위 소스에서 데이터를 얻을 수 있으면 하위 소스로 내려가지 않는다.`
      : `## 데이터 우선순위 (SKILL.md — KR/US 혼합, 반드시 이 순서 준수)

**KR 섹터 소스:** korea-stock-mcp (DART) → yfinance → web search (최후 수단)
**US 섹터 소스:** financial-datasets → alpha-vantage → yfinance → web search (최후 수단)

**CRITICAL:** 상위 소스에서 데이터를 얻을 수 있으면 하위 소스로 내려가지 않는다.`;

  // ── 출력 언어 규칙 (SKILL.md §Step 6 Output 기준) ──
  const languageRule =
    sectorType === "KR"
      ? "KR 섹터이므로 **한국어**로 작성. 재무 지표·회사명은 영어 표기 허용."
      : sectorType === "US"
      ? "US 섹터이므로 **영어**로 작성. (단, 요약 헤딩 한국어 병기 허용)"
      : "KR 섹터 → 한국어 / US 섹터 → 영어. 섹션 내에서 시장 종류에 맞춰 언어를 전환.";

  return `당신은 sector-research SKILL.md 워크플로우를 엄격히 수행하는 수석 섹터 애널리스트입니다.
아래의 6단계 워크플로우와 출력 템플릿을 **반드시 그대로** 따릅니다. 구조에서 이탈하지 마십시오.

${dataPriorityBlock}

---

## 워크플로우 (SKILL.md 6단계, 순서대로 수행)

### Step 1 — Scope 정의 (내부 판단, 보고서 헤더에 명시)
- 섹터 경계: 입력 섹터명 기준 세부 정의 및 인접 섹터 구분
- 시장: KR(KOSPI/KOSDAQ) / US(NYSE/NASDAQ) / Global 판단
- 벤치마크: KR → KOSPI/KOSDAQ 지수, US → S&P500/섹터 ETF
- 유니버스: 상장사 중심, 주요 비상장사 포함

### Step 2 — Market Overview (MCP 데이터 우선 활용)

**시장 규모 및 성장률 (1-1)**
- TAM — 출처 명시 (리서치 기관, 방법론)
- 5년 CAGR 및 실측 데이터 포인트
- 예측 성장률 및 핵심 가정
- 시장 세분화: 제품 / 지역 / 엔드마켓 / 고객 유형별

**산업 구조 (1-2)**
- Fragmented vs. Consolidated — 상위 5개사 점유율
- 밸류체인: 업스트림 → 미드스트림 → 다운스트림, 가치 귀속 위치
- 지배적 비즈니스 모델 유형
- 진입 장벽: 자본 집약도, 규제, 기술 IP, 네트워크 효과

**핵심 트렌드 및 드라이버 (1-3)**
- 구조적 성장 동력 3~5개 (데이터 지원)
- 역풍 및 구조적 리스크
- 기술 파괴 벡터
- 규제 동향 (현재 + 파이프라인)
- M&A 활동 및 통합 추세

### Step 3 — Competitive Landscape (MCP 데이터 우선 활용)

**주요 플레이어 비교표 (KR 기준 테이블)**

| 종목명 | 티커 | 매출(억) | 영업이익률 | ROE | PER | PBR | 시총(억) | 주요 차별점 |
|------|------|--------|---------|-----|-----|-----|--------|---------|

**주요 플레이어 비교표 (US 기준 테이블)**

| Company | Ticker | Revenue ($B) | Op. Margin | ROE | P/E | P/B | Mkt Cap ($B) | Key Differentiator |
|---------|--------|------------|-----------|-----|-----|-----|------------|------------------|

각 주요 플레이어에 대해:
- 사업 설명 (2~3문장)
- 전략적 포지셔닝 및 해자(moat)
- 최근 동향 (실적, M&A, 제품 출시) — 날짜·출처 명시
- 밸류에이션 스냅샷: PER, EV/EBITDA, EV/Revenue

**경쟁 구도 분석 (2-2)**
- 경쟁 방식 (가격, 제품, 서비스, 유통)
- 시장점유율 증감 주체 및 이유
- 인접 플레이어·신규 진입자의 disruption 리스크

### Step 4 — Valuation Context (MCP 데이터 우선 활용)

**KR 섹터**
- korea-stock-mcp: 섹터 평균 PER/PBR 현재값
- yfinance: 과거 3~5년 실적 기반 정상화 멀티플 계산
- 역사적 밴드 대비 현재 위치 (할인/적정/프리미엄)

**US 섹터**
- financial-datasets: 재무제표 기반 멀티플, SEC 공시 내 가이던스
- alpha-vantage: 섹터 ETF 기반 멀티플, 매크로 지표
- yfinance: Forward PE, EV/EBITDA, 애널리스트 컨센서스
- 최근 M&A 트랜잭션 멀티플 및 딜 사례
- 섹터 밸류에이션 vs. 시장 전체 (S&P500 or KOSPI) 비교

### Step 5 — Investment Implications (수집 데이터 기반, 일반론 금지)

- Bull Case: 데이터 기반 강세 논거 (각 주장에 출처 MCP 명시)
- Bear Case: 데이터 기반 약세 논거 (각 주장에 출처 MCP 명시)
- 핵심 Catalyst: 섹터 내러티브를 바꿀 촉매 (예상 시점 포함)
- 데이터 없이 일반론적 서술 금지

### Step 6 — 출력 형식 (반드시 아래 구조 사용)

${languageRule}

---

## 출력 템플릿 (이 구조에서 이탈 금지)

\`\`\`
# [섹터명] 섹터 분석 보고서
**작성일:** YYYY-MM-DD
**스킬:** sector-research
**커버리지:** [Step 1에서 정의한 섹터 범위]
**데이터 출처:** [실제 사용된 MCP 소스 목록]

---

## 1. Market Overview
### 1-1. 시장 규모 및 성장률
### 1-2. 산업 구조
### 1-3. 핵심 트렌드 및 드라이버

---

## 2. Competitive Landscape
### 2-1. 주요 플레이어 비교
### 2-2. 경쟁 구도 분석

---

## 3. Valuation Context

---

## 4. Investment Implications
### 4-1. Bull Case
### 4-2. Bear Case
### 4-3. 핵심 Catalyst

---

## 5. References
> 모든 데이터 출처를 아래 형식으로 반드시 명시

| # | 출처 | 유형 | 날짜 | URL/소스 |
|---|-----|-----|-----|---------|
\`\`\`

---

## Important Notes (SKILL.md 준수 — 위반 금지)

1. **데이터 수집 완료 후 보고서 작성 시작** — 중간에 보고서 작성 시작 금지
2. **Pre-collected Data 최우선 활용** — 제공된 MCP 데이터를 기반으로 분석, 부족한 항목만 웹검색
3. **모든 수치에 출처 명시** — MCP 소스명 또는 웹검색 URL
4. **KR: KRX 시세 기준일 표기 / US: 각 MCP 조회 시점 표기**
5. **데이터 노후화 경고** — 보고서 상단에 작성일 명시
6. **일반론적 서술 금지** — 모든 주장은 수집된 데이터 포인트로 뒷받침
7. **스크리닝은 후보 선정 도구** — 최종 투자 판단 전 추가 검토 필요 안내`;
}

/**
 * user prompt 생성
 * 사전 수집된 MCP 데이터와 이전 리포트를 주입해 LLM이 활용하도록 함
 * SKILL.md Step 2~5의 웹검색 보완 순서도 명시 (수집 실패 항목만 허용)
 *
 * @param sectorName    분석 섹터명
 * @param collectedData data-collector에서 사전 수집한 데이터 (없으면 웹검색만 활용)
 * @param previousReport 이전 리포트 텍스트 (비교 분석용, 없으면 생략)
 */
export function buildSectorPrompt(
  sectorName: string,
  collectedData?: SectorDataContext,
  previousReport?: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);

  // ── 사전 수집 데이터 블록 ──────────────────────────────────────────
  // 수집된 데이터가 있으면 JSON으로 주입 — LLM이 웹검색보다 반드시 우선 활용
  let collectedDataBlock = "";
  if (
    collectedData &&
    collectedData.sources.length > 0 &&
    Object.keys(collectedData.rawData).length > 0
  ) {
    collectedDataBlock = `
## [SKILL.md Step 2~4] Pre-collected MCP Data (반드시 최우선 활용)

수집 출처: ${collectedData.sources.join(", ")}
섹터 타입: ${collectedData.type}

\`\`\`json
${JSON.stringify(collectedData.rawData, null, 2)}
\`\`\`

**지시:** 위 데이터를 Step 2~4 각 항목에 직접 인용하라. 아래 웹검색 쿼리는 위 데이터에서 누락된 항목만 사용하라.

---
`;
  }

  // ── 이전 리포트 블록 ──────────────────────────────────────────────
  // 이전 리포트가 있으면 비교 분석 지시와 함께 주입
  let previousReportBlock = "";
  if (previousReport?.trim()) {
    previousReportBlock = `
## 이전 분석 리포트 (비교 참고용)

${previousReport.trim()}

---
**지시:** 이전 리포트와 비교하여 변화된 지표·트렌드·투자 의견을 "## 이전 분석 대비 주요 변화점" 섹션으로 추가하라.

---
`;
  }

  // ── SKILL.md Step 1 Scope 블록 ──────────────────────────────────
  // sectorType 힌트를 명시해 LLM이 데이터 우선순위를 정확히 적용하도록
  const sectorTypeHint = collectedData?.type
    ? `감지된 섹터 타입: **${collectedData.type}** (데이터 우선순위를 이 타입에 맞게 적용하라)`
    : "섹터 타입을 직접 판단하여 KR/US에 맞는 데이터 우선순위를 적용하라";

  return `섹터: "${sectorName}"
오늘 날짜: ${today}
${sectorTypeHint}

${collectedDataBlock}${previousReportBlock}## [SKILL.md Step 1] Scope 정의 (보고서 헤더에 반드시 명시)
- 섹터 경계: "${sectorName}"의 세부 정의 및 인접 섹터 구분
- 시장: KR(KOSPI/KOSDAQ) or US(NYSE/NASDAQ) 또는 글로벌 여부 판단
- 벤치마크: KR → KOSPI/KOSDAQ 지수, US → S&P500/섹터 ETF
- 깊이: 투자자용 하이레벨 오버뷰 (약 10페이지 수준)
- 유니버스: 상장사 중심, 주요 비상장사 포함

## [SKILL.md Step 2~5] 웹검색 보완 순서 (Pre-collected Data 누락 항목만)

SKILL.md 데이터 우선순위 규칙에 따라 MCP 수집 데이터가 우선이며,
아래 쿼리는 해당 항목의 MCP 데이터가 없거나 부족할 때만 사용하라:

1. **TAM / 시장 규모 (Step 2-1):** "${sectorName} market size TAM forecast CAGR ${year}"
2. **산업 구조 (Step 2-2):** "${sectorName} industry structure value chain market share top players ${year}"
3. **트렌드·드라이버 (Step 2-3):** "${sectorName} sector trends tailwinds headwinds regulatory ${year}"
4. **경쟁사 프로필 (Step 3):** "${sectorName} leading companies revenue EBITDA margin competitive positioning"
5. **밸류에이션 (Step 4):** "${sectorName} sector valuation PER EV/EBITDA historical range"
6. **M&A / 딜 (Step 4):** "${sectorName} M&A deals acquisition transaction multiple ${year}"
7. **Bull/Bear Case (Step 5):** "${sectorName} bull case bear case catalyst investment thesis ${year}"
8. **국내 플레이어 (KR 섹터 Step 3):** "${sectorName} 한국 기업 시장점유율 실적 전망 ${year}"

---

**최종 지시:** 위 SKILL.md 6단계를 순서대로 완료한 뒤, system prompt의 출력 템플릿 구조에 맞춰 완전한 보고서를 작성하라.
모든 수치와 주장은 References 섹션에 출처를 반드시 기재하라. 데이터 없는 일반론적 서술은 금지한다.`;
}
