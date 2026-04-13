// GET /api/etf/history?symbol=069500&market=kr&days=252
// ETF 가격 시계열(OHLCV) 반환 — EtfDetailSheet 가격 차트에서 클라이언트 fetch 사용
//
// 캐시: historicalTTLSeconds (24시간) — 당일 데이터는 하루 1회 갱신으로 충분

import { NextRequest } from "next/server";
import { fetchYahooHistory, toYahooKrSymbol } from "@/lib/fetchers/yahoo";
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import krTickers from "@/config/tickers_kr_etf.json";

interface TickerEntry { symbol: string; exchange?: string; }

// KRX 심볼 → exchange 매핑 (KS/KQ 구분)
const krExchangeMap = new Map<string, "KS" | "KQ">();
(krTickers as TickerEntry[]).forEach((t) => {
  krExchangeMap.set(t.symbol, (t.exchange as "KS" | "KQ") ?? "KS");
});

/** 가격 바 단일 포인트 (종가 + 거래량만 반환 — 차트에 필요한 최소 필드) */
export interface PriceBar {
  date: string;
  close: number;
  volume: number;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const market = searchParams.get("market") as "kr" | "us" | null;
  const days = Math.min(parseInt(searchParams.get("days") ?? "252", 10), 756);

  if (!symbol || !market) {
    return Response.json(
      { error: "symbol, market 파라미터가 필요합니다. 예: ?symbol=069500&market=kr" },
      { status: 400 }
    );
  }

  const cacheKey = `etf-history-${market}-${symbol}-${days}`;
  const cached = await readCache<PriceBar[]>(cacheKey);
  if (cached) {
    return Response.json({ symbol, market, bars: cached, source: "cache" });
  }

  // 거래일 기준 days개를 확보하기 위해 달력일 기준 1.5배 기간 수집 (공휴일 여유)
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - Math.ceil(days * 1.5));

  // 한국 ETF: KRX 6자리 심볼 → Yahoo Finance 형식 변환
  const yahooSymbol =
    market === "kr"
      ? toYahooKrSymbol(symbol, krExchangeMap.get(symbol) ?? "KS")
      : symbol;

  const rawBars = await fetchYahooHistory(yahooSymbol, startDate);

  // 최근 days개 거래일만 잘라서 반환
  const bars: PriceBar[] = rawBars
    .slice(-days)
    .map((b) => ({ date: b.date, close: b.close, volume: b.volume }));

  await writeCache(cacheKey, bars, params.cache.historicalTTLSeconds);

  return Response.json({ symbol, market, bars, source: "api" });
}
