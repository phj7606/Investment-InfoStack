"use client";

// Short-term 계좌 대시보드
//
// 탭 구성:
//   1. Open Positions  — LongtermPositionsTable (Value Investment Account와 동일 포맷)
//   2. Transactions    — TransactionTable + TransactionForm (계좌/시장 필터 숨김)
//   3. Executed Trade  — StockHistoryTable (balance=0 종목)
//   4. 종목별           — StockHistoryTable (전체)
//   5. Risk Management — RiskManagementPanel + PositionRiskTable
//
// 데이터 모델: LongtermTransaction (단일 계좌 2805, 주로 KR)

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, CloudUpload, CloudDownload, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { RiskManagementPanel } from "@/components/portfolio/RiskManagementPanel";
import { PositionRiskTable } from "@/components/portfolio/PositionRiskTable";
import { LongtermPositionsTable } from "@/components/portfolio/longterm/LongtermPositionsTable";
import { TransactionTable } from "@/components/portfolio/longterm/TransactionTable";
import { TransactionForm } from "@/components/portfolio/longterm/TransactionForm";
import { StockHistoryTable } from "@/components/portfolio/longterm/StockHistoryTable";
import type {
  LongtermTransaction,
  LongtermPosition,
  RiskManagementConfig,
  EducationTrade,
  PerformanceSummary,
} from "@/types/portfolio";
import { DEFAULT_RISK_CONFIG } from "@/types/portfolio";

// ─────────────────────────────────────────
// Executed Trade 탭 — 정렬/헬퍼
// ─────────────────────────────────────────
type TradeCol =
  | "stockName" | "sector" | "buyDate" | "sellDate"
  | "buyPrice" | "sellPrice" | "quantity"
  | "profitLoss" | "profitLossPct" | "holdingDays" | "result";

type TradeSortDir = "asc" | "desc";
interface TradeSortState { col: TradeCol; dir: TradeSortDir }

function sortTrades(trades: EducationTrade[], sort: TradeSortState): EducationTrade[] {
  return [...trades].sort((a, b) => {
    const aVal = a[sort.col];
    const bVal = b[sort.col];
    let v: number;
    if (typeof aVal === "number" && typeof bVal === "number") {
      v = aVal - bVal;
    } else {
      v = String(aVal ?? "").localeCompare(String(bVal ?? ""), "ko");
    }
    return sort.dir === "asc" ? v : -v;
  });
}

function plColor(v: number) {
  return v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground";
}
function fmt(v: number) { return Math.round(v).toLocaleString("ko-KR"); }
function fmtPct(v: number, d = 2) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

// ─────────────────────────────────────────
// localStorage 키 — Education 계좌와 분리
// ─────────────────────────────────────────
const RISK_STORAGE_KEY   = "portfolio-risk-management-config-shortterm-v1";
const POSITION_TABLE_KEY = "portfolio-position-risk-table-shortterm-v1";
// 수동 현재가 오버라이드 캐시 (연필 아이콘으로 입력한 값)
const CURRENT_PRICES_KEY = "portfolio-shortterm-current-prices-v1";

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
export function ShorttermAccountDashboardClient() {
  // ── 거래 내역 ──────────────────────────────
  const [transactions, setTransactions] = useState<LongtermTransaction[]>([]);
  const [txLoading, setTxLoading]       = useState(false);

  // ── 포지션 ─────────────────────────────────
  const [positions, setPositions]   = useState<LongtermPosition[]>([]);
  const [posLoading, setPosLoading] = useState(false);

  // ── 현재가 (자동 조회 + localStorage 수동 오버라이드) ──
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_PRICES_KEY);
      return saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch { return {}; }
  });
  // ref로 유지 → 비동기 콜백에서 최신값 읽되 deps 순환 방지
  const currentPricesRef = useRef(currentPrices);

  const [pricesLoading, setPricesLoading]     = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);

  // ── Risk Management ─────────────────────────
  const [riskConfig, setRiskConfig] = useState<RiskManagementConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_RISK_CONFIG;
    try {
      const s = localStorage.getItem(RISK_STORAGE_KEY);
      if (s) return JSON.parse(s) as RiskManagementConfig;
    } catch { /* ignore */ }
    return DEFAULT_RISK_CONFIG;
  });

  // ── TransactionForm 다이얼로그 ───────────────
  const [showForm, setShowForm]   = useState(false);
  const [editingTx, setEditingTx] = useState<LongtermTransaction | undefined>(undefined);

  // ── Open Positions 탭 계좌 필터 — KPI 연동을 위해 부모에서 관리 ──
  const [posAcct, setPosAcct] = useState<"all" | "4802" | "1635" | "1402" | "2805" | "1470" | "8654">("all");

  // ── 종목별 탭 계좌 필터 ─────────────────────────────
  const [stocksAcct, setStocksAcct] = useState<"all" | "4802" | "1635" | "1402" | "2805" | "1470" | "8654">("all");
  // ── 종목별 탭 종류 필터 ─────────────────────────────
  const [stocksType, setStocksType] = useState<"all" | "STOCK" | "ETF">("all");
  const filteredPositions = useMemo(
    () => posAcct === "all" ? positions : positions.filter((p) => p.accountNo === posAcct),
    [positions, posAcct]
  );

  // ── Executed Trade 탭 필터/정렬 ─────────────
  const [resultFilter, setResultFilter] = useState<"all" | "Win" | "Lose">("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [tradeSort, setTradeSort] = useState<TradeSortState>({ col: "sellDate", dir: "desc" });

  // ── 백업/복원 ────────────────────────────────
  const backupFileRef  = useRef<HTMLInputElement>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  // currentPricesRef 동기화
  useEffect(() => { currentPricesRef.current = currentPrices; }, [currentPrices]);

  // ─────────────────────────────────────────
  // 거래 내역 조회
  // ─────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const res = await fetch("/api/portfolio/shortterm/transactions");
      if (!res.ok) return;
      setTransactions(await res.json() as LongtermTransaction[]);
    } finally { setTxLoading(false); }
  }, []);

  // ─────────────────────────────────────────
  // 포지션 조회 + 현재가 즉시 병합
  // ─────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    setPosLoading(true);
    try {
      const res = await fetch("/api/portfolio/shortterm/positions");
      if (!res.ok) return;
      const d = await res.json() as { positions: LongtermPosition[] };
      const snap = currentPricesRef.current;
      setPositions(
        d.positions.map((p) => {
          const cp = snap[p.stockCode];
          if (!cp) return p;
          const evalAmount = cp * p.quantity;
          const evalPL     = evalAmount - p.avgCost * p.quantity;
          const evalPLPct  = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
        })
      );
    } finally { setPosLoading(false); }
  }, []);

  // ─────────────────────────────────────────
  // 현재가 API 조회 (Naver KR + Yahoo US)
  // ─────────────────────────────────────────
  const fetchLivePrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const res = await fetch("/api/portfolio/shortterm/prices");
      if (!res.ok) return;
      const d = await res.json() as { prices: Record<string, number>; fetchedAt: string };
      // API 가격 + 수동 오버라이드 병합 (수동값 우선)
      const merged = { ...d.prices, ...currentPricesRef.current };
      currentPricesRef.current = merged;
      setCurrentPrices(merged);
      setPricesFetchedAt(d.fetchedAt);
      setPositions((prev) =>
        prev.map((p) => {
          const cp = merged[p.stockCode];
          if (!cp) return p;
          const evalAmount = cp * p.quantity;
          const evalPL     = evalAmount - p.avgCost * p.quantity;
          const evalPLPct  = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
        })
      );
    } finally { setPricesLoading(false); }
  }, []);

  // ─────────────────────────────────────────
  // 수동 현재가 오버라이드 (LongtermPositionsTable 연필 아이콘)
  // ─────────────────────────────────────────
  const handlePriceUpdate = useCallback((stockCode: string, price: number) => {
    setCurrentPrices((prev) => {
      const next = { ...prev, [stockCode]: price };
      localStorage.setItem(CURRENT_PRICES_KEY, JSON.stringify(next));
      return next;
    });
    setPositions((prev) =>
      prev.map((p) => {
        if (p.stockCode !== stockCode) return p;
        const evalAmount = price * p.quantity;
        const evalPL     = evalAmount - p.avgCost * p.quantity;
        const evalPLPct  = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
        return { ...p, currentPrice: price, evalAmount, evalPL, evalPLPct };
      })
    );
  }, []);

  // ─────────────────────────────────────────
  // 초기 로드
  // ─────────────────────────────────────────
  useEffect(() => {
    void fetchTransactions();
    void fetchPositions();
  }, [fetchTransactions, fetchPositions]);

  // 포지션 로드 후 현재가 자동 조회 (최초 1회)
  useEffect(() => {
    if (positions.length > 0 && !pricesFetchedAt) void fetchLivePrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);

  // ─────────────────────────────────────────
  // Executed Trade — transactions(SELL)에서 파생
  // Education Account와 동일한 방식
  // ─────────────────────────────────────────
  const derivedTrades = useMemo((): EducationTrade[] => {
    // 종목별 BUY 이력 (시간순) — buyDate 추정에 사용
    const buysByStock = new Map<string, LongtermTransaction[]>();
    for (const tx of transactions) {
      if (tx.tradeType !== "BUY") continue;
      const key = `${tx.stockCode}::${tx.accountNo}`;
      if (!buysByStock.has(key)) buysByStock.set(key, []);
      buysByStock.get(key)!.push(tx);
    }
    for (const [, buys] of buysByStock) {
      buys.sort((a, b) => a.date.localeCompare(b.date));
    }

    return transactions
      .filter((tx) => tx.tradeType === "SELL")
      .map((tx): EducationTrade => {
        const key = `${tx.stockCode}::${tx.accountNo}`;
        const buys = buysByStock.get(key) ?? [];
        const buysBefore = buys.filter((b) => b.date <= tx.date);
        const buyDate = buysBefore.length > 0 ? buysBefore[0].date : tx.date;

        const holdingDays = Math.max(0, Math.round(
          (new Date(tx.date).getTime() - new Date(buyDate).getTime()) / 86400000
        ));

        const buyPrice  = tx.avgCostAtSell ?? 0;
        const buyAmount = Math.round(buyPrice * tx.quantity);
        const pl    = tx.realizedPL ?? 0;
        const plPct = tx.realizedPLPct ?? 0;
        const unitMatch = tx.memo?.match(/^unit:(.+)$/);

        return {
          id: tx.id,
          stockCode: tx.stockCode,
          stockName: tx.stockName,
          sector: tx.sector ?? "",
          buyDate,
          sellDate: tx.date,
          buyPrice,
          buyAmount,
          sellPrice: tx.price,
          sellAmount: tx.amount,
          commission: tx.fee,
          quantity: tx.quantity,
          profitLoss: pl,
          profitLossPct: plPct,
          holdingDays,
          unit: unitMatch ? unitMatch[1] : "",
          result: pl >= 0 ? "Win" : "Lose",
        };
      })
      .sort((a, b) => b.sellDate.localeCompare(a.sellDate));
  }, [transactions]);

  const derivedSummary = useMemo((): PerformanceSummary | null => {
    if (derivedTrades.length === 0) return null;
    const wins   = derivedTrades.filter((t) => t.result === "Win");
    const losses = derivedTrades.filter((t) => t.result === "Lose");

    const totalWinPL  = wins.reduce((s, t) => s + t.profitLoss, 0);
    const totalLossPL = Math.abs(losses.reduce((s, t) => s + t.profitLoss, 0));
    const winRate      = derivedTrades.length > 0 ? wins.length / derivedTrades.length : 0;
    const profitFactor = totalLossPL > 0 ? totalWinPL / totalLossPL : Infinity;
    const avgWinPct    = wins.length > 0
      ? wins.reduce((s, t) => s + t.profitLossPct, 0) / wins.length : 0;
    const avgLossPct   = losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.profitLossPct, 0)) / losses.length : 0;

    let maxConsecutiveLoss = 0, curLoss = 0;
    const sortedAsc = [...derivedTrades].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
    for (const t of sortedAsc) {
      if (t.result === "Lose") { curLoss++; maxConsecutiveLoss = Math.max(maxConsecutiveLoss, curLoss); }
      else curLoss = 0;
    }

    let cumPL = 0;
    const equityCurve = sortedAsc.map((t) => { cumPL += t.profitLoss; return { date: t.sellDate, value: cumPL }; });

    let peak = 0, mdd = 0;
    for (const pt of equityCurve) {
      if (pt.value > peak) peak = pt.value;
      if (peak > 0) { const dd = (pt.value - peak) / peak * 100; if (dd < mdd) mdd = dd; }
    }

    return {
      totalTrades: derivedTrades.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate,
      profitFactor,
      avgWinPct,
      avgLossPct,
      expectedValue: winRate * avgWinPct - (1 - winRate) * avgLossPct,
      maxConsecutiveLoss,
      cumulativeProfitLoss: cumPL,
      mdd,
      equityCurve,
      monthlyReturns: [],
    };
  }, [derivedTrades]);

  const tpi = useMemo(() => {
    if (!derivedSummary || derivedSummary.totalTrades === 0) return null;
    const pf = isFinite(derivedSummary.profitFactor) ? derivedSummary.profitFactor : 0;
    return Math.round(derivedSummary.winRate * (pf + 1) * 10000) / 10000;
  }, [derivedSummary]);

  const tradeTotalBuy = derivedTrades.reduce((s, t) => s + t.buyAmount, 0);
  const tradeTotalPL  = derivedTrades.reduce((s, t) => s + t.profitLoss, 0);

  const sectors = useMemo(() =>
    ["all", ...Array.from(new Set(derivedTrades.map((t) => t.sector).filter(Boolean))).sort()],
  [derivedTrades]);

  const filteredTrades = useMemo(() => {
    let arr = [...derivedTrades];
    if (resultFilter !== "all") arr = arr.filter((t) => t.result === resultFilter);
    if (sectorFilter !== "all") arr = arr.filter((t) => t.sector === sectorFilter);
    return sortTrades(arr, tradeSort);
  }, [derivedTrades, resultFilter, sectorFilter, tradeSort]);

  // ─────────────────────────────────────────
  // 거래 추가/편집 핸들러
  // ─────────────────────────────────────────
  async function handleTxSubmit(tx: Omit<LongtermTransaction, "id"> | LongtermTransaction) {
    const isEdit = "id" in tx && !!tx.id;
    if (isEdit) {
      await fetch(`/api/portfolio/shortterm/transactions/${(tx as LongtermTransaction).id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx),
      });
    } else {
      await fetch("/api/portfolio/shortterm/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx),
      });
    }
    setShowForm(false);
    setEditingTx(undefined);
    void fetchTransactions();
    void fetchPositions();
  }

  async function handleTxDelete(id: string) {
    if (!confirm("이 거래를 삭제하시겠습니까?")) return;
    await fetch(`/api/portfolio/shortterm/transactions/${id}`, { method: "DELETE" });
    void fetchTransactions();
    void fetchPositions();
  }

  function handleTxEdit(tx: LongtermTransaction) {
    setEditingTx(tx);
    setShowForm(true);
  }

  // ─────────────────────────────────────────
  // JSON 백업 다운로드
  // ─────────────────────────────────────────
  async function handleJsonBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/portfolio/shortterm/backup");
      if (!res.ok) throw new Error("백업 API 오류");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `shortterm-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("JSON 백업 실패:", err);
      alert("JSON 백업 다운로드에 실패했습니다.");
    } finally {
      setBackupLoading(false);
    }
  }

  // ─────────────────────────────────────────
  // JSON 복원
  // ─────────────────────────────────────────
  async function handleJsonRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { version?: number; transactions?: unknown[] };

      if (!Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
        alert("유효한 백업 파일이 아닙니다. (transactions 배열 없음)");
        return;
      }

      const useOverwrite = window.confirm(
        `백업 파일: 거래 ${parsed.transactions.length}건\n\n` +
        `[확인] 전체 덮어쓰기 — 현재 데이터가 모두 교체됩니다.\n` +
        `[취소] 병합 추가 — 중복 제외한 신규 건만 추가됩니다.`
      );

      const res = await fetch("/api/portfolio/shortterm/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: parsed.transactions, mode: useOverwrite ? "overwrite" : "merge" }),
      });
      if (!res.ok) throw new Error("복원 API 오류");
      const result = await res.json() as { ok: boolean; restored: number; skipped: number };

      alert(`복원 완료\n저장: ${result.restored}건 / 건너뜀: ${result.skipped}건`);
      void fetchTransactions();
      void fetchPositions();
    } catch (err) {
      console.error("JSON 복원 실패:", err);
      alert("JSON 복원에 실패했습니다. 파일 형식을 확인해 주세요.");
    } finally {
      setBackupLoading(false);
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
  }

  // ─────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* hidden file input — 복원 트리거 */}
      <input
        ref={backupFileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => void handleJsonRestore(e)}
      />

      <Tabs defaultValue="positions">
        <TabsList className={cn("grid w-full grid-cols-5 bg-emerald-500/5 border")}>
          {[
            { value: "positions",    label: "Open Positions",  count: positions.length },
            { value: "transactions", label: "Transactions",    count: transactions.length },
            { value: "executed",     label: "Executed Trade",  count: derivedTrades.length },
            { value: "history",      label: "종목별",           count: undefined },
            { value: "risk",         label: "Risk Management", count: undefined },
          ].map(({ value, label, count }) => (
            <TabsTrigger
              key={value}
              value={value}
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
            탭 1: Open Positions
            Value Investment Account와 동일한 LongtermPositionsTable 포맷
            (종목/시장/계좌/수량/평균단가/현재가/평가금액/평가손익/수익률/누적실현/비중)
        ══════════════════════════════════════ */}
        <TabsContent value="positions" className="mt-4 space-y-3">
          {/* 툴바: Restore/Backup — 종목수는 LongtermPositionsTable 카드 헤더에 표시 */}
          <div className="flex justify-end">
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => backupFileRef.current?.click()}
                disabled={backupLoading}
              >
                <CloudDownload className="h-3 w-3" />
                Restore
              </Button>
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void handleJsonBackup()}
                disabled={backupLoading}
              >
                <CloudUpload className="h-3 w-3" />
                Backup
              </Button>
            </div>
          </div>

          {/* KPI 요약 카드 — filteredPositions(posAcct 적용) 기반
              현재가가 입력된 종목만 평가금액·평가손익 계산에 반영 */}
          {(() => {
            const krwPos = filteredPositions.filter((p) => p.currency === "KRW");
            const totalCost = krwPos.reduce((s, p) => s + p.avgCost * p.quantity, 0);
            const priced    = krwPos.filter((p) => p.currentPrice !== undefined);
            const hasPrices = priced.length > 0;
            const totalEval = priced.reduce((s, p) => s + p.evalAmount, 0);
            const totalPL   = priced.reduce((s, p) => s + p.evalPL, 0);
            const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null;

            // 한국식 정수 포맷 (쉼표 구분, 소수점 없음)
            const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
            const plColor  = totalPL  >= 0 ? "text-emerald-600 dark:text-emerald-400"  : "text-red-500 dark:text-red-400";
            const pctColor = (totalPLPct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
            const fetchedStr = pricesFetchedAt
              ? new Date(pricesFetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
              : null;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 총 매수금액 */}
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">총 매수금액</p>
                  <p className="text-sm font-semibold tabular-nums">{fmt(totalCost)}</p>
                </div>
                {/* 총 평가금액 — 현재가 입력 전에는 대시 표시 */}
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">총 평가금액</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {hasPrices ? fmt(totalEval) : "—"}
                  </p>
                </div>
                {/* 총 평가손익 */}
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">총 평가손익</p>
                  <p className={`text-sm font-semibold tabular-nums ${hasPrices ? plColor : ""}`}>
                    {hasPrices
                      ? `${totalPL >= 0 ? "+" : ""}${fmt(totalPL)}`
                      : "—"}
                  </p>
                </div>
                {/* 수익률 + 시세 기준 시각 */}
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">수익률</p>
                  <p className={`text-sm font-semibold tabular-nums ${hasPrices && totalPLPct !== null ? pctColor : ""}`}>
                    {hasPrices && totalPLPct !== null
                      ? `${totalPLPct >= 0 ? "+" : ""}${totalPLPct.toFixed(2)}%`
                      : "—"}
                  </p>
                  {fetchedStr && hasPrices && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fetchedStr} 기준</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* LongtermPositionsTable — 섹터 컬럼, KR/US 필터 없음 (단일 시장 계좌)
              accountFilter를 부모 posAcct로 제어해 KPI와 연동 */}
          <LongtermPositionsTable
            positions={positions}
            isLoading={posLoading}
            pricesLoading={pricesLoading}
            pricesFetchedAt={pricesFetchedAt}
            onPriceUpdate={handlePriceUpdate}
            onPricesRefresh={fetchLivePrices}
            showSector
            hideMarketFilter
            accountFilter={posAcct}
            onAccountFilterChange={(v) => setPosAcct(v as "all" | "4802" | "1635" | "1402" | "2805" | "1470" | "8654")}
          />
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 2: Transactions
            단일 계좌(2805) — 계좌/시장 필터 숨김
        ══════════════════════════════════════ */}
        <TabsContent value="transactions" className="mt-4 space-y-3">
          {/* 툴바: Restore/Backup + 거래추가 — 건수는 TransactionTable 카드 헤더에 표시 */}
          <div className="flex justify-end">
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => backupFileRef.current?.click()}
                disabled={backupLoading}
              >
                <CloudDownload className="h-3 w-3" />
                Restore
              </Button>
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void handleJsonBackup()}
                disabled={backupLoading}
              >
                <CloudUpload className="h-3 w-3" />
                Backup
              </Button>
              <Button size="sm"
                className="h-7 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => { setEditingTx(undefined); setShowForm(true); }}
              >
                <Plus className="h-3 w-3" />
                거래 추가
              </Button>
            </div>
          </div>

          <TransactionTable
            transactions={transactions}
            isLoading={txLoading}
            onDelete={(id) => void handleTxDelete(id)}
            onEdit={handleTxEdit}
            hideAccountFilter
            hideMarketFilter
            hideFundFilter
          />
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 3: Executed Trade — Education Account와 동일 포맷
            SELL 거래를 EducationTrade로 파생해 성과 요약 + 상세 테이블 표시
        ══════════════════════════════════════ */}
        <TabsContent value="executed" className="mt-4 space-y-3">

          {/* ── 성과 요약 카드 ── */}
          {derivedSummary && derivedSummary.totalTrades > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              <SummaryCard label="총 완료 거래" value={`${derivedSummary.totalTrades}건`}
                sub={`${derivedSummary.winCount}승 ${derivedSummary.lossCount}패`}
              />
              <SummaryCard label="승률" value={`${Math.round(derivedSummary.winRate * 100)}%`} />
              <SummaryCard label="누적 손익"
                value={`${tradeTotalPL >= 0 ? "+" : ""}${fmt(tradeTotalPL)}원`}
                valueClass={plColor(tradeTotalPL)}
              />
              <SummaryCard label="손익비 (PF)"
                value={isFinite(derivedSummary.profitFactor) ? derivedSummary.profitFactor.toFixed(2) : "∞"}
              />
              <SummaryCard label="평균 수익"
                value={`+${derivedSummary.avgWinPct.toFixed(1)}%`}
                valueClass="text-emerald-600 dark:text-emerald-400"
              />
              <SummaryCard label="평균 손실"
                value={`-${derivedSummary.avgLossPct.toFixed(1)}%`}
                valueClass="text-red-500 dark:text-red-400"
              />
              <SummaryCard label="TPI"
                value={tpi !== null ? tpi.toFixed(2) : "-"}
                sub="winRate × (PF+1)"
                valueClass={tpi !== null ? (tpi >= 1 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400") : undefined}
              />
            </div>
          )}

          {/* ── 계좌 총합 ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SummaryCard label="총 매수금액" value={`${fmt(tradeTotalBuy)}원`} />
            <SummaryCard label="총 실현 손익"
              value={`${tradeTotalPL >= 0 ? "+" : ""}${fmt(tradeTotalPL)}원`}
              valueClass={plColor(tradeTotalPL)}
            />
            <SummaryCard label="실현 수익률"
              value={tradeTotalBuy > 0 ? fmtPct((tradeTotalPL / tradeTotalBuy) * 100) : "-"}
              valueClass={plColor(tradeTotalPL)}
            />
          </div>

          {/* ── 필터 ── */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 결과 필터 */}
              <div className="flex rounded-md border overflow-hidden text-[10px]">
                {(["all", "Win", "Lose"] as const).map((f) => (
                  <button key={f}
                    onClick={() => setResultFilter(f)}
                    className={cn(
                      "px-2.5 py-1 transition-colors",
                      resultFilter === f
                        ? f === "Win" ? "bg-red-500 text-white"
                          : f === "Lose" ? "bg-blue-500 text-white"
                          : "bg-emerald-500 text-white"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {f === "all" ? "전체" : f}
                  </button>
                ))}
              </div>
              {/* 섹터 필터 */}
              <select
                value={sectorFilter}
                onChange={(e) => setSectorFilter(e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {sectors.map((s) => (
                  <option key={s} value={s}>{s === "all" ? "전체 섹터" : s}</option>
                ))}
              </select>
              <span className="text-[10px] text-muted-foreground">{filteredTrades.length}건 표시</span>
            </div>
          </div>

          {/* ── 거래 테이블 ── */}
          {filteredTrades.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {derivedTrades.length === 0 ? "완료된 거래가 없습니다." : "필터 조건에 해당하는 거래가 없습니다."}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] text-muted-foreground bg-muted/20">
                        {/* 정렬 가능한 헤더 — 인라인으로 구현 */}
                        {(
                          [
                            { col: "stockName",    label: "종목",  align: "left"  },
                            { col: "sector",       label: "섹터",  align: "left"  },
                            { col: "buyDate",      label: "매수일", align: "right" },
                            { col: "buyPrice",     label: "매수가", align: "right" },
                            { col: "sellDate",     label: "매도일", align: "right" },
                            { col: "sellPrice",    label: "매도가", align: "right" },
                            { col: "quantity",     label: "수량",  align: "right" },
                            { col: "profitLoss",   label: "손익",  align: "right" },
                            { col: "profitLossPct",label: "%",     align: "right" },
                            { col: "holdingDays",  label: "보유",  align: "right" },
                            { col: "result",       label: "결과",  align: "center"},
                          ] as { col: TradeCol; label: string; align: string }[]
                        ).map(({ col, label, align }) => (
                          <th
                            key={col}
                            className={cn(
                              "p-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
                              align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
                            )}
                            onClick={() => setTradeSort((prev) =>
                              prev.col === col
                                ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
                                : { col, dir: "desc" }
                            )}
                          >
                            <span className={cn("inline-flex items-center gap-0.5",
                              align === "right" ? "justify-end w-full" : align === "center" ? "justify-center w-full" : ""
                            )}>
                              {label}
                              {tradeSort.col === col
                                ? tradeSort.dir === "asc"
                                  ? <ArrowUp className="h-3 w-3 text-emerald-500" />
                                  : <ArrowDown className="h-3 w-3 text-emerald-500" />
                                : <ArrowUpDown className="h-3 w-3 opacity-40" />
                              }
                            </span>
                          </th>
                        ))}
                        <th className="p-2 w-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {filteredTrades.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/30 group">
                          <td className="p-2 pl-3">
                            <div className="font-medium">{t.stockName}</div>
                            <div className="text-[10px] text-muted-foreground">{t.stockCode}</div>
                          </td>
                          <td className="p-2 text-muted-foreground">{t.sector || "-"}</td>
                          <td className="text-right p-2 text-muted-foreground tabular-nums">{t.buyDate}</td>
                          <td className="text-right p-2 tabular-nums">{fmt(t.buyPrice)}</td>
                          <td className="text-right p-2 tabular-nums">{t.sellDate}</td>
                          <td className="text-right p-2 tabular-nums">{fmt(t.sellPrice)}</td>
                          <td className="text-right p-2 tabular-nums">{t.quantity.toLocaleString()}</td>
                          <td className={cn("text-right p-2 tabular-nums font-medium", plColor(t.profitLoss))}>
                            {t.profitLoss >= 0 ? "+" : ""}{fmt(t.profitLoss)}
                          </td>
                          <td className={cn("text-right p-2 tabular-nums font-semibold", plColor(t.profitLossPct))}>
                            {fmtPct(t.profitLossPct)}
                          </td>
                          <td className="text-right p-2 text-muted-foreground tabular-nums">{t.holdingDays}일</td>
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
                          <td className="p-2 w-4" />
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30 text-xs font-semibold">
                        <td colSpan={7} className="p-2 pl-3 text-muted-foreground">
                          합계 ({filteredTrades.length}건)
                        </td>
                        <td className={cn("text-right p-2 tabular-nums", plColor(
                          filteredTrades.reduce((s, t) => s + t.profitLoss, 0)
                        ))}>
                          {(() => {
                            const sum = filteredTrades.reduce((s, t) => s + t.profitLoss, 0);
                            return `${sum >= 0 ? "+" : ""}${fmt(sum)}`;
                          })()}
                        </td>
                        <td className={cn("text-right p-2 tabular-nums", plColor(
                          filteredTrades.reduce((s, t) => s + t.profitLossPct, 0) / Math.max(filteredTrades.length, 1)
                        ))}>
                          {(() => {
                            const avg = filteredTrades.reduce((s, t) => s + t.profitLossPct, 0) / Math.max(filteredTrades.length, 1);
                            return fmtPct(avg);
                          })()}
                          <span className="text-[9px] text-muted-foreground ml-0.5">평균</span>
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 4: 종목별 — 전체 거래
            계좌 필터를 부모에서 직접 렌더링 (LongtermDashboard와 동일 Button 스타일)
        ══════════════════════════════════════ */}
        <TabsContent value="history" className="mt-4 space-y-3">
          {/* 계좌 필터 + 종류 필터 — 한 줄 */}
          <div className="flex flex-wrap gap-1.5">
            {(["all", "4802", "1635", "1402", "2805", "1470", "8654"] as const).map((a) => (
              <Button key={a} size="sm" variant={stocksAcct === a ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", stocksAcct === a && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setStocksAcct(a)}
              >
                {a === "all" ? "전체계좌" : a}
              </Button>
            ))}
            <div className="w-px bg-border self-stretch mx-0.5" />
            {(["all", "STOCK", "ETF"] as const).map((t) => (
              <Button key={t} size="sm" variant={stocksType === t ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", stocksType === t && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setStocksType(t)}
              >
                {t === "all" ? "전체종류" : t}
              </Button>
            ))}
          </div>

          <StockHistoryTable
            transactions={transactions}
            isLoading={txLoading}
            showSector
            hideMarketFilter
            accountFilter={stocksAcct}
            onAccountFilterChange={(v) => setStocksAcct(v as "all" | "4802" | "1635" | "1402" | "2805" | "1470" | "8654")}
            assetTypeFilter={stocksType}
            onAssetTypeFilterChange={(v) => setStocksType(v as "all" | "STOCK" | "ETF")}
          />
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 5: Risk Management
        ══════════════════════════════════════ */}
        <TabsContent value="risk" className="mt-4 space-y-4">
          <RiskManagementPanel
            positions={[]}
            winRate={derivedSummary?.winRate ?? 0}
            storageKey={RISK_STORAGE_KEY}
            onConfigChange={setRiskConfig}
          />
          <PositionRiskTable config={riskConfig} storageKey={POSITION_TABLE_KEY} />
        </TabsContent>
      </Tabs>

      {/* 거래 추가/편집 폼 — 섹터 입력 필드 활성화 */}
      <TransactionForm
        open={showForm}
        onOpenChange={(open) => { setShowForm(open); if (!open) setEditingTx(undefined); }}
        initialTx={editingTx}
        onSubmit={(tx) => void handleTxSubmit(tx)}
        showSectorField
        existingTransactions={transactions}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// 요약 카드 (Education Account와 동일)
// ─────────────────────────────────────────
function SummaryCard({
  label, value, sub, valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  dim?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", valueClass)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
