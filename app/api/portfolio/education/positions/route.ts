/**
 * GET    /api/portfolio/education/positions       — 보유 포지션 목록 반환
 * POST   /api/portfolio/education/positions       — 새 포지션(매수) 추가
 * PUT    /api/portfolio/education/positions       — 포지션 편집 (body: 전체 필드)
 * DELETE /api/portfolio/education/positions?id=  — 포지션 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import { readAccountData, writeAccountData } from "@/lib/portfolio/educationData";
import type { EducationPosition } from "@/types/portfolio";

export async function GET() {
  const data = await readAccountData();
  return NextResponse.json({
    positions: data.positions,
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Omit<EducationPosition, "id">;
    if (!body.stockCode || !body.stockName) {
      return NextResponse.json({ error: "종목코드와 종목명은 필수입니다." }, { status: 400 });
    }

    const data = await readAccountData();

    // 같은 종목코드가 이미 있으면 추가 매수 (평균단가·수량·수수료 갱신)
    const existing = data.positions.find((p) => p.stockCode === body.stockCode);
    if (existing) {
      const totalQty  = existing.quantity + body.quantity;
      const totalCost = existing.avgPrice * existing.quantity + body.avgPrice * body.quantity;
      existing.quantity   = totalQty;
      existing.avgPrice   = Math.round(totalCost / totalQty);
      // 수수료·세금은 누적 합산 (전체 매수 비용 추적)
      existing.commission = (existing.commission ?? 0) + (body.commission ?? 0) || undefined;
      existing.tax        = (existing.tax ?? 0) + (body.tax ?? 0) || undefined;
      existing.currentPrice  = 0;
      existing.evalAmount    = 0;
      existing.profitLoss    = 0;
      existing.profitLossPct = 0;
    } else {
      const newPos: EducationPosition = {
        id: crypto.randomUUID(),
        ...body,
        currentPrice: 0,
        evalAmount: 0,
        profitLoss: 0,
        profitLossPct: 0,
      };
      data.positions.push(newPos);
    }

    await writeAccountData(data);
    return NextResponse.json({ ok: true, positions: data.positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as EducationPosition;
    if (!body.id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

    const data = await readAccountData();
    const idx = data.positions.findIndex((p) => p.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "포지션을 찾을 수 없습니다." }, { status: 404 });

    // 편집 시 현재가·평가손익은 초기화 (다음 조회 시 갱신)
    data.positions[idx] = {
      ...body,
      currentPrice: 0,
      evalAmount: 0,
      profitLoss: 0,
      profitLossPct: 0,
    };
    await writeAccountData(data);
    return NextResponse.json({ ok: true, positions: data.positions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });

  const data = await readAccountData();
  data.positions = data.positions.filter((p) => p.id !== id);
  await writeAccountData(data);
  return NextResponse.json({ ok: true });
}
