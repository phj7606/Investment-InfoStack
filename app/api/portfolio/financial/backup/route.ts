/**
 * GET  /api/portfolio/financial/backup  — 재무 스냅샷 JSON 백업 파일 다운로드
 * POST /api/portfolio/financial/backup  — JSON 파일로 스냅샷 복원
 *
 * GET 응답:
 *   - Content-Disposition: attachment 헤더로 브라우저 다운로드 유도
 *   - 파일명: financial-backup-YYYY-MM-DD.json
 *   - 본문: { version, exportedAt, count, snapshots }
 *
 * POST 요청:
 *   - body: { snapshots: FinancialSnapshot[], mode: "overwrite" | "merge" }
 *   - overwrite: 현재 데이터를 완전히 교체
 *   - merge: 기존 스냅샷 유지 + 해당 월이 없는 것만 추가
 *     중복 기준: month (YYYY-MM)
 *   - 응답: { ok, restored, skipped }
 */

import { NextRequest, NextResponse } from "next/server";
import { readSnapshots, writeSnapshots } from "../snapshot/route";
import type { FinancialSnapshot } from "@/types/financial";

// ─────────────────────────────────────────
// GET — 백업 파일 다운로드
// ─────────────────────────────────────────

export async function GET() {
  try {
    const snapshots = await readSnapshots();
    const today = new Date().toISOString().slice(0, 10);

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: snapshots.length,
      snapshots,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 브라우저가 파일로 저장하도록 attachment 지정
        "Content-Disposition": `attachment; filename="financial-backup-${today}.json"`,
      },
    });
  } catch (err) {
    console.error("[financial/backup GET]", err);
    return NextResponse.json({ error: "백업 파일 생성 실패" }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// POST — 백업 파일로 복원
// ─────────────────────────────────────────

interface RestoreBody {
  snapshots: FinancialSnapshot[];
  mode: "overwrite" | "merge";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RestoreBody;

    if (!Array.isArray(body.snapshots) || body.snapshots.length === 0) {
      return NextResponse.json({ error: "snapshots 배열이 비어 있습니다." }, { status: 400 });
    }
    if (body.mode !== "overwrite" && body.mode !== "merge") {
      return NextResponse.json(
        { error: "mode는 'overwrite' 또는 'merge'여야 합니다." },
        { status: 400 }
      );
    }

    if (body.mode === "overwrite") {
      // 현재 데이터를 완전히 교체
      await writeSnapshots(body.snapshots);
      return NextResponse.json({ ok: true, restored: body.snapshots.length, skipped: 0 });
    }

    // merge 모드: 기존 스냅샷 유지, 해당 월이 없는 것만 추가
    // 중복 판단 기준: month (YYYY-MM)
    const existing = await readSnapshots();
    const existingMonths = new Set(existing.map((s) => s.month));

    const toAdd: FinancialSnapshot[] = [];
    let skipped = 0;

    for (const snap of body.snapshots) {
      if (existingMonths.has(snap.month)) {
        skipped++;
      } else {
        toAdd.push(snap);
        existingMonths.add(snap.month);
      }
    }

    if (toAdd.length > 0) {
      await writeSnapshots([...existing, ...toAdd]);
    }

    return NextResponse.json({ ok: true, restored: toAdd.length, skipped });
  } catch (err) {
    console.error("[financial/backup POST]", err);
    return NextResponse.json({ error: "복원 실패" }, { status: 500 });
  }
}
