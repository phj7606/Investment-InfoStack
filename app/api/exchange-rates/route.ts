/**
 * 실시간 환율 API
 *
 * GET /api/exchange-rates
 * → { usdKrw: number, cadKrw: number, fetchedAt: string }
 *
 * Yahoo Finance(KRW=X, CADKRW=X)에서 현재 환율을 조회한다.
 * 조회 실패 시 폴백 환율을 반환하므로 항상 200 응답.
 */

import { NextResponse } from "next/server";
import { fetchExchangeRates } from "@/lib/fetchers/exchange-rate";

export async function GET() {
  const rates = await fetchExchangeRates();
  return NextResponse.json(rates);
}
