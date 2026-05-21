/**
 * Monthly CF API — 월별 현금흐름 항목 CRUD
 *
 * GET  /api/portfolio/financial/monthly-cf?month=2026-05  → 해당 월 항목 목록
 * GET  /api/portfolio/financial/monthly-cf                → 전체 목록
 * POST /api/portfolio/financial/monthly-cf                → 항목 추가
 * DELETE /api/portfolio/financial/monthly-cf?id=xxx       → 항목 삭제
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { MonthlyCFEntry, CreateMonthlyCFRequest } from "@/types/financial";

const DATA_PATH = path.join(process.cwd(), "data", "monthly-cf.json");

async function readEntries(): Promise<MonthlyCFEntry[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as MonthlyCFEntry[];
  } catch {
    return [];
  }
}

async function writeEntries(entries: MonthlyCFEntry[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

// GET — 항목 조회 (month 파라미터로 필터 가능)
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const entries = await readEntries();
  const result = month ? entries.filter((e) => e.month === month) : entries;
  // 월별 → 카테고리 → 이름 순 정렬
  result.sort((a, b) => {
    if (a.month !== b.month) return a.month.localeCompare(b.month);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });
  return NextResponse.json({ entries: result, fetchedAt: new Date().toISOString() });
}

// POST — 항목 추가
export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateMonthlyCFRequest;

  if (!body.category || !body.name || !body.month || body.amount === undefined) {
    return NextResponse.json({ error: "필수 필드 누락: category, name, month, amount" }, { status: 400 });
  }
  if (isNaN(body.amount)) {
    return NextResponse.json({ error: "amount는 숫자여야 합니다" }, { status: 400 });
  }

  const entries = await readEntries();
  const newEntry: MonthlyCFEntry = {
    id: crypto.randomUUID(),
    category: body.category,
    name: body.name.trim(),
    month: body.month,
    amount: body.amount,
    note: body.note?.trim(),
    createdAt: new Date().toISOString(),
  };
  entries.push(newEntry);
  await writeEntries(entries);

  return NextResponse.json({ entry: newEntry }, { status: 201 });
}

// DELETE — 항목 삭제
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id 파라미터 필요" }, { status: 400 });
  }

  const entries = await readEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "항목을 찾을 수 없습니다" }, { status: 404 });
  }

  entries.splice(idx, 1);
  await writeEntries(entries);

  return NextResponse.json({ ok: true });
}
