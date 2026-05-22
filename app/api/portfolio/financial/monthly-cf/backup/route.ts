/**
 * Monthly CF 백업/복원 API
 *
 * GET  /api/portfolio/financial/monthly-cf/backup
 *   → monthly-cf + monthly-cf-balance 를 단일 JSON으로 다운로드
 *
 * POST /api/portfolio/financial/monthly-cf/backup
 *   body: { entries: MonthlyCFEntry[]; balances: MonthlyCFBalance; mode: "overwrite" | "merge" }
 *   → mode=overwrite: 기존 데이터 완전 교체
 *   → mode=merge: entries는 id 기준 중복 제외, balances는 month key 기준 중복 제외
 */

import { NextRequest, NextResponse } from "next/server";
import type { MonthlyCFEntry, MonthlyCFBalance } from "@/types/financial";
import { readKey, writeKey } from "@/lib/db";

const ENTRIES_KEY = "monthly_cf";
const BALANCE_KEY = "monthly_cf_balance";

// ─── GET — 백업 다운로드 ───────────────────────────────────────────

export async function GET() {
  const [entries, balances] = await Promise.all([
    readKey<MonthlyCFEntry[]>(ENTRIES_KEY, []),
    readKey<MonthlyCFBalance>(BALANCE_KEY, {}),
  ]);

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entryCount: entries.length,
    entries,
    balances,
  };

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="monthly-cf-backup-${today}.json"`,
    },
  });
}

// ─── POST — 복원 ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    entries?: MonthlyCFEntry[];
    balances?: MonthlyCFBalance;
    mode: "overwrite" | "merge";
  };

  if (!body.mode || (body.mode !== "overwrite" && body.mode !== "merge")) {
    return NextResponse.json(
      { error: "mode는 overwrite 또는 merge 여야 합니다" },
      { status: 400 }
    );
  }

  const incomingEntries: MonthlyCFEntry[] = Array.isArray(body.entries) ? body.entries : [];
  const incomingBalances: MonthlyCFBalance = body.balances ?? {};

  let restoredEntries = 0;
  let skippedEntries = 0;
  let restoredBalances = 0;
  let skippedBalances = 0;

  if (body.mode === "overwrite") {
    await Promise.all([
      writeKey(ENTRIES_KEY, incomingEntries),
      writeKey(BALANCE_KEY, incomingBalances),
    ]);
    restoredEntries = incomingEntries.length;
    restoredBalances = Object.keys(incomingBalances).length;
  } else {
    // merge — entries: id 기준 중복 제외, balances: month key 기준 중복 제외
    const [existing, existingBalances] = await Promise.all([
      readKey<MonthlyCFEntry[]>(ENTRIES_KEY, []),
      readKey<MonthlyCFBalance>(BALANCE_KEY, {}),
    ]);

    // entries 병합
    const existingIds = new Set(existing.map((e) => e.id));
    for (const entry of incomingEntries) {
      if (existingIds.has(entry.id)) {
        skippedEntries++;
      } else {
        existing.push(entry);
        existingIds.add(entry.id);
        restoredEntries++;
      }
    }

    // balances 병합 — 기존 month는 유지, 신규 month만 추가
    for (const [month, amount] of Object.entries(incomingBalances)) {
      if (month in existingBalances) {
        skippedBalances++;
      } else {
        existingBalances[month] = amount as number;
        restoredBalances++;
      }
    }

    await Promise.all([
      writeKey(ENTRIES_KEY, existing),
      writeKey(BALANCE_KEY, existingBalances),
    ]);
  }

  return NextResponse.json({
    ok: true,
    restored: restoredEntries,
    skipped: skippedEntries,
    restoredBalances,
    skippedBalances,
  });
}
