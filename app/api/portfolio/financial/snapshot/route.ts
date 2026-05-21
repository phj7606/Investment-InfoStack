/**
 * Financial Snapshot API — 월별 재무 스냅샷 목록 조회 및 생성
 *
 * GET  /api/portfolio/financial/snapshot          → 전체 스냅샷 목록 (월 요약)
 * POST /api/portfolio/financial/snapshot          → DRAFT 스냅샷 생성 또는 업데이트
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import type { FinancialSnapshot } from "@/types/financial";
import { createDraftSnapshot } from "@/lib/portfolio/financial-calc";

const DATA_PATH = path.join(process.cwd(), "data", "financial-snapshots.json");

export async function readSnapshots(): Promise<FinancialSnapshot[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as FinancialSnapshot[];
  } catch {
    return [];
  }
}

export async function writeSnapshots(snapshots: FinancialSnapshot[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(snapshots, null, 2), "utf-8");
}

// GET — 전체 스냅샷 목록 (최신 월 우선 정렬)
export async function GET() {
  const snapshots = await readSnapshots();
  snapshots.sort((a, b) => b.month.localeCompare(a.month));
  return NextResponse.json({ snapshots, fetchedAt: new Date().toISOString() });
}

// POST — DRAFT 스냅샷 생성 (해당 월이 이미 있으면 무시, CONFIRMED이면 에러)
export async function POST(req: NextRequest) {
  const body = await req.json() as { month: string };
  if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
    return NextResponse.json({ error: "month 형식 오류 (YYYY-MM)" }, { status: 400 });
  }

  const snapshots = await readSnapshots();
  const existing = snapshots.find((s) => s.month === body.month);

  if (existing) {
    if (existing.status === "CONFIRMED") {
      return NextResponse.json({ error: "이미 확정된 월입니다" }, { status: 409 });
    }
    // DRAFT이면 기존 반환
    return NextResponse.json({ snapshot: existing, created: false });
  }

  // 신규 DRAFT 생성
  const snapshot = createDraftSnapshot(body.month);
  snapshots.push(snapshot);
  await writeSnapshots(snapshots);

  return NextResponse.json({ snapshot, created: true }, { status: 201 });
}
