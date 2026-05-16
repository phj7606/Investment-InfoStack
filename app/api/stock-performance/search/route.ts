// 주가 성과 분석 — 종목 검색 API
// 티커 또는 기업명으로 종목을 검색하고 거래소 정보를 함께 반환
// 한국어 쿼리: 네이버 금융 자동완성 API 사용 (Yahoo Finance 불안정 문제 해결)
// 영문 쿼리: Yahoo Finance HTTP 검색 API 사용
// GET /api/stock-performance/search?q=삼성전자

import { NextRequest, NextResponse } from "next/server";
import { searchNaverFinanceTickers } from "@/lib/fetchers/krx";

export interface SearchSuggestion {
  /** 순수 티커 심볼 (.KS/.KQ 접미사 제거) */
  ticker: string;
  /** Yahoo Finance 내부 심볼 (한국: 005930.KS 형태) */
  yahooSymbol: string;
  /** 기업명 */
  name: string;
  /** 자동 감지된 거래소 */
  exchange: "KRX" | "NYSE" | "NASDAQ";
  /** 거래소 표시명 (예: "NasdaqGS", "NYSE", "KSE") */
  exchDisp?: string;
}

/** 한국어 문자(한글) 포함 여부 확인 — 네이버 금융 API 사용 결정에 사용 */
function containsKorean(text: string): boolean {
  return /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(text);
}

/** Yahoo Finance 검색 결과 단일 항목 */
interface YahooSearchQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchDisp?: string;
}

/**
 * Yahoo Finance 검색 API에 직접 HTTP 요청 (미국 주식 검색용)
 * Node.js 서버에서의 직접 요청은 Yahoo가 HTML을 반환할 수 있으므로
 * JSON 파싱 실패 시 빈 배열 반환
 */
async function fetchYahooSearch(query: string): Promise<YahooSearchQuote[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&lang=en`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const text = await res.text();
    // HTML 응답(차단됨)을 JSON으로 파싱하면 오류 → 빈 배열 반환
    let data: { finance?: { result?: Array<{ quotes?: YahooSearchQuote[] }> }; quotes?: YahooSearchQuote[] };
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }
    return data?.finance?.result?.[0]?.quotes ?? data?.quotes ?? [];
  } catch {
    return [];
  }
}

/**
 * Yahoo Finance exchDisp 필드와 심볼 접미사로 거래소를 감지
 * 감지 불가 시 null 반환 → 필터에서 제외
 */
function detectExchange(symbol: string, exchDisp?: string): "KRX" | "NYSE" | "NASDAQ" | null {
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ")) return "KRX";
  if (!exchDisp) return null;
  if (exchDisp.includes("Nasdaq") || exchDisp.includes("NASDAQ")) return "NASDAQ";
  if (exchDisp.includes("NYSE")) return "NYSE";
  return null;
}

/**
 * 네이버 금융 검색 결과를 SearchSuggestion 형식으로 변환
 */
async function searchKorean(query: string): Promise<SearchSuggestion[]> {
  const items = await searchNaverFinanceTickers(query);
  return items
    .map((item): SearchSuggestion => ({
      ticker: item.code,
      // Yahoo Finance 심볼 형식으로 변환 (.KS/.KQ 접미사 추가)
      yahooSymbol: `${item.code}.${item.market}`,
      name: item.name,
      exchange: "KRX",
      exchDisp: item.market === "KQ" ? "KOSDAQ" : "KRX",
    }))
    .slice(0, 6);
}

/**
 * Yahoo Finance 검색 결과를 SearchSuggestion 형식으로 변환 (미국 주식용)
 */
async function searchUS(query: string): Promise<SearchSuggestion[]> {
  const quotes = await fetchYahooSearch(query);
  return quotes
    .filter((quote) => {
      if (!quote.symbol) return false;
      // 한국 주식이 섞여 들어오면 제외 (미국 주식 검색에서는 불필요)
      if (quote.symbol.endsWith(".KS") || quote.symbol.endsWith(".KQ")) return false;
      // EQUITY와 ETF만 허용 — INDEX, MUTUALFUND 등은 제외
      const allowedTypes = ["EQUITY", "ETF"];
      if (quote.quoteType && !allowedTypes.includes(quote.quoteType)) return false;
      return true;
    })
    .map((quote): SearchSuggestion | null => {
      const exchange = detectExchange(quote.symbol, quote.exchDisp);
      if (!exchange || exchange === "KRX") return null;
      const name = quote.shortname ?? quote.symbol;
      return {
        ticker: quote.symbol,
        yahooSymbol: quote.symbol,
        name,
        exchange,
        exchDisp: quote.exchDisp,
      };
    })
    .filter((s): s is SearchSuggestion => s !== null)
    .filter((s, idx, arr) => arr.findIndex((x) => x.ticker === s.ticker) === idx)
    .slice(0, 6);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 1) {
    return NextResponse.json([]);
  }

  try {
    // 한국어 포함 쿼리 → 네이버 금융 API로 KRX 종목 검색
    // 영문 쿼리 → Yahoo Finance로 미국 주식 검색
    const suggestions = containsKorean(q)
      ? await searchKorean(q)
      : await searchUS(q);

    return NextResponse.json(suggestions);
  } catch (err) {
    console.error("[stock-performance/search] 검색 오류:", err);
    return NextResponse.json([]);
  }
}
