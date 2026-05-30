/**
 * GET  /api/portfolio/longterm/transactions  — 거래 목록 조회
 * POST /api/portfolio/longterm/transactions  — 거래 추가
 *
 * 쿼리 파라미터 (GET):
 *   account?: "4802" | "1635" | "1402"  — 계좌 필터
 *   market?:  "KR" | "US"               — 시장 필터
 *   type?:    "STOCK" | "FUND" | "ETF"  — 종류 필터
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  readTransactions,
  addTransaction,
} from "@/lib/portfolio/longterm-store";
import { enrichSellTransaction, enrichTransactionsFromHistory } from "@/lib/portfolio/longterm-calc";
import type { LongtermTransaction } from "@/types/portfolio";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get("account");
    const market = searchParams.get("market") as "KR" | "US" | null;
    const type = searchParams.get("type") as "STOCK" | "FUND" | "ETF" | null;

    let txs = await readTransactions();

    // BUY 수정 등으로 인한 stale realizedPL을 항상 히스토리 기준으로 재계산
    txs = enrichTransactionsFromHistory(txs);

    if (account) txs = txs.filter((t) => t.accountNo === account);
    if (market) txs = txs.filter((t) => t.market === market);
    if (type) txs = txs.filter((t) => t.assetType === type);

    // 날짜 내림차순 정렬
    txs.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json(txs);
  } catch (err) {
    console.error("[longterm/transactions GET]", err);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Omit<LongtermTransaction, "id">;

    // id 자동 생성
    let tx: LongtermTransaction = { ...body, id: randomUUID() };

    const existing = await readTransactions();

    // 서버사이드 중복 방지 — 클라이언트 dedup이 실패해도 이중 저장을 막음
    // 키: date::stockCode::accountNo::tradeType::quantity::price
    // DIVIDEND는 amount로 구분 (price=0 이라 유일성 부족)
    const isDuplicate = existing.some((t) => {
      if (t.tradeType === "DIVIDEND" && tx.tradeType === "DIVIDEND") {
        return t.stockCode === tx.stockCode && t.accountNo === tx.accountNo && t.amount === tx.amount;
      }
      return (
        t.date === tx.date &&
        t.stockCode === tx.stockCode &&
        t.accountNo === tx.accountNo &&
        t.tradeType === tx.tradeType &&
        t.quantity === tx.quantity &&
        t.price === tx.price
      );
    });
    if (isDuplicate) {
      return NextResponse.json({ id: null, duplicate: true }, { status: 200 });
    }

    // SELL 거래인 경우 realizedPL 자동 계산
    if (tx.tradeType === "SELL") {
      tx = enrichSellTransaction(tx, existing);
    }

    await addTransaction(tx);
    return NextResponse.json({ id: tx.id }, { status: 201 });
  } catch (err) {
    console.error("[longterm/transactions POST]", err);
    return NextResponse.json({ error: "추가 실패" }, { status: 500 });
  }
}
