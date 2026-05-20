/**
 * GET  /api/portfolio/shortterm/backup  — JSON 백업 파일 다운로드
 * POST /api/portfolio/shortterm/backup  — JSON 파일로 데이터 복원
 *
 * GET 응답:
 *   - Content-Disposition: attachment 헤더로 브라우저 다운로드 유도
 *   - 파일명: shortterm-backup-YYYY-MM-DD.json
 *   - 본문: { version, exportedAt, positionCount, tradeCount, positions, trades }
 *
 * POST 요청:
 *   - body: { positions, trades, mode: "overwrite" | "merge" }
 *   - overwrite: 현재 데이터를 완전히 교체
 *   - merge: 기존 데이터 유지 + 중복 제외한 신규 건만 추가
 *     거래 중복 기준: buyDate + sellDate + stockCode + quantity
 *     포지션 중복 기준: stockCode (이미 보유 중이면 건너뜀)
 */

import { NextRequest, NextResponse } from "next/server";
import { readAccountData, writeAccountData } from "@/lib/portfolio/shorttermData";
import type { EducationPosition, EducationTrade } from "@/types/portfolio";

// ─────────────────────────────────────────
// GET — 백업 파일 다운로드
// ─────────────────────────────────────────

export async function GET() {
  try {
    const data = await readAccountData();
    const today = new Date().toISOString().slice(0, 10);

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      positionCount: data.positions.length,
      tradeCount: data.trades.length,
      positions: data.positions,
      trades: data.trades,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="shortterm-backup-${today}.json"`,
      },
    });
  } catch (err) {
    console.error("[shortterm/backup GET]", err);
    return NextResponse.json({ error: "백업 파일 생성 실패" }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// POST — 백업 파일로 복원
// ─────────────────────────────────────────

interface RestoreBody {
  positions: EducationPosition[];
  trades: EducationTrade[];
  mode: "overwrite" | "merge";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RestoreBody;

    if (!Array.isArray(body.positions) || !Array.isArray(body.trades)) {
      return NextResponse.json(
        { error: "positions, trades 배열이 필요합니다." },
        { status: 400 }
      );
    }
    if (body.mode !== "overwrite" && body.mode !== "merge") {
      return NextResponse.json(
        { error: "mode는 'overwrite' 또는 'merge'여야 합니다." },
        { status: 400 }
      );
    }

    if (body.mode === "overwrite") {
      await writeAccountData({ positions: body.positions, trades: body.trades });
      return NextResponse.json({
        ok: true,
        restoredPositions: body.positions.length,
        restoredTrades: body.trades.length,
        skippedPositions: 0,
        skippedTrades: 0,
      });
    }

    // ── merge 모드 ─────────────────────────────────
    const current = await readAccountData();

    // 포지션 중복 기준: stockCode
    const existingCodes = new Set(current.positions.map((p) => p.stockCode));
    const newPositions: EducationPosition[] = [];
    let skippedPositions = 0;
    for (const p of body.positions) {
      if (existingCodes.has(p.stockCode)) {
        skippedPositions++;
      } else {
        newPositions.push(p);
        existingCodes.add(p.stockCode);
      }
    }

    // 거래 중복 기준: buyDate + sellDate + stockCode + quantity
    const existingTradeKeys = new Set(
      current.trades.map((t) => `${t.buyDate}::${t.sellDate}::${t.stockCode}::${t.quantity}`)
    );
    const newTrades: EducationTrade[] = [];
    let skippedTrades = 0;
    for (const t of body.trades) {
      const key = `${t.buyDate}::${t.sellDate}::${t.stockCode}::${t.quantity}`;
      if (existingTradeKeys.has(key)) {
        skippedTrades++;
      } else {
        newTrades.push(t);
        existingTradeKeys.add(key);
      }
    }

    await writeAccountData({
      positions: [...current.positions, ...newPositions],
      trades: [...current.trades, ...newTrades],
    });

    return NextResponse.json({
      ok: true,
      restoredPositions: newPositions.length,
      restoredTrades: newTrades.length,
      skippedPositions,
      skippedTrades,
    });
  } catch (err) {
    console.error("[shortterm/backup POST]", err);
    return NextResponse.json({ error: "복원 실패" }, { status: 500 });
  }
}
