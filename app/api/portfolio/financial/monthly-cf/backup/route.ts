/**
 * Monthly CF 백업/복원 API
 *
 * GET  /api/portfolio/financial/monthly-cf/backup
 *   → monthly-cf.json + monthly-cf-balance.json 을 단일 JSON으로 다운로드
 *
 * POST /api/portfolio/financial/monthly-cf/backup
 *   body: { entries: MonthlyCFEntry[]; balances: MonthlyCFBalance; mode: "overwrite" | "merge" }
 *   → mode=overwrite: 기존 데이터 완전 교체
 *   → mode=merge: entries는 id 기준 중복 제외, balances는 month key 기준 중복 제외
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { MonthlyCFEntry, MonthlyCFBalance } from "@/types/financial";

const ENTRIES_PATH = path.join(process.cwd(), "data", "monthly-cf.json");
const BALANCE_PATH = path.join(process.cwd(), "data", "monthly-cf-balance.json");

async function readEntries(): Promise<MonthlyCFEntry[]> {
  try {
    return JSON.parse(await fs.readFile(ENTRIES_PATH, "utf-8"));
  } catch {
    return [];
  }
}

async function readBalances(): Promise<MonthlyCFBalance> {
  try {
    return JSON.parse(await fs.readFile(BALANCE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

async function writeEntries(entries: MonthlyCFEntry[]): Promise<void> {
  await fs.writeFile(ENTRIES_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

async function writeBalances(balances: MonthlyCFBalance): Promise<void> {
  await fs.writeFile(BALANCE_PATH, JSON.stringify(balances, null, 2), "utf-8");
}

// ─── GET — 백업 다운로드 ───────────────────────────────────────────

export async function GET() {
  const [entries, balances] = await Promise.all([readEntries(), readBalances()]);

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
    // 전체 교체
    await writeEntries(incomingEntries);
    await writeBalances(incomingBalances);
    restoredEntries = incomingEntries.length;
    restoredBalances = Object.keys(incomingBalances).length;
  } else {
    // merge — entries: id 기준 중복 제외, balances: month key 기준 중복 제외
    const [existing, existingBalances] = await Promise.all([readEntries(), readBalances()]);

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

    await writeEntries(existing);
    await writeBalances(existingBalances);
  }

  return NextResponse.json({
    ok: true,
    restored: restoredEntries,
    skipped: skippedEntries,
    restoredBalances,
    skippedBalances,
  });
}
