/**
 * POST /api/portfolio/education/positions/sell
 *
 * 보유 포지션에서 매도 처리:
 *   1. 포지션 수량에서 차감 (전량 매도 시 포지션 삭제)
 *   2. 거래내역에 SELL 기록 추가
 *
 * Body:
 *   positionId : string  — 매도할 포지션 id
 *   sellDate   : string  — 매도일 (YYYY-MM-DD)
 *   sellPrice  : number  — 매도단가 (원)
 *   quantity   : number  — 매도 수량 (부분 매도 지원)
 */

import { NextRequest, NextResponse } from "next/server";
import { readAccountData, writeAccountData, calcEducationSummary } from "@/lib/portfolio/educationData";
import type { EducationTrade } from "@/types/portfolio";

export async function POST(req: NextRequest) {
  try {
    const { positionId, sellDate, sellPrice, quantity, commission, tax } = await req.json() as {
      positionId: string;
      sellDate: string;
      sellPrice: number;
      quantity: number;
      commission?: number;
      tax?: number;
    };

    if (!positionId || !sellDate || sellPrice <= 0 || quantity <= 0) {
      return NextResponse.json({ error: "positionId, sellDate, sellPrice, quantity 필수 (sellPrice·quantity는 0 초과)" }, { status: 400 });
    }

    const data = await readAccountData();
    const posIdx = data.positions.findIndex((p) => p.id === positionId);
    if (posIdx === -1) {
      return NextResponse.json({ error: "포지션을 찾을 수 없습니다." }, { status: 404 });
    }

    const pos = data.positions[posIdx];
    if (quantity > pos.quantity) {
      return NextResponse.json({ error: `매도 수량(${quantity})이 보유 수량(${pos.quantity})을 초과합니다.` }, { status: 400 });
    }

    // 손익 계산 — 수수료 미반영 (longterm/pension과 동일 기준)
    // 수수료는 buyCommission/commission/tax 필드에 참조용으로만 저장
    const buyAmount  = pos.avgPrice * quantity;
    const sellAmount = sellPrice * quantity;
    // 부분 매도 시 매수 수수료 안분 — 참조용 저장
    const buyFeeRatio   = quantity / pos.quantity;
    const buyCommission = Math.round(((pos.commission ?? 0) + (pos.tax ?? 0)) * buyFeeRatio);
    const profitLoss    = Math.round(sellAmount - buyAmount);
    // 소수점 2자리 고정 (UI toFixed(2) 표시와 동일 정밀도)
    const profitLossPct = buyAmount > 0 ? Math.round((profitLoss / buyAmount) * 10000) / 100 : 0;

    // 보유 일수 계산
    let holdingDays = 0;
    if (pos.buyDate) {
      const d1 = new Date(pos.buyDate).getTime();
      const d2 = new Date(sellDate).getTime();
      holdingDays = Math.round((d2 - d1) / 86400000);
    }

    // 거래내역 추가 (fee-exclusive 기준으로 저장 — 수수료는 참조용만)
    const trade: EducationTrade = {
      id: crypto.randomUUID(),
      stockCode: pos.stockCode,
      stockName: pos.stockName,
      buyDate: pos.buyDate,
      buyPrice: pos.avgPrice,
      quantity,
      buyAmount,
      sellDate,
      sellPrice,
      sellAmount,
      ...(buyCommission > 0 ? { buyCommission } : {}),
      ...(commission ? { commission } : {}),
      ...(tax ? { tax } : {}),
      profitLoss,
      profitLossPct,
      holdingDays,
      sector: pos.sector,
      unit: pos.unit,
      result: profitLoss > 0 ? "Win" : "Lose",
    };
    data.trades.push(trade);

    // 포지션 수량 차감 or 삭제
    if (quantity === pos.quantity) {
      data.positions.splice(posIdx, 1);
    } else {
      data.positions[posIdx] = {
        ...pos,
        quantity: pos.quantity - quantity,
        currentPrice: 0,
        evalAmount: 0,
        profitLoss: 0,
        profitLossPct: 0,
      };
    }

    await writeAccountData(data);
    const summary = calcEducationSummary(data.trades);
    return NextResponse.json({ ok: true, trade, positions: data.positions, trades: data.trades, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
