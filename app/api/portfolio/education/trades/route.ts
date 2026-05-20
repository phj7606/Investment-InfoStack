/**
 * GET    /api/portfolio/education/trades         — 거래내역 + 성과 요약 반환
 * POST   /api/portfolio/education/trades         — 거래 직접 추가
 * PUT    /api/portfolio/education/trades         — 거래 편집 (P&L 재계산)
 * DELETE /api/portfolio/education/trades?id=...  — 거래 삭제
 *
 * 매도 처리(포지션 → 거래내역 이동)는 별도 라우트:
 *   POST /api/portfolio/education/positions/sell
 */

import { NextRequest, NextResponse } from "next/server";
import { readAccountData, writeAccountData, calcEducationSummary } from "@/lib/portfolio/educationData";
import type { EducationTrade } from "@/types/portfolio";

export async function GET() {
  const data = await readAccountData();
  const summary = calcEducationSummary(data.trades);
  return NextResponse.json({
    trades: data.trades,
    summary,
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<EducationTrade, "id">;
    if (!body.stockCode || !body.stockName || !body.sellDate) {
      return NextResponse.json({ error: "종목코드, 종목명, 매도일은 필수입니다." }, { status: 400 });
    }

    const data = await readAccountData();
    const newTrade: EducationTrade = {
      id: crypto.randomUUID(),
      ...body,
    };
    data.trades.push(newTrade);
    await writeAccountData(data);

    const summary = calcEducationSummary(data.trades);
    return NextResponse.json({ ok: true, trades: data.trades, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as EducationTrade;
    if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

    // P&L·보유일수·결과 재계산
    const buyAmount  = body.buyPrice * body.quantity;
    const sellAmount = body.sellPrice * body.quantity;
    const fees       = (body.commission ?? 0) + (body.tax ?? 0);
    const profitLoss = Math.round(sellAmount - buyAmount - fees);
    const profitLossPct = buyAmount > 0
      ? Math.round((profitLoss / buyAmount) * 10000) / 100 : 0;
    let holdingDays = 0;
    if (body.buyDate && body.sellDate) {
      holdingDays = Math.round(
        (new Date(body.sellDate).getTime() - new Date(body.buyDate).getTime()) / 86400000
      );
    }

    const data = await readAccountData();
    const idx = data.trades.findIndex((t) => t.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "거래를 찾을 수 없습니다." }, { status: 404 });

    data.trades[idx] = {
      ...body,
      buyAmount,
      sellAmount,
      profitLoss,
      profitLossPct,
      holdingDays: Math.max(0, holdingDays),
      result: profitLoss > 0 ? "Win" : "Lose",
    };
    await writeAccountData(data);

    const summary = calcEducationSummary(data.trades);
    return NextResponse.json({ ok: true, trades: data.trades, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

  const data = await readAccountData();
  data.trades = data.trades.filter((t) => t.id !== id);
  await writeAccountData(data);
  return NextResponse.json({ ok: true });
}
