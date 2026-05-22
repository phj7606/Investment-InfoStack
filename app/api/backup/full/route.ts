/**
 * GET  /api/backup/full  — 전체 데이터 통합 백업 파일 다운로드
 * POST /api/backup/full  — 통합 백업 파일로 전체 또는 선택 모듈 복원
 *
 * GET 응답:
 *   - Content-Disposition: attachment 헤더로 브라우저 다운로드 유도
 *   - 파일명: investment-backup-YYYY-MM-DD.json
 *   - 본문: { version, exportedAt, financial, pension, longterm, education, shortterm }
 *
 * POST 요청:
 *   - body: { data: {...}, modules: string[], mode: "overwrite" | "merge" }
 *   - modules: 복원할 모듈 목록 (기본값: 전체)
 *   - mode: overwrite = 완전 교체, merge = 중복 제외 신규 추가
 *   - 응답: { ok, results: { [module]: { restored, skipped } } }
 */

import { NextRequest, NextResponse } from "next/server";
import { readSnapshots, writeSnapshots } from "@/app/api/portfolio/financial/snapshot/route";
import {
  readTransactions as readPensionTx,
  writeTransactions as writePensionTx,
} from "@/lib/portfolio/pension-store";
import {
  readTransactions as readLongtermTx,
  writeTransactions as writeLongtermTx,
} from "@/lib/portfolio/longterm-store";
import {
  readAccountData as readEducation,
  writeAccountData as writeEducation,
} from "@/lib/portfolio/educationData";
import {
  readAccountData as readShortterm,
  writeAccountData as writeShortterm,
} from "@/lib/portfolio/shorttermData";
import type { FinancialSnapshot } from "@/types/financial";
import type {
  LongtermTransaction,
  PensionTransaction,
  EducationPosition,
  EducationTrade,
} from "@/types/portfolio";

// ─────────────────────────────────────────
// 백업 데이터 구조 타입
// ─────────────────────────────────────────

interface FullBackupData {
  version: 2;
  exportedAt: string;
  financial: {
    count: number;
    snapshots: FinancialSnapshot[];
  };
  pension: {
    count: number;
    transactions: PensionTransaction[];
  };
  longterm: {
    count: number;
    transactions: LongtermTransaction[];
  };
  education: {
    positionCount: number;
    tradeCount: number;
    positions: EducationPosition[];
    trades: EducationTrade[];
  };
  shortterm: {
    positionCount: number;
    tradeCount: number;
    positions: EducationPosition[];
    trades: EducationTrade[];
  };
}

// ─────────────────────────────────────────
// GET — 통합 백업 파일 다운로드
// ─────────────────────────────────────────

export async function GET() {
  try {
    // 5개 모듈 데이터 병렬 로드
    // 5개 모듈 데이터 병렬 로드 — 모두 async 함수로 전환됨
    const [snapshots, pensionTx, longtermTx, educationData, shorttermData] =
      await Promise.all([
        readSnapshots(),
        readPensionTx(),
        readLongtermTx(),
        readEducation(),
        readShortterm(),
      ]);

    const today = new Date().toISOString().slice(0, 10);

    const payload: FullBackupData = {
      version: 2,
      exportedAt: new Date().toISOString(),
      financial: {
        count: snapshots.length,
        snapshots,
      },
      pension: {
        count: pensionTx.length,
        transactions: pensionTx,
      },
      longterm: {
        count: longtermTx.length,
        transactions: longtermTx,
      },
      education: {
        positionCount: educationData.positions.length,
        tradeCount: educationData.trades.length,
        positions: educationData.positions,
        trades: educationData.trades,
      },
      shortterm: {
        positionCount: shorttermData.positions.length,
        tradeCount: shorttermData.trades.length,
        positions: shorttermData.positions,
        trades: shorttermData.trades,
      },
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="investment-backup-${today}.json"`,
      },
    });
  } catch (err) {
    console.error("[backup/full GET]", err);
    return NextResponse.json({ error: "백업 파일 생성 실패" }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// POST — 통합 백업 파일로 복원
// ─────────────────────────────────────────

interface RestoreBody {
  data: FullBackupData;
  modules: Array<"financial" | "pension" | "longterm" | "education" | "shortterm">;
  mode: "overwrite" | "merge";
}

interface ModuleResult {
  restored: number;
  skipped: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RestoreBody;

    if (!body.data || body.data.version !== 2) {
      return NextResponse.json(
        { error: "유효하지 않은 백업 파일입니다. (version 2 필요)" },
        { status: 400 }
      );
    }
    if (!Array.isArray(body.modules) || body.modules.length === 0) {
      return NextResponse.json({ error: "복원할 modules 목록이 필요합니다." }, { status: 400 });
    }
    if (body.mode !== "overwrite" && body.mode !== "merge") {
      return NextResponse.json(
        { error: "mode는 'overwrite' 또는 'merge'여야 합니다." },
        { status: 400 }
      );
    }

    const results: Record<string, ModuleResult> = {};
    const tasks: Promise<void>[] = [];

    // ── 재무 스냅샷 복원 ────────────────────────────────
    if (body.modules.includes("financial")) {
      tasks.push(
        (async () => {
          const incoming = body.data.financial.snapshots;
          if (body.mode === "overwrite") {
            await writeSnapshots(incoming);
            results.financial = { restored: incoming.length, skipped: 0 };
          } else {
            // merge: month 기준 중복 제외
            const existing = await readSnapshots();
            const existingMonths = new Set(existing.map((s) => s.month));
            const toAdd = incoming.filter((s) => !existingMonths.has(s.month));
            if (toAdd.length > 0) await writeSnapshots([...existing, ...toAdd]);
            results.financial = {
              restored: toAdd.length,
              skipped: incoming.length - toAdd.length,
            };
          }
        })()
      );
    }

    // ── 연금 거래내역 복원 ────────────────────────────────
    if (body.modules.includes("pension")) {
      tasks.push(
        (async () => {
          const incoming = body.data.pension.transactions;
          if (body.mode === "overwrite") {
            await writePensionTx(incoming);
            results.pension = { restored: incoming.length, skipped: 0 };
          } else {
            const existing = await readPensionTx();
            const existingKeys = new Set(
              existing.map(
                (t) => `${t.date}::${t.stockCode}::${t.accountType}::${t.tradeType}::${t.quantity}::${t.price}`
              )
            );
            const toAdd = incoming.filter((t) => {
              const k = `${t.date}::${t.stockCode}::${t.accountType}::${t.tradeType}::${t.quantity}::${t.price}`;
              return !existingKeys.has(k);
            });
            if (toAdd.length > 0) await writePensionTx([...existing, ...toAdd]);
            results.pension = {
              restored: toAdd.length,
              skipped: incoming.length - toAdd.length,
            };
          }
        })()
      );
    }

    // ── 중장기 거래내역 복원 ────────────────────────────────
    if (body.modules.includes("longterm")) {
      tasks.push(
        (async () => {
          const incoming = body.data.longterm.transactions;
          if (body.mode === "overwrite") {
            await writeLongtermTx(incoming);
            results.longterm = { restored: incoming.length, skipped: 0 };
          } else {
            const existing = await readLongtermTx();
            const existingKeys = new Set(
              existing.map(
                (t) => `${t.date}::${t.stockCode}::${t.tradeType}::${t.quantity}::${t.price}`
              )
            );
            const toAdd = incoming.filter((t) => {
              const k = `${t.date}::${t.stockCode}::${t.tradeType}::${t.quantity}::${t.price}`;
              return !existingKeys.has(k);
            });
            if (toAdd.length > 0) await writeLongtermTx([...existing, ...toAdd]);
            results.longterm = {
              restored: toAdd.length,
              skipped: incoming.length - toAdd.length,
            };
          }
        })()
      );
    }

    // ── 교육 계좌 복원 ────────────────────────────────
    if (body.modules.includes("education")) {
      tasks.push(
        (async () => {
          const { positions: inPos, trades: inTrades } = body.data.education;
          if (body.mode === "overwrite") {
            await writeEducation({ positions: inPos, trades: inTrades });
            results.education = {
              restored: inPos.length + inTrades.length,
              skipped: 0,
            };
          } else {
            const current = await readEducation();
            const existingCodes = new Set(current.positions.map((p) => p.stockCode));
            const newPos = inPos.filter((p) => !existingCodes.has(p.stockCode));
            const existingTrades = new Set(
              current.trades.map(
                (t) => `${t.buyDate}::${t.sellDate}::${t.stockCode}::${t.quantity}`
              )
            );
            const newTrades = inTrades.filter(
              (t) => !existingTrades.has(`${t.buyDate}::${t.sellDate}::${t.stockCode}::${t.quantity}`)
            );
            await writeEducation({
              positions: [...current.positions, ...newPos],
              trades: [...current.trades, ...newTrades],
            });
            results.education = {
              restored: newPos.length + newTrades.length,
              skipped: inPos.length - newPos.length + inTrades.length - newTrades.length,
            };
          }
        })()
      );
    }

    // ── 단기 계좌 복원 ────────────────────────────────
    if (body.modules.includes("shortterm")) {
      tasks.push(
        (async () => {
          const { positions: inPos, trades: inTrades } = body.data.shortterm;
          if (body.mode === "overwrite") {
            await writeShortterm({ positions: inPos, trades: inTrades });
            results.shortterm = {
              restored: inPos.length + inTrades.length,
              skipped: 0,
            };
          } else {
            const current = await readShortterm();
            const existingCodes = new Set(current.positions.map((p) => p.stockCode));
            const newPos = inPos.filter((p) => !existingCodes.has(p.stockCode));
            const existingTrades = new Set(
              current.trades.map(
                (t) => `${t.buyDate}::${t.sellDate}::${t.stockCode}::${t.quantity}`
              )
            );
            const newTrades = inTrades.filter(
              (t) => !existingTrades.has(`${t.buyDate}::${t.sellDate}::${t.stockCode}::${t.quantity}`)
            );
            await writeShortterm({
              positions: [...current.positions, ...newPos],
              trades: [...current.trades, ...newTrades],
            });
            results.shortterm = {
              restored: newPos.length + newTrades.length,
              skipped: inPos.length - newPos.length + inTrades.length - newTrades.length,
            };
          }
        })()
      );
    }

    // 모든 모듈 복원 병렬 실행
    await Promise.all(tasks);

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error("[backup/full POST]", err);
    return NextResponse.json({ error: "복원 실패" }, { status: 500 });
  }
}
