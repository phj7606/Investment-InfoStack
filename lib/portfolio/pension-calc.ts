/**
 * 연금 계좌 성과 계산 모듈
 *
 * 핵심 원칙:
 * - 거래 이력 기반: PensionTransaction[] → PensionPosition[] (직접 저장 X)
 * - 그룹키: stockCode + accountType + (category | "") — 퇴직연금 채권형/주식형 분리
 * - 부분 매도 지원: SELL 시 realizedPL 계산, 남은 수량은 동일 avgCost 유지
 * - longterm-calc.ts 패턴 동일 적용
 */

import type {
  PensionTransaction,
  PensionPosition,
  PensionAccountSummary,
  PensionAccountType,
  PensionRebalancingTarget,
} from "@/types/portfolio";

// ─────────────────────────────────────────
// 포지션 계산
// ─────────────────────────────────────────

/**
 * 전체 거래 이력 → 현재 보유 포지션 계산
 *
 * 그룹키: stockCode + accountType + category(없으면 "")
 * BUY: qty↑, totalCost↑ → avgCost = totalCost / qty
 * SELL: realizedPL 누적, totalCost 비례 차감, qty↓
 * DIVIDEND: 포지션 계산 제외
 */
export function calcPensionPositions(
  txs: PensionTransaction[],
  currentPrices: Record<string, number> = {}
): PensionPosition[] {
  type PosEntry = {
    stockCode: string;
    stockName: string;
    accountType: PensionAccountType;
    category?: "BOND" | "EQUITY";
    assetType: "STOCK" | "BOND" | "FUND";
    quantity: number;
    totalCost: number;
    totalRealizedPL: number;
    firstBuyDate?: string;   // 최초 BUY 거래 날짜 (CAGR 계산 기준점)
  };

  const posMap = new Map<string, PosEntry>();

  // 날짜 오름차순 처리 — FIFO 누적
  const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sorted) {
    if (tx.tradeType === "DIVIDEND") continue;

    // 퇴직연금은 category(채권형/주식형)도 키에 포함해 분리 추적
    const key = `${tx.stockCode}::${tx.accountType}::${tx.category ?? ""}`;
    let pos = posMap.get(key);

    if (!pos) {
      pos = {
        stockCode: tx.stockCode,
        stockName: tx.stockName,
        accountType: tx.accountType,
        category: tx.category,
        assetType: tx.assetType,
        quantity: 0,
        totalCost: 0,
        totalRealizedPL: 0,
      };
      posMap.set(key, pos);
    }

    if (tx.tradeType === "BUY") {
      // 최초 BUY 날짜 기록 — sorted 배열이 날짜 오름차순이므로 처음 BUY가 가장 이른 매수일
      if (!pos.firstBuyDate) pos.firstBuyDate = tx.date;
      pos.quantity += tx.quantity;
      pos.totalCost += tx.amount; // 수수료 별도 처리 (enrichSellTransaction과 동일 기준)
    } else if (tx.tradeType === "SELL") {
      // realizedPL: 저장 시 enrichSellTransaction이 계산해둔 값 우선 사용
      if (tx.realizedPL !== undefined) {
        pos.totalRealizedPL += tx.realizedPL;
      } else {
        const avgCost = pos.quantity > 0 ? pos.totalCost / pos.quantity : 0;
        pos.totalRealizedPL += (tx.price - avgCost) * tx.quantity;
      }
      // 잔여 수량 비율로 totalCost 차감 (남은 수량 avgCost 불변)
      if (pos.quantity > 0) {
        pos.totalCost = pos.totalCost * ((pos.quantity - tx.quantity) / pos.quantity);
      }
      pos.quantity = Math.max(0, pos.quantity - tx.quantity);
    }
  }

  // 잔여 수량 > 0인 항목만 포지션으로 반환
  const active = Array.from(posMap.values()).filter((p) => p.quantity > 0);

  // 계좌별 총 평가금액 (비중 계산 기준)
  const evalByAccount = new Map<string, number>();
  for (const p of active) {
    const cur = currentPrices[p.stockCode] ?? 0;
    const avgCost = p.quantity > 0 ? p.totalCost / p.quantity : 0;
    const eval_ = (cur > 0 ? cur : avgCost) * p.quantity;
    const acctKey = `${p.accountType}::${p.category ?? ""}`;
    evalByAccount.set(acctKey, (evalByAccount.get(acctKey) ?? 0) + eval_);
  }

  // 보유기간(개월) 계산 기준일 — 서버 사이드이므로 오늘 날짜 사용
  const today = new Date();

  const result: PensionPosition[] = [];
  for (const p of active) {
    const avgCost = p.quantity > 0 ? p.totalCost / p.quantity : 0;
    const cur = currentPrices[p.stockCode] ?? 0;
    const evalAmount = (cur > 0 ? cur : avgCost) * p.quantity;
    const evalPL = cur > 0 ? evalAmount - avgCost * p.quantity : 0;
    const evalPLPct = cur > 0 && avgCost > 0
      ? (evalPL / (avgCost * p.quantity)) * 100
      : 0;
    const acctKey = `${p.accountType}::${p.category ?? ""}`;
    const totalEval = evalByAccount.get(acctKey) ?? 0;
    const weight = totalEval > 0 ? evalAmount / totalEval : 0;

    // 보유기간 계산 — 최초 매수일부터 오늘까지 월 수 (소수점 포함)
    let holdingMonths: number | undefined;
    if (p.firstBuyDate) {
      const buyDate = new Date(p.firstBuyDate);
      holdingMonths =
        (today.getFullYear() - buyDate.getFullYear()) * 12 +
        (today.getMonth() - buyDate.getMonth()) +
        (today.getDate() - buyDate.getDate()) / 30;
      holdingMonths = Math.max(0, holdingMonths);
    }

    result.push({
      stockCode: p.stockCode,
      stockName: p.stockName,
      accountType: p.accountType,
      category: p.category,
      assetType: p.assetType,
      quantity: Math.round(p.quantity * 1000) / 1000,
      avgCost: Math.floor(avgCost),
      currentPrice: cur,
      evalAmount: Math.round(evalAmount),
      evalPL: Math.round(evalPL),
      evalPLPct: Math.round(evalPLPct * 100) / 100,
      totalRealizedPL: Math.round(p.totalRealizedPL),
      weight: Math.round(weight * 10000) / 10000,
      firstBuyDate: p.firstBuyDate,
      holdingMonths: holdingMonths != null ? Math.round(holdingMonths * 100) / 100 : undefined,
      // CAGR / 월평균 기하수익률은 currentPrice 없으면 null — 클라이언트 enrichedPositions에서 현재가 반영 후 재계산
      cagr: cur > 0 && avgCost > 0 && holdingMonths != null && holdingMonths >= 1
        ? Math.pow(1 + evalPLPct / 100, 12 / holdingMonths) - 1
        : null,
      // 월평균 기하수익률: (1 + 총수익률)^(1/보유개월) - 1
      // ETF 간 보유기간 정규화 비교 지표 — 단위: 월(月)
      monthlyGeoReturn: cur > 0 && avgCost > 0 && holdingMonths != null && holdingMonths >= 1
        ? Math.pow(1 + evalPLPct / 100, 1 / holdingMonths) - 1
        : null,
    });
  }

  return result;
}

// ─────────────────────────────────────────
// SELL 거래 보강 — realizedPL 자동 계산
// ─────────────────────────────────────────

/**
 * SELL 거래 저장 전 현재 avgCost 기준으로 realizedPL 주입
 * longterm의 enrichSellTransaction과 동일 알고리즘,
 * 그룹키만 stockCode + accountType + category로 변경
 */
export function enrichSellTransaction(
  tx: PensionTransaction,
  existingTxs: PensionTransaction[]
): PensionTransaction {
  if (tx.tradeType !== "SELL") return tx;

  // 동일 종목+계좌+카테고리의 이전 거래 (날짜순)
  const relevant = existingTxs
    .filter(
      (t) =>
        t.stockCode === tx.stockCode &&
        t.accountType === tx.accountType &&
        t.category === tx.category &&
        t.tradeType !== "DIVIDEND"
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  let qty = 0;
  let totalCost = 0;

  for (const t of relevant) {
    if (t.tradeType === "BUY") {
      qty += t.quantity;
      totalCost += t.amount;
    } else if (t.tradeType === "SELL") {
      if (qty > 0) totalCost = totalCost * ((qty - t.quantity) / qty);
      qty = Math.max(0, qty - t.quantity);
    }
  }

  const avgCostAtSell = qty > 0 ? totalCost / qty : 0;
  const netSellProceeds = tx.amount - (tx.fee ?? 0);
  const costBasis = avgCostAtSell * tx.quantity;
  const realizedPL = netSellProceeds - costBasis;
  const realizedPLPct = costBasis > 0 ? (realizedPL / costBasis) * 100 : 0;

  return {
    ...tx,
    avgCostAtSell: Math.floor(avgCostAtSell),
    realizedPL: Math.round(realizedPL),
    realizedPLPct: Math.round(realizedPLPct * 100) / 100,
  };
}

// ─────────────────────────────────────────
// 계좌별 요약 계산
// ─────────────────────────────────────────

export function calcPensionAccountSummary(
  positions: PensionPosition[],
  transactions: PensionTransaction[],
  accountType: PensionAccountType
): PensionAccountSummary {
  const acctPositions = positions.filter((p) => p.accountType === accountType);
  const acctTxs       = transactions.filter((t) => t.accountType === accountType);

  // 순 투자금: BUY 합계 - SELL 합계
  const totalBuy  = acctTxs.filter((t) => t.tradeType === "BUY").reduce((s, t) => s + t.amount, 0);
  const totalSell = acctTxs.filter((t) => t.tradeType === "SELL").reduce((s, t) => s + t.amount, 0);

  const totalRealizedPL = acctTxs
    .filter((t) => t.tradeType === "SELL" && t.realizedPL !== undefined)
    .reduce((s, t) => s + (t.realizedPL ?? 0), 0);

  const dividendTotal = acctTxs
    .filter((t) => t.tradeType === "DIVIDEND")
    .reduce((s, t) => s + t.amount, 0);

  const totalEvalAmount = acctPositions.reduce((s, p) => s + p.evalAmount, 0);
  const totalEvalPL     = acctPositions.reduce((s, p) => s + p.evalPL, 0);

  return {
    accountType,
    totalInvested: totalBuy - totalSell,
    totalEvalAmount,
    totalRealizedPL,
    totalEvalPL,
    dividendTotal,
    positionCount: acctPositions.length,
  };
}

// ─────────────────────────────────────────
// 리밸런싱 계산 (RETIREMENT 전용)
// ─────────────────────────────────────────

export interface RebalancingResult {
  totalEval: number;
  bondEval: number;
  equityEval: number;
  currentBondRatio: number;
  currentEquityRatio: number;
  bondDiff: number;    // + = 채권형 매수 필요, - = 매도 필요
  equityDiff: number;
}

export function calcRebalancing(
  positions: PensionPosition[],
  target: PensionRebalancingTarget,
  accountType: "RETIREMENT" | "SAVINGS" = "RETIREMENT"
): RebalancingResult {
  // 해당 계좌 타입의 포지션만 필터링 — 퇴직연금/연금저축 각각 독립 계산
  const retirement = positions.filter((p) => p.accountType === accountType);

  const bondEval   = retirement
    .filter((p) => p.category === "BOND")
    .reduce((s, p) => s + p.evalAmount, 0);
  const equityEval = retirement
    .filter((p) => p.category === "EQUITY")
    .reduce((s, p) => s + p.evalAmount, 0);
  const totalEval  = bondEval + equityEval;

  if (totalEval === 0) {
    return { totalEval: 0, bondEval: 0, equityEval: 0, currentBondRatio: 0, currentEquityRatio: 0, bondDiff: 0, equityDiff: 0 };
  }

  const currentBondRatio   = (bondEval / totalEval) * 100;
  const currentEquityRatio = (equityEval / totalEval) * 100;
  const targetBond   = totalEval * (target.bondRatio / 100);
  const targetEquity = totalEval * (target.equityRatio / 100);

  return {
    totalEval,
    bondEval,
    equityEval,
    currentBondRatio:   Math.round(currentBondRatio * 10) / 10,
    currentEquityRatio: Math.round(currentEquityRatio * 10) / 10,
    bondDiff:   Math.round(targetBond - bondEval),
    equityDiff: Math.round(targetEquity - equityEval),
  };
}
