/**
 * GET  /api/portfolio/longterm/backup  — JSON 백업 파일 다운로드
 * POST /api/portfolio/longterm/backup  — JSON 파일로 거래내역 복원
 *
 * GET 응답:
 *   - Content-Disposition: attachment 헤더로 브라우저 다운로드 유도
 *   - 파일명: longterm-backup-YYYY-MM-DD.json
 *   - 본문: { version, exportedAt, count, transactions }
 *
 * POST 요청:
 *   - body: { transactions: LongtermTransaction[], mode: "overwrite" | "merge" }
 *   - overwrite: 현재 데이터를 완전히 교체
 *   - merge: 기존 거래 유지 + 중복 제외한 신규 건만 추가
 *     중복 기준: date + stockCode + tradeType + quantity + price 복합키
 *   - 응답: { ok, restored, skipped }
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions, writeTransactions } from "@/lib/portfolio/longterm-store";
import type { LongtermTransaction } from "@/types/portfolio";

// ─────────────────────────────────────────
// GET — 백업 파일 다운로드
// ─────────────────────────────────────────

export async function GET() {
  try {
    const transactions = await readTransactions();
    const today = new Date().toISOString().slice(0, 10);

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: transactions.length,
      transactions,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 브라우저가 파일로 저장하도록 attachment 지정
        "Content-Disposition": `attachment; filename="longterm-backup-${today}.json"`,
      },
    });
  } catch (err) {
    console.error("[backup GET]", err);
    return NextResponse.json({ error: "백업 파일 생성 실패" }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// POST — 백업 파일로 복원
// ─────────────────────────────────────────

interface RestoreBody {
  transactions: LongtermTransaction[];
  mode: "overwrite" | "merge";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RestoreBody;

    if (!Array.isArray(body.transactions) || body.transactions.length === 0) {
      return NextResponse.json({ error: "transactions 배열이 비어 있습니다." }, { status: 400 });
    }
    if (body.mode !== "overwrite" && body.mode !== "merge") {
      return NextResponse.json({ error: "mode는 'overwrite' 또는 'merge'여야 합니다." }, { status: 400 });
    }

    if (body.mode === "overwrite") {
      // 현재 데이터를 완전히 교체
      await writeTransactions(body.transactions);
      return NextResponse.json({ ok: true, restored: body.transactions.length, skipped: 0 });
    }

    // merge 모드: 기존 거래는 유지하고 중복이 아닌 신규 건만 추가
    // 중복 판단 기준: date + stockCode + tradeType + quantity + price
    const existing = await readTransactions();
    const existingKeys = new Set(
      existing.map((t) => `${t.date}::${t.stockCode}::${t.tradeType}::${t.quantity}::${t.price}`)
    );

    const toAdd: LongtermTransaction[] = [];
    let skipped = 0;

    for (const tx of body.transactions) {
      const key = `${tx.date}::${tx.stockCode}::${tx.tradeType}::${tx.quantity}::${tx.price}`;
      if (existingKeys.has(key)) {
        skipped++;
      } else {
        toAdd.push(tx);
        existingKeys.add(key); // 같은 파일 내 중복 방지
      }
    }

    if (toAdd.length > 0) {
      await writeTransactions([...existing, ...toAdd]);
    }

    return NextResponse.json({ ok: true, restored: toAdd.length, skipped });
  } catch (err) {
    console.error("[backup POST]", err);
    return NextResponse.json({ error: "복원 실패" }, { status: 500 });
  }
}
