/**
 * Education 계좌 데이터 파일 읽기/쓰기 헬퍼
 * data/education-account.json을 단일 소스로 관리
 *
 * Next.js App Router RSC/Route Handler에서만 사용 (서버 전용)
 */

import fs from "fs/promises";
import path from "path";
import type { EducationAccountData, EducationPosition, EducationTrade, PerformanceSummary } from "@/types/portfolio";

const DATA_PATH = path.join(process.cwd(), "data", "education-account.json");

// ─────────────────────────────────────────
// 파일 읽기/쓰기
// ─────────────────────────────────────────

export async function readAccountData(): Promise<EducationAccountData> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as EducationAccountData;
  } catch {
    // 파일 없으면 빈 구조 반환
    return { positions: [], trades: [] };
  }
}

export async function writeAccountData(data: EducationAccountData): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ─────────────────────────────────────────
// 성과 요약 계산 (EducationTrade[] 기반)
// ─────────────────────────────────────────

export function calcEducationSummary(trades: EducationTrade[]): PerformanceSummary {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winCount: 0, lossCount: 0,
      winRate: 0, profitFactor: 0,
      avgWinPct: 0, avgLossPct: 0, expectedValue: 0,
      maxConsecutiveLoss: 0, cumulativeProfitLoss: 0,
      mdd: 0, equityCurve: [], monthlyReturns: [],
    };
  }

  const wins = trades.filter((t) => t.profitLossPct > 0);
  const losses = trades.filter((t) => t.profitLossPct <= 0);
  const totalTrades = trades.length;
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = winCount / totalTrades;

  const totalWinPL = wins.reduce((s, t) => s + t.profitLoss, 0);
  const totalLossPL = Math.abs(losses.reduce((s, t) => s + t.profitLoss, 0));
  const profitFactor = totalLossPL === 0 ? Infinity : totalWinPL / totalLossPL;

  const avgWinPct = winCount > 0
    ? wins.reduce((s, t) => s + t.profitLossPct, 0) / winCount : 0;
  const avgLossPct = lossCount > 0
    ? Math.abs(losses.reduce((s, t) => s + t.profitLossPct, 0) / lossCount) : 0;
  const expectedValue = winRate * avgWinPct - (1 - winRate) * avgLossPct;

  // 최대 연속 손실
  let maxConsecutiveLoss = 0;
  let currentStreak = 0;
  // 매도일 기준 정렬 후 계산
  const sorted = [...trades].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
  for (const t of sorted) {
    if (t.profitLossPct <= 0) {
      currentStreak++;
      maxConsecutiveLoss = Math.max(maxConsecutiveLoss, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Equity Curve (누적 손익)
  let cumPL = 0;
  const equityCurve = sorted.map((t) => {
    cumPL += t.profitLoss;
    return { date: t.sellDate, value: Math.round(cumPL) };
  });
  const cumulativeProfitLoss = Math.round(cumPL);

  // MDD (Equity Curve 기준)
  let peak = 0;
  let mdd = 0;
  for (const pt of equityCurve) {
    if (pt.value > peak) peak = pt.value;
    const drawdown = peak > 0 ? (peak - pt.value) / peak : 0;
    if (drawdown > mdd) mdd = drawdown;
  }

  // 월별 수익률
  const monthMap: Record<string, { pl: number }> = {};
  for (const t of sorted) {
    const key = t.sellDate.slice(0, 7); // YYYY-MM
    if (!monthMap[key]) monthMap[key] = { pl: 0 };
    monthMap[key].pl += t.profitLoss;
  }
  const monthlyReturns = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { pl }]) => {
      const [year, month] = key.split("-").map(Number);
      return { year, month, returnPct: 0, profitLoss: Math.round(pl) };
    });

  return {
    totalTrades, winCount, lossCount, winRate,
    profitFactor: Math.round(profitFactor * 100) / 100,
    avgWinPct: Math.round(avgWinPct * 100) / 100,
    avgLossPct: Math.round(avgLossPct * 100) / 100,
    expectedValue: Math.round(expectedValue * 100) / 100,
    maxConsecutiveLoss,
    cumulativeProfitLoss,
    mdd: -Math.round(mdd * 10000) / 100,
    equityCurve,
    monthlyReturns,
  };
}
