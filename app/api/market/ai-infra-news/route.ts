// GET /api/market/ai-infra-news
// AI 인프라 투자 관련 뉴스 집계
// 2개 소스를 병렬 수집 후 날짜 역순으로 통합:
//   1. Alpha Vantage NEWS_SENTIMENT — Neocloud + 하이퍼스케일러 종목 특화 + 감성 점수
//   2. Yahoo Finance Search API — "neocloud hyperscaler AI infrastructure" 키워드 검색

import { NextRequest } from "next/server";
import type { AiInfraNewsItem } from "@/types/market-analysis";

export const dynamic = "force-dynamic";

const AV_BASE = "https://www.alphavantage.co/query";
// Neocloud 3사 + 주요 하이퍼스케일러
const AV_TICKERS = "CRWV,NBIS,IREN,AMZN,MSFT,GOOGL,META";
const YAHOO_SEARCH_BASE = "https://query1.finance.yahoo.com/v1/finance/search";

// ── Alpha Vantage NEWS_SENTIMENT ────────────────────────────────────────────
async function fetchAlphaVantageNews(): Promise<AiInfraNewsItem[]> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) {
    console.warn("[ai-infra-news] ALPHA_VANTAGE_KEY 미설정 — Alpha Vantage 뉴스 스킵");
    return [];
  }

  const url =
    `${AV_BASE}?function=NEWS_SENTIMENT` +
    `&tickers=${AV_TICKERS}` +
    `&topics=technology,ipo` +
    `&limit=30` +
    `&sort=LATEST` +
    `&apikey=${apiKey}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    // 뉴스는 10분 캐시 (자주 갱신)
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);

  const json = await res.json();

  // API 제한 또는 에러 응답 처리
  if (json.Information || json["Error Message"]) {
    console.warn("[ai-infra-news] Alpha Vantage 제한:", json.Information ?? json["Error Message"]);
    return [];
  }

  const feed: Array<{
    title: string;
    url: string;
    time_published: string; // "20250511T120000"
    summary?: string;
    source: string;
    overall_sentiment_label?: string;
    ticker_sentiment?: Array<{
      ticker: string;
      ticker_sentiment_label?: string;
    }>;
  }> = json.feed ?? [];

  return feed.map((item, i) => {
    // "20250511T120000" → Unix timestamp
    const publishedAt = parseAvTime(item.time_published);

    // 관련 종목 추출 (AV_TICKERS 내 종목만 포함)
    const relatedTickers =
      item.ticker_sentiment
        ?.map((t) => t.ticker)
        .filter((t) => AV_TICKERS.split(",").includes(t)) ?? [];

    // 감성: overall_sentiment_label 사용
    const sentiment = normalizeSentiment(item.overall_sentiment_label);

    return {
      id: `av-${i}-${publishedAt}`,
      title: item.title,
      publisher: item.source,
      link: item.url,
      publishedAt,
      summary: item.summary,
      relatedTickers,
      sentiment,
      source: "alphavantage" as const,
    };
  });
}

// ── Yahoo Finance Search API ─────────────────────────────────────────────────
async function fetchYahooNews(query: string): Promise<AiInfraNewsItem[]> {
  const params = new URLSearchParams({
    q: query,
    newsCount: "25",
    quotesCount: "0",
    enableFuzzyQuery: "false",
    enableCbs: "true",
    enableNavLinks: "false",
  });

  const url = `${YAHOO_SEARCH_BASE}?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      // Yahoo Finance는 브라우저 User-Agent를 요구하는 경우가 있음
      "User-Agent":
        "Mozilla/5.0 (compatible; InvestmentInfoStack/1.0; +https://github.com/investment-infostack)",
    },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 600 },
  });
  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`);

  const json = await res.json();

  const news: Array<{
    uuid?: string;
    title?: string;
    publisher?: string;
    link?: string;
    providerPublishTime?: number;
    relatedTickers?: string[];
  }> = json.news ?? [];

  return news
    .filter((item) => item.title && item.link)
    .map((item, i) => ({
      id: item.uuid ?? `yahoo-${i}`,
      title: item.title ?? "",
      publisher: item.publisher ?? "Yahoo Finance",
      link: item.link ?? "",
      publishedAt: item.providerPublishTime ?? 0,
      relatedTickers: item.relatedTickers,
      source: "yahoo" as const,
    }));
}

// ── 유틸리티 ─────────────────────────────────────────────────────────────────

/** Alpha Vantage 시간 포맷 "20250511T120000" → Unix timestamp (초) */
function parseAvTime(str: string): number {
  // "20250511T120000" → "2025-05-11T12:00:00Z"
  const formatted = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(9, 11)}:${str.slice(11, 13)}:${str.slice(13, 15)}Z`;
  const ms = Date.parse(formatted);
  return isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/** Alpha Vantage 감성 레이블 → 표준 타입 */
function normalizeSentiment(
  label?: string
): "Bullish" | "Bearish" | "Neutral" | undefined {
  if (!label) return undefined;
  const l = label.toLowerCase();
  if (l.includes("bullish")) return "Bullish";
  if (l.includes("bearish")) return "Bearish";
  return "Neutral";
}

// ── Route Handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // 커스텀 키워드 검색 지원 (기본값: AI 인프라 투자 관련)
  const query =
    searchParams.get("q") ?? "neocloud hyperscaler AI infrastructure capex investment";

  // 2개 소스 병렬 수집
  const [avRes, yahooRes] = await Promise.allSettled([
    fetchAlphaVantageNews(),
    fetchYahooNews(query),
  ]);

  const avNews = avRes.status === "fulfilled" ? avRes.value : [];
  const yahooNews = yahooRes.status === "fulfilled" ? yahooRes.value : [];

  // 통합 + 중복 제거 (제목 기준) + 날짜 역순 정렬
  const seen = new Set<string>();
  const combined: AiInfraNewsItem[] = [];

  for (const item of [...avNews, ...yahooNews]) {
    // 제목 앞 40자를 키로 사용해 유사 중복 제거
    const key = item.title.slice(0, 40).toLowerCase().trim();
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(item);
    }
  }

  // 최신 기사 우선
  combined.sort((a, b) => b.publishedAt - a.publishedAt);

  return Response.json({
    data: combined.slice(0, 50),
    meta: {
      total: combined.length,
      sources: {
        alphavantage: avNews.length,
        yahoo: yahooNews.length,
      },
    },
  });
}
