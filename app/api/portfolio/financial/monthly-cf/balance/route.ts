/**
 * Monthly CF 계좌잔액 API
 *
 * GET  /api/portfolio/financial/monthly-cf/balance
 *   → { balances: MonthlyCFBalance }  전체 월별 잔액 맵 반환
 *
 * PUT  /api/portfolio/financial/monthly-cf/balance
 *   body: { month: "2026-01", amount: 5000000 }
 *   → 해당 월 opening balance upsert 후 전체 반환
 *
 * DELETE /api/portfolio/financial/monthly-cf/balance?month=2026-01
 *   → 해당 월 잔액 삭제 (이후 자동계산으로 복귀)
 */

import { NextRequest, NextResponse } from "next/server";
import type { MonthlyCFBalance } from "@/types/financial";
import { readKey, writeKey } from "@/lib/db";

const DATA_KEY = "monthly_cf_balance";

async function readBalances(): Promise<MonthlyCFBalance> {
  return readKey<MonthlyCFBalance>(DATA_KEY, {});
}

async function writeBalances(balances: MonthlyCFBalance): Promise<void> {
  await writeKey(DATA_KEY, balances);
}

// GET — 전체 잔액 맵 조회
export async function GET() {
  const balances = await readBalances();
  return NextResponse.json({ balances });
}

// PUT — 특정 월 잔액 upsert
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as { month: string; amount: number };

  if (!body.month || typeof body.amount !== "number" || isNaN(body.amount)) {
    return NextResponse.json(
      { error: "month (string), amount (number) 필수" },
      { status: 400 }
    );
  }

  const balances = await readBalances();
  balances[body.month] = body.amount;
  await writeBalances(balances);

  return NextResponse.json({ balances });
}

// DELETE — 특정 월 잔액 제거 (자동계산으로 복귀)
export async function DELETE(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "month 파라미터 필요" }, { status: 400 });
  }

  const balances = await readBalances();
  delete balances[month];
  await writeBalances(balances);

  return NextResponse.json({ balances });
}
