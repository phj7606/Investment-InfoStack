/**
 * PUT    /api/portfolio/shortterm/transactions/[id]  — 거래 수정
 * DELETE /api/portfolio/shortterm/transactions/[id]  — 거래 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions, updateTransaction, deleteTransaction } from "@/lib/portfolio/shorttermData";
import { enrichSellTransaction, enrichTransactionsFromHistory } from "@/lib/portfolio/longterm-calc";
import type { LongtermTransaction } from "@/types/portfolio";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Omit<LongtermTransaction, "id">;
    let tx: LongtermTransaction = { ...body, id };

    // SELL 거래인 경우 realizedPL 재계산 (자신 제외)
    if (tx.tradeType === "SELL") {
      const existing = (await readTransactions()).filter((t) => t.id !== id);
      tx = enrichSellTransaction(tx, existing);
    }

    await updateTransaction(tx);

    // BUY 수정 시 같은 종목+계좌의 이후 SELL 저장값도 연쇄 업데이트
    if (tx.tradeType === "BUY") {
      const allTxs  = await readTransactions();
      const groupKey = `${tx.stockCode}::${tx.accountNo}`;
      const group    = allTxs.filter((t) => `${t.stockCode}::${t.accountNo}` === groupKey);
      const enriched = enrichTransactionsFromHistory(group);
      for (const enrichedTx of enriched) {
        if (enrichedTx.tradeType !== "SELL" || enrichedTx.id === id) continue;
        const orig = allTxs.find((t) => t.id === enrichedTx.id);
        if (!orig) continue;
        if (orig.realizedPL !== enrichedTx.realizedPL ||
            orig.avgCostAtSell !== enrichedTx.avgCostAtSell) {
          await updateTransaction(enrichedTx);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[shortterm/transactions PUT]", err);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteTransaction(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[shortterm/transactions DELETE]", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
