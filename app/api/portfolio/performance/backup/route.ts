/**
 * 성과 기준 데이터 백업/복원 API
 *
 * GET  /api/portfolio/performance/backup
 *   → performance-bootstrap.json + performance-baseline.json 을 단일 JSON으로 다운로드
 *
 * POST /api/portfolio/performance/backup
 *   body: { bootstrap?: any; baseline?: any; mode: "overwrite" }
 *   → mode=overwrite: 제공된 파일만 전체 교체 (bootstrap·baseline 독립적으로 복원 가능)
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const BOOTSTRAP_PATH = path.join(process.cwd(), "data", "performance-bootstrap.json");
const BASELINE_PATH  = path.join(process.cwd(), "data", "performance-baseline.json");

async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── GET — 백업 다운로드 ───────────────────────────────────────────

export async function GET() {
  const [bootstrap, baseline] = await Promise.all([
    readJson(BOOTSTRAP_PATH),
    readJson(BASELINE_PATH),
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
    await writeJson(BOOTSTRAP_PATH, body.bootstrap);
    restoredBootstrap = true;
  }

  if (body.baseline != null) {
    await writeJson(BASELINE_PATH, body.baseline);
    restoredBaseline = true;
  }

  return NextResponse.json({ ok: true, restoredBootstrap, restoredBaseline });
}
