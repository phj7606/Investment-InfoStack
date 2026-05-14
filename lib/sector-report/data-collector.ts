// 서버 전용 — API Route에서만 import
// sector-research SKILL.md 데이터 우선순위를 REST API 직접 호출로 구현
//
// KR 섹터: korea-stock-mcp(DART) → yfinance(Yahoo Finance) → web search fallback
// US 섹터: financial-datasets(로컬) → alpha-vantage → yfinance → web search fallback
//
// MCP 서버는 stdio 프로세스라 Next.js Route에서 직접 호출 불가 →
// 각 MCP가 래핑하는 REST API를 직접 호출해 동일 데이터 확보

export interface SectorDataContext {
  type: "KR" | "US" | "BOTH";
  // 실제 사용된 소스 목록 — 리포트 References 섹션에 표기
  sources: string[];
  // 수집된 원시 데이터 — 프롬프트에 JSON 블록으로 주입
  rawData: Record<string, unknown>;
}

// ── 섹터 타입 감지 ──────────────────────────────────────────────────
// 입력 섹터명에서 KR/US 여부를 키워드로 판별
// 판단 불가 시 BOTH → KR + US 모두 수집 시도
const KR_KEYWORDS = [
  "반도체", "배터리", "바이오", "조선", "방산", "금융", "에너지", "화학",
  "철강", "자동차", "유통", "건설", "보험", "증권", "은행", "게임",
  "엔터", "미디어", "식품", "제약", "kospi", "kosdaq", "코스피", "코스닥",
  "k-", "한국", "국내",
];
const US_KEYWORDS = [
  "cloud", "saas", "fintech", "semiconductor", "energy", "healthcare",
  "biotech", "defense", "aerospace", "retail", "banking", "insurance",
  "media", "gaming", "ev", "electric vehicle", "nasdaq", "s&p",
  "us ", "american", "global",
];

export function detectSectorType(sectorName: string): "KR" | "US" | "BOTH" {
  const lower = sectorName.toLowerCase();
  const isKR = KR_KEYWORDS.some((kw) => lower.includes(kw));
  const isUS = US_KEYWORDS.some((kw) => lower.includes(kw));
  if (isKR && !isUS) return "KR";
  if (isUS && !isKR) return "US";
  return "BOTH"; // 모호하면 양쪽 모두 수집
}

// ── KR 섹터 데이터 수집 ─────────────────────────────────────────────
// 1순위: DART Open API (korea-stock-mcp 동일 데이터 소스)
// 2순위: Yahoo Finance 비공식 API (yfinance 동일 데이터 소스)
async function collectKRData(
  sectorName: string
): Promise<{ sources: string[]; data: Record<string, unknown> }> {
  const sources: string[] = [];
  const data: Record<string, unknown> = {};

  // 1순위: DART Open API — 기업 재무 정보
  const dartKey = process.env.DART_API_KEY;
  if (dartKey) {
    try {
      // 기업명 검색으로 섹터 대표 종목 조회
      const searchUrl = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${dartKey}&corp_name=${encodeURIComponent(sectorName)}&page_count=10`;
      const res = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        if (json.status === "000" && json.list?.length > 0) {
          data.dartCompanies = json.list.slice(0, 5).map((c: Record<string, string>) => ({
            name: c.corp_name,
            corpCode: c.corp_code,
            stockCode: c.stock_code,
            market: c.stock_mkt,
          }));
          sources.push("DART Open API");
        }
      }
    } catch {
      // DART 실패 시 다음 단계로 — 오류 무시
    }
  }

  // 2순위: Yahoo Finance 비공식 API — 국내 ETF/종목 시세
  // KODEX/TIGER 섹터 ETF 심볼로 조회
  const krEtfSymbols = getKRSectorEtfSymbols(sectorName);
  if (krEtfSymbols.length > 0) {
    try {
      const symbolsParam = krEtfSymbols.join(",");
      const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsParam}&fields=shortName,regularMarketPrice,regularMarketChangePercent,fiftyTwoWeekHigh,fiftyTwoWeekLow,trailingPE,priceToBook`;
      const res = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        const quotes = json.quoteResponse?.result ?? [];
        if (quotes.length > 0) {
          data.krEtfQuotes = quotes.map((q: Record<string, unknown>) => ({
            symbol: q.symbol,
            name: q.shortName,
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent,
            pe: q.trailingPE,
            pb: q.priceToBook,
            high52w: q.fiftyTwoWeekHigh,
            low52w: q.fiftyTwoWeekLow,
          }));
          sources.push("Yahoo Finance (KR ETF)");
        }
      }
    } catch {
      // Yahoo Finance 실패 시 web search fallback
    }
  }

  return { sources, data };
}

// ── US 섹터 데이터 수집 ─────────────────────────────────────────────
// 1순위: financial-datasets 로컬 서버 (dev 환경에서만)
// 2순위: Alpha Vantage REST API
// 3순위: Yahoo Finance 비공식 API
async function collectUSData(
  sectorName: string
): Promise<{ sources: string[]; data: Record<string, unknown> }> {
  const sources: string[] = [];
  const data: Record<string, unknown> = {};

  // 1순위: financial-datasets 로컬 서버
  // /Users/mac/mcp-server/server.py 가 MCP stdio 서버로 실행 중일 때
  // HTTP 엔드포인트를 노출하지 않으므로 현재는 skip — 향후 HTTP 래퍼 추가 시 활성화
  // TODO: financial-datasets HTTP wrapper 구현 후 활성화

  // 2순위: Alpha Vantage — 섹터 ETF 성과 + 매크로 지표
  const avKey = process.env.ALPHA_VANTAGE_KEY;
  if (avKey) {
    try {
      // 섹터별 ETF 심볼로 시세 조회
      const etfSymbol = getUSSectorEtfSymbol(sectorName);
      if (etfSymbol) {
        const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${etfSymbol}&apikey=${avKey}`;
        const res = await fetch(avUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const json = await res.json();
          const quote = json["Global Quote"];
          if (quote && quote["05. price"]) {
            data.sectorEtf = {
              symbol: etfSymbol,
              price: quote["05. price"],
              changePercent: quote["10. change percent"],
              high: quote["03. high"],
              low: quote["04. low"],
              volume: quote["06. volume"],
            };
            sources.push(`Alpha Vantage (${etfSymbol})`);
          }
        }
      }

      // 매크로 지표: 연방기금금리
      try {
        const fedUrl = `https://www.alphavantage.co/query?function=FEDERAL_FUNDS_RATE&interval=monthly&apikey=${avKey}`;
        const fedRes = await fetch(fedUrl, { signal: AbortSignal.timeout(5000) });
        if (fedRes.ok) {
          const fedJson = await fedRes.json();
          const latest = fedJson.data?.[0];
          if (latest) {
            data.fedRate = { date: latest.date, value: latest.value };
            if (!sources.includes("Alpha Vantage (Macro)")) {
              sources.push("Alpha Vantage (Macro)");
            }
          }
        }
      } catch {
        // 매크로 실패 무시
      }
    } catch {
      // Alpha Vantage 실패 시 다음 단계로
    }
  }

  // 3순위: Yahoo Finance — US 섹터 ETF 상세
  const usEtfSymbols = getUSSectorEtfSymbols(sectorName);
  if (usEtfSymbols.length > 0 && sources.length === 0) {
    try {
      const symbolsParam = usEtfSymbols.join(",");
      const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolsParam}&fields=shortName,regularMarketPrice,regularMarketChangePercent,trailingPE,fiftyTwoWeekHigh,fiftyTwoWeekLow,marketCap`;
      const res = await fetch(yahooUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const json = await res.json();
        const quotes = json.quoteResponse?.result ?? [];
        if (quotes.length > 0) {
          data.usEtfQuotes = quotes.map((q: Record<string, unknown>) => ({
            symbol: q.symbol,
            name: q.shortName,
            price: q.regularMarketPrice,
            changePercent: q.regularMarketChangePercent,
            pe: q.trailingPE,
            high52w: q.fiftyTwoWeekHigh,
            low52w: q.fiftyTwoWeekLow,
          }));
          sources.push("Yahoo Finance (US ETF)");
        }
      }
    } catch {
      // Yahoo Finance 실패 — web search fallback
    }
  }

  return { sources, data };
}

// ── 메인 수집 함수 ──────────────────────────────────────────────────
// API Route에서 호출. 실패해도 빈 context 반환 → LLM 웹검색으로 보완
export async function collectSectorData(
  sectorName: string
): Promise<SectorDataContext> {
  const type = detectSectorType(sectorName);
  const allSources: string[] = [];
  const allData: Record<string, unknown> = {};

  try {
    if (type === "KR" || type === "BOTH") {
      const { sources, data } = await collectKRData(sectorName);
      allSources.push(...sources);
      if (Object.keys(data).length > 0) allData.kr = data;
    }

    if (type === "US" || type === "BOTH") {
      const { sources, data } = await collectUSData(sectorName);
      allSources.push(...sources);
      if (Object.keys(data).length > 0) allData.us = data;
    }
  } catch {
    // 수집 전체 실패해도 빈 context 반환 — LLM이 웹검색으로 보완
  }

  return {
    type,
    sources: allSources,
    rawData: allData,
  };
}

// ── ETF 심볼 매핑 ───────────────────────────────────────────────────
// 섹터명 → 대표 ETF 심볼 매핑 (주요 섹터만 커버)

function getKRSectorEtfSymbols(sectorName: string): string[] {
  const lower = sectorName.toLowerCase();
  if (lower.includes("반도체")) return ["091160.KS", "KODEX반도체.KS"];
  if (lower.includes("배터리") || lower.includes("2차전지")) return ["305720.KS", "KODEX2차전지산업.KS"];
  if (lower.includes("바이오") || lower.includes("제약")) return ["244580.KS", "KODEX바이오.KS"];
  if (lower.includes("조선")) return ["139230.KS"];
  if (lower.includes("방산")) return ["425040.KS"];
  if (lower.includes("금융") || lower.includes("은행")) return ["139270.KS"];
  if (lower.includes("에너지")) return ["117460.KS"];
  return [];
}

function getUSSectorEtfSymbol(sectorName: string): string | null {
  const lower = sectorName.toLowerCase();
  if (lower.includes("tech") || lower.includes("반도체") || lower.includes("semiconductor")) return "XLK";
  if (lower.includes("energy") || lower.includes("에너지")) return "XLE";
  if (lower.includes("financial") || lower.includes("금융") || lower.includes("fintech")) return "XLF";
  if (lower.includes("health") || lower.includes("biotech") || lower.includes("바이오")) return "XLV";
  if (lower.includes("consumer") || lower.includes("retail")) return "XLY";
  if (lower.includes("industrial") || lower.includes("defense") || lower.includes("방산")) return "XLI";
  if (lower.includes("cloud") || lower.includes("saas") || lower.includes("software")) return "IGV";
  if (lower.includes("ai") || lower.includes("artificial")) return "BOTZ";
  if (lower.includes("ev") || lower.includes("electric vehicle")) return "DRIV";
  return "SPY"; // 기본값: S&P500
}

function getUSSectorEtfSymbols(sectorName: string): string[] {
  const primary = getUSSectorEtfSymbol(sectorName);
  return primary ? [primary] : [];
}
