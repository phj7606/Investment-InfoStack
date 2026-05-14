// 섹터 기반 스크리너 프롬프트
// Step 1: 섹터 → ticker 목록 (JSON만 반환, 수치 창작 금지)
// Step 2: 실제 수치 기반 투자 포인트 생성 (수치 창작 금지)

// 섹터 ticker 요청 시스템 프롬프트
// JSON만 반환하도록 강제 — 마크다운, 설명, 코드블록 모두 금지
export const TICKER_SYSTEM_PROMPT = `당신은 글로벌 주식 데이터베이스입니다.
사용자가 요청한 섹터와 시장의 대표 종목을 JSON 배열로만 반환합니다.

출력 형식 (이 외 아무것도 출력하지 마세요):
[
  {"ticker":"종목코드","exchange":"거래소","companyName":"회사명"},
  ...
]

규칙:
- 마크다운 없음, 코드블록 없음, 설명 없음
- 반드시 유효한 JSON 배열만 출력
- ticker: 한국은 6자리 숫자(예: 005930), 미국은 영문 심볼(예: NVDA)
- exchange: KRX(한국), NYSE, NASDAQ 중 하나
- 8~12개 종목 반환`;

export function buildTickerPrompt(sector: string, market: "KR" | "US" | "ALL"): string {
  const marketDesc =
    market === "KR"  ? "한국 (KOSPI/KOSDAQ, KRX 상장)" :
    market === "US"  ? "미국 (NYSE/NASDAQ 상장)" :
                       "한국 + 미국 (KRX, NYSE, NASDAQ)";

  return `섹터: ${sector}
시장: ${marketDesc}
대표 종목 8~12개를 JSON 배열로 반환하세요.`;
}

// 투자 포인트 시스템 프롬프트
// 실제 수치를 컨텍스트로 받아 해석만 생성 — 수치 창작 절대 금지
export const INVESTMENT_POINT_SYSTEM_PROMPT = `당신은 주식 투자 애널리스트입니다.
주어진 실제 재무 데이터를 기반으로 각 종목의 핵심 투자 포인트를 작성합니다.

규칙:
- 제공된 데이터에 없는 수치는 절대 생성하지 마세요
- 각 종목당 한국어 1문장, 40자 이내
- 투자 포인트가 없으면 "데이터 부족" 반환
- JSON 배열로만 출력: [{"ticker":"XXX","point":"..."},...]`;

export function buildInvestmentPointPrompt(
  stocks: Array<{
    ticker: string;
    companyName: string;
    per: number | null;
    pbr: number | null;
    marketCap: number | null;
    revenue: number | null;
    operatingIncome: number | null;
  }>
): string {
  const data = stocks.map((s) => ({
    ticker: s.ticker,
    name: s.companyName,
    per: s.per,
    pbr: s.pbr,
    // 시가총액은 조원 단위로 축약 (가독성)
    marketCap_억: s.marketCap,
    revenue_억: s.revenue,
    operatingIncome_억: s.operatingIncome,
  }));

  return `다음 종목들의 실제 재무 데이터를 바탕으로 투자 포인트를 작성하세요.

데이터:
${JSON.stringify(data, null, 2)}

각 종목의 투자 포인트를 JSON 배열로 반환하세요.`;
}
