/**
 * 연금 리밸런싱 설정 백업/복원 API
 *
 * GET  /api/portfolio/pension/rebalancing/backup
 *   → pension-rebalancing.json 을 단일 JSON으로 다운로드
 *
 * POST /api/portfolio/pension/rebalancing/backup
 *   body: { config: { bondRatio: number; equityRatio: number }, mode: "overwrite" }
 *   → mode=overwrite: 기존 설정 전체 교체 (단일 config 객체라 merge 불필요)
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "data", "pension-rebalancing.json");

interface RebalancingConfig {
  bondRatio: number;
  equityRatio: number;
}

async function readConfig(): Promise<RebalancingConfig> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8"));
  } catch {
    return { bondRatio: 30, equityRatio: 70 };
  }
}

async function writeConfig(config: RebalancingConfig): Promise<void> {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

// ─── GET — 백업 다운로드 ───────────────────────────────────────────

export async function GET() {
  const config = await readConfig();

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
    config?: RebalancingConfig;
    mode: "overwrite";
  };

  if (body.mode !== "overwrite") {
    return NextResponse.json(
      { error: "mode는 overwrite 여야 합니다" },
      { status: 400 }
    );
  }

  if (!body.config || typeof body.config.bondRatio !== "number" || typeof body.config.equityRatio !== "number") {
    return NextResponse.json(
      { error: "config.bondRatio, config.equityRatio 가 필요합니다" },
      { status: 400 }
    );
  }

  await writeConfig(body.config);

  return NextResponse.json({ ok: true, restored: 1, skipped: 0 });
}
