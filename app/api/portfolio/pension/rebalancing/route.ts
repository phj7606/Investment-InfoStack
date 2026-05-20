/**
 * GET /api/portfolio/pension/rebalancing
 *   — 계좌별 목표 비중 + 현재 비중 + 리밸런싱 계산 결과
 *   응답: { config: PensionRebalancingConfig, results: { RETIREMENT, SAVINGS } }
 *
 * PUT /api/portfolio/pension/rebalancing
 *   — 단일 계좌 목표 비중 저장
 *   요청: { accountType: "RETIREMENT" | "SAVINGS", bondRatio: number, equityRatio: number }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readTransactions,
  readRebalancingConfig,
  writeRebalancingTarget,
} from "@/lib/portfolio/pension-store";
import {
  calcPensionPositions,
  calcRebalancing,
} from "@/lib/portfolio/pension-calc";
import type { PensionRebalancingTarget } from "@/types/portfolio";

export async function GET() {
  const transactions = readTransactions();
  const positions    = calcPensionPositions(transactions);
  const config       = readRebalancingConfig();

  // 퇴직연금 / 연금저축 각각 리밸런싱 계산
  const retirementResult = calcRebalancing(positions, config.RETIREMENT, "RETIREMENT");
  const savingsResult    = calcRebalancing(positions, config.SAVINGS,    "SAVINGS");

  return NextResponse.json({
    config,
    results: {
      RETIREMENT: retirementResult,
      SAVINGS:    savingsResult,
    },
    fetchedAt: new Date().toISOString(),
  });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as {
      accountType: "RETIREMENT" | "SAVINGS";
    } & PensionRebalancingTarget;

    if (body.accountType !== "RETIREMENT" && body.accountType !== "SAVINGS") {
      return NextResponse.json(
        { error: "accountType은 'RETIREMENT' 또는 'SAVINGS'여야 합니다." },
        { status: 400 }
      );
    }
    if (typeof body.bondRatio !== "number" || typeof body.equityRatio !== "number") {
      return NextResponse.json({ error: "bondRatio, equityRatio는 숫자 필수" }, { status: 400 });
    }
    if (Math.round(body.bondRatio + body.equityRatio) !== 100) {
      return NextResponse.json(
        { error: "채권형 + 주식형 비중 합계는 100이어야 합니다." },
        { status: 400 }
      );
    }

    const target: PensionRebalancingTarget = {
      bondRatio: body.bondRatio,
      equityRatio: body.equityRatio,
    };

    // 해당 계좌의 목표 비중만 업데이트
    writeRebalancingTarget(body.accountType, target);

    // 업데이트 후 재계산 결과 반환
    const transactions = readTransactions();
    const positions    = calcPensionPositions(transactions);
    const result       = calcRebalancing(positions, target, body.accountType);

    return NextResponse.json({ ok: true, target, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "오류 발생";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
