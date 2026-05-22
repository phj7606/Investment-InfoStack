/**
 * PUT    /api/portfolio/pension/transactions/[id] — 거래 수정
 * DELETE /api/portfolio/pension/transactions/[id] — 거래 삭제
 *
 * SELL 수정 시 realizedPL 재계산 (기존 거래 제외 후 계산)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readTransactions,
  updateTransaction,
  deleteTransaction,
} from "@/lib/portfolio/pension-store";
import { enrichSellTransaction } from "@/lib/portfolio/pension-calc";
import type { PensionTransaction } from "@/types/portfolio";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json() as PensionTransaction;

    const existing = await readTransactions();
    const idx = existing.findIndex((t) => t.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });
    }

    // SELL 수정 시: 본인 거래 제외한 이력 기준으로 realizedPL 재계산
    const withoutSelf = existing.filter((t) => t.id !== id);
    const updated = body.tradeType === "SELL"
      ? enrichSellTransaction({ ...body, id }, withoutSelf)
      : { ...body, id };

    await updateTransaction(id, updated);
    return NextResponse.json({ ok: true, transaction: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await readTransactions();
    if (!existing.find((t) => t.id === id)) {
      return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });
    }
    await deleteTransaction(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
