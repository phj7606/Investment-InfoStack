/**
 * Financial Snapshot API — 월별 재무 스냅샷 목록 조회 및 생성
 *
 * GET  /api/portfolio/financial/snapshot          → 전체 스냅샷 목록 (월 요약)
 * POST /api/portfolio/financial/snapshot          → DRAFT 스냅샷 생성 또는 업데이트
 */

import { NextRequest, NextResponse } from "next/server";
import type { FinancialSnapshot } from "@/types/financial";
import { createDraftSnapshot } from "@/lib/portfolio/financial-calc";
import { readKey, writeKey } from "@/lib/db";

const DATA_KEY = "financial_snapshots";

export async function readSnapshots(): Promise<FinancialSnapshot[]> {
  return readKey<FinancialSnapshot[]>(DATA_KEY, []);
}

export async function writeSnapshots(snapshots: FinancialSnapshot[]): Promise<void> {
  await writeKey(DATA_KEY, snapshots);
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

  // 신규 DRAFT 생성 — 이전 달 CONFIRMED 스냅샷을 찾아 이월
  const [yearStr, monthStr] = body.month.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const prevMonthStr = month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
  const prevConfirmed = snapshots.find(
    (s) => s.month === prevMonthStr && s.status === "CONFIRMED"
  );

  const snapshot = createDraftSnapshot(body.month, undefined, prevConfirmed);
  snapshots.push(snapshot);
  await writeSnapshots(snapshots);

  return NextResponse.json({ snapshot, created: true }, { status: 201 });
}
