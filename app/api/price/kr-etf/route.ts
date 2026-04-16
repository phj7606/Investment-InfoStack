// GET /api/price/kr-etf?symbols=069500,229200,133690
// 한국 ETF 현재가 스냅샷 반환 (Yahoo Finance .KS/.KQ 경유)
// KRX 6자리 심볼을 Yahoo Finance 형식으로 변환하여 조회

import { NextRequest } from "next/server";
import { fetchYahooQuotes, toYahooKrSymbol } from "@/lib/fetchers/yahoo";
import { readCache, writeCache } from "@/lib/cache";
import type { YahooQuote } from "@/lib/fetchers/yahoo";
import params from "@/config/params.json";
import krEtfTickers from "@/config/tickers_kr_etf.json";
import krEtfForeignTickers from "@/config/tickers_kr_etf_foreign.json";

// 모든 한국 ETF 티커 심볼 → exchange 매핑 (KS/KQ 구분)
const exchangeMap = new Map<string, "KS" | "KQ">();
[...krEtfTickers, ...krEtfForeignTickers].forEach((t) => {
  exchangeMap.set(t.symbol, (t.exchange as "KS" | "KQ") ?? "KS");
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return Response.json(
      { error: "symbols 파라미터가 필요합니다. 예: ?symbols=069500,229200" },
      { status: 400 }
    );
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    return Response.json(
      { error: "유효한 심볼이 없습니다" },
      { status: 400 }
    );
  }

  const cacheKey = `price-kr-etf-${symbols.sort().join("-")}`;

  const cached = await readCache<YahooQuote[]>(cacheKey);
  if (cached) {
    return Response.json({ data: cached, source: "cache" });
  }

  // KRX 심볼 → Yahoo Finance 형식으로 변환 (예: "069500" → "069500.KS")
  const yahooSymbols = symbols.map((symbol) => {
    const exchange = exchangeMap.get(symbol) ?? "KS";
    return toYahooKrSymbol(symbol, exchange);
  });

  const rawData = await fetchYahooQuotes(yahooSymbols);

  // Yahoo Finance 심볼(069500.KS)을 KRX 원본 심볼(069500)로 역변환
  const data = rawData.map((q) => ({
    ...q,
    symbol: q.symbol.replace(/\.(KS|KQ)$/, ""),
  }));

  await writeCache(cacheKey, data, params.cache.priceTTLSeconds);

  return Response.json({ data, source: "api" });
}
