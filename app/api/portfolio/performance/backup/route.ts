/**
 * 성과 기준 데이터 백업/복원 API
 *
 * GET  /api/portfolio/performance/backup
 *   → performance-bootstrap + performance-baseline 을 단일 JSON으로 다운로드
 *
 * POST /api/portfolio/performance/backup
 *   body: { bootstrap?: any; baseline?: any; mode: "overwrite" }
 *   → mode=overwrite: 제공된 데이터만 전체 교체 (bootstrap·baseline 독립적으로 복원 가능)
 */

import { NextRequest, NextResponse } from "next/server";
import { readKey, writeKey } from "@/lib/db";

const BOOTSTRAP_KEY = "performance_bootstrap";
const BASELINE_KEY  = "performance_baseline";

// ─── GET — 백업 다운로드 ───────────────────────────────────────────

export async function GET() {
  const [bootstrap, baseline] = await Promise.all([
    readKey<unknown>(BOOTSTRAP_KEY, null),
    readKey<unknown>(BASELINE_KEY, null),
  ]);

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    bootstrap,
    baseline,
  };

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="performance-backup-${today}.json"`,
    },
  });
}

// ─── POST — 복원 ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    bootstrap?: unknown;
    baseline?: unknown;
    mode: "overwrite";
  };

  if (body.mode !== "overwrite") {
    return NextResponse.json(
      { error: "mode는 overwrite 여야 합니다" },
      { status: 400 }
    );
  }

  // bootstrap·baseline 중 제공된 것만 복원 (독립 처리)
  let restoredBootstrap = false;
  let restoredBaseline  = false;

  if (body.bootstrap != null) {
    await writeKey(BOOTSTRAP_KEY, body.bootstrap);
    restoredBootstrap = true;
  }

  if (body.baseline != null) {
    await writeKey(BASELINE_KEY, body.baseline);
    restoredBaseline = true;
  }

  return NextResponse.json({ ok: true, restoredBootstrap, restoredBaseline });
}
