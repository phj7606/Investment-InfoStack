/**
 * 연금 리밸런싱 설정 백업/복원 API
 *
 * GET  /api/portfolio/pension/rebalancing/backup
 *   → 리밸런싱 설정을 단일 JSON으로 다운로드
 *
 * POST /api/portfolio/pension/rebalancing/backup
 *   body: { config: PensionRebalancingConfig, mode: "overwrite" }
 *   → mode=overwrite: 기존 설정 전체 교체
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readRebalancingConfig,
  writeRebalancingConfig,
} from "@/lib/portfolio/pension-store";
import type { PensionRebalancingConfig } from "@/types/portfolio";

// ─── GET — 백업 다운로드 ───────────────────────────────────────────

export async function GET() {
  const config = await readRebalancingConfig();

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    config,
  };

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pension-rebalancing-backup-${today}.json"`,
    },
  });
}

// ─── POST — 복원 ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    config?: PensionRebalancingConfig;
    mode: "overwrite";
  };

  if (body.mode !== "overwrite") {
    return NextResponse.json(
      { error: "mode는 overwrite 여야 합니다" },
      { status: 400 }
    );
  }

  if (!body.config) {
    return NextResponse.json(
      { error: "config 객체가 필요합니다" },
      { status: 400 }
    );
  }

  await writeRebalancingConfig(body.config);

  return NextResponse.json({ ok: true, restored: 1, skipped: 0 });
}
