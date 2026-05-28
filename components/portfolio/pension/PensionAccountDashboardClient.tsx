"use client";

// 연금 계좌 대시보드 — 거래내역 기반 3탭 통합 관리
//
// 탭 1 (리밸런싱): 계좌별 보유 포지션 (LongtermPositionsTable 형식) + 리밸런싱 분석
// 탭 2 (거래내역): BUY/SELL/DIVIDEND 거래 이력 + 추가/편집/삭제 + 컬럼 정렬
// 탭 3 (종목별):   2열 그리드 Accordion — Value Investment Account 스타일 소계 포함

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, RefreshCw, Trash2, Pencil,
  ChevronDown, ChevronRight, CloudUpload, CloudDownload,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { cn, naverStockUrl } from "@/lib/utils";
import { PensionTransactionForm } from "./PensionTransactionForm";
import type {
  PensionPosition,
  PensionTransaction,
  PensionAccountSummary,
  PensionAccountType,
  PensionRebalancingTarget,
} from "@/types/portfolio";
import type { RebalancingResult } from "@/lib/portfolio/pension-calc";

// 리밸런싱 가능 계좌 타입 (채권/주식 카테고리 구분이 있는 계좌)
type RebalAccountType = "RETIREMENT" | "SAVINGS";

// ─────────────────────────────────────────
// 색상·포맷 헬퍼
// ─────────────────────────────────────────
function plColor(v: number) {
  return v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground";
}
function fmt(v: number) { return Math.round(v).toLocaleString("ko-KR"); }
function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const PIE_COLORS = { BOND: "#3b82f6", EQUITY: "#ef4444" };

const ACCT_LABELS: Record<PensionAccountType, string> = {
  RETIREMENT: "퇴직연금", SAVINGS: "연금저축", IRP: "IRP",
};
const TRADE_LABELS: Record<string, string> = {
  BUY: "매수", SELL: "매도", DIVIDEND: "배당",
};
const CATEGORY_LABELS: Record<string, string> = {
  BOND: "채권형", EQUITY: "주식형",
};

// ─────────────────────────────────────────
// 정렬 헬퍼 — 클릭 가능한 컬럼 헤더
// ─────────────────────────────────────────
type TxSortKey = "date" | "accountType" | "stockName" | "category" | "tradeType" | "quantity" | "price" | "amount" | "realizedPL";

function SortIcon({ col, sortKey, sortDir }: { col: TxSortKey; sortKey: TxSortKey; sortDir: "asc" | "desc" }) {
  if (col !== sortKey) return <ArrowUpDown className="inline h-3 w-3 ml-0.5 opacity-30" />;
  return sortDir === "asc"
    ? <ArrowUp className="inline h-3 w-3 ml-0.5 text-emerald-600" />
    : <ArrowDown className="inline h-3 w-3 ml-0.5 text-emerald-600" />;
}

// ─────────────────────────────────────────
// API 응답 타입
// ─────────────────────────────────────────
interface PositionsResponse {
  positions: PensionPosition[];
  retirementSummary: PensionAccountSummary;
  savingsSummary: PensionAccountSummary;
  irpSummary: PensionAccountSummary;
}
interface TransactionsResponse { transactions: PensionTransaction[]; }
interface RebalancingResponse {
  config: {
    RETIREMENT: PensionRebalancingTarget;
    SAVINGS:    PensionRebalancingTarget;
  };
  results: {
    RETIREMENT: RebalancingResult;
    SAVINGS:    RebalancingResult;
  };
}

// ─────────────────────────────────────────
// 종목별 탭 — 그룹 타입
// ─────────────────────────────────────────
interface StockGroup {
  stockCode: string;
  stockName: string;
  category?: string;
  assetType: string;
  position?: PensionPosition & { hasCurPrice?: boolean };
  txs: PensionTransaction[];
  // 집계
  totalBuyQty: number;
  totalBuyAmt: number;
  totalBuyFee: number;
  totalSellQty: number;
  totalSellAmt: number;
  totalSellFee: number;
  totalDividend: number;
  balance: number;
  avgCost: number;
  fixedPL: number;
  fixedPLPct: number;
  footerPL: number;      // 테이블 하단 실현손익 (수수료 포함): 총매도 - 취득원가 - 매수수수료 - 매도수수료
  footerPLPct: number;
}

// ─────────────────────────────────────────
// Executed Trade — 완전 매도 완료 종목 1건 1행 타입
// (잔량 0 = 전체 청산된 종목을 1개 엔트리로 집계)
// ─────────────────────────────────────────
interface PensionExecutedTrade {
  key: string;               // `${stockCode}::${accountType}::${category ?? ""}`
  stockCode: string;
  stockName: string;
  category?: string;
  assetType: string;
  accountType: PensionAccountType;
  buyDate: string;           // 최초 매수일
  sellDate: string;          // 최종 매도일
  avgBuyPrice: number;       // 총매수금액 / 총매수수량
  avgSellPrice: number;      // 총매도금액 / 총매도수량
  totalQty: number;          // 매도 수량(= 매수 수량)
  totalBuyAmt: number;
  profitLoss: number;        // 실현손익 합계
  profitLossPct: number;     // 실현수익률
  holdingDays: number;
  result: "Win" | "Lose";
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
export function PensionAccountDashboardClient() {
  // ── 데이터 상태 ─────────────────────────
  const [positions,    setPositions]    = useState<PensionPosition[]>([]);
  const [transactions, setTransactions] = useState<PensionTransaction[]>([]);
  const [summaries,    setSummaries]    = useState<Record<PensionAccountType, PensionAccountSummary | null>>({
    RETIREMENT: null, SAVINGS: null, IRP: null,
  });
  // 계좌별 리밸런싱 목표 비중 (RETIREMENT / SAVINGS 각각 독립)
  const [rebalTargets, setRebalTargets] = useState<Record<RebalAccountType, PensionRebalancingTarget>>({
    RETIREMENT: { bondRatio: 40, equityRatio: 60 },
    SAVINGS:    { bondRatio: 30, equityRatio: 70 },
  });
  const [loading, setLoading] = useState(false);

  // ── 현재가 ──────────────────────────────
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [priceLoading,  setPriceLoading]  = useState(false);
  const [priceAt,       setPriceAt]       = useState<string | null>(null);

  // ── 리밸런싱 편집 상태 (계좌별) ──
  // localBonds / localEquities: 입력 중인 문자열 (저장 전 임시)
  const [localBonds,   setLocalBonds]   = useState<Record<RebalAccountType, string>>({ RETIREMENT: "40", SAVINGS: "30" });
  const [localEquities, setLocalEquities] = useState<Record<RebalAccountType, string>>({ RETIREMENT: "60", SAVINGS: "70" });
  const [rebalSaving, setRebalSaving] = useState(false);
  const [rebalError,  setRebalError]  = useState<string | null>(null);

  // ── 현금 입력 (계좌별 리밸런싱 계산에 포함할 보유 현금) ──
  const [cashAmounts, setCashAmounts] = useState<Record<RebalAccountType, number>>({ RETIREMENT: 0, SAVINGS: 0 });
  const [localCashes, setLocalCashes] = useState<Record<RebalAccountType, string>>({ RETIREMENT: "", SAVINGS: "" });

  // ── 다이얼로그 ─────────────────────────
  const [txFormOpen,    setTxFormOpen]    = useState(false);
  const [txFormDefault, setTxFormDefault] = useState<PensionAccountType>("RETIREMENT");
  const [editTx,        setEditTx]        = useState<PensionTransaction | null>(null);

  // ── 리밸런싱 탭: 선택된 계좌 + 카테고리 필터 ─────────────
  const [selectedAccount, setSelectedAccount] = useState<PensionAccountType>("RETIREMENT");
  const [posCatFilter, setPosCatFilter] = useState<"all" | "BOND" | "EQUITY">("all");

  // ── 포지션 테이블 정렬 ─────────────────────
  type PosSortKey = "stockName" | "category" | "quantity" | "avgCost" | "currentPrice" | "evalAmount" | "evalPL" | "evalPLPct" | "totalRealizedPL" | "cagr" | "monthlyGeoReturn" | "holdingMonths";
  const [posSortKey, setPosSortKey] = useState<PosSortKey>("evalAmount");
  const [posSortDir, setPosSortDir] = useState<"asc" | "desc">("desc");
  function togglePosSort(key: PosSortKey) {
    if (posSortKey === key) setPosSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setPosSortKey(key); setPosSortDir("desc"); }
  }
  function PosSortIcon({ col }: { col: PosSortKey }) {
    if (col !== posSortKey) return <ArrowUpDown className="inline h-3 w-3 ml-0.5 opacity-30" />;
    return posSortDir === "asc"
      ? <ArrowUp className="inline h-3 w-3 ml-0.5 text-emerald-600" />
      : <ArrowDown className="inline h-3 w-3 ml-0.5 text-emerald-600" />;
  }

  // ── 종목별 목표 비중 (리밸런싱 분석 — stockKey: `${stockCode}::${category}`) ──
  // 카테고리 내 각 종목에 몇 %를 배분할지 설정 (합계 100%)
  const [stockAllocations, setStockAllocations] = useState<Record<string, number>>({});

  // ── 거래내역 탭 필터 + 정렬 ───────────
  const [txAcctFilter, setTxAcctFilter] = useState<PensionAccountType | "all">("all");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "BUY" | "SELL" | "DIVIDEND">("all");
  const [txSearch,     setTxSearch]     = useState("");
  const [sortKey,      setSortKey]      = useState<TxSortKey>("date");
  const [sortDir,      setSortDir]      = useState<"asc" | "desc">("desc");

  // ── 종목별 탭 필터 + accordion ─────────
  const [stockAcctFilter, setStockAcctFilter] = useState<PensionAccountType>("RETIREMENT");
  const [openAccordions,  setOpenAccordions]  = useState<Set<string>>(new Set());

  // ── 백업/복원 ───────────────────────────────
  // 복원 시 파일 선택 input ref (hidden input)
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMsg,     setBackupMsg]     = useState<string | null>(null);

  // ── Executed Trade 탭 정렬·필터 ────────────
  type ExTradeSortCol = "stockName" | "accountType" | "buyDate" | "sellDate" | "avgBuyPrice" | "avgSellPrice" | "profitLoss" | "profitLossPct" | "holdingDays" | "result";
  const [exTradeSort,       setExTradeSort]       = useState<{ col: ExTradeSortCol; dir: "asc" | "desc" }>({ col: "sellDate", dir: "desc" });
  const [exTradeAcctFilter, setExTradeAcctFilter] = useState<PensionAccountType | "all">("all");

  // ─────────────────────────────────────────
  // 데이터 로드
  // ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [posRes, txRes, rebalRes] = await Promise.all([
        fetch("/api/portfolio/pension/positions"),
        fetch("/api/portfolio/pension/transactions"),
        fetch("/api/portfolio/pension/rebalancing"),
      ]);
      const posData   = await posRes.json()   as PositionsResponse;
      const txData    = await txRes.json()    as TransactionsResponse;
      const rebalData = await rebalRes.json() as RebalancingResponse;

      setPositions(posData.positions);
      setSummaries({
        RETIREMENT: posData.retirementSummary,
        SAVINGS:    posData.savingsSummary,
        IRP:        posData.irpSummary,
      });
      setTransactions(txData.transactions);
      // 계좌별 목표 비중 초기화
      setRebalTargets({
        RETIREMENT: rebalData.config.RETIREMENT,
        SAVINGS:    rebalData.config.SAVINGS,
      });
      setLocalBonds({
        RETIREMENT: String(rebalData.config.RETIREMENT.bondRatio),
        SAVINGS:    String(rebalData.config.SAVINGS.bondRatio),
      });
      setLocalEquities({
        RETIREMENT: String(rebalData.config.RETIREMENT.equityRatio),
        SAVINGS:    String(rebalData.config.SAVINGS.equityRatio),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ─────────────────────────────────────────
  // 현재가 조회
  // Education/Shortterm 패턴과 동일:
  //   - positions를 인자로 받아 deps 없이 정의 (불필요한 재생성 방지)
  //   - useEffect에서 positions 로드 시 자동 조회
  // ─────────────────────────────────────────
  const fetchPrices = useCallback(async (posArr: PensionPosition[]) => {
    if (posArr.length === 0) return;
    setPriceLoading(true);
    try {
      const codes = [...new Set(posArr.map((p) => p.stockCode))].join(",");
      const res = await fetch(`/api/portfolio/risk/prices?codes=${encodeURIComponent(codes)}`);
      if (!res.ok) return;
      const data = await res.json() as { prices: Record<string, number>; fetchedAt: string };
      setCurrentPrices(data.prices);
      setPriceAt(data.fetchedAt);
    } finally {
      setPriceLoading(false);
    }
  }, []);

  // 포지션 로드 완료 시 자동 현재가 조회 (다른 페이지와 동일한 동작)
  useEffect(() => {
    if (positions.length > 0) void fetchPrices(positions);
  }, [positions, fetchPrices]);

  // ─────────────────────────────────────────
  // 포지션에 현재가 적용
  // ─────────────────────────────────────────
  const enrichedPositions = useMemo(() => {
    const today = new Date();
    return positions.map((p) => {
      const cur     = currentPrices[p.stockCode] ?? 0;
      const buyAmt  = p.avgCost * p.quantity;
      const hasCurPrice = cur > 0;
      const evalAmount  = hasCurPrice ? cur * p.quantity : buyAmt;
      const evalPL      = hasCurPrice ? (cur - p.avgCost) * p.quantity : 0;
      const evalPLPct   = hasCurPrice && p.avgCost > 0
        ? ((cur - p.avgCost) / p.avgCost) * 100 : 0;

      // 보유기간(개월) — p.holdingMonths는 서버 기준 today이므로 클라이언트에서 재계산
      let holdingMonths = p.holdingMonths;
      if (p.firstBuyDate) {
        const buyDate = new Date(p.firstBuyDate);
        holdingMonths =
          (today.getFullYear() - buyDate.getFullYear()) * 12 +
          (today.getMonth() - buyDate.getMonth()) +
          (today.getDate() - buyDate.getDate()) / 30;
        holdingMonths = Math.max(0, holdingMonths);
      }

      const canCalcReturn = hasCurPrice && p.avgCost > 0 && holdingMonths != null && holdingMonths >= 1;

      // 연환산 수익률(CAGR) — (1 + 총수익률)^(12/보유개월) - 1
      const cagr = canCalcReturn
        ? Math.pow(1 + evalPLPct / 100, 12 / holdingMonths!) - 1
        : null;

      // 월평균 기하수익률 — (1 + 총수익률)^(1/보유개월) - 1
      // 보유기간이 다른 ETF 간 공정 비교 기준
      const monthlyGeoReturn = canCalcReturn
        ? Math.pow(1 + evalPLPct / 100, 1 / holdingMonths!) - 1
        : null;

      return {
        ...p,
        currentPrice: cur,
        evalAmount,
        evalPL,
        evalPLPct,
        hasCurPrice,
        holdingMonths,
        cagr,
        monthlyGeoReturn,
      };
    });
  }, [positions, currentPrices]);

  // ─────────────────────────────────────────
  // 리밸런싱 계산 — 클라이언트 사이드 재계산 (계좌별)
  //
  // API 응답은 avgCost 기준이므로 현재가 조회 후 stale 상태가 됨.
  // enrichedPositions(현재가 반영) + cashAmounts 기반으로 직접 재계산.
  // ─────────────────────────────────────────
  function calcLiveRebal(acctType: RebalAccountType): RebalancingResult {
    const acctPos    = enrichedPositions.filter((p) => p.accountType === acctType);
    const bondEval   = acctPos.filter((p) => p.category === "BOND").reduce((s, p) => s + p.evalAmount, 0);
    const equityEval = acctPos.filter((p) => p.category === "EQUITY").reduce((s, p) => s + p.evalAmount, 0);
    const cash       = cashAmounts[acctType];
    const totalEval  = bondEval + equityEval + cash;

    if (totalEval === 0) {
      return { totalEval: 0, bondEval: 0, equityEval: 0, currentBondRatio: 0, currentEquityRatio: 0, bondDiff: 0, equityDiff: 0 };
    }

    const target     = rebalTargets[acctType];
    const targetBond   = totalEval * (target.bondRatio / 100);
    const targetEquity = totalEval * (target.equityRatio / 100);

    return {
      totalEval,
      bondEval,
      equityEval,
      currentBondRatio:   Math.round((bondEval   / totalEval) * 1000) / 10,
      currentEquityRatio: Math.round((equityEval / totalEval) * 1000) / 10,
      bondDiff:   Math.round(targetBond   - bondEval),
      equityDiff: Math.round(targetEquity - equityEval),
    };
  }

  // 계좌별 liveRebalResult — enrichedPositions / rebalTargets / cashAmounts 변경 시 재계산
  const liveRebalResults = useMemo((): Record<RebalAccountType, RebalancingResult> => ({
    RETIREMENT: calcLiveRebal("RETIREMENT"),
    SAVINGS:    calcLiveRebal("SAVINGS"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [enrichedPositions, rebalTargets, cashAmounts]);

  // ─────────────────────────────────────────
  // 리밸런싱 목표 저장 (현재 선택된 계좌 기준)
  // ─────────────────────────────────────────
  async function handleSaveRebal(acctType: RebalAccountType) {
    const bond   = Number(localBonds[acctType]);
    const equity = Number(localEquities[acctType]);
    if (isNaN(bond) || isNaN(equity) || Math.round(bond + equity) !== 100) {
      setRebalError("채권형 + 주식형 합계가 100이어야 합니다.");
      return;
    }
    setRebalSaving(true);
    setRebalError(null);
    try {
      const res = await fetch("/api/portfolio/pension/rebalancing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType: acctType, bondRatio: bond, equityRatio: equity }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? "실패");
      // 저장 성공 시 해당 계좌의 목표 비중 로컬 상태 업데이트
      setRebalTargets((prev) => ({ ...prev, [acctType]: { bondRatio: bond, equityRatio: equity } }));
    } catch (err) {
      setRebalError(err instanceof Error ? err.message : "오류");
    } finally {
      setRebalSaving(false);
    }
  }

  // ─────────────────────────────────────────
  // JSON 백업 다운로드
  // GET /api/portfolio/pension/backup → attachment 파일로 저장
  // ─────────────────────────────────────────
  async function handleJsonBackup() {
    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const res = await fetch("/api/portfolio/pension/backup");
      if (!res.ok) throw new Error("백업 API 오류");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `pension-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setBackupMsg("백업 완료");
    } catch (err) {
      console.error("JSON 백업 실패:", err);
      setBackupMsg("백업 실패");
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupMsg(null), 3000);
    }
  }

  // ─────────────────────────────────────────
  // JSON 복원
  // 파일 선택 → overwrite/merge 선택 → POST
  // ─────────────────────────────────────────
  async function handleJsonRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupLoading(true);
    setBackupMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { transactions?: unknown[] };

      if (!Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
        alert("유효한 백업 파일이 아닙니다. (transactions 배열 없음)");
        return;
      }

      // overwrite/merge 선택
      const useOverwrite = window.confirm(
        `백업 파일: 거래 ${parsed.transactions.length}건\n\n` +
        `[확인] 전체 덮어쓰기 (overwrite) — 현재 데이터가 모두 교체됩니다.\n` +
        `[취소] 병합 추가 (merge) — 중복 제외한 신규 건만 추가됩니다.`
      );

      const res = await fetch("/api/portfolio/pension/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsed.transactions,
          mode: useOverwrite ? "overwrite" : "merge",
        }),
      });

      if (!res.ok) throw new Error("복원 API 오류");
      const result = await res.json() as { ok: boolean; restored: number; skipped: number };

      alert(`복원 완료\n저장: ${result.restored}건 / 건너뜀: ${result.skipped}건`);
      setBackupMsg(`복원 완료 (${result.restored}건)`);
      void loadData();
    } catch (err) {
      console.error("JSON 복원 실패:", err);
      alert("JSON 복원에 실패했습니다. 파일 형식을 확인해 주세요.");
      setBackupMsg("복원 실패");
    } finally {
      setBackupLoading(false);
      setTimeout(() => setBackupMsg(null), 3000);
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
  }

  // ─────────────────────────────────────────
  // 거래 삭제
  // ─────────────────────────────────────────
  async function handleDeleteTx(tx: PensionTransaction) {
    if (!confirm(`[${tx.stockName}] ${TRADE_LABELS[tx.tradeType]} 거래를 삭제하시겠습니까?`)) return;
    await fetch(`/api/portfolio/pension/transactions/${tx.id}`, { method: "DELETE" });
    void loadData();
  }

  // ─────────────────────────────────────────
  // 정렬 토글
  // ─────────────────────────────────────────
  function toggleSort(key: TxSortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // ─────────────────────────────────────────
  // 거래내역 탭 필터 + 정렬 적용
  // ─────────────────────────────────────────
  const filteredTx = useMemo(() => {
    let arr = [...transactions];
    if (txAcctFilter !== "all") arr = arr.filter((t) => t.accountType === txAcctFilter);
    if (txTypeFilter !== "all") arr = arr.filter((t) => t.tradeType === txTypeFilter);
    if (txSearch.trim()) {
      const kw = txSearch.trim().toLowerCase();
      arr = arr.filter((t) =>
        t.stockName.toLowerCase().includes(kw) || t.stockCode.toLowerCase().includes(kw)
      );
    }
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":        cmp = a.date.localeCompare(b.date); break;
        case "accountType": cmp = a.accountType.localeCompare(b.accountType); break;
        case "stockName":   cmp = a.stockName.localeCompare(b.stockName, "ko"); break;
        case "category":    cmp = (a.category ?? "").localeCompare(b.category ?? ""); break;
        case "tradeType":   cmp = a.tradeType.localeCompare(b.tradeType); break;
        case "quantity":    cmp = a.quantity - b.quantity; break;
        case "price":       cmp = a.price - b.price; break;
        case "amount":      cmp = a.amount - b.amount; break;
        case "realizedPL":  cmp = (a.realizedPL ?? 0) - (b.realizedPL ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [transactions, txAcctFilter, txTypeFilter, txSearch, sortKey, sortDir]);

  // ─────────────────────────────────────────
  // 종목별 탭: 계좌 필터 후 종목 그룹화 + 집계
  // ─────────────────────────────────────────
  const stockGroups = useMemo((): StockGroup[] => {
    const acctTx  = transactions.filter((t) => t.accountType === stockAcctFilter);
    const acctPos = enrichedPositions.filter((p) => p.accountType === stockAcctFilter);

    const groupMap = new Map<string, {
      stockCode: string; stockName: string; category?: string; assetType: string;
      position?: typeof acctPos[0]; txs: PensionTransaction[];
    }>();

    for (const tx of acctTx) {
      const key = `${tx.stockCode}::${tx.category ?? ""}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          stockCode: tx.stockCode,
          stockName: tx.stockName,
          category:  tx.category,
          assetType: tx.assetType,
          position:  acctPos.find((p) => p.stockCode === tx.stockCode && p.category === tx.category),
          txs: [],
        });
      }
      groupMap.get(key)!.txs.push(tx);
    }

    // 날짜 오름차순 정렬 (소계 계산과 화면 표시 모두 오름차순)
    for (const g of groupMap.values()) {
      g.txs.sort((a, b) => a.date.localeCompare(b.date));
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.stockName.localeCompare(b.stockName, "ko")
    ).map((g) => {
      const buys  = g.txs.filter((t) => t.tradeType === "BUY");
      const sells = g.txs.filter((t) => t.tradeType === "SELL");
      const divs  = g.txs.filter((t) => t.tradeType === "DIVIDEND");

      const totalBuyQty  = buys.reduce((s, t) => s + t.quantity, 0);
      const totalBuyAmt  = buys.reduce((s, t) => s + t.amount, 0);
      const totalBuyFee  = buys.reduce((s, t) => s + (t.fee ?? 0), 0);
      const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0);
      const totalSellAmt = sells.reduce((s, t) => s + t.amount, 0);
      const totalSellFee = sells.reduce((s, t) => s + (t.fee ?? 0), 0);
      const totalDividend = divs.reduce((s, t) => s + t.amount, 0);
      const balance = g.position?.quantity ?? Math.max(0, totalBuyQty - totalSellQty);

      // 잔량 기준 가중평균단가 추적
      let runQty = 0, runCost = 0, sellCostBase = 0;
      for (const t of g.txs) {
        if (t.tradeType === "BUY") {
          runQty  += t.quantity;
          runCost += t.amount;
        } else if (t.tradeType === "SELL") {
          const avg = runQty > 0 ? runCost / runQty : 0;
          sellCostBase += avg * t.quantity;
          runCost = Math.max(0, runCost - avg * t.quantity);
          runQty  = Math.max(0, runQty - t.quantity);
        }
      }
      const avgCost = g.position?.avgCost ?? (balance > 0 ? runCost / balance : 0);

      // 행별 실현손익: enrichSellTransaction이 저장한 값 우선 (수수료 제외)
      const fixedPL = sells.reduce((s, t) => {
        if (t.realizedPL !== undefined) return s + t.realizedPL;
        return s + (t.price - (t.avgCostAtSell ?? avgCost)) * t.quantity;
      }, 0);
      const fixedPLPct = sellCostBase > 0 ? (fixedPL / sellCostBase) * 100 : 0;

      // 테이블 하단 실현손익 (수수료 포함): 총매도금액 - 취득원가 - 매수수수료전체 - 매도수수료전체
      const footerPL    = totalSellAmt - sellCostBase - totalBuyFee - totalSellFee;
      const footerPLPct = (sellCostBase + totalBuyFee) > 0
        ? (footerPL / (sellCostBase + totalBuyFee)) * 100 : 0;

      return {
        ...g,
        totalBuyQty, totalBuyAmt, totalBuyFee,
        totalSellQty, totalSellAmt, totalSellFee,
        totalDividend, balance,
        avgCost: Math.floor(avgCost),
        fixedPL: Math.round(fixedPL),
        fixedPLPct: Math.round(fixedPLPct * 100) / 100,
        footerPL: Math.round(footerPL),
        footerPLPct: Math.round(footerPLPct * 100) / 100,
      };
    });
  }, [transactions, enrichedPositions, stockAcctFilter]);

  // ─────────────────────────────────────────
  // Executed Trade — transactions에서 파생
  //
  // 모든 계좌의 transactions를 종목+계좌+카테고리 단위로 그룹화하고,
  // 잔량 0 (전량 매도 완료) + 매도 이력 있는 종목만 Executed Trade로 집계.
  // 종목별 탭과 동일한 데이터소스이므로 거래 추가·수정 시 자동 업데이트.
  // ─────────────────────────────────────────
  const executedTrades = useMemo((): PensionExecutedTrade[] => {
    // 계좌 필터 없이 전체 transactions 그룹화
    const groupMap = new Map<string, {
      stockCode: string; stockName: string; category?: string; assetType: string;
      accountType: PensionAccountType; txs: PensionTransaction[];
    }>();

    for (const tx of transactions) {
      const key = `${tx.stockCode}::${tx.accountType}::${tx.category ?? ""}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          stockCode: tx.stockCode, stockName: tx.stockName,
          category: tx.category, assetType: tx.assetType,
          accountType: tx.accountType, txs: [],
        });
      }
      groupMap.get(key)!.txs.push(tx);
    }

    const result: PensionExecutedTrade[] = [];

    for (const [key, g] of groupMap) {
      // 날짜 오름차순 정렬 (잔량 추적 정확성 보장)
      g.txs.sort((a, b) => a.date.localeCompare(b.date));

      const buys  = g.txs.filter((t) => t.tradeType === "BUY");
      const sells = g.txs.filter((t) => t.tradeType === "SELL");

      // 매도 이력이 없으면 Executed Trade 아님
      if (sells.length === 0) continue;

      const totalBuyQty  = buys.reduce((s, t) => s + t.quantity, 0);
      const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0);

      // enrichedPositions에서 해당 종목의 현재 잔량 확인
      const pos = enrichedPositions.find((p) =>
        p.stockCode === g.stockCode &&
        p.accountType === g.accountType &&
        (p.category ?? "") === (g.category ?? "")
      );
      const balance = pos?.quantity ?? Math.max(0, totalBuyQty - totalSellQty);

      // 잔량이 남아있으면 아직 미완료 → 제외
      if (balance !== 0) continue;

      const totalBuyAmt  = buys.reduce((s, t) => s + t.amount, 0);
      const totalSellAmt = sells.reduce((s, t) => s + t.amount, 0);
      const avgBuyPrice  = totalBuyQty  > 0 ? Math.round(totalBuyAmt  / totalBuyQty)  : 0;
      const avgSellPrice = totalSellQty > 0 ? Math.round(totalSellAmt / totalSellQty) : 0;

      const buyDate  = buys[0]?.date                ?? sells[0]?.date ?? "";
      const sellDate = sells[sells.length - 1]?.date ?? "";

      // 실현손익: SELL에 realizedPL 저장된 경우 사용, 없으면 직접 계산
      let profitLoss   = 0;
      let sellCostBase = 0;
      let runQty = 0, runCost = 0;
      for (const t of g.txs) {
        if (t.tradeType === "BUY") {
          runQty  += t.quantity;
          runCost += t.amount;
        } else if (t.tradeType === "SELL") {
          const avg = runQty > 0 ? runCost / runQty : 0;
          sellCostBase += avg * t.quantity;
          if (t.realizedPL !== undefined) {
            profitLoss += t.realizedPL;
          } else {
            profitLoss += (t.amount - (t.fee ?? 0)) - avg * t.quantity;
          }
          runCost = Math.max(0, runCost - avg * t.quantity);
          runQty  = Math.max(0, runQty  - t.quantity);
        }
      }

      const profitLossPct = sellCostBase > 0 ? (profitLoss / sellCostBase) * 100 : 0;
      const holdingDays   = buyDate && sellDate
        ? Math.max(0, Math.round(
            (new Date(sellDate).getTime() - new Date(buyDate).getTime()) / 86400000
          ))
        : 0;

      result.push({
        key,
        stockCode: g.stockCode, stockName: g.stockName,
        category: g.category, assetType: g.assetType,
        accountType: g.accountType,
        buyDate, sellDate, avgBuyPrice, avgSellPrice,
        totalQty: totalSellQty, totalBuyAmt,
        profitLoss:    Math.round(profitLoss),
        profitLossPct: Math.round(profitLossPct * 100) / 100,
        holdingDays,
        result: profitLoss >= 0 ? "Win" : "Lose",
      });
    }

    // 기본 정렬: 최종 매도일 내림차순
    return result.sort((a, b) => b.sellDate.localeCompare(a.sellDate));
  }, [transactions, enrichedPositions]);

  // 필터 + 정렬 적용 — executedSummary보다 먼저 정의해 KPI 연동
  const filteredExecutedTrades = useMemo(() => {
    let arr = [...executedTrades];
    if (exTradeAcctFilter !== "all") arr = arr.filter((t) => t.accountType === exTradeAcctFilter);
    return arr.sort((a, b) => {
      let cmp = 0;
      switch (exTradeSort.col) {
        case "stockName":    cmp = a.stockName.localeCompare(b.stockName, "ko"); break;
        case "accountType":  cmp = a.accountType.localeCompare(b.accountType); break;
        case "buyDate":      cmp = a.buyDate.localeCompare(b.buyDate); break;
        case "sellDate":     cmp = a.sellDate.localeCompare(b.sellDate); break;
        case "avgBuyPrice":  cmp = a.avgBuyPrice  - b.avgBuyPrice;  break;
        case "avgSellPrice": cmp = a.avgSellPrice - b.avgSellPrice; break;
        case "profitLoss":   cmp = a.profitLoss   - b.profitLoss;   break;
        case "profitLossPct": cmp = a.profitLossPct - b.profitLossPct; break;
        case "holdingDays":  cmp = a.holdingDays  - b.holdingDays;  break;
        case "result":       cmp = a.result.localeCompare(b.result); break;
      }
      return exTradeSort.dir === "asc" ? cmp : -cmp;
    });
  }, [executedTrades, exTradeAcctFilter, exTradeSort]);

  // Executed Trade 성과 요약 — filteredExecutedTrades 기반 (계좌 필터 연동)
  const executedSummary = useMemo(() => {
    if (filteredExecutedTrades.length === 0) return null;
    const wins   = filteredExecutedTrades.filter((t) => t.result === "Win");
    const losses = filteredExecutedTrades.filter((t) => t.result === "Lose");
    const totalWinPL   = wins.reduce((s, t) => s + t.profitLoss, 0);
    const totalLossPL  = Math.abs(losses.reduce((s, t) => s + t.profitLoss, 0));
    const winRate      = filteredExecutedTrades.length > 0 ? wins.length / filteredExecutedTrades.length : 0;
    const profitFactor = totalLossPL > 0 ? totalWinPL / totalLossPL : Infinity;
    const avgWinPct    = wins.length   > 0 ? wins.reduce((s, t) => s + t.profitLossPct, 0) / wins.length : 0;
    const avgLossPct   = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.profitLossPct, 0)) / losses.length : 0;
    return { totalTrades: filteredExecutedTrades.length, winCount: wins.length, lossCount: losses.length, winRate, profitFactor, avgWinPct, avgLossPct };
  }, [filteredExecutedTrades]);

  // TPI = winRate × (PF + 1)
  const exTpi = useMemo(() => {
    if (!executedSummary || executedSummary.totalTrades === 0) return null;
    const pf = isFinite(executedSummary.profitFactor) ? executedSummary.profitFactor : 0;
    return Math.round(executedSummary.winRate * (pf + 1) * 10000) / 10000;
  }, [executedSummary]);

  // KPI 합계 — filteredExecutedTrades 기반
  const exTradeTotalBuy = filteredExecutedTrades.reduce((s, t) => s + t.totalBuyAmt, 0);
  const exTradeTotalPL  = filteredExecutedTrades.reduce((s, t) => s + t.profitLoss, 0);

  // ─────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* 탭 3개 → 4개: 리밸런싱 | Transactions | Executed Trade | 종목별 */}
      <Tabs defaultValue="rebalancing">
        <TabsList className="grid w-full grid-cols-4 bg-emerald-500/5 border">
          {[
            { value: "rebalancing",  label: "Open Positions", count: undefined },
            { value: "transactions", label: "Transactions",   count: transactions.length },
            { value: "executed",     label: "Executed Trade", count: executedTrades.length },
            { value: "stocks",       label: "종목별",          count: stockGroups.length },
          ].map(({ value, label, count }) => (
            <TabsTrigger
              key={value} value={value}
              className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white text-xs"
            >
              {label}
              {count != null && count > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{count}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ══════════════════════════════════════
            탭 1: 리밸런싱 (계좌별 포지션 + 리밸런싱 분석)
        ══════════════════════════════════════ */}
        <TabsContent value="rebalancing" className="mt-4 space-y-4">
          {/* 툴바: 복원 / 백업 / 현재가 조회 / 거래 추가 */}
          {/* 파일 선택 input — hidden, backupFileRef로 제어 */}
          <input
            ref={backupFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleJsonRestore(e)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {enrichedPositions.filter((p) => p.accountType === selectedAccount).length}종목 보유 ({transactions.length}건 거래)
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              {backupMsg && <span className="text-[10px] text-emerald-600">{backupMsg}</span>}
              {/* 복원 버튼 — 파일 선택 input 클릭 트리거 */}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                onClick={() => backupFileRef.current?.click()}
                disabled={backupLoading}>
                <CloudDownload className={cn("h-3 w-3", backupLoading && "animate-pulse")} />
                Restore
              </Button>
              {/* 백업 다운로드 */}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                onClick={() => void handleJsonBackup()} disabled={backupLoading}>
                <CloudUpload className={cn("h-3 w-3", backupLoading && "animate-pulse")} />
                Backup
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                onClick={() => void fetchPrices(positions)} disabled={priceLoading || positions.length === 0}>
                <RefreshCw className={cn("h-3 w-3", priceLoading && "animate-spin")} />
                현재가 조회
              </Button>
            </div>
          </div>

          {/* 계좌 선택 탭 */}
          <div className="flex rounded-md border overflow-hidden text-xs w-fit">
            {(["RETIREMENT", "SAVINGS", "IRP"] as PensionAccountType[]).map((acct) => {
              const cnt = enrichedPositions.filter((p) => p.accountType === acct).length;
              return (
                <button key={acct}
                  onClick={() => { setSelectedAccount(acct); setPosCatFilter("all"); }}
                  className={cn("px-4 py-1.5 transition-colors flex items-center gap-1.5",
                    selectedAccount === acct
                      ? "bg-emerald-500 text-white font-medium"
                      : "hover:bg-muted/50 text-muted-foreground"
                  )}>
                  {ACCT_LABELS[acct]}
                  {cnt > 0 && (
                    <span className={cn("text-[10px] rounded px-1",
                      selectedAccount === acct ? "bg-white/20" : "bg-muted")}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 보유 포지션 테이블 — LongtermPositionsTable 형식 */}
          {(() => {
            const acctPos = enrichedPositions.filter((p) => p.accountType === selectedAccount);
            const hasCat  = selectedAccount === "RETIREMENT" || selectedAccount === "SAVINGS";

            // 카테고리 필터 적용
            const filtered = posCatFilter === "all"
              ? acctPos
              : acctPos.filter((p) => p.category === posCatFilter);

            // 포지션 테이블 정렬 (클릭한 컬럼 기준)
            const sorted = [...filtered].sort((a, b) => {
              let cmp = 0;
              switch (posSortKey) {
                case "stockName":       cmp = a.stockName.localeCompare(b.stockName, "ko"); break;
                case "category":        cmp = (a.category ?? "").localeCompare(b.category ?? ""); break;
                case "quantity":        cmp = a.quantity - b.quantity; break;
                case "avgCost":         cmp = a.avgCost - b.avgCost; break;
                case "currentPrice":    cmp = a.currentPrice - b.currentPrice; break;
                case "evalAmount":      cmp = a.evalAmount - b.evalAmount; break;
                case "evalPL":          cmp = a.evalPL - b.evalPL; break;
                case "evalPLPct":       cmp = a.evalPLPct - b.evalPLPct; break;
                case "totalRealizedPL": cmp = a.totalRealizedPL - b.totalRealizedPL; break;
                case "cagr":             cmp = (a.cagr ?? -Infinity) - (b.cagr ?? -Infinity); break;
                case "monthlyGeoReturn": cmp = (a.monthlyGeoReturn ?? -Infinity) - (b.monthlyGeoReturn ?? -Infinity); break;
                case "holdingMonths":    cmp = (a.holdingMonths ?? 0) - (b.holdingMonths ?? 0); break;
              }
              return posSortDir === "asc" ? cmp : -cmp;
            });

            // 합계 계산 (현재가 있는 종목만 평가손익 산정)
            const totalEval      = filtered.reduce((s, p) => s + p.evalAmount, 0);
            const withPrice      = filtered.filter((p) => (p as { hasCurPrice?: boolean }).hasCurPrice);
            const totalEvalPL    = withPrice.reduce((s, p) => s + p.evalPL, 0);
            const totalCostBasis = withPrice.reduce((s, p) => s + p.avgCost * p.quantity, 0);
            const totalEvalPLPct = totalCostBasis > 0 ? (totalEvalPL / totalCostBasis) * 100 : null;
            const totalRealPL    = filtered.reduce((s, p) => s + p.totalRealizedPL, 0);

            // 현재가 조회 시각
            const fetchedLabel = priceAt
              ? new Date(priceAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
              : null;

            return (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  {/* 헤더: 제목(좌) + 현재가 상태(우) */}
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">보유 포지션</CardTitle>
                    <div className="flex items-center gap-2">
                      {fetchedLabel && !priceLoading && (
                        <span className="text-[10px] text-muted-foreground">{fetchedLabel} 기준</span>
                      )}
                      <button
                        onClick={() => void fetchPrices(positions)}
                        disabled={priceLoading || positions.length === 0}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-600 disabled:opacity-40 transition-colors"
                      >
                        <RefreshCw className={cn("h-3 w-3", priceLoading && "animate-spin")} />
                        {priceLoading ? "조회 중..." : "현재가 새로고침"}
                      </button>
                      <span className="text-[10px] text-muted-foreground">{filtered.length}종목</span>
                    </div>
                  </div>
                  {/* 채권형/주식형 필터 (퇴직연금·연금저축) */}
                  {hasCat && (
                    <div className="flex gap-1 mt-2">
                      {(["all", "BOND", "EQUITY"] as const).map((f) => (
                        <Button key={f} variant={posCatFilter === f ? "default" : "outline"} size="sm"
                          className={cn("h-6 px-2 text-[10px]",
                            posCatFilter === f && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                          onClick={() => setPosCatFilter(f)}>
                          {f === "all" ? "전체" : CATEGORY_LABELS[f]}
                        </Button>
                      ))}
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-0">
                  {loading ? (
                    <div className="px-4 pb-4 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
                      ))}
                    </div>
                  ) : sorted.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      {ACCT_LABELS[selectedAccount]} 보유 포지션이 없습니다.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/30">
                            {/* 클릭 가능한 정렬 헤더 */}
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("stockName")}>
                              종목 <PosSortIcon col="stockName" />
                            </th>
                            {hasCat && (
                              <th className="px-3 py-2 text-center font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                                onClick={() => togglePosSort("category")}>
                                구분 <PosSortIcon col="category" />
                              </th>
                            )}
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("quantity")}>
                              수량 <PosSortIcon col="quantity" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("avgCost")}>
                              평균단가 <PosSortIcon col="avgCost" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("currentPrice")}>
                              <span className="inline-flex items-center gap-1">
                                현재가 <PosSortIcon col="currentPrice" />
                                {priceLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin ml-1" />}
                              </span>
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("evalAmount")}>
                              평가금액 <PosSortIcon col="evalAmount" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("evalPL")}>
                              평가손익 <PosSortIcon col="evalPL" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("evalPLPct")}>
                              수익률 <PosSortIcon col="evalPLPct" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("totalRealizedPL")}>
                              누적실현 <PosSortIcon col="totalRealizedPL" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("monthlyGeoReturn")}
                              title="월평균 기하수익률: (1+총수익률)^(1/보유개월)-1 — 보유기간이 다른 ETF 간 공정 비교">
                              월평균 <PosSortIcon col="monthlyGeoReturn" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("holdingMonths")}
                              title="최초 매수일부터 오늘까지 보유 개월 수">
                              보유 <PosSortIcon col="holdingMonths" />
                            </th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                              onClick={() => togglePosSort("evalAmount")}>
                              비중 <PosSortIcon col="evalAmount" />
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {sorted.map((pos) => {
                            const hasCur = (pos as { hasCurPrice?: boolean }).hasCurPrice ?? false;
                            const weight = totalEval > 0
                              ? ((pos.evalAmount / totalEval) * 100).toFixed(1) + "%"
                              : "0.0%";
                            return (
                              <tr key={`${pos.stockCode}::${pos.category ?? ""}`}
                                className="hover:bg-muted/20 transition-colors">
                                {/* 종목명 + 코드 + 자산유형 — 종목명 클릭 시 네이버 금융 이동 */}
                                <td className="px-4 py-2.5">
                                  <a
                                    href={naverStockUrl(pos.stockCode)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium hover:underline hover:text-emerald-600 transition-colors"
                                  >
                                    {pos.stockName}
                                  </a>
                                  <p className="text-[10px] text-muted-foreground">
                                    {pos.stockCode}
                                    <span className="ml-1 opacity-60">{pos.assetType}</span>
                                  </p>
                                </td>
                                {/* 구분 (채권형/주식형) */}
                                {hasCat && (
                                  <td className="px-3 py-2.5 text-center">
                                    {pos.category ? (
                                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded",
                                        pos.category === "BOND"
                                          ? "bg-blue-100 text-blue-700"
                                          : "bg-red-100 text-red-700")}>
                                        {CATEGORY_LABELS[pos.category]}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                )}
                                {/* 수량 */}
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {pos.quantity.toLocaleString()}
                                </td>
                                {/* 평균단가 */}
                                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                  {fmt(pos.avgCost)}
                                </td>
                                {/* 현재가 */}
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {priceLoading
                                    ? <span className="text-[10px] text-muted-foreground">조회 중…</span>
                                    : hasCur
                                    ? fmt(pos.currentPrice)
                                    : <span className="text-muted-foreground">-</span>}
                                </td>
                                {/* 평가금액 */}
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {fmt(pos.evalAmount)}원
                                </td>
                                {/* 평가손익 */}
                                <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium",
                                  hasCur ? plColor(pos.evalPL) : "text-muted-foreground")}>
                                  {hasCur
                                    ? `${pos.evalPL >= 0 ? "+" : ""}${fmt(pos.evalPL)}원`
                                    : "-"}
                                </td>
                                {/* 수익률 */}
                                <td className={cn("px-3 py-2.5 text-right tabular-nums font-semibold",
                                  hasCur ? plColor(pos.evalPLPct) : "text-muted-foreground")}>
                                  {hasCur
                                    ? `${pos.evalPLPct >= 0 ? "+" : ""}${pos.evalPLPct.toFixed(2)}%`
                                    : "-"}
                                </td>
                                {/* 누적실현손익 */}
                                <td className={cn("px-3 py-2.5 text-right tabular-nums",
                                  pos.totalRealizedPL !== 0 ? plColor(pos.totalRealizedPL) : "text-muted-foreground")}>
                                  {pos.totalRealizedPL !== 0
                                    ? `${pos.totalRealizedPL >= 0 ? "+" : ""}${fmt(pos.totalRealizedPL)}원`
                                    : "-"}
                                </td>
                                {/* 월평균 기하수익률 — (1+r)^(1/months)-1, 현재가 없으면 "-" */}
                                <td className={cn("px-3 py-2.5 text-right tabular-nums font-semibold",
                                  pos.monthlyGeoReturn != null ? plColor(pos.monthlyGeoReturn) : "text-muted-foreground")}>
                                  {pos.monthlyGeoReturn != null
                                    ? `${pos.monthlyGeoReturn >= 0 ? "+" : ""}${(pos.monthlyGeoReturn * 100).toFixed(2)}%`
                                    : "-"}
                                </td>
                                {/* 보유기간 (개월) */}
                                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground text-[11px]">
                                  {pos.holdingMonths != null
                                    ? `${Math.floor(pos.holdingMonths)}개월`
                                    : "-"}
                                </td>
                                {/* 비중 */}
                                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                  {weight}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>

                        {/* 합계 행 (2종목 이상) */}
                        {sorted.length > 1 && (
                          <tfoot>
                            <tr className={cn("border-t bg-muted/20 font-medium text-xs")}>
                              <td className="px-4 py-2 text-muted-foreground"
                                colSpan={hasCat ? 5 : 4}>합계</td>
                              {/* 평가금액 */}
                              <td className="px-3 py-2 text-right tabular-nums">
                                {fmt(totalEval)}원
                              </td>
                              {/* 평가손익 */}
                              <td className={cn("px-3 py-2 text-right tabular-nums",
                                withPrice.length > 0 ? plColor(totalEvalPL) : "text-muted-foreground")}>
                                {withPrice.length > 0
                                  ? `${totalEvalPL >= 0 ? "+" : ""}${fmt(totalEvalPL)}원`
                                  : "-"}
                              </td>
                              {/* 수익률 */}
                              <td className={cn("px-3 py-2 text-right tabular-nums font-semibold",
                                totalEvalPLPct != null ? plColor(totalEvalPLPct) : "text-muted-foreground")}>
                                {totalEvalPLPct != null
                                  ? `${totalEvalPLPct >= 0 ? "+" : ""}${totalEvalPLPct.toFixed(2)}%`
                                  : "-"}
                              </td>
                              {/* 누적실현 */}
                              <td className={cn("px-3 py-2 text-right tabular-nums",
                                totalRealPL !== 0 ? plColor(totalRealPL) : "text-muted-foreground")}>
                                {totalRealPL !== 0
                                  ? `${totalRealPL >= 0 ? "+" : ""}${fmt(totalRealPL)}원`
                                  : "-"}
                              </td>
                              {/* 월평균 기하수익률 가중평균 (evalAmount 기준) */}
                              {(() => {
                                const geoPositions    = sorted.filter((p) => p.monthlyGeoReturn != null);
                                const totalGeoEval    = geoPositions.reduce((s, p) => s + p.evalAmount, 0);
                                const weightedMonthly = totalGeoEval > 0
                                  ? geoPositions.reduce((s, p) => s + (p.monthlyGeoReturn ?? 0) * p.evalAmount, 0) / totalGeoEval
                                  : null;
                                return (
                                  <td className={cn("px-3 py-2 text-right tabular-nums font-semibold",
                                    weightedMonthly != null ? plColor(weightedMonthly) : "text-muted-foreground")}>
                                    {weightedMonthly != null
                                      ? `${weightedMonthly >= 0 ? "+" : ""}${(weightedMonthly * 100).toFixed(2)}%`
                                      : "-"}
                                  </td>
                                );
                              })()}
                              {/* 보유기간 — 합계 없음 */}
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">-</td>
                              {/* 비중 합계 */}
                              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                100%
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* 리밸런싱 분석 — 퇴직연금 / 연금저축 (채권/주식 카테고리가 있는 계좌) */}
          {(selectedAccount === "RETIREMENT" || selectedAccount === "SAVINGS") && (() => {
            const acctType  = selectedAccount as RebalAccountType;
            const acctPos   = enrichedPositions.filter((p) => p.accountType === acctType);
            const bondPos   = acctPos.filter((p) => p.category === "BOND");
            const equityPos = acctPos.filter((p) => p.category === "EQUITY");
            return (
              <RebalancingPanel
                accountLabel={ACCT_LABELS[acctType]}
                target={rebalTargets[acctType]}
                result={liveRebalResults[acctType]}
                localBond={localBonds[acctType]}
                localEquity={localEquities[acctType]}
                onBondChange={(v) => {
                  setLocalBonds((prev) => ({ ...prev, [acctType]: v }));
                  const n = Number(v);
                  if (!isNaN(n)) setLocalEquities((prev) => ({ ...prev, [acctType]: String(100 - n) }));
                }}
                onEquityChange={(v) => {
                  setLocalEquities((prev) => ({ ...prev, [acctType]: v }));
                  const n = Number(v);
                  if (!isNaN(n)) setLocalBonds((prev) => ({ ...prev, [acctType]: String(100 - n) }));
                }}
                onSave={() => void handleSaveRebal(acctType)}
                saving={rebalSaving}
                error={rebalError}
                bondPositions={bondPos}
                equityPositions={equityPos}
                stockAllocations={stockAllocations}
                onAllocationChange={(key, pct) =>
                  setStockAllocations((prev) => ({ ...prev, [key]: pct }))
                }
                cashAmount={cashAmounts[acctType]}
                localCash={localCashes[acctType]}
                onCashChange={(raw, display) => {
                  setCashAmounts((prev) => ({ ...prev, [acctType]: raw }));
                  setLocalCashes((prev) => ({ ...prev, [acctType]: display }));
                }}
              />
            );
          })()}
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 2: 거래내역
        ══════════════════════════════════════ */}
        <TabsContent value="transactions" className="mt-4 space-y-3">
          {/* 툴바 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 items-center">
              {/* 계좌 필터 */}
              <div className="flex rounded-md border overflow-hidden text-[10px]">
                {(["all", "RETIREMENT", "SAVINGS", "IRP"] as const).map((acct) => (
                  <button key={acct} onClick={() => setTxAcctFilter(acct)}
                    className={cn("px-2.5 py-1 transition-colors",
                      txAcctFilter === acct ? "bg-emerald-500 text-white" : "hover:bg-muted/50"
                    )}>
                    {acct === "all" ? "전체" : ACCT_LABELS[acct]}
                  </button>
                ))}
              </div>
              {/* 거래유형 필터 */}
              <div className="flex rounded-md border overflow-hidden text-[10px]">
                {(["all", "BUY", "SELL", "DIVIDEND"] as const).map((type) => (
                  <button key={type} onClick={() => setTxTypeFilter(type)}
                    className={cn("px-2.5 py-1 transition-colors",
                      txTypeFilter === type
                        ? type === "BUY" ? "bg-red-500 text-white"
                          : type === "SELL" ? "bg-blue-500 text-white"
                          : type === "DIVIDEND" ? "bg-amber-500 text-white"
                          : "bg-emerald-500 text-white"
                        : "hover:bg-muted/50"
                    )}>
                    {type === "all" ? "전체" : TRADE_LABELS[type]}
                  </button>
                ))}
              </div>
              {/* 종목 검색 */}
              <Input className="h-7 text-xs w-40 placeholder:text-muted-foreground/60"
                placeholder="종목명·코드 검색"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">{filteredTx.length}건</span>
            </div>
            <div className="flex gap-2 items-center">
              {/* 복원/백업 — 거래내역 탭에서도 동일한 API 사용 */}
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                onClick={() => backupFileRef.current?.click()}
                disabled={backupLoading}>
                <CloudDownload className={cn("h-3 w-3", backupLoading && "animate-pulse")} />
                Restore
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                onClick={() => void handleJsonBackup()} disabled={backupLoading}>
                <CloudUpload className={cn("h-3 w-3", backupLoading && "animate-pulse")} />
                Backup
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => { setEditTx(null); setTxFormOpen(true); }}>
                <Plus className="h-3 w-3" />Add Trade
              </Button>
            </div>
          </div>

          {/* 거래 테이블 */}
          {filteredTx.length === 0 ? (
            <EmptyState text={transactions.length === 0 ? "거래 내역이 없습니다." : "필터 조건에 해당하는 거래가 없습니다."} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] text-muted-foreground bg-muted/20">
                        {/* 정렬 가능한 헤더 — cursor-pointer */}
                        {(
                          [
                            { key: "date"      as TxSortKey, label: "날짜",   align: "left",   cls: "pl-3" },
                            { key: "accountType" as TxSortKey, label: "계좌", align: "left",   cls: "" },
                            { key: "stockName" as TxSortKey, label: "종목",   align: "left",   cls: "" },
                            { key: "category"  as TxSortKey, label: "구분",   align: "center", cls: "" },
                            { key: "tradeType" as TxSortKey, label: "유형",   align: "center", cls: "" },
                            { key: "quantity"  as TxSortKey, label: "수량",   align: "right",  cls: "" },
                            { key: "price"     as TxSortKey, label: "단가",   align: "right",  cls: "" },
                            { key: "amount"    as TxSortKey, label: "금액",   align: "right",  cls: "" },
                            { key: "realizedPL" as TxSortKey, label: "실현손익", align: "right", cls: "" },
                          ] as const
                        ).map(({ key, label, align, cls }) => (
                          <th key={key}
                            className={cn("p-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors", cls,
                              align === "left" ? "text-left" : align === "right" ? "text-right" : "text-center"
                            )}
                            onClick={() => toggleSort(key)}
                          >
                            {label}
                            <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                          </th>
                        ))}
                        <th className="p-2 w-14" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {filteredTx.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/30 group">
                          <td className="p-2 pl-3 tabular-nums text-muted-foreground whitespace-nowrap">{t.date}</td>
                          <td className="p-2">
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{ACCT_LABELS[t.accountType]}</span>
                          </td>
                          <td className="p-2">
                            <div className="font-medium">{t.stockName}</div>
                            <div className="text-[10px] text-muted-foreground">{t.stockCode}</div>
                          </td>
                          <td className="p-2 text-center">
                            {t.category ? (
                              <span className={cn("text-[10px] font-medium",
                                t.category === "BOND" ? "text-blue-600" : "text-red-500")}>
                                {CATEGORY_LABELS[t.category]}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="p-2 text-center">
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded",
                              t.tradeType === "BUY"
                                ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                                : t.tradeType === "SELL"
                                ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                                : "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                            )}>
                              {TRADE_LABELS[t.tradeType]}
                            </span>
                          </td>
                          <td className="text-right p-2 tabular-nums">
                            {t.quantity > 0 ? `${t.quantity.toLocaleString()}주` : "-"}
                          </td>
                          <td className="text-right p-2 tabular-nums">
                            {t.price > 0 ? fmt(t.price) : "-"}
                          </td>
                          <td className="text-right p-2 tabular-nums font-medium">{fmt(t.amount)}</td>
                          <td className="text-right p-2 tabular-nums">
                            {t.realizedPL !== undefined ? (
                              <span className={cn("font-semibold", plColor(t.realizedPL))}>
                                {t.realizedPL >= 0 ? "+" : ""}{fmt(t.realizedPL)}
                              </span>
                            ) : "-"}
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="outline" size="sm" className="h-6 w-6 p-0"
                                onClick={() => { setEditTx(t); setTxFormOpen(true); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="outline" size="sm"
                                className="h-6 w-6 p-0 border-red-200 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                                onClick={() => void handleDeleteTx(t)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 3: Executed Trade — 잔량 0인 종목 (전량 매도 완료)
            종목별 탭과 동일한 데이터소스, 계좌 전체 집계
        ══════════════════════════════════════ */}
        <TabsContent value="executed" className="mt-4 space-y-3">

          {/* 성과 요약 카드 — 거래 건수가 있을 때만 표시 */}
          {executedSummary && executedSummary.totalTrades > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              <ExSummaryCard label="총 완료 거래"
                value={`${executedSummary.totalTrades}건`}
                sub={`${executedSummary.winCount}승 ${executedSummary.lossCount}패`}
              />
              <ExSummaryCard label="승률"
                value={`${Math.round(executedSummary.winRate * 100)}%`}
              />
              <ExSummaryCard label="누적 손익"
                value={`${exTradeTotalPL >= 0 ? "+" : ""}${fmt(exTradeTotalPL)}원`}
                valueClass={plColor(exTradeTotalPL)}
              />
              <ExSummaryCard label="손익비 (PF)"
                value={isFinite(executedSummary.profitFactor) ? executedSummary.profitFactor.toFixed(2) : "∞"}
              />
              <ExSummaryCard label="평균 수익"
                value={`+${executedSummary.avgWinPct.toFixed(1)}%`}
                valueClass="text-emerald-600 dark:text-emerald-400"
              />
              <ExSummaryCard label="평균 손실"
                value={`-${executedSummary.avgLossPct.toFixed(1)}%`}
                valueClass="text-red-500 dark:text-red-400"
              />
              <ExSummaryCard label="TPI"
                value={exTpi !== null ? exTpi.toFixed(2) : "-"}
                sub="winRate × (PF+1)"
                valueClass={exTpi !== null ? (exTpi >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400") : undefined}
              />
            </div>
          )}

          {/* 계좌 총합 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <ExSummaryCard label="총 매수금액"   value={`${fmt(exTradeTotalBuy)}원`} />
            <ExSummaryCard label="총 실현 손익"
              value={`${exTradeTotalPL >= 0 ? "+" : ""}${fmt(exTradeTotalPL)}원`}
              valueClass={plColor(exTradeTotalPL)}
            />
            <ExSummaryCard label="실현 수익률"
              value={exTradeTotalBuy > 0 ? fmtPct((exTradeTotalPL / exTradeTotalBuy) * 100) : "-"}
              valueClass={plColor(exTradeTotalPL)}
            />
          </div>

          {/* 필터 바 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 계좌 필터 */}
            <div className="flex rounded-md border overflow-hidden text-[10px]">
              {(["all", "RETIREMENT", "SAVINGS", "IRP"] as const).map((acct) => (
                <button key={acct} onClick={() => setExTradeAcctFilter(acct)}
                  className={cn("px-2.5 py-1 transition-colors",
                    exTradeAcctFilter === acct ? "bg-emerald-500 text-white" : "hover:bg-muted/50"
                  )}>
                  {acct === "all" ? "전체" : ACCT_LABELS[acct]}
                </button>
              ))}
            </div>

<span className="text-[10px] text-muted-foreground">{filteredExecutedTrades.length}건 표시</span>
          </div>

          {/* 거래 테이블 */}
          {filteredExecutedTrades.length === 0 ? (
            <EmptyState text={
              executedTrades.length === 0
                ? "전량 매도 완료된 종목이 없습니다."
                : "필터 조건에 해당하는 거래가 없습니다."
            } />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] text-muted-foreground bg-muted/20">
                        {/* 클릭 가능한 정렬 헤더 */}
                        {([
                          { col: "stockName"    as ExTradeSortCol, label: "종목",   align: "left"  },
                          { col: "accountType"  as ExTradeSortCol, label: "계좌",   align: "left"  },
                          { col: "buyDate"      as ExTradeSortCol, label: "매수일", align: "right" },
                          { col: "avgBuyPrice"  as ExTradeSortCol, label: "매수가", align: "right" },
                          { col: "sellDate"     as ExTradeSortCol, label: "매도일", align: "right" },
                          { col: "avgSellPrice" as ExTradeSortCol, label: "매도가", align: "right" },
                          { col: "profitLoss"   as ExTradeSortCol, label: "손익",   align: "right" },
                          { col: "profitLossPct" as ExTradeSortCol, label: "%",     align: "right" },
                          { col: "holdingDays"  as ExTradeSortCol, label: "보유",   align: "right" },
                          { col: "result"       as ExTradeSortCol, label: "결과",   align: "center"},
                        ] as const).map(({ col, label, align }) => (
                          <th key={col}
                            className={cn(
                              "p-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
                              align === "left" ? "text-left pl-3" : align === "right" ? "text-right" : "text-center"
                            )}
                            onClick={() => setExTradeSort((prev) =>
                              prev.col === col
                                ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { col, dir: "desc" }
                            )}
                          >
                            <span className={cn("inline-flex items-center gap-0.5",
                              align === "right" ? "justify-end" : align === "center" ? "justify-center" : ""
                            )}>
                              {label}
                              {exTradeSort.col === col
                                ? exTradeSort.dir === "asc"
                                  ? <ArrowUp   className="h-3 w-3 text-emerald-600" />
                                  : <ArrowDown className="h-3 w-3 text-emerald-600" />
                                : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {filteredExecutedTrades.map((t) => (
                        <tr key={t.key} className="hover:bg-muted/30">
                          {/* 종목명 + 코드 */}
                          <td className="p-2 pl-3">
                            <div className="font-medium">{t.stockName}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {t.stockCode}
                              {t.category && (
                                <span className={cn("ml-1 px-1 rounded",
                                  t.category === "BOND"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-red-100 text-red-700"
                                )}>
                                  {CATEGORY_LABELS[t.category]}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* 계좌 배지 */}
                          <td className="p-2">
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                              {ACCT_LABELS[t.accountType]}
                            </span>
                          </td>
                          {/* 매수일 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">{t.buyDate}</td>
                          {/* 평균 매수가 */}
                          <td className="text-right p-2 tabular-nums">{fmt(t.avgBuyPrice)}</td>
                          {/* 매도일 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">{t.sellDate}</td>
                          {/* 평균 매도가 */}
                          <td className="text-right p-2 tabular-nums">{fmt(t.avgSellPrice)}</td>
                          {/* 실현손익 */}
                          <td className={cn("text-right p-2 tabular-nums font-medium", plColor(t.profitLoss))}>
                            {t.profitLoss >= 0 ? "+" : ""}{fmt(t.profitLoss)}
                          </td>
                          {/* 수익률 */}
                          <td className={cn("text-right p-2 tabular-nums font-semibold", plColor(t.profitLossPct))}>
                            {fmtPct(t.profitLossPct)}
                          </td>
                          {/* 보유일수 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">
                            {t.holdingDays}일
                          </td>
                          {/* Win / Lose 배지 */}
                          <td className="text-center p-2">
                            <span className={cn(
                              "text-[10px] font-bold px-1.5 py-0.5 rounded",
                              t.result === "Win"
                                ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                                : "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                            )}>
                              {t.result}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 4: 종목별 — Value Investment Account 스타일
        ══════════════════════════════════════ */}
        <TabsContent value="stocks" className="mt-4 space-y-3">
          {/* 계좌 필터 */}
          <div className="flex rounded-md border overflow-hidden text-[10px] w-fit">
            {(["RETIREMENT", "SAVINGS", "IRP"] as PensionAccountType[]).map((acct) => (
              <button key={acct} onClick={() => setStockAcctFilter(acct)}
                className={cn("px-3 py-1.5 transition-colors",
                  stockAcctFilter === acct ? "bg-emerald-500 text-white" : "hover:bg-muted/50"
                )}>
                {ACCT_LABELS[acct]}
              </button>
            ))}
          </div>

          {stockGroups.length === 0 ? (
            <EmptyState text={`${ACCT_LABELS[stockAcctFilter]} 거래 내역이 없습니다.`} />
          ) : (
            /* 2열 그리드 — items-start 로 각 카드가 독립 높이 유지 */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
              {stockGroups.map((g) => {
                const key    = `${g.stockCode}::${g.category ?? ""}`;
                const isOpen = openAccordions.has(key);

                return (
                  <div key={key} className="w-full">
                    {/* ── 헤더 (클릭으로 accordion 토글) ── */}
                    <button
                      className="w-full flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted/40 transition-colors text-left h-[72px]"
                      onClick={() => {
                        setOpenAccordions((prev) => {
                          const next = new Set(prev);
                          isOpen ? next.delete(key) : next.add(key);
                          return next;
                        });
                      }}
                    >
                      {isOpen
                        ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}

                      {/* 종목명 + 코드 */}
                      <div className="flex items-baseline gap-1 min-w-0 flex-1">
                        <span className="text-xs font-semibold truncate">{g.stockName}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">({g.stockCode})</span>
                      </div>

                      {/* 배지: 계좌유형 + 카테고리 */}
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-medium">
                          {ACCT_LABELS[stockAcctFilter]}
                        </span>
                        {g.category && (
                          <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium",
                            g.category === "BOND"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-red-100 text-red-700"
                          )}>
                            {CATEGORY_LABELS[g.category]}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                          {g.assetType}
                        </span>
                      </div>

                      {/* 잔량 + 실현손익 */}
                      <div className="flex flex-col items-end text-[10px] shrink-0 ml-1">
                        <span className="text-muted-foreground">
                          잔량 <span className="font-medium text-foreground">{g.balance.toLocaleString()}</span>주
                        </span>
                        {g.totalSellQty > 0 && (
                          <span className={g.footerPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                            {g.footerPL >= 0 ? "+" : ""}{fmt(g.footerPL)}원
                            <span className="opacity-70 ml-0.5">({fmtPct(g.footerPLPct)})</span>
                          </span>
                        )}
                        {g.totalDividend > 0 && (
                          <span className="text-emerald-600">배당 {fmt(g.totalDividend)}원</span>
                        )}
                      </div>
                    </button>

                    {/* ── 펼쳐진 내용: 거래 테이블 + 소계 ── */}
                    {isOpen && (
                      <div className="border border-t-0 rounded-b-lg">
                        {/* 거래 테이블: 고정 너비 + 가로 스크롤 */}
                        <div className="overflow-x-auto">
                          <table className="text-[11px] border-collapse" style={{ width: "660px" }}>
                            {/* 날짜/구분/수량/단가/수수료/금액/실현손익/메모 */}
                            <colgroup>
                              <col style={{ width: "88px" }} />
                              <col style={{ width: "44px" }} />
                              <col style={{ width: "60px" }} />
                              <col style={{ width: "84px" }} />
                              <col style={{ width: "64px" }} />
                              <col style={{ width: "96px" }} />
                              <col style={{ width: "140px" }} />
                              <col style={{ width: "84px" }} />
                            </colgroup>
                            <thead>
                              <tr className="bg-muted/50 text-muted-foreground">
                                <th className="px-2 py-1.5 text-left font-medium">날짜</th>
                                <th className="px-1 py-1.5 text-center font-medium">구분</th>
                                <th className="px-2 py-1.5 text-right font-medium">수량</th>
                                <th className="px-2 py-1.5 text-right font-medium">단가</th>
                                <th className="px-2 py-1.5 text-right font-medium">수수료</th>
                                <th className="px-2 py-1.5 text-right font-medium">금액</th>
                                <th className="px-2 py-1.5 text-right font-medium">실현손익</th>
                                <th className="px-2 py-1.5 text-left font-medium">메모</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.txs.map((t, idx) => (
                                <tr key={t.id}
                                  className={cn("group", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                                  <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap border-t">
                                    {t.date}
                                  </td>
                                  <td className="px-1 py-1.5 text-center font-medium border-t">
                                    {t.tradeType === "BUY"
                                      ? <span className="text-red-500">매수</span>
                                      : t.tradeType === "SELL"
                                      ? <span className="text-blue-500">매도</span>
                                      : <span className="text-emerald-600">배당</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums border-t">
                                    {t.tradeType === "DIVIDEND" ? "—" : `${t.quantity.toLocaleString()}주`}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums border-t">
                                    {t.tradeType === "DIVIDEND" ? "—" : fmt(t.price)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground border-t">
                                    {t.fee != null && t.fee > 0 ? fmt(t.fee) : "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums font-medium border-t">
                                    {fmt(t.amount)}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums border-t">
                                    {t.tradeType === "SELL" && t.realizedPL !== undefined ? (
                                      <span className={t.realizedPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                                        {t.realizedPL >= 0 ? "+" : ""}{fmt(t.realizedPL)}
                                        {t.realizedPLPct !== undefined && (
                                          <span className="opacity-70 text-[10px] ml-0.5">({fmtPct(t.realizedPLPct)})</span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-muted-foreground truncate border-t">
                                    {t.memo ?? ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* ── 소계 바 ── */}
                        <div className="bg-muted/30 border-t px-3 py-2.5 grid grid-cols-4 gap-x-4 text-[11px]">
                          <div>
                            <p className="text-muted-foreground text-[10px] mb-0.5">총 매수</p>
                            <p className="font-medium tabular-nums">{g.totalBuyQty.toLocaleString()}주</p>
                            <p className="tabular-nums">{fmt(g.totalBuyAmt)}원</p>
                            {g.totalBuyFee > 0 && (
                              <p className="text-muted-foreground tabular-nums text-[10px]">
                                수수료 {fmt(g.totalBuyFee)}원
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] mb-0.5">총 매도</p>
                            <p className="font-medium tabular-nums">{g.totalSellQty.toLocaleString()}주</p>
                            <p className="tabular-nums">{fmt(g.totalSellAmt)}원</p>
                            {g.totalSellFee > 0 && (
                              <p className="text-muted-foreground tabular-nums text-[10px]">
                                수수료 {fmt(g.totalSellFee)}원
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] mb-0.5">잔량 (평균단가)</p>
                            <p className="font-medium tabular-nums">{g.balance.toLocaleString()}주</p>
                            <p className="tabular-nums">{fmt(g.avgCost)}원</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px] mb-0.5">실현손익 / 배당</p>
                            {g.totalSellQty > 0 ? (
                              <p className={cn("font-medium tabular-nums", g.footerPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                                {g.footerPL >= 0 ? "+" : ""}{fmt(g.footerPL)}원
                                <span className="opacity-70 text-[10px] ml-0.5">({fmtPct(g.footerPLPct)})</span>
                              </p>
                            ) : (
                              <p className="text-muted-foreground tabular-nums">—</p>
                            )}
                            {g.totalDividend > 0 && (
                              <p className="text-emerald-600 tabular-nums">배당 {fmt(g.totalDividend)}원</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ── 다이얼로그 ── */}
      <PensionTransactionForm
        open={txFormOpen}
        onOpenChange={(open) => { setTxFormOpen(open); if (!open) setEditTx(null); }}
        onSaved={() => { void loadData(); }}
        editTransaction={editTx ?? undefined}
        defaultAccountType={txFormDefault}
        positions={enrichedPositions}
        existingTransactions={transactions}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// 포지션 미니 테이블 (대시보드/리밸런싱 공용)
// ─────────────────────────────────────────
function PositionMiniTable({
  positions, priceLoading, priceAt,
}: {
  positions: Array<PensionPosition & { hasCurPrice?: boolean }>;
  priceLoading: boolean;
  priceAt: string | null;
}) {
  if (positions.length === 0) return <EmptyState text="포지션 없음" />;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-[10px] text-muted-foreground bg-muted/20">
                <th className="text-left p-2 pl-3 font-medium">종목명</th>
                <th className="text-right p-2 font-medium">수량</th>
                <th className="text-right p-2 font-medium">평균단가</th>
                <th className="text-right p-2 font-medium">현재가</th>
                <th className="text-right p-2 pr-3 font-medium">평가손익</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {positions.map((p) => (
                <tr key={`${p.stockCode}::${p.category ?? ""}`} className="hover:bg-muted/30">
                  <td className="p-2 pl-3">
                    <div className="font-medium">{p.stockName}</div>
                    <div className="text-[10px] text-muted-foreground">{p.stockCode}</div>
                  </td>
                  <td className="text-right p-2 tabular-nums">{p.quantity.toLocaleString()}주</td>
                  <td className="text-right p-2 tabular-nums">{fmt(p.avgCost)}</td>
                  <td className="text-right p-2 tabular-nums">
                    {priceLoading
                      ? <span className="text-[10px] text-muted-foreground">조회 중…</span>
                      : p.currentPrice > 0 ? fmt(p.currentPrice)
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="text-right p-2 pr-3 tabular-nums">
                    {p.evalPL !== 0 ? (
                      <div>
                        <div className={cn("font-semibold", plColor(p.evalPL))}>
                          {p.evalPL >= 0 ? "+" : ""}{fmt(p.evalPL)}
                        </div>
                        <div className={cn("text-[10px]", plColor(p.evalPLPct))}>
                          {fmtPct(p.evalPLPct)}
                        </div>
                      </div>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {priceAt && (
              <tfoot>
                <tr>
                  <td colSpan={5} className="text-right p-1 pr-3 text-[10px] text-muted-foreground">
                    {new Date(priceAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// 리밸런싱 패널
// ─────────────────────────────────────────
function RebalancingPanel({
  target, result,
  localBond, localEquity,
  onBondChange, onEquityChange,
  onSave, saving, error,
  bondPositions, equityPositions,
  stockAllocations, onAllocationChange,
  cashAmount, localCash, onCashChange,
  accountLabel,
}: {
  target: PensionRebalancingTarget;
  result: RebalancingResult | null;
  localBond: string; localEquity: string;
  onBondChange: (v: string) => void;
  onEquityChange: (v: string) => void;
  onSave: () => void;
  saving: boolean; error: string | null;
  // 종목별 비중 설정
  bondPositions: Array<PensionPosition & { hasCurPrice?: boolean }>;
  equityPositions: Array<PensionPosition & { hasCurPrice?: boolean }>;
  stockAllocations: Record<string, number>;  // `${stockCode}::${category}` → target %
  onAllocationChange: (key: string, pct: number) => void;
  // 보유 현금 (리밸런싱 총평가금액에 포함)
  cashAmount: number;
  localCash: string;
  onCashChange: (raw: number, display: string) => void;
  // 계좌 레이블 (패널 제목에 표시)
  accountLabel: string;
}) {
  const hasData = result && result.totalEval > 0;

  const pieData = hasData
    ? [
        { name: "채권형", value: result!.bondEval,   color: PIE_COLORS.BOND },
        { name: "주식형", value: result!.equityEval, color: PIE_COLORS.EQUITY },
      ]
    : [
        { name: "채권형 (목표)", value: target.bondRatio,   color: PIE_COLORS.BOND },
        { name: "주식형 (목표)", value: target.equityRatio, color: PIE_COLORS.EQUITY },
      ];

  // 종목별 목표 비중 테이블 렌더 헬퍼
  // targetCatEval: 해당 카테고리의 목표 평가금액 (전체 × 카테고리 목표비중%)
  function StockAllocationTable({
    positions, catLabel, catColor, catTextColor, targetCatEval,
  }: {
    positions: Array<PensionPosition & { hasCurPrice?: boolean; monthlyGeoReturn?: number | null }>;
    catLabel: string; catColor: string; catTextColor: string;
    targetCatEval: number;
  }) {
    // 각 종목 목표 비중의 합계 (유효성 표시용)
    const totalAlloc = positions.reduce((s, p) => {
      const key = `${p.stockCode}::${p.category ?? ""}`;
      return s + (stockAllocations[key] ?? 0);
    }, 0);
    const isValid = Math.abs(totalAlloc - 100) < 0.01;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={cn("text-xs font-medium", catTextColor)}>{catLabel} 종목별 비중</p>
          <span className={cn("text-[11px] font-semibold tabular-nums",
            isValid ? "text-emerald-600" : totalAlloc > 0 ? "text-amber-600" : "text-muted-foreground")}>
            합계 {totalAlloc.toFixed(1)}% {isValid ? "✓" : totalAlloc > 0 ? "(100% 맞춰주세요)" : ""}
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="text-xs" style={{ width: "100%", tableLayout: "fixed" }}>
            {/* 고정 열 너비 — 열맞춤 */}
            {/* 고정 열 너비: 종목28 | 현재금액14 | 비중9 | 월평균10 | 목표%11 | 목표금액14 | 필요금액14 */}
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">종목</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">현재금액</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">비중</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground"
                    title="월평균 기하수익률: (1+총수익률)^(1/보유개월)-1">월평균</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">목표%</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">목표금액</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">필요금액</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {positions.map((p) => {
                const key          = `${p.stockCode}::${p.category ?? ""}`;
                const hasCur       = (p as { hasCurPrice?: boolean }).hasCurPrice ?? false;
                const allocPct     = stockAllocations[key] ?? 0;
                const catTotalEval = positions.reduce((s, x) => s + x.evalAmount, 0);
                const curPct       = catTotalEval > 0 ? (p.evalAmount / catTotalEval) * 100 : 0;
                const targetAmt    = targetCatEval * (allocPct / 100);
                const diff         = allocPct > 0 ? targetAmt - p.evalAmount : 0;

                return (
                  <tr key={key} className="hover:bg-muted/20">
                    <td className="px-3 py-2 min-w-0">
                      <p className="font-medium truncate">{p.stockName}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-[10px] text-muted-foreground">{p.stockCode}</p>
                        {/* 현재가 없으면 매입가 기준임을 명시 */}
                        {!hasCur && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0 rounded">
                            매입가기준
                          </span>
                        )}
                      </div>
                    </td>
                    {/* 현재금액 */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {fmt(p.evalAmount)}원
                    </td>
                    {/* 현재비중 */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {curPct.toFixed(1)}%
                    </td>
                    {/* 월평균 기하수익률 */}
                    {(() => {
                      const mgr = (p as { monthlyGeoReturn?: number | null }).monthlyGeoReturn;
                      return (
                        <td className={cn("px-3 py-2 text-right tabular-nums font-semibold",
                          mgr != null ? plColor(mgr) : "text-muted-foreground")}>
                          {mgr != null
                            ? `${mgr >= 0 ? "+" : ""}${(mgr * 100).toFixed(2)}%`
                            : "-"}
                        </td>
                      );
                    })()}
                    {/* 목표비중 입력 */}
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={allocPct === 0 ? "" : allocPct}
                        placeholder="0"
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          onAllocationChange(key, isNaN(v) ? 0 : v);
                        }}
                        className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                    {/* 목표금액 */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {allocPct > 0 ? `${fmt(targetAmt)}원` : <span className="text-muted-foreground">-</span>}
                    </td>
                    {/* 필요금액 (매수/매도) */}
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium",
                      diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : "text-muted-foreground")}>
                      {allocPct > 0
                        ? diff > 0
                          ? `+${fmt(diff)} 매수`
                          : diff < 0
                          ? `${fmt(diff)} 매도`
                          : "균형"
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* 합계 행 */}
            {positions.length > 1 && (
              <tfoot>
                <tr className="border-t bg-muted/20 font-medium">
                  <td className="px-3 py-2 text-muted-foreground">합계</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(positions.reduce((s, p) => s + p.evalAmount, 0))}원
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">100%</td>
                  {/* 월평균 가중평균 (evalAmount 기준) */}
                  {(() => {
                    const geoPos   = positions.filter((p) => (p as { monthlyGeoReturn?: number | null }).monthlyGeoReturn != null);
                    const totalEv  = geoPos.reduce((s, p) => s + p.evalAmount, 0);
                    const weighted = totalEv > 0
                      ? geoPos.reduce((s, p) => s + ((p as { monthlyGeoReturn?: number | null }).monthlyGeoReturn ?? 0) * p.evalAmount, 0) / totalEv
                      : null;
                    return (
                      <td className={cn("px-3 py-2 text-right tabular-nums",
                        weighted != null ? plColor(weighted) : "text-muted-foreground")}>
                        {weighted != null
                          ? `${weighted >= 0 ? "+" : ""}${(weighted * 100).toFixed(2)}%`
                          : "-"}
                      </td>
                    );
                  })()}
                  <td className={cn("px-3 py-2 text-right tabular-nums",
                    isValid ? "text-emerald-600" : "text-amber-600")}>
                    {totalAlloc.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalAlloc > 0 ? `${fmt(targetCatEval)}원` : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {totalAlloc > 0 && isValid ? (
                      <span className="text-emerald-600 text-[11px]">합계 정렬됨</span>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold">리밸런싱 분석</CardTitle>
        <p className="text-[11px] text-muted-foreground">{accountLabel} 채권형 / 주식형 목표 비중 설정 및 필요 금액</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {/* ① 채권형/주식형 비중 + 보유 현금 설정 */}
        <div className="rounded-lg bg-muted/30 p-3 space-y-3">
          <p className="text-xs font-medium">1단계: 비중 및 보유 현금 설정</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">채권형 (%)</Label>
              <Input className="h-8 text-xs w-20 tabular-nums" value={localBond} onChange={(e) => onBondChange(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">주식형 (%)</Label>
              <Input className="h-8 text-xs w-20 tabular-nums" value={localEquity} onChange={(e) => onEquityChange(e.target.value)} />
            </div>
            {/* 구분선 */}
            <div className="w-px h-8 bg-border hidden sm:block" />
            {/* 보유 현금 — 총평가금액 기준에 포함되어 리밸런싱 목표 금액 계산에 반영됨 */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">보유 현금 (원)</Label>
              <Input
                className="h-8 text-xs w-32 tabular-nums"
                placeholder="0"
                value={localCash}
                onChange={(e) => {
                  const raw = parseInt(e.target.value.replace(/,/g, ""), 10);
                  const clean = isNaN(raw) ? 0 : raw;
                  onCashChange(clean, isNaN(raw) ? "" : clean.toLocaleString("ko-KR"));
                }}
              />
            </div>
            <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={onSave} disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </Button>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <p className="text-[11px] text-muted-foreground">
            저장된 비중: 채권형 {target.bondRatio}% / 주식형 {target.equityRatio}%
            {cashAmount > 0 && (
              <span className="ml-2 text-emerald-600 font-medium">
                · 현금 {cashAmount.toLocaleString("ko-KR")}원 포함
              </span>
            )}
          </p>
        </div>

        {/* ② 현재 비중 파이차트 + 카테고리별 필요 금액 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="h-52">
            <p className="text-[11px] font-medium text-center mb-1">
              {hasData ? "현재 비중" : "목표 비중 (포지션 없음)"}
            </p>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                  labelLine={false}>
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${fmt(value)}${hasData ? "원" : "%"}`, ""]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {hasData && result ? (
            <div className="space-y-3">
              <p className="text-xs font-medium">카테고리별 필요 금액</p>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                {/* 주식+채권 평가금액 */}
                <div>
                  주식+채권:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {fmt(result.bondEval + result.equityEval)}원
                  </span>
                </div>
                {/* 현금이 있을 때만 표시 */}
                {cashAmount > 0 && (
                  <div>
                    현금:{" "}
                    <span className="font-semibold text-emerald-600 tabular-nums">
                      +{fmt(cashAmount)}원
                    </span>
                  </div>
                )}
                <div className={cashAmount > 0 ? "border-t pt-1" : ""}>
                  총평가:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {fmt(result.totalEval)}원
                  </span>
                  {cashAmount > 0 && (
                    <span className="text-emerald-600 ml-1">(현금 포함)</span>
                  )}
                </div>
              </div>
              {[
                { label: "채권형", color: "bg-blue-500", textColor: "text-blue-600", current: result.currentBondRatio, target: target.bondRatio, diff: result.bondDiff },
                { label: "주식형", color: "bg-red-500",  textColor: "text-red-500",  current: result.currentEquityRatio, target: target.equityRatio, diff: result.equityDiff },
              ].map(({ label, color, textColor, current, target: tgt, diff }) => (
                <div key={label} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                    <span className={`text-xs font-medium ${textColor}`}>{label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 text-[11px]">
                    <span className="text-muted-foreground">현재 비중</span>
                    <span className="tabular-nums text-right">{current.toFixed(1)}%</span>
                    <span className="text-muted-foreground">목표 비중</span>
                    <span className="tabular-nums text-right">{tgt}%</span>
                    <span className="text-muted-foreground">필요 금액</span>
                    <span className={cn("tabular-nums text-right font-semibold",
                      diff > 0 ? "text-red-500" : diff < 0 ? "text-blue-500" : "text-muted-foreground")}>
                      {diff > 0 ? `+${fmt(diff)} 매수` : diff < 0 ? `${fmt(diff)} 매도` : "균형"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              {accountLabel} 포지션을 추가하면<br />리밸런싱 필요 금액이 표시됩니다.
            </div>
          )}
        </div>

        {/* ③ 종목별 목표 비중 설정 (포지션 있을 때만) */}
        {hasData && result && (bondPositions.length > 0 || equityPositions.length > 0) && (
          <div className="space-y-4 border-t pt-4">
            <p className="text-xs font-medium">2단계: 종목별 목표 비중 설정</p>
            <p className="text-[11px] text-muted-foreground">
              각 카테고리 내 종목별 목표 비중(%)을 입력하면 필요 매수/매도 금액이 계산됩니다.<br />
              각 카테고리의 목표 비중 합계가 100%가 되어야 합니다.
            </p>
            {bondPositions.length > 0 && (
              <StockAllocationTable
                positions={bondPositions}
                catLabel="채권형"
                catColor="bg-blue-500"
                catTextColor="text-blue-600"
                targetCatEval={result.totalEval * (target.bondRatio / 100)}
              />
            )}
            {equityPositions.length > 0 && (
              <StockAllocationTable
                positions={equityPositions}
                catLabel="주식형"
                catColor="bg-red-500"
                catTextColor="text-red-500"
                targetCatEval={result.totalEval * (target.equityRatio / 100)}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────
// Executed Trade 탭 성과 요약 카드
// ─────────────────────────────────────────
function ExSummaryCard({
  label, value, sub, valueClass,
}: {
  label: string; value: string; sub?: string; valueClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", valueClass)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────
// 빈 상태 표시
// ─────────────────────────────────────────
function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
