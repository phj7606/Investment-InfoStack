"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Lock, RefreshCw, CloudUpload, CloudDownload } from "lucide-react";
import { RateCell } from "./RateCell";
import { Button } from "@/components/ui/button";
import { FinancialStatementView } from "./views/FinancialStatementView";
import { AssetManagementView } from "./views/AssetManagementView";
import { EduPensionView } from "./views/EduPensionView";
import { MonthlyCFView } from "./views/MonthlyCFView";
import {
  buildConfirmedStatementData,
  getRecentMonths,
  currentMonth,
  createDraftSnapshot,
} from "@/lib/portfolio/financial-calc";
import type {
  FinancialSnapshot,
  MonthlyCFEntry,
  MonthlyCFBalance,
  FinancialStatementData,
  LivePortfolioData,
  TxSummaryByMonth,
} from "@/types/financial";

// ─────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────

interface NetWorthPoint {
  month: string;
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  status: "DRAFT" | "CONFIRMED";
}

// ─────────────────────────────────────────
// DRAFT 스냅샷에서 재무제표 데이터 조립 (클라이언트 사이드)
// ─────────────────────────────────────────

function buildDraftStatementFromSnapshot(
  snapshot: FinancialSnapshot,
  liveData: LivePortfolioData | null,
  prevData?: FinancialStatementData | null
): FinancialStatementData {
  /**
   * DRAFT 상태에서는 실시간 포지션을 liveData API에서 가져온다.
   * liveData가 없으면 confirmedPortfolio(이전 확정값) 또는 0으로 표시.
   */
  const cp = snapshot.confirmedPortfolio;
  const { exchangeRates } = snapshot;
  const { usdKrw, cadKrw } = exchangeRates;

  // 투자자산 — FUND: 자산관리 탭과 일치 보장 위해 사용자 입력값(fundMonthly.balance) 최우선
  // CONFIRMED 월: fm.balance === cp.fundBalance (confirm 시 동기화됨) → 결과 변동 없음
  // DRAFT 월: live-data fund.balance가 부정확할 때 사용자 입력값 반영
  const fundKrw = snapshot.fundMonthly?.balance ?? liveData?.fund.balance ?? cp?.fundBalance ?? 0;
  const korStocksKrw = liveData?.korStocks.balance ?? cp?.korStocksBalance ?? 0;
  const usStocksUsd = liveData?.usStocks.balanceUsd ?? cp?.usStocksBalanceUsd ?? 0;
  const usStocksKrw = liveData?.usStocks.balanceKrw ?? cp?.usStocksBalanceKrw ?? Math.round(usStocksUsd * usdKrw);

  // 계좌별 예수금 합산 — financial-calc.ts 와 동일한 우선순위 적용
  // 이유: liveData.stockDepositUsd 는 live-data API에서 0으로 하드코딩되어 있어
  //       수동 입력된 stockDepositByAccount 합산값을 우선 사용해야 정확한 값을 표시함
  const byAccountKrwTotal = Object.values(snapshot.stockDepositByAccount ?? {})
    .reduce((sum, v) => sum + (v.krw ?? 0), 0);
  const byAccountUsdTotal = Object.values(snapshot.stockDepositByAccount ?? {})
    .reduce((sum, v) => sum + (v.usd ?? 0), 0);
  // 우선순위: byAccount 합산 → snapshot 직접입력(top-level) → liveData → cp → 0
  // 이유: 프로덕션 Supabase에 byAccount가 없을 경우 Edit 다이얼로그에서 저장한
  //       top-level stockDepositKrw/Usd 값을 fallback으로 사용
  const stockDepositKrw = byAccountKrwTotal
    || snapshot.stockDepositKrw
    || liveData?.stockDepositKrw
    || cp?.stockDepositKrw
    || 0;
  const stockDepositUsd = byAccountUsdTotal
    || snapshot.stockDepositUsd
    || liveData?.stockDepositUsd
    || cp?.stockDepositUsd
    || 0;

  // 연금
  const pensionFundBalance = liveData?.pensionFund.balance ?? cp?.pensionFundBalance ?? 0;
  const pensionDepositBalance = liveData?.pensionDeposit.balance ?? cp?.pensionDepositBalance ?? 0;
  const irpBalance = liveData?.irp.balance ?? cp?.irpBalance ?? 0;
  const pensionKrw = pensionFundBalance + pensionDepositBalance + irpBalance;
  const canadianPensionKrw = Math.round(snapshot.canadianPension.balanceCad * cadKrw);

  // 교육 + Digital Asset(크립토)
  // Education: 자산관리II 탭과 일치 보장 위해 사용자 입력값(educationMonthly) 최우선
  // CONFIRMED 월: em.deposit === cp.education1470Deposit (confirm 시 동기화) → 결과 변동 없음
  // DRAFT 월: live-data education1470.deposit는 항상 0 하드코딩, stock은 거래 기반 평가 → 사용자 입력 우선
  const edu1470Stock = snapshot.educationMonthly?.stockBalance
    || liveData?.education1470.stock
    || cp?.education1470Stock
    || 0;
  const edu1470Deposit = snapshot.educationMonthly?.deposit
    ?? liveData?.education1470.deposit
    ?? cp?.education1470Deposit
    ?? 0;
  // 가상자산 잔액 — snapshot.crypto에서 수동 입력값 사용
  const cryptoKrw =
    (snapshot.crypto.upbit.balance || 0) +
    (snapshot.crypto.korbit.balance || 0) +
    Math.round((snapshot.crypto.binance.balance || 0) * usdKrw);
  const educationKrw = edu1470Stock + edu1470Deposit + cryptoKrw;

  // 정기예금
  const fixedDepositKrwVal = snapshot.fixedDepositKrw;
  const fixedDepositUsdKrw = Math.round(snapshot.fixedDepositUsd * usdKrw);
  const currentAssetTotal = fixedDepositKrwVal + fixedDepositUsdKrw;

  // 비유동자산
  const nonCurrentAssetTotal = snapshot.realEstate;

  // 투자자산 합계
  const investmentAssetTotal =
    korStocksKrw + fundKrw + stockDepositKrw +
    usStocksKrw + Math.round(stockDepositUsd * usdKrw);

  // 총자산
  const totalAssets = Math.round(
    currentAssetTotal + nonCurrentAssetTotal + investmentAssetTotal +
    pensionKrw + canadianPensionKrw + educationKrw +
    snapshot.otherAssets.reduce((s, a) => s + a.amount, 0)
  );

  // 부채
  const nonCurrentLiabilityTotal = snapshot.privateLoan + snapshot.leaseDeposit + snapshot.mortgageLoan;
  const totalDebt = nonCurrentLiabilityTotal;
  const netWorth = totalAssets - totalDebt;

  // 투자+연금+교육 합계 (엑셀 INVESTMENT & PENSION TOTAL)
  const investmentPensionTotal = investmentAssetTotal + pensionKrw + canadianPensionKrw + educationKrw;

  // CAPITAL 변동 내역 (전월 대비 섹션별 변동)
  const prevNetWorthVal = prevData?.netWorth ?? 0;
  const capitalNetChanges = prevData ? netWorth - prevNetWorthVal : 0;
  const capitalChangeInCurrentAsset = prevData
    ? currentAssetTotal - prevData.assets.currentAsset.total : 0;
  const capitalChangeInNonCurrentAsset = prevData
    ? nonCurrentAssetTotal - prevData.assets.nonCurrentAsset.total : 0;
  const capitalChangeInInvestmentAsset = prevData
    ? investmentAssetTotal - prevData.assets.investmentAsset.total : 0;
  const capitalChangeInPensionEducation = prevData
    ? (pensionKrw + canadianPensionKrw + educationKrw) -
      (prevData.assets.pensionKrw + prevData.assets.educationKrw) : 0;
  const capitalChangeInLiability = prevData
    ? -(totalDebt - prevData.liabilities.totalDebt) : 0;

  // Net Debt/Surplus
  const investmentTotal = investmentAssetTotal;
  const cashTotal = fixedDepositKrwVal + fixedDepositUsdKrw;
  const assetTotal = investmentTotal + cashTotal;
  const netDebtSurplus = assetTotal - snapshot.leaseDeposit;
  const lessDepositReimbursement = netDebtSurplus;
  const excessDeficit = lessDepositReimbursement - snapshot.leaseDeposit;

  return {
    month: snapshot.month,
    status: "DRAFT",
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
        fund: fundKrw,
        stockDepositKrw,
        usStocksKrw,
        usStocksUsd: usStocksUsd,
        usStocksDepositKrw: Math.round(stockDepositUsd * usdKrw),
        usStocksDepositUsd: stockDepositUsd,
        total: investmentAssetTotal,
      },
      pensionKrw: pensionKrw + canadianPensionKrw,
      educationKrw,
      investmentPensionTotal: Math.round(investmentPensionTotal),
      totalAssets,
      investmentPortfolio: [
        { label: "국내 펀드 (FUND)", amountKrw: fundKrw, currency: "KRW" },
        { label: "국내주식/ETF (KRW)", amountKrw: korStocksKrw, currency: "KRW" },
        {
          label: "미국주식/ETF (USD)",
          amountKrw: usStocksKrw,
          currency: "USD",
          originalAmount: usStocksUsd,
          exchangeRate: usdKrw,
        },
      ],
      pension: [
        { label: "연금 (국내)", amountKrw: pensionKrw, currency: "KRW" },
        {
          label: "연금 (캐나다 RESP/RRSP)",
          amountKrw: canadianPensionKrw,
          currency: "CAD",
          originalAmount: snapshot.canadianPension.balanceCad,
          exchangeRate: cadKrw,
        },
      ],
      education: { label: "교육저축 (1470)", amountKrw: educationKrw, currency: "KRW" },
      shortterm: { label: "주식예수금", amountKrw: stockDepositKrw, currency: "KRW" },
      digitalAssets: { label: "가상자산", amountKrw: 0, currency: "KRW" },
      cash: { label: "정기예금 KRW", amountKrw: fixedDepositKrwVal, currency: "KRW" },
      otherAssets: [
        { label: "부동산", amountKrw: snapshot.realEstate },
        ...snapshot.otherAssets.map((a) => ({ label: a.name, amountKrw: a.amount })),
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
      lessDepositReimbursement: Math.round(lessDepositReimbursement),
      excessDeficit: Math.round(excessDeficit),
    },
  };
}

// ─────────────────────────────────────────
// 메인 클라이언트 컴포넌트
// ─────────────────────────────────────────

export function FinancialStatementClient() {
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());
  const [snapshots, setSnapshots] = useState<FinancialSnapshot[]>([]);
  const [cfEntries, setCfEntries] = useState<MonthlyCFEntry[]>([]);
  const [cfBalances, setCfBalances] = useState<MonthlyCFBalance>({});
  const [liveData, setLiveData] = useState<LivePortfolioData | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [txSummaries, setTxSummaries] = useState<TxSummaryByMonth>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // 탭 상태를 controlled로 관리 — loadData() 시 loading=true로 Tabs가 unmount되면
  // defaultValue로 리셋되어 선택 탭이 사라지는 문제를 방지
  const [activeTab, setActiveTab] = useState("statement");

  // ── 백업/복원 ────────────────────────────────────────────
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  // ── 메인 데이터 로딩 ──────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [snapshotRes, cfRes, txSummaryRes, cfBalanceRes] = await Promise.all([
        fetch("/api/portfolio/financial/snapshot"),
        fetch("/api/portfolio/financial/monthly-cf"),
        fetch("/api/portfolio/financial/tx-summary"),
        fetch("/api/portfolio/financial/monthly-cf/balance"),
      ]);

      if (!snapshotRes.ok || !cfRes.ok) throw new Error("데이터 로드 실패");

      const snapshotData = await snapshotRes.json();
      const cfData = await cfRes.json();
      // tx-summary / balance는 실패해도 빈 객체로 fallback (선택적 데이터)
      const txSummaryData = txSummaryRes.ok ? await txSummaryRes.json() : {};
      const cfBalanceData = cfBalanceRes.ok ? await cfBalanceRes.json() : {};

      setSnapshots(snapshotData.snapshots ?? []);
      setCfEntries(cfData.entries ?? []);
      setTxSummaries(txSummaryData ?? {});
      setCfBalances(cfBalanceData.balances ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── 실시간 포트폴리오 데이터 로딩 (DRAFT 상태에서만) ──
  const loadLiveData = useCallback(async (usdKrw: number) => {
    setLiveLoading(true);
    try {
      const res = await fetch(`/api/portfolio/financial/live-data?usdKrw=${usdKrw}`);
      if (!res.ok) throw new Error("실시간 데이터 로드 실패");
      const data = await res.json();
      setLiveData(data);
    } catch (e) {
      console.error("[FinancialStatementClient] 실시간 데이터 로드 실패:", e);
      setLiveData(null);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);


  // ── 현재 선택 월 스냅샷 ──────────────────────────────
  const currentSnapshot: FinancialSnapshot =
    snapshots.find((s) => s.month === selectedMonth) ?? createDraftSnapshot(selectedMonth);

  // 월 변경 시 실시간 데이터 재로드
  // 자산관리·자산관리 II 탭은 월 선택과 무관하게 전체 연도를 표시하며
  // DRAFT 컬럼에서 항상 liveData(포지션 잔액, 현재 환율)가 필요하므로
  // CONFIRMED 월 선택 시에도 liveData를 유지한다.
  // CONFIRMED 월의 재무제표는 confirmedPortfolio를 사용하므로 liveData 유무 무관.
  useEffect(() => {
    loadLiveData(currentSnapshot.exchangeRates.usdKrw);
  }, [selectedMonth, currentSnapshot.status, currentSnapshot.exchangeRates.usdKrw, loadLiveData]);

  // ── 전월 재무제표 데이터 (CAPITAL 변동 계산용) ─────────
  const prevMonth = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 2, 1); // 전월
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const prevSnapshot = snapshots.find((s) => s.month === prevMonth);
  const prevStatementData: FinancialStatementData | null = prevSnapshot
    ? prevSnapshot.status === "CONFIRMED"
      ? buildConfirmedStatementData(prevSnapshot)
      : buildDraftStatementFromSnapshot(prevSnapshot, null)
    : null;

  // ── 재무제표 데이터 조립 ─────────────────────────────
  const statementData: FinancialStatementData | null =
    currentSnapshot.status === "CONFIRMED"
      ? buildConfirmedStatementData(currentSnapshot, prevStatementData)
      : buildDraftStatementFromSnapshot(currentSnapshot, liveData, prevStatementData);

  // ── 순자산 추세 데이터 (최근 12개월) ──────────────────
  const recentMonths = getRecentMonths(12).reverse();
  const trendData: NetWorthPoint[] = recentMonths
    .map((m) => {
      const snap = snapshots.find((s) => s.month === m);
      if (!snap) return null;
      const sd =
        snap.status === "CONFIRMED"
          ? buildConfirmedStatementData(snap)
          : buildDraftStatementFromSnapshot(snap, null);
      if (!sd) return null;
      return {
        month: m,
        netWorth: sd.netWorth,
        totalAssets: sd.assets.totalAssets,
        totalDebt: sd.liabilities.totalDebt,
        status: snap.status,
      };
    })
    .filter((d): d is NetWorthPoint => d !== null);

  // ── 현금흐름 연도 (현재 연도 기준) ──────────────────────
  const cfYear = new Date().getFullYear();

  // ── 월 선택 옵션 ─────────────────────────────────────
  const availableMonths = Array.from(
    new Set([...getRecentMonths(12), ...snapshots.map((s) => s.month)])
  ).sort((a, b) => b.localeCompare(a));

  // ── 전체 새로고침 (자산관리/연금교육 탭 수정 후) ──────
  const handleRefresh = useCallback(async () => {
    await loadData();
    if (currentSnapshot.status === "DRAFT") {
      loadLiveData(currentSnapshot.exchangeRates.usdKrw);
    }
  }, [loadData, loadLiveData, currentSnapshot.status, currentSnapshot.exchangeRates.usdKrw]);

  // ── 계좌잔액 PUT/DELETE 콜백 (MonthlyCFView에서 호출) ──
  const handleCFBalanceUpdate = useCallback(async (month: string, amount: number) => {
    const res = await fetch("/api/portfolio/financial/monthly-cf/balance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, amount }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setCfBalances(data.balances ?? {});
  }, []);

  const handleCFBalanceDelete = useCallback(async (month: string) => {
    const res = await fetch(
      `/api/portfolio/financial/monthly-cf/balance?month=${month}`,
      { method: "DELETE" }
    );
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setCfBalances(data.balances ?? {});
  }, []);

  // ── 백업 다운로드 ────────────────────────────────────────
  async function handleJsonBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/portfolio/financial/backup");
      if (!res.ok) throw new Error("백업 API 오류");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `financial-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("JSON 백업 실패:", err);
      alert("JSON 백업 다운로드에 실패했습니다.");
    } finally {
      setBackupLoading(false);
    }
  }

  // ── 백업 복원 ────────────────────────────────────────────
  async function handleJsonRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { snapshots?: unknown[] };

      if (!Array.isArray(parsed.snapshots) || parsed.snapshots.length === 0) {
        alert("유효한 백업 파일이 아닙니다. (snapshots 배열 없음)");
        return;
      }

      const useOverwrite = window.confirm(
        `백업 파일: 스냅샷 ${parsed.snapshots.length}개월\n\n` +
        `[확인] 전체 덮어쓰기 (overwrite) — 현재 데이터가 모두 교체됩니다.\n` +
        `[취소] 병합 추가 (merge) — 없는 월만 추가됩니다.`
      );

      const res = await fetch("/api/portfolio/financial/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshots: parsed.snapshots,
          mode: useOverwrite ? "overwrite" : "merge",
        }),
      });

      if (!res.ok) throw new Error("복원 API 오류");
      const result = await res.json() as { ok: boolean; restored: number; skipped: number };

      alert(`복원 완료\n저장: ${result.restored}개월 / 건너뜀: ${result.skipped}개월`);
      void loadData();
    } catch (err) {
      console.error("JSON 복원 실패:", err);
      alert("JSON 복원에 실패했습니다. 파일 형식을 확인해 주세요.");
    } finally {
      setBackupLoading(false);
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
  }

  // ── 환율 수정 (DRAFT 스냅샷에만 적용) ───────────────────
  const handleRateSave = useCallback(async (field: "usdKrw" | "cadKrw", value: number) => {
    // DRAFT 스냅샷의 환율을 서버에 저장 후 데이터 리로드
    const targetMonth = snapshots.find((s) => s.status === "DRAFT")?.month ?? currentMonth();
    await fetch(`/api/portfolio/financial/snapshot/${targetMonth}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchangeRates: { [field]: value } }),
    });
    await loadData();
    // 환율 변경 시 실시간 데이터도 재로드 (KRW 환산 값 갱신)
    if (field === "usdKrw") {
      loadLiveData(value);
    }
  }, [snapshots, loadData, loadLiveData]);

  // ── 실시간 환율 갱신 (yfinance에서 USD/KRW, CAD/KRW 조회) ─
  const [rateRefreshing, setRateRefreshing] = useState(false);
  const handleRateRefresh = useCallback(async () => {
    const draftSnap = snapshots.find((s) => s.status === "DRAFT");
    if (!draftSnap) return; // CONFIRMED 월에는 갱신 불가
    setRateRefreshing(true);
    try {
      // 실시간 환율 조회
      const res = await fetch("/api/exchange-rates");
      if (!res.ok) throw new Error("환율 조회 실패");
      const { usdKrw, cadKrw } = await res.json() as { usdKrw: number; cadKrw: number };
      // DRAFT 스냅샷에 실시간 환율 저장
      await fetch(`/api/portfolio/financial/snapshot/${draftSnap.month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeRates: { usdKrw, cadKrw } }),
      });
      await loadData();
      loadLiveData(usdKrw);
    } catch (e) {
      console.error("[handleRateRefresh] 실시간 환율 갱신 실패:", e);
    } finally {
      setRateRefreshing(false);
    }
  }, [snapshots, loadData, loadLiveData]);

  // ── DRAFT 월 환율 자동 갱신 (세션당 1회) ─────────────────
  // 페이지 최초 진입 시 DRAFT 스냅샷의 환율을 yfinance 실시간값으로 자동 업데이트
  // 이후 수동 "실시간 갱신" 버튼으로도 언제든 재갱신 가능
  const autoRateRefreshed = useRef(false);
  useEffect(() => {
    // 이미 자동 갱신했거나, 스냅샷이 아직 안 로드된 경우 무시
    if (autoRateRefreshed.current || snapshots.length === 0) return;
    const hasDraft = snapshots.some((s) => s.status === "DRAFT");
    if (!hasDraft) return;
    autoRateRefreshed.current = true;
    handleRateRefresh();
  }, [snapshots, handleRateRefresh]);

  // ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <p className="text-destructive">오류: {error}</p>
        <button onClick={loadData} className="mt-2 underline text-sm">다시 시도</button>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
      {/* 월 선택 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">기준 월</span>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableMonths.map((m) => {
              const snap = snapshots.find((s) => s.month === m);
              const isConfirmed = snap?.status === "CONFIRMED";
              return (
                <SelectItem key={m} value={m}>
                  <span className="flex items-center gap-2">
                    {m}
                    {isConfirmed && <Lock className="w-3 h-3 text-emerald-600" />}
                    {!isConfirmed && snap && (
                      <Badge variant="outline" className="text-[10px] py-0 text-amber-600">DRAFT</Badge>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {/* JSON 백업/복원 버튼 — ml-auto로 우측 정렬 */}
        <div className="ml-auto flex gap-2">
          {/* hidden file input — 복원 시 파일 선택 트리거용 */}
          <input
            ref={backupFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleJsonRestore(e)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => backupFileRef.current?.click()}
            disabled={backupLoading}
          >
            <CloudDownload className="h-3 w-3" />
            Restore
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => void handleJsonBackup()}
            disabled={backupLoading}
          >
            <CloudUpload className="h-3 w-3" />
            Backup
          </Button>
        </div>
      </div>

      {/* 탭 — 4개: 재무제표 | 자산관리 | 연금·교육 | 현금흐름 */}
      {/* value/onValueChange controlled: loadData() 시 loading 상태로 인해 Tabs가 unmount되어도
          activeTab state가 유지되어 "실시간 갱신" 후 자산관리 탭이 해제되지 않음 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="statement">재무제표</TabsTrigger>
          <TabsTrigger value="assets">자산관리</TabsTrigger>
          <TabsTrigger value="edu-pension">자산관리 II</TabsTrigger>
          <TabsTrigger value="cf">현금흐름</TabsTrigger>
        </TabsList>

        {/* Tab 1: 재무제표 */}
        <TabsContent value="statement" className="mt-6">
          {/* DRAFT 상태에서 liveData 로딩 중이면 스켈레톤 표시
              — liveData 없이는 투자자산이 0으로 잘못 표시되므로 로딩 완료까지 대기 */}
          {currentSnapshot.status === "DRAFT" && liveLoading ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>투자 자산 실시간 데이터 로딩 중...</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Skeleton className="h-96 rounded-lg" />
                <Skeleton className="h-96 rounded-lg" />
              </div>
            </div>
          ) : statementData ? (
            <FinancialStatementView
              data={statementData}
              snapshot={currentSnapshot}
              trendData={trendData}
              onRefresh={handleRefresh}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <p>이번 달 마감 버튼을 클릭하여 재무제표를 생성하거나,</p>
              <p className="mt-1">수정 버튼으로 현금·부채 정보를 먼저 입력해주세요.</p>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: 자산관리 — 연간 테이블 뷰 (월 선택 불필요) */}
        <TabsContent value="assets" className="mt-6">
          <AssetManagementView
            snapshots={snapshots}
            liveData={liveData}
            liveLoading={liveLoading}
            onRefresh={handleRefresh}
            txSummaries={txSummaries}
            onRateSave={handleRateSave}
            onRateRefresh={handleRateRefresh}
            rateRefreshing={rateRefreshing}
          />
        </TabsContent>

        {/* Tab 3: 연금·교육 */}
        <TabsContent value="edu-pension" className="mt-6">
          <EduPensionView
            snapshots={snapshots}
            liveData={liveData}
            liveLoading={liveLoading}
            onRefresh={handleRefresh}
          />
        </TabsContent>

        {/* Tab 4: 현금흐름 */}
        <TabsContent value="cf" className="mt-6">
          <MonthlyCFView
            entries={cfEntries}
            balances={cfBalances}
            year={cfYear}
            onRefresh={handleRefresh}
            onBalanceUpdate={handleCFBalanceUpdate}
            onBalanceDelete={handleCFBalanceDelete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
