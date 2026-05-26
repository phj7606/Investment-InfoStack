/**
 * GET  /api/portfolio/education/lt-backup  — JSON 백업 파일 다운로드
 * POST /api/portfolio/education/lt-backup  — JSON 파일로 거래내역 복원
 *
 * Longterm backup 패턴 동일 — LongtermTransaction[] 형식
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions, writeTransactions } from "@/lib/portfolio/educationTransactionsData";
import type { LongtermTransaction } from "@/types/portfolio";

// ─────────────────────────────────────────
// GET — 백업 파일 다운로드
// ─────────────────────────────────────────

export async function GET() {
  try {
    const transactions = await readTransactions();
    const today = new Date().toISOString().slice(0, 10);

    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      count: transactions.length,
      transactions,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="education-lt-backup-${today}.json"`,
      },
    });
  } catch (err) {
    console.error("[education/lt-backup GET]", err);
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
      await writeTransactions(body.transactions);
      return NextResponse.json({ ok: true, restored: body.transactions.length, skipped: 0 });
    }

    // merge 모드: 중복이 아닌 신규 건만 추가
    // 중복 기준: date + stockCode + tradeType + quantity + price
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
        existingKeys.add(key);
      }
    }

    if (toAdd.length > 0) {
      await writeTransactions([...existing, ...toAdd]);
    }

    return NextResponse.json({ ok: true, restored: toAdd.length, skipped });
  } catch (err) {
    console.error("[education/lt-backup POST]", err);
    return NextResponse.json({ error: "복원 실패" }, { status: 500 });
  }
}
