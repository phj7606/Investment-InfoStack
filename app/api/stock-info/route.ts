/**
 * GET /api/stock-info?code=016360&market=KR
 *
 * 종목코드로 공식 종목명을 조회 — TransactionForm 자동완성용
 * - KR: Naver Finance basic API (stockName 필드)
 * - US: Yahoo Finance v7 quote API (shortName 필드)
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchNaverPriceAndName } from "@/lib/fetchers/naver";

export async function GET(req: NextRequest) {
  const code   = req.nextUrl.searchParams.get("code")?.trim().toUpperCase();
  const market = req.nextUrl.searchParams.get("market") as "KR" | "US" | null;

  if (!code || !market) return NextResponse.json({ name: null });

  try {
    if (market === "KR") {
      const { name } = await fetchNaverPriceAndName(code);
      return NextResponse.json({ name });
    }

    // US: Yahoo Finance v7 — shortName / longName
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${code}&fields=shortName,longName`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ name: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any;
    const quote = data?.quoteResponse?.result?.[0];
    const name: string | null = quote?.shortName ?? quote?.longName ?? null;
    return NextResponse.json({ name });
  } catch {
    return NextResponse.json({ name: null });
  }
}
