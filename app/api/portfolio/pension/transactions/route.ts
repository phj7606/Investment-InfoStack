/**
 * GET  /api/portfolio/pension/transactions — 거래 목록 조회
 * POST /api/portfolio/pension/transactions — 거래 추가 (SELL 시 realizedPL 자동 계산)
 *
 * Query params (GET):
 *   ?account=RETIREMENT|SAVINGS|IRP  — 계좌 필터
 *   ?type=BUY|SELL|DIVIDEND          — 거래유형 필터
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readTransactions,
  addTransaction,
} from "@/lib/portfolio/pension-store";
import { enrichSellTransaction, enrichTransactionsFromHistory } from "@/lib/portfolio/pension-calc";
import type { PensionTransaction, PensionAccountType } from "@/types/portfolio";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const account = searchParams.get("account") as PensionAccountType | null;
  const type    = searchParams.get("type");

  let txs = await readTransactions();

  // BUY 수정 등으로 인한 stale realizedPL을 항상 히스토리 기준으로 재계산
  txs = enrichTransactionsFromHistory(txs);

  if (account) txs = txs.filter((t) => t.accountType === account);
  if (type)    txs = txs.filter((t) => t.tradeType === type);

  // 날짜 내림차순 반환
  txs.sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ transactions: txs, count: txs.length });
}

export async function POST(req: NextRequest) {
  try {
    let body = await req.json() as Omit<PensionTransaction, "id">;

    // 필수 필드 검증
    if (!body.accountType || !body.tradeType) {
      return NextResponse.json({ error: "accountType, tradeType 필수" }, { status: 400 });
    }
    if (!body.stockCode || !body.stockName) {
      return NextResponse.json({ error: "종목코드와 종목명은 필수입니다." }, { status: 400 });
    }

    const existing = await readTransactions();

    // 중복 거래 방지 (DIVIDEND는 amount 기준, BUY/SELL은 날짜+종목+수량+단가 기준)
    const isDuplicate = existing.some((t) => {
      if (body.tradeType === "DIVIDEND") {
        return t.stockCode === body.stockCode &&
               t.accountType === body.accountType &&
               t.tradeType === "DIVIDEND" &&
               t.amount === body.amount;
      }
      return t.date === body.date &&
             t.stockCode === body.stockCode &&
             t.accountType === body.accountType &&
             t.tradeType === body.tradeType &&
             t.quantity === body.quantity &&
             t.price === body.price;
    });

    if (isDuplicate) {
      return NextResponse.json({ id: null, duplicate: true }, { status: 200 });
    }

    // SELL 거래: realizedPL 자동 계산
    const withId = { ...body, id: crypto.randomUUID() } as PensionTransaction;
    const tx = body.tradeType === "SELL"
      ? enrichSellTransaction(withId, existing)
      : withId;

    await addTransaction(tx);
    return NextResponse.json({ ok: true, transaction: tx }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
