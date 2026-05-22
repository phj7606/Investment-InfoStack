/**
 * PUT    /api/portfolio/longterm/transactions/[id]  — 거래 수정
 * DELETE /api/portfolio/longterm/transactions/[id]  — 거래 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteTransaction, updateTransaction, readTransactions } from "@/lib/portfolio/longterm-store";
import { enrichSellTransaction } from "@/lib/portfolio/longterm-calc";
import type { LongtermTransaction } from "@/types/portfolio";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Omit<LongtermTransaction, "id">;
    let tx: LongtermTransaction = { ...body, id };

    // SELL 거래인 경우 realizedPL 재계산 (기존 거래에서 자신 제외한 상태로 계산)
    if (tx.tradeType === "SELL") {
      const existing = (await readTransactions()).filter((t) => t.id !== id);
      tx = enrichSellTransaction(tx, existing);
    }

    await updateTransaction(tx);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[longterm/transactions PUT]", err);
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
    console.error("[longterm/transactions DELETE]", err);
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
