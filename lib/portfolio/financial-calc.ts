/**
 * 재무현황 통합 계산 모듈
 *
 * 역할:
 * - 각 계좌 포지션을 KRW로 환산하여 집계
 * - 재무제표(FinancialStatementData) 조립
 * - Monthly CF 요약 집계
 *
 * 엑셀 FS-May 2026 / Asset Management 시트 구조 기반으로 재설계:
 * - FUND / KOR Stocks / US Stocks 분리
 * - 임차보증금(Lease Deposit) 별도 처리 → Net Debt/Surplus 계산
 * - CURRENT ASSET / NON-CURRENT ASSET / INVESTMENT ASSET 분리
 */

import type { LongtermPosition, PensionPosition, EducationPosition } from "@/types/portfolio";
import type {
  ExchangeRates,
  MonthlyCFEntry,
  MonthlyCFSummary,
  CFCategoryType,
  FinancialSnapshot,
  FinancialStatementData,
  AssetLineItem,
  AssetManagementColumnData,
  AssetManagementSectionData,
  AssetManagementIIColumnData,
  DepositsColumnData,
  LivePortfolioData,
  TxSummaryByMonth,
} from "@/types/financial";

// ─────────────────────────────────────────
// Monthly CF 집계
// ─────────────────────────────────────────

/**
 * 특정 월의 CF 항목들을 카테고리별로 집계
 * 엑셀 Monthly CF 시트: INCOME / FIXED_EXPENSE / CREDIT_CARD / CASH_EXPENSE / TAX / ACCOUNT_TRANSFER
 */
export function calcMonthlyCFSummary(
  entries: MonthlyCFEntry[],
  month: string
): MonthlyCFSummary {
  // 해당 월 항목만 필터
  const monthEntries = entries.filter((e) => e.month === month);

  // 카테고리별 합산 (amount 부호 그대로)
  const byCategory = {
    INCOME: 0,
    FIXED_EXPENSE: 0,
    CREDIT_CARD: 0,
    CASH_EXPENSE: 0,
    TAX: 0,
    ACCOUNT_TRANSFER: 0,
  } as Record<CFCategoryType, number>;

  for (const e of monthEntries) {
    byCategory[e.category] += e.amount;
  }

  const totalIncome = byCategory.INCOME; // 양수
  // 지출 카테고리는 음수로 저장되므로 절대값으로 변환
  const totalExpense = Math.abs(
    byCategory.FIXED_EXPENSE + byCategory.CREDIT_CARD + byCategory.CASH_EXPENSE + byCategory.TAX
  );
  const totalTransfer = Math.abs(byCategory.ACCOUNT_TRANSFER);
  const netCF = totalIncome - totalExpense - totalTransfer;
  const savingsRate =
    totalIncome > 0 ? (totalIncome - totalExpense - totalTransfer) / totalIncome : 0;

  return {
    month,
    totalIncome,
    totalExpense,
    totalTransfer,
    netCF,
    savingsRate,
    byCategory,
  };
}

/** 최근 N개월의 CF 요약 목록 반환 (차트용) */
export function calcMonthlyCFHistory(
  entries: MonthlyCFEntry[],
  months: string[]
): MonthlyCFSummary[] {
  return months.map((m) => calcMonthlyCFSummary(entries, m));
}

// ─────────────────────────────────────────
// KRW 환산 포트폴리오 합계 헬퍼
// ─────────────────────────────────────────

/** Longterm KRW 포지션 평가액 합계 (FUND 포함, KR 전체) */
export function calcLongtermKrwTotal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "KRW")
    .reduce((sum, p) => sum + p.evalAmount, 0);
}

/** Longterm USD 포지션 평가액 합계 (USD 원본값) */
export function calcLongtermUsdTotal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + p.evalAmount, 0);
}

/** Longterm 중 FUND 자산만 평가액 합계 (KRW) */
export function calcFundKrwTotal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "KRW" && p.assetType === "FUND")
    .reduce((sum, p) => sum + p.evalAmount, 0);
}

/** Longterm 중 국내주식(KR STOCK/ETF)만 평가액 합계 (KRW) */
export function calcKorStocksKrwTotal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "KRW" && (p.assetType === "STOCK" || p.assetType === "ETF") && p.market === "KR")
    .reduce((sum, p) => sum + p.evalAmount, 0);
}

/** Longterm 중 미국주식(US)만 평가액 합계 (USD) */
export function calcUsStocksUsdTotal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + p.evalAmount, 0);
}

/** Longterm 중 FUND 원금 합계 (KRW) */
export function calcFundKrwPrincipal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "KRW" && p.assetType === "FUND")
    .reduce((sum, p) => sum + p.avgCost * p.quantity, 0);
}

/** Longterm 중 국내주식 원금 합계 (KRW) */
export function calcKorStocksKrwPrincipal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "KRW" && (p.assetType === "STOCK" || p.assetType === "ETF") && p.market === "KR")
    .reduce((sum, p) => sum + p.avgCost * p.quantity, 0);
}

/** Longterm 중 미국주식 원금 합계 (USD) */
export function calcUsStocksUsdPrincipal(positions: LongtermPosition[]): number {
  return positions
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + p.avgCost * p.quantity, 0);
}

/** Korean Pension 포지션 평가액 합계 (KRW) */
export function calcPensionKrwTotal(positions: PensionPosition[]): number {
  return positions.reduce((sum, p) => sum + p.evalAmount, 0);
}

/**
 * Education 포지션 평가액 합계 (KRW)
 * currentPrice가 0이면 avgPrice 기준으로 계산
 */
export function calcEducationKrwTotal(positions: EducationPosition[]): number {
  return positions.reduce(
    (sum, p) => sum + (p.currentPrice > 0 ? p.currentPrice : p.avgPrice) * p.quantity,
    0
  );
}

/**
 * Shortterm 포지션 평가액 합계 (KRW)
 * Education과 동일 구조(EducationPosition)이므로 같은 함수 재사용
 */
export const calcShorttermKrwTotal = calcEducationKrwTotal;

// ─────────────────────────────────────────
// 재무제표 조립
// ─────────────────────────────────────────

/**
 * 과거 월(CONFIRMED) 재무제표 데이터 조립
 * 포트폴리오 값은 confirmedPortfolio에 저장된 고정값 사용 (재계산 없음)
 */
export function buildConfirmedStatementData(
  snapshot: FinancialSnapshot,
  prevData?: FinancialStatementData | null
): FinancialStatementData | null {
  if (snapshot.status !== "CONFIRMED" || !snapshot.confirmedPortfolio) return null;

  const { exchangeRates, otherAssets, canadianPension } = snapshot;
  const cp = snapshot.confirmedPortfolio;
  const { usdKrw, cadKrw } = exchangeRates;

  // cp.fundBalance가 0이면 수동입력값(fundMonthly) fallback — lock-balances 미포함 시 대응
  const fundKrw = cp.fundBalance || snapshot.fundMonthly?.balance || 0;
  const korStocksKrw = cp.korStocksBalance;
  const usStocksKrw = cp.usStocksBalanceKrw;
  const usStocksUsd = cp.usStocksBalanceUsd;
  const stockDepositKrw = cp.stockDepositKrw;
  // cp.stockDepositUsd가 0이면 stockDepositByAccount USD 합산 — confirm 시 0 저장된 버그 대응
  const stockDepositUsd = cp.stockDepositUsd > 0
    ? cp.stockDepositUsd
    : Object.values(snapshot.stockDepositByAccount ?? {}).reduce((s: number, a) => s + ((a as {usd?: number})?.usd ?? 0), 0);

  // 연금 투자잔액 (퇴직연금 + 연금저축 + IRP)
  const pensionFundKrwConf = cp.pensionFundBalance + cp.pensionDepositBalance + cp.irpBalance;
  // canadianPensionKrw가 0이어도 balanceCad에서 재계산 (과거 confirm 시 누락 대응)
  const canadianPensionKrw = (cp.canadianPensionKrw && cp.canadianPensionKrw > 0)
    ? cp.canadianPensionKrw
    : Math.round(canadianPension.balanceCad * cadKrw);
  // CONFIRMED 월: pensionCashDeposit는 snap에서 직접 읽음
  const pensionDepositKrwConf =
    (snapshot.pensionCashDeposit?.RETIREMENT ?? 0) +
    (snapshot.pensionCashDeposit?.SAVINGS ?? 0) +
    (snapshot.pensionCashDeposit?.IRP ?? 0);
  // FS pensionKrw 합계 — CONFIRMED도 새 공식 적용 (total asset만 변경, 화면 표시는 불변)
  const pensionKrwConf = pensionFundKrwConf + pensionDepositKrwConf + canadianPensionKrw;
  // 교육 + Digital Asset(크립토)
  const cryptoKrw =
    (snapshot.crypto.upbit.balance || 0) +
    (snapshot.crypto.korbit.balance || 0) +
    Math.round((snapshot.crypto.binance.balance || 0) * usdKrw);
  const educationKrw = cp.education1470Deposit + cp.education1470Stock + cryptoKrw;

  const fixedDepositKrwVal = snapshot.fixedDepositKrw;
  const fixedDepositUsdKrw = Math.round(snapshot.fixedDepositUsd * usdKrw);
  const currentAssetTotal = fixedDepositKrwVal + fixedDepositUsdKrw;
  const nonCurrentAssetTotal = snapshot.realEstate;
  // 투자자산 합계 (FUND/Derivatives 포함)
  const investmentAssetTotal = korStocksKrw + fundKrw + stockDepositKrw +
    usStocksKrw + Math.round(stockDepositUsd * usdKrw);

  const totalAssets = Math.round(
    currentAssetTotal + nonCurrentAssetTotal + investmentAssetTotal +
    pensionKrwConf + educationKrw +
    otherAssets.reduce((s, a) => s + a.amount, 0)
  );

  const nonCurrentLiabilityTotal = snapshot.privateLoan + snapshot.leaseDeposit + snapshot.mortgageLoan;
  const totalDebt = nonCurrentLiabilityTotal;
  const netWorth = totalAssets - totalDebt;

  // 투자+연금+교육 합계
  const investmentPensionTotal = investmentAssetTotal + pensionKrwConf + educationKrw;

  // CAPITAL 변동 내역 (전월 대비)
  const prevNetWorthVal = prevData?.netWorth ?? 0;
  const capitalNetChanges = prevData ? netWorth - prevNetWorthVal : 0;
  const capitalChangeInCurrentAsset = prevData
    ? currentAssetTotal - prevData.assets.currentAsset.total : 0;
  const capitalChangeInNonCurrentAsset = prevData
    ? nonCurrentAssetTotal - prevData.assets.nonCurrentAsset.total : 0;
  const capitalChangeInInvestmentAsset = prevData
    ? investmentAssetTotal - prevData.assets.investmentAsset.total : 0;
  const capitalChangeInPensionEducation = prevData
    ? (pensionKrwConf + educationKrw) -
      (prevData.assets.pensionKrw + prevData.assets.educationKrw) : 0;
  const capitalChangeInLiability = prevData
    ? -(totalDebt - prevData.liabilities.totalDebt) : 0;

  const investmentTotal = investmentAssetTotal;
  const cashTotal = fixedDepositKrwVal + fixedDepositUsdKrw;
  const assetTotal = investmentTotal + cashTotal;
  const netDebtSurplus = assetTotal - snapshot.leaseDeposit;

  const investmentPortfolio: AssetLineItem[] = [
    { label: "국내 펀드 (FUND)", amountKrw: fundKrw, currency: "KRW" },
    { label: "국내주식/ETF (KRW)", amountKrw: korStocksKrw, currency: "KRW" },
    {
      label: "미국주식/ETF (USD)",
      amountKrw: usStocksKrw,
      currency: "USD",
      originalAmount: usStocksUsd,
      exchangeRate: usdKrw,
    },
  ];

  const pension: AssetLineItem[] = [
    // DRAFT와 동일하게 펀드잔액 + 현금예수금 합산 (캐나다 제외 — 별도 항목)
    { label: "연금 (국내)", amountKrw: pensionFundKrwConf + pensionDepositKrwConf, currency: "KRW" },
    {
      label: "연금 (캐나다 RESP/RRSP)",
      amountKrw: canadianPensionKrw,
      currency: "CAD",
      originalAmount: canadianPension.balanceCad,
      exchangeRate: cadKrw,
    },
  ];

  return {
    month: snapshot.month,
    status: "CONFIRMED",
    exchangeRates,
    assets: {
      currentAsset: {
        cashEquivalent: 0,
        foreignDepositUsd: 0,
        foreignDepositCad: 0,
        fixedDepositUsd: fixedDepositUsdKrw,
        fixedDepositKrw: fixedDepositKrwVal,
        total: currentAssetTotal,
      },
      nonCurrentAsset: {
        realEstate: snapshot.realEstate,
        total: nonCurrentAssetTotal,
      },
      investmentAsset: {
        korStocks: korStocksKrw,
        fund: fundKrw,  // 값 보존 (자산관리 탭용), FS 표시는 제외
        stockDepositKrw,
        usStocksKrw,
        usStocksUsd,
        usStocksDepositKrw: Math.round(stockDepositUsd * usdKrw),
        usStocksDepositUsd: stockDepositUsd,
        total: investmentAssetTotal,
      },
      pensionKrw: pensionKrwConf,   // 3개 항목 합산 (CONFIRMED도 동일 구조)
      educationKrw,
      investmentPensionTotal: Math.round(investmentPensionTotal),
      totalAssets,
      // CONFIRMED도 DRAFT와 동일하게 3개 항목 세분화
      pensionBreakdown: {
        pensionFundKrw: pensionFundKrwConf,
        pensionDepositKrw: pensionDepositKrwConf,
        respRrspKrw: canadianPensionKrw,
      },
      investmentPortfolio,
      pension,
      education: { label: "교육저축 (1470)", amountKrw: educationKrw, currency: "KRW" },
      shortterm: { label: "Short-term 계좌", amountKrw: stockDepositKrw, currency: "KRW" },
      digitalAssets: { label: "가상자산", amountKrw: 0, currency: "KRW" },
      cash: { label: "정기예금 KRW", amountKrw: fixedDepositKrwVal, currency: "KRW" },
      otherAssets: [
        { label: "부동산", amountKrw: snapshot.realEstate },
        ...otherAssets.map((a) => ({ label: a.name, amountKrw: a.amount })),
      ],
    },
    liabilities: {
      currentLiability: 0,
      privateLoan: snapshot.privateLoan,
      leaseDeposit: snapshot.leaseDeposit,
      nonCurrentLiabilityTotal,
      totalDebt,
    },
    netWorth: Math.round(netWorth),
    capital: {
      prevNetWorth: Math.round(prevNetWorthVal),
      netChanges: Math.round(capitalNetChanges),
      changeInCurrentAsset: Math.round(capitalChangeInCurrentAsset),
      changeInNonCurrentAsset: Math.round(capitalChangeInNonCurrentAsset),
      changeInInvestmentAsset: Math.round(capitalChangeInInvestmentAsset),
      changeInPensionEducation: Math.round(capitalChangeInPensionEducation),
      changeInLiability: Math.round(capitalChangeInLiability),
    },
    assetManagement: {
      fundKrw,
      korStocksKrw,
      usStocksKrw,
      usStocksUsd,
      stockDepositKrw,
      stockDepositUsd,
      investmentTotal: Math.round(investmentTotal),
      fixedDepositKrw: fixedDepositKrwVal,
      cashEquivalent: 0,
      cashTotal: Math.round(cashTotal),
      assetTotal: Math.round(assetTotal),
      leaseDeposit: snapshot.leaseDeposit,
      netDebtSurplus: Math.round(netDebtSurplus),
    },
  };
}

// ─────────────────────────────────────────
// 스냅샷 유틸
// ─────────────────────────────────────────

/**
 * 현재 연월 문자열 반환 ("2026-05" 형식)
 */
export function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * 최근 N개월의 연월 배열 생성 (최신순)
 * 예: getRecentMonths(3) → ["2026-05", "2026-04", "2026-03"]
 */
export function getRecentMonths(n: number, from?: string): string[] {
  const base = from ?? currentMonth();
  const [y, m] = base.split("-").map(Number);
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const date = new Date(y, m - 1 - i, 1);
    months.push(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

// ─────────────────────────────────────────
// 자산관리 연간 테이블 계산
// ─────────────────────────────────────────

/** 빈 섹션 데이터 기본값 */
function emptySectionData(): AssetManagementSectionData {
  return {
    principal: 0,
    bid: 0,
    askBv: 0,
    fixedPnl: 0,
    cumFixedPnl: 0,
    cumBid: 0,
    cumAskBv: 0,
    balance: 0,
    monthlyPnl: 0,
    cumPnl: 0,
    pct: 0,
    cumPct: 0,
  };
}

/**
 * 월간 손익 계산
 * Monthly P/L = (Balance + Fixed P/L) - Prev Balance - (Bid - Ask BV)
 * 이 공식은 엑셀 Asset Management 수식을 그대로 반영
 */
function calcMonthlyPnl(
  balance: number,
  fixedPnl: number,
  prevBalance: number,
  bid: number,
  askBv: number
): number {
  return balance + fixedPnl - prevBalance - bid + askBv;
}

/**
 * 자산관리 연간 테이블 데이터 생성
 *
 * 엑셀 Asset Management 시트 구조 기반:
 * - baseline: 전년 12월 (Dec-{year-1})
 * - columns: Jan~Dec {year}
 * - CONFIRMED 월: confirmedPortfolio 사용
 * - DRAFT 월: liveData + snapshot.fundMonthly 사용
 * - 스냅샷 없는 월: hasData=false 빈 컬럼
 */
export function buildAssetManagementYearlyData(
  snapshots: FinancialSnapshot[],
  liveData: LivePortfolioData | null,
  year: number,
  txSummaries?: TxSummaryByMonth
): AssetManagementColumnData[] {
  // ── 대상 월 목록: Dec-{year-1} + Jan~Dec {year} ──────────
  const baselineMonth = `${year - 1}-12`;
  const yearMonths = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );
  const allMonths = [baselineMonth, ...yearMonths];

  // ── 스냅샷 맵 (month → snapshot) ──────────────────────
  const snapMap = new Map(snapshots.map((s) => [s.month, s]));

  // ── 누적 손익 · 매수 추적 (각 섹션별로 이전 월부터 누적) ─────
  // YTD P/L % 분모: 엑셀 공식 = cumPnl / (DecBalance + cumBid)
  // cumBid / cumAskBv 는 YTD Principal · Bid · AskBV 행 표시에도 사용
  let fundCumPnl = 0;
  let fundCumFixedPnl = 0;
  let fundCumBid = 0;
  let fundCumAskBv = 0;
  let korCumPnl = 0;
  let korCumFixedPnl = 0;
  let korCumBid = 0;
  let korCumAskBv = 0;
  let krwCumPnl = 0;
  let usCumPnl = 0;
  let usCumFixedPnl = 0;
  let usCumBid = 0;
  let usCumAskBv = 0;

  const curMonth = currentMonth();
  const columns: AssetManagementColumnData[] = [];

  for (let i = 0; i < allMonths.length; i++) {
    const month = allMonths[i];
    const isBaseline = month === baselineMonth;
    const snap = snapMap.get(month);

    if (!snap) {
      // 스냅샷 없는 월: 현재 진행 중 달이면 isDraft=true, 그 외 빈 컬럼
      const isDraft = !isBaseline && month === curMonth;
      columns.push({
        month,
        isBaseline,
        isDraft,
        hasData: false,
        isBalanceLocked: false,
        usdKrw: 1475.27,
        exchangeRates: { usdKrw: 1475.27, cadKrw: 1086.59 },
        fund: emptySectionData(),
        korStocks: emptySectionData(),
        krwTotal: emptySectionData(),
        usStocks: emptySectionData(),
        stockDepositKrw: 0,
        stockDepositUsd: 0,
        stockDepositByAccount: undefined,
        cashForeignUsd: 0,
        cashForeignCad: 0,
        fixedDepositKrw: 0,
        fixedDepositUsd: 0,
        netDebtSurplus: 0,
        investmentTotal: 0,
        cashTotal: 0,
        assetTotal: 0,
        leaseDeposit: 0,
        krwStocksBalance: 0,
        usStocksBalanceKrw: 0,
        stockDepositUsdKrw: 0,
      });
      continue;
    }

    const isDraft = snap.status === "DRAFT";
    const cp = snap.confirmedPortfolio;
    const usdKrw = snap.exchangeRates.usdKrw;

    // 이전 컬럼 잔액 (Monthly P/L 계산용)
    const prevCol = columns.length > 0 ? columns[columns.length - 1] : null;
    const prevFundBalance = prevCol ? prevCol.fund.balance : 0;
    const prevKorBalance = prevCol ? prevCol.korStocks.balance : 0;
    const prevKrwBalance = prevCol ? prevCol.krwTotal.balance : 0;
    const prevUsBalance = prevCol ? prevCol.usStocks.balance : 0;

    // ── FUND 데이터 ──────────────────────────────────────
    // CONFIRMED: confirmedPortfolio / DRAFT: 거래내역(monthlyTxSummary) + liveData
    let fundData: AssetManagementSectionData;
    if (isDraft) {
      // DRAFT: fundMonthly 수동입력이 있으면 최우선, 없으면 liveData / 거래내역 fallback
      const fm = snap.fundMonthly;
      const hasFm = fm != null; // 사용자가 한 번이라도 저장한 경우
      const balance = hasFm ? fm.balance : (liveData?.fund.balance ?? 0);
      // Principal = 전월잔고 (엑셀 구조) — 이전 컬럼의 balance 사용
      const principal = prevFundBalance > 0 ? prevFundBalance : (fm?.principal ?? (liveData?.fund.principal ?? 0));
      // fundMonthly 수동입력 최우선 → 거래내역 → 0
      const bid      = hasFm ? fm.bid      : (liveData?.monthlyTxSummary?.fund.bid      ?? 0);
      const askBv    = hasFm ? fm.askBv    : (liveData?.monthlyTxSummary?.fund.askBv    ?? 0);
      const fixedPnl = hasFm ? fm.fixedPnl : (liveData?.monthlyTxSummary?.fund.fixedPnl ?? 0);
      const monthlyPnl = prevFundBalance > 0
        ? calcMonthlyPnl(balance, fixedPnl, prevFundBalance, bid, askBv)
        : 0;
      // CONFIRMED 블록과 대칭: isBaseline 시 누적값 리셋 (연도 전환 엣지 케이스 방어)
      if (isBaseline) {
        fundCumFixedPnl = 0;
        fundCumPnl = 0;
        fundCumBid = 0;
        fundCumAskBv = 0;
      } else {
        fundCumFixedPnl += fixedPnl;
        fundCumPnl += monthlyPnl;
        fundCumBid += bid;
        fundCumAskBv += askBv;
      }
      fundData = {
        principal,
        bid,
        askBv,
        fixedPnl,
        cumFixedPnl: fundCumFixedPnl,
        cumBid: fundCumBid,
        cumAskBv: fundCumAskBv,
        balance,
        monthlyPnl: isBaseline ? 0 : monthlyPnl,
        cumPnl: fundCumPnl,
        // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
        pct: isBaseline || (prevFundBalance + bid) === 0 ? 0
          : monthlyPnl / (prevFundBalance + bid),
        cumPct: 0, // YTD는 별도 계산
      };
    } else if (cp) {
      // CONFIRMED: fundMonthly(수동입력) > cp(엑셀값) > txSummaries(거래내역) 우선순위
      const fm = snap.fundMonthly;
      const balance = fm?.balance ?? cp.fundBalance;
      const txFundBid      = txSummaries?.[month]?.fund.bid      ?? 0;
      const txFundAskBv    = txSummaries?.[month]?.fund.askBv    ?? 0;
      const txFundFixedPnl = txSummaries?.[month]?.fund.fixedPnl ?? 0;
      const bid      = fm?.bid      ?? ((cp.fundBid      !== undefined && cp.fundBid      !== 0) ? cp.fundBid      : txFundBid);
      const askBv    = fm?.askBv    ?? ((cp.fundAskBv    !== undefined && cp.fundAskBv    !== 0) ? cp.fundAskBv    : txFundAskBv);
      const fixedPnl = fm?.fixedPnl ?? ((cp.fundFixedPnl !== undefined && cp.fundFixedPnl !== 0) ? cp.fundFixedPnl : txFundFixedPnl);
      const monthlyPnl = isBaseline ? 0
        : calcMonthlyPnl(balance, fixedPnl, prevFundBalance, bid, askBv);
      // baseline 컬럼에서 누적 초기화
      // 엑셀 구조: Jan부터 YTD 리셋. baseline(Dec) 행은 cp 값 직접 표시,
      // 러닝 토탈은 0으로 리셋해 Jan부터 정확한 YTD 누적 시작
      if (isBaseline) {
        fundCumFixedPnl = 0;
        fundCumPnl = 0;
        fundCumBid = 0;
        fundCumAskBv = 0;
      } else {
        fundCumFixedPnl += fixedPnl;
        fundCumPnl += monthlyPnl;
        fundCumBid += bid;
        fundCumAskBv += askBv;
      }
      fundData = {
        principal: cp.fundPrincipal,
        bid,
        askBv,
        fixedPnl,
        cumFixedPnl: isBaseline ? (cp.fundCumFixedPnl ?? 0) : fundCumFixedPnl,
        cumBid: isBaseline ? 0 : fundCumBid,
        cumAskBv: isBaseline ? 0 : fundCumAskBv,
        balance,
        monthlyPnl,
        cumPnl: isBaseline ? cp.fundCumPnl : fundCumPnl,
        // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
        pct: isBaseline || (prevFundBalance + bid) === 0 ? 0
          : monthlyPnl / (prevFundBalance + bid),
        cumPct: 0,
      };
    } else {
      fundData = emptySectionData();
    }

    // ── KOR Stocks 데이터 ────────────────────────────────
    let korData: AssetManagementSectionData;
    if (isDraft) {
      const balance = liveData?.korStocks.balance ?? 0;
      // 거래 내역: 당월 매수/매도 집계 (principal 계산에 사용)
      const bid      = liveData?.monthlyTxSummary?.korStocks.bid      ?? 0;
      const askBv    = liveData?.monthlyTxSummary?.korStocks.askBv    ?? 0;
      const fixedPnl = liveData?.monthlyTxSummary?.korStocks.fixedPnl ?? 0;
      // Principal = 전월잔고 + 당월Bid - 당월Ask(BV)
      // 엑셀 공식: Principal + AskBV = PrevBalance + Bid (수익률 분모와 일치)
      const principal = prevKorBalance > 0 ? prevKorBalance + bid - askBv : (liveData?.korStocks.principal ?? 0);
      // Monthly P/L = balance + fixedPnl - prevBalance - bid + askBv
      const monthlyPnl = prevKorBalance > 0
        ? calcMonthlyPnl(balance, fixedPnl, prevKorBalance, bid, askBv)
        : 0;
      if (isBaseline) {
        korCumFixedPnl = 0;
        korCumPnl = 0;
        korCumBid = 0;
        korCumAskBv = 0;
      } else {
        korCumFixedPnl += fixedPnl;
        korCumPnl += monthlyPnl;
        korCumBid += bid;
        korCumAskBv += askBv;
      }
      korData = {
        principal,
        bid,
        askBv,
        fixedPnl,
        cumFixedPnl: korCumFixedPnl,
        cumBid: korCumBid,
        cumAskBv: korCumAskBv,
        balance,
        monthlyPnl: isBaseline ? 0 : monthlyPnl,
        cumPnl: korCumPnl,
        // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
        pct: isBaseline || (prevKorBalance + bid) === 0 ? 0
          : monthlyPnl / (prevKorBalance + bid),
        cumPct: 0,
      };
    } else if (cp) {
      // CONFIRMED: cp 값이 0이면 txSummaries fallback 사용
      // cp에 명시적 수동 값(0 아님)이 있으면 우선, 없거나 0이면 거래내역에서 가져옴
      const balance = cp.korStocksBalance;
      const txKorBid      = txSummaries?.[month]?.korStocks.bid      ?? 0;
      const txKorAskBv    = txSummaries?.[month]?.korStocks.askBv    ?? 0;
      const txKorFixedPnl = txSummaries?.[month]?.korStocks.fixedPnl ?? 0;
      const bid      = (cp.korStocksBid      !== undefined && cp.korStocksBid      !== 0) ? cp.korStocksBid      : txKorBid;
      const askBv    = (cp.korStocksAskBv    !== undefined && cp.korStocksAskBv    !== 0) ? cp.korStocksAskBv    : txKorAskBv;
      const fixedPnl = (cp.korStocksFixedPnl !== undefined && cp.korStocksFixedPnl !== 0) ? cp.korStocksFixedPnl : txKorFixedPnl;
      const monthlyPnl = isBaseline ? 0
        : calcMonthlyPnl(balance, fixedPnl, prevKorBalance, bid, askBv);
      // 엑셀 구조: Jan부터 YTD 리셋. baseline(Dec) 행은 cp 값 직접 표시,
      // 러닝 토탈은 0으로 리셋해 Jan부터 정확한 YTD 누적 시작
      if (isBaseline) {
        korCumFixedPnl = 0;
        korCumPnl = 0;
        korCumBid = 0;
        korCumAskBv = 0;
      } else {
        korCumFixedPnl += fixedPnl;
        korCumPnl += monthlyPnl;
        korCumBid += bid;
        korCumAskBv += askBv;
      }
      // Principal = 전월잔고 + 당월Bid - 당월AskBV (DRAFT와 동일 공식)
      // Dec baseline이면 저장값 그대로 사용
      const korPrincipal = prevKorBalance > 0 ? prevKorBalance + bid - askBv : cp.korStocksPrincipal;
      korData = {
        principal: korPrincipal,
        bid,
        askBv,
        fixedPnl,
        cumFixedPnl: isBaseline ? (cp.korStocksCumFixedPnl ?? 0) : korCumFixedPnl,
        cumBid: isBaseline ? 0 : korCumBid,
        cumAskBv: isBaseline ? 0 : korCumAskBv,
        balance,
        monthlyPnl,
        cumPnl: isBaseline ? cp.korStocksCumPnl : korCumPnl,
        // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
        pct: isBaseline || (prevKorBalance + bid) === 0 ? 0
          : monthlyPnl / (prevKorBalance + bid),
        cumPct: 0,
      };
    } else {
      korData = emptySectionData();
    }

    // ── KRW Total (Fund + KOR Stocks 합산) ──────────────
    const krwBalance = fundData.balance + korData.balance;
    const krwBid = fundData.bid + korData.bid;
    const krwAskBv = fundData.askBv + korData.askBv;
    const krwFixedPnl = fundData.fixedPnl + korData.fixedPnl;
    const krwMonthlyPnl = isBaseline ? 0
      : calcMonthlyPnl(krwBalance, krwFixedPnl, prevKrwBalance, krwBid, krwAskBv);
    if (isBaseline) {
      krwCumPnl = fundData.cumPnl + korData.cumPnl;
    } else {
      krwCumPnl += krwMonthlyPnl;
    }
    const krwTotal: AssetManagementSectionData = {
      principal: fundData.principal + korData.principal,
      bid: krwBid,
      askBv: krwAskBv,
      fixedPnl: krwFixedPnl,
      cumFixedPnl: fundData.cumFixedPnl + korData.cumFixedPnl,
      // KRW Total cumBid/cumAskBv = Fund + KOR 합산
      cumBid: fundData.cumBid + korData.cumBid,
      cumAskBv: fundData.cumAskBv + korData.cumAskBv,
      balance: krwBalance,
      monthlyPnl: krwMonthlyPnl,
      cumPnl: isBaseline ? fundData.cumPnl + korData.cumPnl : krwCumPnl,
      // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
      pct: isBaseline || (prevKrwBalance + krwBid) === 0 ? 0
        : krwMonthlyPnl / (prevKrwBalance + krwBid),
      cumPct: 0,
    };

    // ── US Stocks (USD) ──────────────────────────────────
    let usData: AssetManagementSectionData;
    if (isDraft) {
      const balance = liveData?.usStocks.balanceUsd ?? 0;
      // 거래 내역: 당월 매수/매도 집계 (USD, principal 계산에 사용)
      const bid      = liveData?.monthlyTxSummary?.usStocks.bid      ?? 0;
      const askBv    = liveData?.monthlyTxSummary?.usStocks.askBv    ?? 0;
      const fixedPnl = liveData?.monthlyTxSummary?.usStocks.fixedPnl ?? 0;
      // Principal = 전월잔고 + 당월Bid - 당월Ask(BV) (USD)
      // 엑셀 공식: Principal + AskBV = PrevBalance + Bid (수익률 분모와 일치)
      const principal = prevUsBalance > 0 ? prevUsBalance + bid - askBv : (liveData?.usStocks.principalUsd ?? 0);
      const monthlyPnl = prevUsBalance > 0
        ? calcMonthlyPnl(balance, fixedPnl, prevUsBalance, bid, askBv)
        : 0;
      if (isBaseline) {
        usCumFixedPnl = 0;
        usCumPnl = 0;
        usCumBid = 0;
        usCumAskBv = 0;
      } else {
        usCumFixedPnl += fixedPnl;
        usCumPnl += monthlyPnl;
        usCumBid += bid;
        usCumAskBv += askBv;
      }
      usData = {
        principal,
        bid,
        askBv,
        fixedPnl,
        cumFixedPnl: usCumFixedPnl,
        cumBid: usCumBid,
        cumAskBv: usCumAskBv,
        balance,
        monthlyPnl: isBaseline ? 0 : monthlyPnl,
        cumPnl: usCumPnl,
        // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
        pct: isBaseline || (prevUsBalance + bid) === 0 ? 0
          : monthlyPnl / (prevUsBalance + bid),
        cumPct: 0,
      };
    } else if (cp) {
      // CONFIRMED: cp 값이 0이면 txSummaries fallback 사용
      // cp에 명시적 수동 값(0 아님)이 있으면 우선, 없거나 0이면 거래내역에서 가져옴
      const balance = cp.usStocksBalanceUsd;
      const txUsBid      = txSummaries?.[month]?.usStocks.bid      ?? 0;
      const txUsAskBv    = txSummaries?.[month]?.usStocks.askBv    ?? 0;
      const txUsFixedPnl = txSummaries?.[month]?.usStocks.fixedPnl ?? 0;
      const bid      = (cp.usStocksBidUsd      !== undefined && cp.usStocksBidUsd      !== 0) ? cp.usStocksBidUsd      : txUsBid;
      const askBv    = (cp.usStocksAskBvUsd    !== undefined && cp.usStocksAskBvUsd    !== 0) ? cp.usStocksAskBvUsd    : txUsAskBv;
      const fixedPnl = (cp.usStocksFixedPnlUsd !== undefined && cp.usStocksFixedPnlUsd !== 0) ? cp.usStocksFixedPnlUsd : txUsFixedPnl;
      const monthlyPnl = isBaseline ? 0
        : calcMonthlyPnl(balance, fixedPnl, prevUsBalance, bid, askBv);
      // 엑셀 구조: Jan부터 YTD 리셋. baseline(Dec) 행은 cp 값 직접 표시,
      // 러닝 토탈은 0으로 리셋해 Jan부터 정확한 YTD 누적 시작
      if (isBaseline) {
        usCumFixedPnl = 0;
        usCumPnl = 0;
        usCumBid = 0;
        usCumAskBv = 0;
      } else {
        usCumFixedPnl += fixedPnl;
        usCumPnl += monthlyPnl;
        usCumBid += bid;
        usCumAskBv += askBv;
      }
      // Principal = 전월잔고 + 당월Bid - 당월AskBV (USD, DRAFT와 동일 공식)
      const usPrincipal = prevUsBalance > 0 ? prevUsBalance + bid - askBv : cp.usStocksPrincipalUsd;
      usData = {
        principal: usPrincipal,
        bid,
        askBv,
        fixedPnl,
        cumFixedPnl: isBaseline ? (cp.usStocksCumFixedPnlUsd ?? 0) : usCumFixedPnl,
        cumBid: isBaseline ? 0 : usCumBid,
        cumAskBv: isBaseline ? 0 : usCumAskBv,
        balance,
        monthlyPnl,
        cumPnl: isBaseline ? cp.usStocksCumPnlUsd : usCumPnl,
        // 엑셀 수식: Monthly P/L / (Principal + Ask(BV)) = Monthly P/L / (PrevBalance + Bid)
        pct: isBaseline || (prevUsBalance + bid) === 0 ? 0
          : monthlyPnl / (prevUsBalance + bid),
        cumPct: 0,
      };
    } else {
      usData = emptySectionData();
    }

    // ── 예수금 ───────────────────────────────────────────
    // 소스 우선순위: stockDepositByAccount 합산 > liveData / cp (레거시)
    // 이유: shortterm-account.json이 현금이 아닌 주식 포지션을 보관하므로
    //       liveData/cp의 stockDepositKrw는 주식평가액일 수 있다.
    //       계좌별 현금잔액은 월별 수동입력된 stockDepositByAccount가 정확함.
    let stockDepositKrw = 0;
    let stockDepositUsd = 0;

    const byAccountKrwTotal = Object.values(snap.stockDepositByAccount ?? {})
      .reduce((sum, v) => sum + (v.krw ?? 0), 0);
    const byAccountUsdTotal = Object.values(snap.stockDepositByAccount ?? {})
      .reduce((sum, v) => sum + (v.usd ?? 0), 0);

    if (isDraft) {
      // byAccount 합산 우선 → Edit 다이얼로그 직접 입력값
      // liveData.stockDepositKrw는 shortterm(2805) 주식평가액이므로 사용 불가
      stockDepositKrw = byAccountKrwTotal || snap.stockDepositKrw || 0;
      stockDepositUsd = byAccountUsdTotal || snap.stockDepositUsd || 0;
    } else if (cp) {
      // CONFIRMED: KRW는 byAccount 합산 (수동 입력값이 cp와 동일하거나 더 최신)
      //            USD는 cp 저장값 사용 — byAccount는 정수(소수점 없음)라서
      //            엑셀의 소수점 포함 확정값(ex: 37.61)과 차이 발생
      // || 대신 키 존재 여부로 분기 — 실제 잔액이 0원인 경우와 미입력을 구분
      // byAccountKrwTotal > 0 조건 추가: 키가 있어도 합산이 0이면 cp 확정값 사용
      // (Jan처럼 stockDepositByAccount={4802:{krw:0},...} 형태로 저장된 경우 방어)
      const hasByAccountInput = Object.keys(snap.stockDepositByAccount ?? {}).length > 0;
      stockDepositKrw = (hasByAccountInput && byAccountKrwTotal > 0) ? byAccountKrwTotal : cp.stockDepositKrw;
      stockDepositUsd = cp.stockDepositUsd;
    }

    // ── Cash & Equivalent ────────────────────────────────
    const cashForeignUsd = snap.cashForeignUsd ?? 0;
    const cashForeignCad = snap.cashForeignCad ?? 0;
    const fixedDepositKrw = snap.fixedDepositKrw;
    const fixedDepositUsd = snap.fixedDepositUsd;

    // ── Summary 계산 ─────────────────────────────────────
    // Investment Total = KRW Total + US Stocks(KRW환산) + 예수금
    //
    // 엑셀 수식: 각 항목을 반올림 없이 합산 후 최종값만 정수 표시
    //   row74 = usBalanceUsd * usdKrw  (소수점 유지)
    //   row75 = depositUsd  * usdKrw  (소수점 유지)
    //   row70 = SUM(row71..75)         (합산 후 정수 표시)
    //
    // 개별 항목에 Math.round를 적용하면 ±1원 오차 발생 — 최종 합에만 반올림
    // DRAFT: liveData.balanceKrw (이미 정수) 우선, 없으면 float 계산
    const usBalanceKrwRaw = isDraft
      ? (liveData?.usStocks.balanceKrw ?? usData.balance * usdKrw)
      : usData.balance * usdKrw;
    // stockDepositUsd: CONFIRMED는 cp 저장값(소수점 포함, ex: 37.61) 사용
    //                  byAccount는 정수라 .61 등이 소실됨
    const stockDepositUsdKrwRaw = stockDepositUsd * usdKrw;
    // FUND/Derivatives 포함 — KOR Stocks + FUND + US Stocks + Stock Deposit 합산
    const investmentTotal = Math.round(fundData.balance + korData.balance + usBalanceKrwRaw + stockDepositKrw + stockDepositUsdKrwRaw);

    // Cash Total = 외화예금 KRW환산 + 정기예금
    const cashForeignUsdKrw = Math.round(cashForeignUsd * usdKrw);
    const cashForeignCadKrw = Math.round(cashForeignCad * (snap.exchangeRates.cadKrw ?? 1086.59));
    const fixedDepositUsdKrw = Math.round(fixedDepositUsd * usdKrw);
    const cashTotal = cashForeignUsdKrw + cashForeignCadKrw + fixedDepositKrw + fixedDepositUsdKrw;

    const assetTotal = investmentTotal + cashTotal;
    const leaseDeposit = snap.leaseDeposit;
    const netDebtSurplus = assetTotal - leaseDeposit;

    // ── 계좌별 예수금 세부 내역 ──────────────────────────
    // CONFIRMED: confirmedPortfolio 또는 스냅샷 직접 입력
    // DRAFT: 스냅샷의 stockDepositByAccount 사용
    const stockDepositByAccount =
      snap.stockDepositByAccount ??
      (cp?.stockDepositByAccount ?? undefined);

    columns.push({
      month,
      isBaseline,
      isDraft,
      hasData: true,
      isBalanceLocked: !!snap.lockedBalances,
      usdKrw,
      // 환율 섹션 테이블 표시용 — 해당 월의 확정/실시간 환율
      exchangeRates: {
        usdKrw: snap.exchangeRates.usdKrw,
        cadKrw: snap.exchangeRates.cadKrw ?? 1086.59,
      },
      fund: fundData,
      korStocks: korData,
      krwTotal,
      usStocks: usData,
      stockDepositKrw,
      stockDepositUsd,
      stockDepositByAccount,
      cashForeignUsd,
      cashForeignCad,
      fixedDepositKrw,
      fixedDepositUsd,
      netDebtSurplus,
      investmentTotal,
      cashTotal,
      assetTotal,
      leaseDeposit,
      // ── Summary 세부항목 ────────────────────────────────────
      // krwStocksBalance: KOR Stocks만 (FUND 제외)
      krwStocksBalance: korData.balance,
      // usStocksBalanceKrw: US Stocks KRW 환산 (DRAFT: liveData 기반)
      usStocksBalanceKrw: usBalanceKrwRaw,
      // stockDepositUsdKrw: USD 예수금 KRW 환산
      stockDepositUsdKrw: stockDepositUsdKrwRaw,
    });
  }

  // ── YTD 누적 수익률 계산 (각 섹션 cumPct) ───────────────
  // 엑셀 공식: cumPnl / (DecBalance + cumBid)
  //   Q21 = Q20 / (Q13 + Q15)
  //   Q13 + Q15 = (DecBalance + cumBid - cumAskBv) + cumAskBv = DecBalance + cumBid
  // 즉, 분모는 "기초잔액 + 올해 누적 매수액"으로, 추가 투입 자본을 반영한 정확한 수익률
  const janIdx = columns.findIndex((c) => c.month === `${year}-01`);
  if (janIdx > 0) {
    const baselineCol = columns[janIdx - 1]; // Dec-{year-1}
    const baseFund = baselineCol.fund.balance;
    const baseKor = baselineCol.korStocks.balance;
    const baseKrw = baselineCol.krwTotal.balance;
    const baseUs = baselineCol.usStocks.balance;

    for (let i = janIdx; i < columns.length; i++) {
      const col = columns[i];
      if (!col.hasData) continue;
      // 분모 = DecBalance + cumBid (누적 매수 포함으로 추가 투입 자본 반영)
      col.fund.cumPct = (baseFund + col.fund.cumBid) > 0
        ? col.fund.cumPnl / (baseFund + col.fund.cumBid) : 0;
      col.korStocks.cumPct = (baseKor + col.korStocks.cumBid) > 0
        ? col.korStocks.cumPnl / (baseKor + col.korStocks.cumBid) : 0;
      col.krwTotal.cumPct = (baseKrw + col.krwTotal.cumBid) > 0
        ? col.krwTotal.cumPnl / (baseKrw + col.krwTotal.cumBid) : 0;
      col.usStocks.cumPct = (baseUs + col.usStocks.cumBid) > 0
        ? col.usStocks.cumPnl / (baseUs + col.usStocks.cumBid) : 0;
    }
  }

  return columns;
}

// ─────────────────────────────────────────
// Deposit & FX 연간 테이블
// ─────────────────────────────────────────

/**
 * Deposit & FX 관리 페이지용 연간 데이터 빌드
 * Dec-{year-1}(baseline) + Jan~Dec{year} 컬럼 배열 반환
 */
export function buildDepositsYearlyData(
  snapshots: FinancialSnapshot[],
  year: number
): DepositsColumnData[] {
  const columns: DepositsColumnData[] = [];

  // baseline + 12개월 순서로 처리
  const months: Array<{ month: string; isBaseline: boolean }> = [
    { month: `${year - 1}-12`, isBaseline: true },
    ...Array.from({ length: 12 }, (_, i) => ({
      month: `${year}-${String(i + 1).padStart(2, "0")}`,
      isBaseline: false,
    })),
  ];

  const curMonth = currentMonth();

  for (const { month, isBaseline } of months) {
    const snap = snapshots.find((s) => s.month === month);
    const isDraft = !isBaseline && month === curMonth && (!snap || snap.status !== "CONFIRMED");

    if (!snap) {
      // 해당 월 스냅샷 없음 — 빈 컬럼
      columns.push({
        month,
        isBaseline,
        isDraft,
        hasData: false,
        exchangeRates: { usdKrw: 1300, cadKrw: 1000 },
        stockDepositByAccount: {
          "4802": { krw: 0, usd: 0 },
          "1635": { krw: 0, usd: 0 },
          "1402": { krw: 0, usd: 0 },
        },
        shortterm2805Deposit: 0,
        education1470Deposit: 0,
        pensionCashDeposit: { RETIREMENT: 0, SAVINGS: 0, IRP: 0 },
        cashForeignUsd: 0,
        cashForeignCad: 0,
        fixedDepositKrw: 0,
        fixedDepositUsd: 0,
        leaseDeposit: 0,
        digitalAssetPrincipal: {
          upbitPrincipal: 0,
          korbitPrincipal: 0,
          binancePrincipalUsd: 0,
          totalPrincipalKrw: 0,
        },
        respRrsp: { balanceCad: 0, balanceKrw: 0 },
      });
      continue;
    }

    const usdKrw = snap.exchangeRates.usdKrw;
    const cadKrw = snap.exchangeRates.cadKrw ?? 1086.59;

    // Stock Deposit 계좌별 값
    const byAcc = snap.stockDepositByAccount ?? {};
    const stockDepositByAccount = {
      "4802": { krw: byAcc["4802"]?.krw ?? 0, usd: byAcc["4802"]?.usd ?? 0 },
      "1635": { krw: byAcc["1635"]?.krw ?? 0, usd: byAcc["1635"]?.usd ?? 0 },
      "1402": { krw: byAcc["1402"]?.krw ?? 0, usd: byAcc["1402"]?.usd ?? 0 },
    };

    // Digital Asset Principal — snap.crypto에서 취득원가 읽기
    const crypto = snap.crypto ?? { upbit: { balance: 0, principal: 0 }, korbit: { balance: 0, principal: 0 }, binance: { balance: 0, principal: 0 } };
    const upbitPrincipal = crypto.upbit?.principal ?? 0;
    const korbitPrincipal = crypto.korbit?.principal ?? 0;
    const binancePrincipalUsd = crypto.binance?.principal ?? 0;
    const totalPrincipalKrw = upbitPrincipal + korbitPrincipal + Math.round(binancePrincipalUsd * usdKrw);

    // RESP/RRSP — snap.canadianPension에서 읽기
    const balanceCad = snap.canadianPension?.balanceCad ?? 0;
    const balanceKrw = Math.round(balanceCad * cadKrw);

    columns.push({
      month,
      isBaseline,
      isDraft,
      hasData: true,
      exchangeRates: { usdKrw, cadKrw },
      stockDepositByAccount,
      shortterm2805Deposit: snap.shorttermMonthly?.deposit ?? 0,
      education1470Deposit: snap.educationMonthly?.deposit ?? 0,
      pensionCashDeposit: {
        RETIREMENT: snap.pensionCashDeposit?.RETIREMENT ?? 0,
        SAVINGS: snap.pensionCashDeposit?.SAVINGS ?? 0,
        IRP: snap.pensionCashDeposit?.IRP ?? 0,
      },
      cashForeignUsd: snap.cashForeignUsd ?? 0,
      cashForeignCad: snap.cashForeignCad ?? 0,
      fixedDepositKrw: snap.fixedDepositKrw,
      fixedDepositUsd: snap.fixedDepositUsd,
      leaseDeposit: snap.leaseDeposit,
      digitalAssetPrincipal: { upbitPrincipal, korbitPrincipal, binancePrincipalUsd, totalPrincipalKrw },
      respRrsp: { balanceCad, balanceKrw },
    });
  }

  return columns;
}

// ─────────────────────────────────────────
// 자산관리 II 연간 테이블 (Edu, Pension Others 시트)
// ─────────────────────────────────────────

/**
 * 자산관리 II 연도별 컬럼 배열 생성
 *
 * 엑셀 "Edu, Pension Others" 시트 구조:
 * - Dec-{year-1} baseline | Jan~Dec (YTD 없음)
 * - 섹션: Digital Asset / Education / Pension / RESP-RRSP / Short-term
 * - DRAFT 월: liveData 기준 / CONFIRMED 월: confirmedPortfolio 기준
 *
 * Principal → Balance → P/L 순서 (엑셀과 동일)
 */
export function buildAssetManagementIIYearlyData(
  snapshots: FinancialSnapshot[],
  liveData: LivePortfolioData | null,
  year: number
): AssetManagementIIColumnData[] {
  const baselineMonth = `${year - 1}-12`;
  const yearMonths = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );
  const allMonths = [baselineMonth, ...yearMonths];

  const snapMap = new Map(snapshots.map((s) => [s.month, s]));

  const curMonthII = currentMonth();

  // 빈 컬럼 생성 헬퍼
  const emptyCol = (month: string, isBaseline: boolean, isDraft = false): AssetManagementIIColumnData => ({
    month, isBaseline, isDraft, hasData: false,
    usdKrw: 1475.27, cadKrw: 1086.59,
    digitalAsset: {
      upbitBalance: 0, upbitPrincipal: 0,
      korbitBalance: 0, korbitPrincipal: 0,
      binanceBalanceUsd: 0, binancePrincipalUsd: 0,
      totalKrw: 0, totalPrincipalKrw: 0, pnlKrw: 0, pnlPct: 0,
    },
    education: { deposit: 0, stockBalance: 0, balance: 0, principal: 0, pnl: 0, totalBalance: 0 },
    pension: {
      pensionFundBalance: 0, pensionFundPrincipal: 0, pensionFundPnl: 0,
      pensionDepositBalance: 0, pensionDepositPrincipal: 0, pensionDepositPnl: 0,
      irpBalance: 0, irpPrincipal: 0, irpPnl: 0,
      totalBalance: 0, totalPrincipal: 0, totalPnl: 0, totalPnlPct: 0,
    },
    respRrsp: { balanceCad: 0, balanceKrw: 0 },
    shortterm: { deposit: 0, stockBalance: 0, balance: 0, principal: 0, pnl: 0, totalBalance: 0 },
  });

  const columns: AssetManagementIIColumnData[] = [];

  for (const month of allMonths) {
    const isBaseline = month === baselineMonth;
    const snap = snapMap.get(month);

    if (!snap) {
      // 스냅샷 없는 현재 달이면 isDraft=true (입력 버튼 활성화 목적)
      columns.push(emptyCol(month, isBaseline, !isBaseline && month === curMonthII));
      continue;
    }

    const isDraft = snap.status === "DRAFT";
    const cp = snap.confirmedPortfolio;
    // DRAFT 월: liveData 현재 환율 우선 적용 (스냅샷 초기화 당시 환율은 구식)
    // CONFIRMED 월: 확정 시 잠긴 환율 사용 (변경 불가)
    const usdKrw = isDraft
      ? (liveData?.currentRates?.usdKrw ?? snap.exchangeRates.usdKrw)
      : snap.exchangeRates.usdKrw;
    const cadKrw = isDraft
      ? (liveData?.currentRates?.cadKrw ?? snap.exchangeRates.cadKrw ?? 1086.59)
      : (snap.exchangeRates.cadKrw ?? 1086.59);

    // ── Digital Asset 집계 ───────────────────────────
    // crypto 데이터는 DRAFT/CONFIRMED 모두 snap.crypto에 저장됨
    const crypto = snap.crypto ?? {
      upbit: { balance: 0, principal: 0 },
      korbit: { balance: 0, principal: 0 },
      binance: { balance: 0, principal: 0 },
    };
    const upbitBalance = crypto.upbit?.balance ?? 0;
    const upbitPrincipal = crypto.upbit?.principal ?? 0;
    const korbitBalance = crypto.korbit?.balance ?? 0;
    const korbitPrincipal = crypto.korbit?.principal ?? 0;
    const binanceBalanceUsd = crypto.binance?.balance ?? 0;
    const binancePrincipalUsd = crypto.binance?.principal ?? 0;

    const totalKrw = upbitBalance + korbitBalance + Math.round(binanceBalanceUsd * usdKrw);
    const totalPrincipalKrw = upbitPrincipal + korbitPrincipal + Math.round(binancePrincipalUsd * usdKrw);
    const pnlKrw = totalKrw - totalPrincipalKrw;
    const pnlPct = totalPrincipalKrw > 0 ? pnlKrw / totalPrincipalKrw : 0;

    const digitalAsset: AssetManagementIIColumnData["digitalAsset"] = {
      upbitBalance, upbitPrincipal,
      korbitBalance, korbitPrincipal,
      binanceBalanceUsd, binancePrincipalUsd,
      totalKrw, totalPrincipalKrw, pnlKrw, pnlPct,
    };

    // ── Education 집계 ───────────────────────────────
    let education: AssetManagementIIColumnData["education"];
    if (isDraft) {
      const deposit = snap.educationMonthly?.deposit ?? 0;
      // stockBalance: 수동 입력값 우선 (0이면 live-data 실시간 집계 사용)
      const stockBalance = snap.educationMonthly?.stockBalance || (liveData?.education1470.stock ?? 0);
      const principal = liveData?.education1470.principal ?? 0;
      // balance = 주식 잔액만 (P/L 산정 기준), totalBalance = deposit + stockBalance
      const balance = stockBalance;
      const pnl = stockBalance - principal;
      const totalBalance = deposit + stockBalance;
      education = { deposit, stockBalance, balance, principal, pnl, totalBalance };
    } else if (cp) {
      const deposit = cp.education1470Deposit ?? 0;
      const stockBalance = cp.education1470Stock ?? 0;
      const principal = cp.education1470Principal ?? 0;
      const balance = stockBalance;
      const pnl = stockBalance - principal;
      const totalBalance = deposit + stockBalance;
      education = { deposit, stockBalance, balance, principal, pnl, totalBalance };
    } else {
      education = { deposit: 0, stockBalance: 0, balance: 0, principal: 0, pnl: 0, totalBalance: 0 };
    }

    // ── Pension 집계 (계좌별 분리) ───────────────────
    let pension: AssetManagementIIColumnData["pension"];
    if (isDraft) {
      // 잔액은 liveData 실시간, 원금도 liveData에서 직접 가져옴 (Pension Account 기준)
      const pm = snap.pensionMonthly;
      const pensionFundBalance = pm?.fundBalance ?? liveData?.pensionFund.balance ?? 0;
      const pensionFundPrincipal = liveData?.pensionFund.principal ?? 0;
      const pensionFundPnl = pensionFundBalance - pensionFundPrincipal;
      const pensionDepositBalance = pm?.depositBalance ?? liveData?.pensionDeposit.balance ?? 0;
      const pensionDepositPrincipal = liveData?.pensionDeposit.principal ?? 0;
      const pensionDepositPnl = pensionDepositBalance - pensionDepositPrincipal;
      const irpBalance = pm?.irpBalance ?? liveData?.irp.balance ?? 0;
      const irpPrincipal = liveData?.irp.principal ?? 0;
      const irpPnl = irpBalance - irpPrincipal;
      const totalBalance = pensionFundBalance + pensionDepositBalance + irpBalance;
      const totalPrincipal = pensionFundPrincipal + pensionDepositPrincipal + irpPrincipal;
      const totalPnl = totalBalance - totalPrincipal;
      const totalPnlPct = totalPrincipal > 0 ? totalPnl / totalPrincipal : 0;
      pension = {
        pensionFundBalance, pensionFundPrincipal, pensionFundPnl,
        pensionDepositBalance, pensionDepositPrincipal, pensionDepositPnl,
        irpBalance, irpPrincipal, irpPnl,
        totalBalance, totalPrincipal, totalPnl, totalPnlPct,
      };
    } else if (cp) {
      const pensionFundBalance = cp.pensionFundBalance ?? 0;
      const pensionFundPrincipal = cp.pensionFundPrincipal ?? 0;
      const pensionFundPnl = pensionFundBalance - pensionFundPrincipal;
      const pensionDepositBalance = cp.pensionDepositBalance ?? 0;
      const pensionDepositPrincipal = cp.pensionDepositPrincipal ?? 0;
      const pensionDepositPnl = pensionDepositBalance - pensionDepositPrincipal;
      const irpBalance = cp.irpBalance ?? 0;
      const irpPrincipal = cp.irpPrincipal ?? 0;
      const irpPnl = irpBalance - irpPrincipal;
      const totalBalance = pensionFundBalance + pensionDepositBalance + irpBalance;
      const totalPrincipal = pensionFundPrincipal + pensionDepositPrincipal + irpPrincipal;
      const totalPnl = totalBalance - totalPrincipal;
      const totalPnlPct = totalPrincipal > 0 ? totalPnl / totalPrincipal : 0;
      pension = {
        pensionFundBalance, pensionFundPrincipal, pensionFundPnl,
        pensionDepositBalance, pensionDepositPrincipal, pensionDepositPnl,
        irpBalance, irpPrincipal, irpPnl,
        totalBalance, totalPrincipal, totalPnl, totalPnlPct,
      };
    } else {
      pension = {
        pensionFundBalance: 0, pensionFundPrincipal: 0, pensionFundPnl: 0,
        pensionDepositBalance: 0, pensionDepositPrincipal: 0, pensionDepositPnl: 0,
        irpBalance: 0, irpPrincipal: 0, irpPnl: 0,
        totalBalance: 0, totalPrincipal: 0, totalPnl: 0, totalPnlPct: 0,
      };
    }

    // ── RESP/RRSP 집계 ───────────────────────────────
    const balanceCad = snap.canadianPension?.balanceCad ?? 0;
    const respRrsp: AssetManagementIIColumnData["respRrsp"] = {
      balanceCad,
      balanceKrw: Math.round(balanceCad * cadKrw),
    };

    // ── Short-term 집계 ──────────────────────────────
    let shortterm: AssetManagementIIColumnData["shortterm"];
    if (isDraft) {
      const deposit = snap.shorttermMonthly?.deposit ?? 0;
      // stockBalance: 수동 입력값 우선 (0이면 live-data 실시간 집계 사용)
      const stockBalance = snap.shorttermMonthly?.stockBalance || (liveData?.shortterm.stockBalance ?? 0);
      const principal = liveData?.shortterm.principal ?? 0;
      // balance = 주식 잔액만 (P/L 산정 기준), totalBalance = deposit + stockBalance
      const balance = stockBalance;
      const pnl = stockBalance - principal;
      const totalBalance = deposit + stockBalance;
      shortterm = { deposit, stockBalance, balance, principal, pnl, totalBalance };
    } else if (cp) {
      const deposit = cp.shorttermDeposit ?? 0;
      const stockBalance = cp.shorttermStockBalance ?? 0;
      const principal = cp.shorttermPrincipal ?? 0;
      const balance = stockBalance;
      const pnl = stockBalance - principal;
      const totalBalance = deposit + stockBalance;
      shortterm = { deposit, stockBalance, balance, principal, pnl, totalBalance };
    } else {
      shortterm = { deposit: 0, stockBalance: 0, balance: 0, principal: 0, pnl: 0, totalBalance: 0 };
    }

    columns.push({
      month, isBaseline, isDraft, hasData: true,
      usdKrw, cadKrw,
      digitalAsset, education, pension, respRrsp, shortterm,
    });
  }

  return columns;
}

/**
 * DRAFT 스냅샷 기본값 생성 — 해당 월 스냅샷이 없을 때 초기화용
 *
 * 엑셀 현재 값 기반 기본값:
 * - fixedDepositKrw: 550,000,000 (정기예금)
 * - leaseDeposit: 1,300,000,000 (임차보증금)
 * - privateLoan: 146,930,000 (개인차입금)
 * - realEstate: 1,668,000,000 (부동산)
 */
export function createDraftSnapshot(
  month: string,
  exchangeRates?: { usdKrw: number; cadKrw: number },
  prevConfirmed?: FinancialSnapshot
): FinancialSnapshot {
  // prevConfirmed가 있으면 해당 월 확정값을 이월(carry-forward)
  // 없으면 최초 설정 시점의 엑셀 하드코딩값 사용
  return {
    id: crypto.randomUUID(),
    month,
    status: "DRAFT",
    exchangeRates: exchangeRates ?? prevConfirmed?.exchangeRates ?? { usdKrw: 1475.27, cadKrw: 1086.59 },
    fixedDepositKrw: prevConfirmed?.fixedDepositKrw ?? 550000000,
    fixedDepositUsd: prevConfirmed?.fixedDepositUsd ?? 0,
    leaseDeposit: prevConfirmed?.leaseDeposit ?? 1300000000,
    privateLoan: prevConfirmed?.privateLoan ?? 146930000,
    mortgageLoan: prevConfirmed?.mortgageLoan ?? 0,
    realEstate: prevConfirmed?.realEstate ?? 1668000000,
    otherAssets: prevConfirmed?.otherAssets ? [...prevConfirmed.otherAssets] : [],
    crypto: {
      upbit: { balance: 0, principal: 0 },
      korbit: { balance: 0, principal: 0 },
      binance: { balance: 0, principal: 0 },
    },
    canadianPension: prevConfirmed?.canadianPension
      ? { ...prevConfirmed.canadianPension }
      : { balanceCad: 0, monthlyFeeCad: 0 },
    midterm2805: { cumInstallment: 0, cumSpent: 0, balance: 0 },
    updatedAt: new Date().toISOString(),
  };
}
