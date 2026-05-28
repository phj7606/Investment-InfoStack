"use client";

// Education 계좌(1470) 대시보드 — education_transactions 단일 소스
// 5탭: Open Positions | Transactions | Executed Trade | 종목별 | Risk Management
//
// 모든 탭이 educationTransactionsData (LongtermTransaction 기반) 단일 소스 사용
// Executed Trade: SELL 거래를 derivedTrades로 파생 계산 (별도 education_account 불필요)
// Risk Management: RiskManagementPanel + PositionRiskTable

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, CloudUpload, CloudDownload } from "lucide-react";
// CloudUpload, CloudDownload는 LT 백업 버튼에서 계속 사용
import { cn } from "@/lib/utils";
import { RiskManagementPanel } from "@/components/portfolio/RiskManagementPanel";
import { PositionRiskTable } from "@/components/portfolio/PositionRiskTable";
import { LongtermPositionsTable } from "@/components/portfolio/longterm/LongtermPositionsTable";
import { TransactionTable } from "@/components/portfolio/longterm/TransactionTable";
import { TransactionForm } from "@/components/portfolio/longterm/TransactionForm";
import { StockHistoryTable } from "@/components/portfolio/longterm/StockHistoryTable";
import type {
  EducationTrade,
  PerformanceSummary,
  RiskManagementConfig,
  LongtermTransaction,
  LongtermPosition,
} from "@/types/portfolio";
import { DEFAULT_RISK_CONFIG } from "@/types/portfolio";

// ─────────────────────────────────────────
// 상수
// ─────────────────────────────────────────
const RISK_STORAGE_KEY   = "portfolio-risk-management-config-education-v1";
const POSITION_TABLE_KEY = "portfolio-position-risk-table-education-v1";
// LT 현재가 수동 오버라이드 캐시 키 (Education 계좌 전용)
const LT_PRICES_KEY = "portfolio-education-lt-prices-v1";

// ─────────────────────────────────────────
// 색상·포맷 헬퍼
// ─────────────────────────────────────────
function plColor(v: number) {
  return v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground";
}
function fmt(v: number) { return v.toLocaleString(); }
function fmtPct(v: number, d = 2) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

// ─────────────────────────────────────────
// 정렬 유틸 (Executed Trade 탭 전용)
// ─────────────────────────────────────────
type TradeCol =
  | "stockName" | "sector" | "buyDate" | "sellDate"
  | "buyPrice" | "sellPrice" | "quantity"
  | "profitLoss" | "profitLossPct" | "holdingDays" | "result";

type SortDir = "asc" | "desc";
interface SortState { col: TradeCol; dir: SortDir }

function sortTrades(trades: EducationTrade[], sort: SortState): EducationTrade[] {
  return [...trades].sort((a, b) => {
    let v: number;
    const aVal = a[sort.col];
    const bVal = b[sort.col];
    if (typeof aVal === "number" && typeof bVal === "number") {
      v = aVal - bVal;
    } else {
      v = String(aVal ?? "").localeCompare(String(bVal ?? ""), "ko");
    }
    return sort.dir === "asc" ? v : -v;
  });
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function EducationAccountDashboardClient() {
  // ── Risk Management ─────────────────────────
  const [riskConfig, setRiskConfig] = useState<RiskManagementConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_RISK_CONFIG;
    try {
      const s = localStorage.getItem(RISK_STORAGE_KEY);
      if (s) return JSON.parse(s) as RiskManagementConfig;
    } catch { /* ignore */ }
    return DEFAULT_RISK_CONFIG;
  });

  // ── Executed Trade 정렬/필터 ────────────────
  const [sort, setSort]               = useState<SortState>({ col: "sellDate", dir: "desc" });
  const [resultFilter, setResultFilter] = useState<"all" | "Win" | "Lose">("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  // ── 종목별 탭 필터 ──────────────────────────
  const [stocksAcct, setStocksAcct] = useState<"all" | "4802" | "1635" | "1402" | "2805" | "1470" | "8654">("all");
  const [stocksType, setStocksType] = useState<"all" | "STOCK" | "ETF">("all");

  const [backupLoading, setBackupLoading] = useState(false);

  // ─────────────────────────────────────────
  // LT transactions (Open Positions / Transactions / 종목별용)
  // ─────────────────────────────────────────
  const [ltTransactions, setLtTransactions] = useState<LongtermTransaction[]>([]);
  const [ltTxLoading, setLtTxLoading]       = useState(false);

  const [ltPositions, setLtPositions]   = useState<LongtermPosition[]>([]);
  const [ltPosLoading, setLtPosLoading] = useState(false);

  // 현재가 — localStorage에서 초기값 복원 (수동 오버라이드 유지)
  const [ltCurrentPrices, setLtCurrentPrices] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(LT_PRICES_KEY);
      return saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch { return {}; }
  });
  // ref로 유지 → 비동기 콜백에서 최신값 읽되 deps 순환 방지
  const ltCurrentPricesRef = useRef(ltCurrentPrices);

  const [ltPricesLoading, setLtPricesLoading]     = useState(false);
  const [ltPricesFetchedAt, setLtPricesFetchedAt] = useState<string | null>(null);

  // TransactionForm 다이얼로그
  const [showLtForm, setShowLtForm]   = useState(false);
  const [editingLtTx, setEditingLtTx] = useState<LongtermTransaction | undefined>(undefined);

  // LT 백업 파일 input ref
  const ltBackupFileRef = useRef<HTMLInputElement>(null);

  // ltCurrentPricesRef 동기화
  useEffect(() => { ltCurrentPricesRef.current = ltCurrentPrices; }, [ltCurrentPrices]);

  // ─────────────────────────────────────────
  // LT 거래 내역 조회
  // ─────────────────────────────────────────
  const fetchLtTransactions = useCallback(async () => {
    setLtTxLoading(true);
    try {
      const res = await fetch("/api/portfolio/education/transactions");
      if (!res.ok) return;
      setLtTransactions(await res.json() as LongtermTransaction[]);
    } finally { setLtTxLoading(false); }
  }, []);

  // ─────────────────────────────────────────
  // LT 포지션 조회 + 현재가 즉시 병합
  // ─────────────────────────────────────────
  const fetchLtPositions = useCallback(async () => {
    setLtPosLoading(true);
    try {
      const res = await fetch("/api/portfolio/education/lt-positions");
      if (!res.ok) return;
      const d = await res.json() as { positions: LongtermPosition[] };
      const snap = ltCurrentPricesRef.current;
      setLtPositions(
        d.positions.map((p) => {
          const cp = snap[p.stockCode];
          if (!cp) return p;
          const evalAmount = cp * p.quantity;
          const evalPL     = evalAmount - p.avgCost * p.quantity;
          const evalPLPct  = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
        })
      );
    } finally { setLtPosLoading(false); }
  }, []);

  // ─────────────────────────────────────────
  // LT 현재가 API 조회 (Naver KR + Yahoo US)
  // ─────────────────────────────────────────
  const fetchLtLivePrices = useCallback(async () => {
    setLtPricesLoading(true);
    try {
      const res = await fetch("/api/portfolio/education/lt-prices");
      if (!res.ok) return;
      const d = await res.json() as { prices: Record<string, number>; fetchedAt: string };
      // API 가격 + 수동 오버라이드 병합 (수동값 우선)
      const merged = { ...d.prices, ...ltCurrentPricesRef.current };
      ltCurrentPricesRef.current = merged;
      setLtCurrentPrices(merged);
      setLtPricesFetchedAt(d.fetchedAt);
      setLtPositions((prev) =>
        prev.map((p) => {
          const cp = merged[p.stockCode];
          if (!cp) return p;
          const evalAmount = cp * p.quantity;
          const evalPL     = evalAmount - p.avgCost * p.quantity;
          const evalPLPct  = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
        })
      );
    } finally { setLtPricesLoading(false); }
  }, []);

  // ─────────────────────────────────────────
  // LT 수동 현재가 오버라이드 (연필 아이콘)
  // ─────────────────────────────────────────
  const handleLtPriceUpdate = useCallback((stockCode: string, price: number) => {
    setLtCurrentPrices((prev) => {
      const next = { ...prev, [stockCode]: price };
      localStorage.setItem(LT_PRICES_KEY, JSON.stringify(next));
      return next;
    });
    setLtPositions((prev) =>
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
  // 초기 로드 (LT)
  // ─────────────────────────────────────────
  useEffect(() => {
    void fetchLtTransactions();
    void fetchLtPositions();
  }, [fetchLtTransactions, fetchLtPositions]);

  // 포지션 로드 후 현재가 자동 조회 (최초 1회)
  useEffect(() => {
    if (ltPositions.length > 0 && !ltPricesFetchedAt) void fetchLtLivePrices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltPositions.length]);

  // ─────────────────────────────────────────
  // LT 거래 추가/편집 핸들러
  // ─────────────────────────────────────────
  async function handleLtTxSubmit(tx: Omit<LongtermTransaction, "id"> | LongtermTransaction) {
    const isEdit = "id" in tx && !!tx.id;
    if (isEdit) {
      await fetch(`/api/portfolio/education/transactions/${(tx as LongtermTransaction).id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx),
      });
    } else {
      await fetch("/api/portfolio/education/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tx),
      });
    }
    setShowLtForm(false);
    setEditingLtTx(undefined);
    void fetchLtTransactions();
    void fetchLtPositions();
  }

  async function handleLtTxDelete(id: string) {
    if (!confirm("이 거래를 삭제하시겠습니까?")) return;
    await fetch(`/api/portfolio/education/transactions/${id}`, { method: "DELETE" });
    void fetchLtTransactions();
    void fetchLtPositions();
  }

  function handleLtTxEdit(tx: LongtermTransaction) {
    setEditingLtTx(tx);
    setShowLtForm(true);
  }

  // ─────────────────────────────────────────
  // LT JSON 백업 다운로드
  // GET /api/portfolio/education/lt-backup → attachment 파일로 저장
  // ─────────────────────────────────────────
  async function handleLtJsonBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/portfolio/education/lt-backup");
      if (!res.ok) throw new Error("백업 API 오류");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `education-lt-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("LT JSON 백업 실패:", err);
      alert("JSON 백업 다운로드에 실패했습니다.");
    } finally {
      setBackupLoading(false);
    }
  }

  // ─────────────────────────────────────────
  // LT JSON 복원
  // 파일 선택 → overwrite/merge 선택 → POST
  // ─────────────────────────────────────────
  async function handleLtJsonRestore(e: React.ChangeEvent<HTMLInputElement>) {
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

      const res = await fetch("/api/portfolio/education/lt-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: parsed.transactions, mode: useOverwrite ? "overwrite" : "merge" }),
      });
      if (!res.ok) throw new Error("복원 API 오류");
      const result = await res.json() as { ok: boolean; restored: number; skipped: number };

      alert(`복원 완료\n저장: ${result.restored}건 / 건너뜀: ${result.skipped}건`);
      void fetchLtTransactions();
      void fetchLtPositions();
    } catch (err) {
      console.error("LT JSON 복원 실패:", err);
      alert("JSON 복원에 실패했습니다. 파일 형식을 확인해 주세요.");
    } finally {
      setBackupLoading(false);
      if (ltBackupFileRef.current) ltBackupFileRef.current.value = "";
    }
  }

  // ─────────────────────────────────────────
  // Executed Trade — ltTransactions에서 파생
  // ─────────────────────────────────────────
  // Transactions/종목별과 동일한 데이터소스(education_transactions)를 사용하므로
  // 거래 추가·수정 시 Executed Trade도 자동으로 업데이트된다.

  const derivedTrades = useMemo((): EducationTrade[] => {
    // 종목별 BUY 이력 (시간순) — 매도 시점의 buyDate 추정에 사용
    const buysByStock = new Map<string, LongtermTransaction[]>();
    for (const tx of ltTransactions) {
      if (tx.tradeType !== "BUY") continue;
      const key = `${tx.stockCode}::${tx.accountNo}`;
      if (!buysByStock.has(key)) buysByStock.set(key, []);
      buysByStock.get(key)!.push(tx);
    }
    for (const [, buys] of buysByStock) {
      buys.sort((a, b) => a.date.localeCompare(b.date));
    }

    return ltTransactions
      .filter((tx) => tx.tradeType === "SELL")
      .map((tx): EducationTrade => {
        const key = `${tx.stockCode}::${tx.accountNo}`;
        const buys = buysByStock.get(key) ?? [];
        // 이 SELL 이전에 존재하는 BUY 중 첫 번째 날짜를 buyDate로 사용
        const buysBefore = buys.filter((b) => b.date <= tx.date);
        const buyDate    = buysBefore.length > 0 ? buysBefore[0].date : tx.date;

        const holdingDays = Math.max(0, Math.round(
          (new Date(tx.date).getTime() - new Date(buyDate).getTime()) / 86400000
        ));

        const buyPrice  = tx.avgCostAtSell ?? 0;
        const buyAmount = Math.round(buyPrice * tx.quantity);
        const pl     = tx.realizedPL ?? 0;
        const plPct  = tx.realizedPLPct ?? 0;

        // 데이터 마이그레이션 시 unit은 memo="unit:X/Y" 형식으로 저장됨
        const unitMatch = tx.memo?.match(/^unit:(.+)$/);
        const unit = unitMatch ? unitMatch[1] : "";

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
          quantity: tx.quantity,
          commission: tx.fee,
          profitLoss: pl,
          profitLossPct: plPct,
          holdingDays,
          unit,
          result: pl >= 0 ? "Win" : "Lose",
        };
      })
      .sort((a, b) => b.sellDate.localeCompare(a.sellDate));
  }, [ltTransactions]);

  // PerformanceSummary — derivedTrades에서 클라이언트 계산
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

    // 최대 연속 손실
    let maxConsecutiveLoss = 0, curLoss = 0;
    const sortedByDate = [...derivedTrades].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
    for (const t of sortedByDate) {
      if (t.result === "Lose") { curLoss++; maxConsecutiveLoss = Math.max(maxConsecutiveLoss, curLoss); }
      else curLoss = 0;
    }

    // Equity Curve (누적 손익 시계열)
    let cumPL = 0;
    const equityCurve = sortedByDate.map((t) => {
      cumPL += t.profitLoss;
      return { date: t.sellDate, value: cumPL };
    });

    // MDD (Equity Curve 기준 최대 낙폭 %)
    let peak = 0, mdd = 0;
    for (const pt of equityCurve) {
      if (pt.value > peak) peak = pt.value;
      if (peak > 0) {
        const dd = (pt.value - peak) / peak * 100;
        if (dd < mdd) mdd = dd;
      }
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

  // TPI = winRate × (profitFactor + 1)  (엑셀 S열 공식 역산)
  const tpi = useMemo(() => {
    if (!derivedSummary || derivedSummary.totalTrades === 0) return null;
    const pf = isFinite(derivedSummary.profitFactor) ? derivedSummary.profitFactor : 0;
    return Math.round(derivedSummary.winRate * (pf + 1) * 10000) / 10000;
  }, [derivedSummary]);

  // tradeTotalBuy/PL은 filteredTrades 정의 후로 이동 (필터 연동)

  // 섹터 목록 (필터용)
  const sectors = useMemo(() =>
    ["all", ...Array.from(new Set(derivedTrades.map((t) => t.sector).filter(Boolean))).sort()],
  [derivedTrades]);

  // 필터 + 정렬 적용
  const filteredTrades = useMemo(() => {
    let arr = [...derivedTrades];
    if (resultFilter !== "all") arr = arr.filter((t) => t.result === resultFilter);
    if (sectorFilter !== "all") arr = arr.filter((t) => t.sector === sectorFilter);
    return sortTrades(arr, sort);
  }, [derivedTrades, resultFilter, sectorFilter, sort]);

  // KPI — filteredTrades 기반 (resultFilter·sectorFilter 연동)
  const tradeTotalBuy = filteredTrades.reduce((s, t) => s + t.buyAmount, 0);
  const tradeTotalPL  = filteredTrades.reduce((s, t) => s + t.profitLoss, 0);

  // ─────────────────────────────────────────
  // Executed Trade 정렬 헬퍼
  // ─────────────────────────────────────────
  function toggleSort(col: TradeCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" }
    );
  }

  function SortIcon({ col }: { col: TradeCol }) {
    if (sort.col !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-0.5" />;
    return sort.dir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-0.5 text-emerald-500" />
      : <ArrowDown className="h-3 w-3 ml-0.5 text-emerald-500" />;
  }

  function ThSort({ col, label, align = "right" }: { col: TradeCol; label: string; align?: "left" | "right" }) {
    return (
      <th
        className={cn(
          "p-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
          align === "right" ? "text-right" : "text-left"
        )}
        onClick={() => toggleSort(col)}
      >
        <span className={cn("inline-flex items-center gap-0.5", align === "right" ? "justify-end" : "")}>
          {label}
          <SortIcon col={col} />
        </span>
      </th>
    );
  }

  // ─────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* LT 백업 복원용 hidden file input */}
      <input
        ref={ltBackupFileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => void handleLtJsonRestore(e)}
      />
      <Tabs defaultValue="positions">
        {/* 탭 목록: 3탭 → 5탭으로 확장, grid-cols-3 → grid-cols-5 */}
        <TabsList className="grid w-full grid-cols-5 bg-emerald-500/5 border">
          {[
            { value: "positions",    label: "Open Positions",  count: ltPositions.length },
            { value: "transactions", label: "Transactions",    count: ltTransactions.length },
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
            LongtermTransaction 기반 포지션 (Short-term Account와 동일 포맷)
        ══════════════════════════════════════ */}
        <TabsContent value="positions" className="mt-4 space-y-3">
          {/* 툴바: Restore/Backup — 종목수는 LongtermPositionsTable 카드 헤더에 표시 */}
          <div className="flex justify-end">
            <div className="flex gap-2">
              {/* 복원 버튼 — LT 전용 file input 트리거 */}
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => ltBackupFileRef.current?.click()}
                disabled={backupLoading}
              >
                <CloudDownload className="h-3 w-3" />
                Restore
              </Button>
              {/* LT 백업 다운로드 */}
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void handleLtJsonBackup()}
                disabled={backupLoading}
              >
                <CloudUpload className="h-3 w-3" />
                Backup
              </Button>
            </div>
          </div>

          {/* KPI 요약 카드 — 총 매수금액 / 총 평가금액 / 총 평가손익 / 수익률
              KRW 포지션만 합산, 현재가 입력된 종목만 평가 계산에 반영 */}
          {(() => {
            const krwPos = ltPositions.filter((p) => p.currency === "KRW");
            const totalCost = krwPos.reduce((s, p) => s + p.avgCost * p.quantity, 0);
            const priced    = krwPos.filter((p) => p.currentPrice !== undefined);
            const hasPrices = priced.length > 0;
            const totalEval = priced.reduce((s, p) => s + p.evalAmount, 0);
            const totalPL   = priced.reduce((s, p) => s + p.evalPL, 0);
            const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null;

            const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
            const plColor  = totalPL  >= 0 ? "text-emerald-600 dark:text-emerald-400"  : "text-red-500 dark:text-red-400";
            const pctColor = (totalPLPct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
            const fetchedStr = ltPricesFetchedAt
              ? new Date(ltPricesFetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
              : null;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">총 매수금액</p>
                  <p className="text-sm font-semibold tabular-nums">{fmt(totalCost)}</p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">총 평가금액</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {hasPrices ? fmt(totalEval) : "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">총 평가손익</p>
                  <p className={`text-sm font-semibold tabular-nums ${hasPrices ? plColor : ""}`}>
                    {hasPrices
                      ? `${totalPL >= 0 ? "+" : ""}${fmt(totalPL)}`
                      : "—"}
                  </p>
                </div>
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

          {/* LongtermPositionsTable — 섹터 컬럼, KR/US 필터 없음 (단일 시장 계좌) */}
          <LongtermPositionsTable
            positions={ltPositions}
            isLoading={ltPosLoading}
            pricesLoading={ltPricesLoading}
            pricesFetchedAt={ltPricesFetchedAt}
            onPriceUpdate={handleLtPriceUpdate}
            onPricesRefresh={fetchLtLivePrices}
            showSector
            hideMarketFilter
          />
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 2: Transactions
            단일 계좌 — 계좌/시장 필터 숨김
        ══════════════════════════════════════ */}
        <TabsContent value="transactions" className="mt-4 space-y-3">
          {/* 툴바: Restore/Backup + 거래추가 — 건수는 TransactionTable 카드 헤더에 표시 */}
          <div className="flex justify-end">
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => ltBackupFileRef.current?.click()}
                disabled={backupLoading}
              >
                <CloudDownload className="h-3 w-3" />
                Restore
              </Button>
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void handleLtJsonBackup()}
                disabled={backupLoading}
              >
                <CloudUpload className="h-3 w-3" />
                Backup
              </Button>
              <Button size="sm"
                className="h-7 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => { setEditingLtTx(undefined); setShowLtForm(true); }}
              >
                <Plus className="h-3 w-3" />
                거래 추가
              </Button>
            </div>
          </div>

          <TransactionTable
            transactions={ltTransactions}
            isLoading={ltTxLoading}
            onDelete={(id) => void handleLtTxDelete(id)}
            onEdit={handleLtTxEdit}
            hideAccountFilter
            hideMarketFilter
            hideFundFilter
          />
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 3: Executed Trade — 기존 코드 그대로 유지
            (tabValue만 "trades" → "executed"로 변경)
        ══════════════════════════════════════ */}
        <TabsContent value="executed" className="mt-4 space-y-3">

          {/* ── 성과 요약 (테이블 상단) ── */}
          {derivedSummary && derivedSummary.totalTrades > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              <SummaryCard label="총 완료 거래" value={`${derivedSummary.totalTrades}건`}
                sub={`${derivedSummary.winCount}승 ${derivedSummary.lossCount}패`}
              />
              <SummaryCard label="승률"
                value={`${Math.round(derivedSummary.winRate * 100)}%`}
              />
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

          {/* ── 필터 + 백업/추가 버튼 ── */}
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

              <span className="text-[10px] text-muted-foreground">
                {filteredTrades.length}건 표시
              </span>
            </div>

            <div className="flex gap-2">
              {/* education_transactions 단일 소스 — LT TransactionForm 재사용 */}
              <Button size="sm"
                className="h-7 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => { setEditingLtTx(undefined); setShowLtForm(true); }}
              >
                <Plus className="h-3 w-3" />
                거래 추가
              </Button>
            </div>
          </div>

          {/* ── 거래내역 테이블 ── */}
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
                        <ThSort col="stockName" label="종목" align="left" />
                        <ThSort col="sector" label="섹터" align="left" />
                        <ThSort col="buyDate"  label="매수일" />
                        <ThSort col="buyPrice" label="매수가" />
                        <ThSort col="sellDate"  label="매도일" />
                        <ThSort col="sellPrice" label="매도가" />
                        <ThSort col="quantity" label="수량" />
                        <ThSort col="profitLoss"    label="손익" />
                        <ThSort col="profitLossPct" label="%" />
                        <ThSort col="holdingDays"   label="보유" />
                        <ThSort col="result" label="결과" />
                        <th className="p-2 w-8" />
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
                          <td className="text-right p-2 tabular-nums">{t.quantity}</td>
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
                              {t.result || "-"}
                            </span>
                          </td>
                          <td className="p-2">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  // derivedTrades의 id는 원본 ltTransaction id와 동일 — LT 편집 경로 사용
                                  const ltTx = ltTransactions.find((tx) => tx.id === t.id);
                                  if (ltTx) handleLtTxEdit(ltTx);
                                }}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                                title="편집"
                              >
                                ✏
                              </button>
                              <button
                                onClick={() => void handleLtTxDelete(t.id)}
                                className="text-[10px] text-red-400 hover:text-red-600"
                                title="삭제"
                              >
                                ✕
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* 합계 행 */}
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
            탭 4: 종목별 — LT 전체 거래 히스토리
        ══════════════════════════════════════ */}
        <TabsContent value="history" className="mt-4 space-y-3">
          {/* 계좌 필터 + 종류 필터 — 한 줄 (Short-term Account와 동일) */}
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
            transactions={ltTransactions}
            isLoading={ltTxLoading}
            showSector
            hideMarketFilter
            accountFilter={stocksAcct}
            onAccountFilterChange={(v) => setStocksAcct(v as "all" | "4802" | "1635" | "1402" | "2805" | "1470" | "8654")}
            assetTypeFilter={stocksType}
            onAssetTypeFilterChange={(v) => setStocksType(v as "all" | "STOCK" | "ETF")}
          />
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 5: Risk Management — 기존 코드 그대로 유지
            (tabValue만 "account" → "risk"로 변경)
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

      {/* ── 다이얼로그 — Executed Trade 탭용 ── */}
      {/* ── LT TransactionForm — Open Positions / Transactions / Executed Trade 탭 공용 ── */}
      <TransactionForm
        open={showLtForm}
        onOpenChange={(open) => { setShowLtForm(open); if (!open) setEditingLtTx(undefined); }}
        initialTx={editingLtTx}
        onSubmit={(tx) => void handleLtTxSubmit(tx)}
        showSectorField
        existingTransactions={ltTransactions}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// 요약 카드
// ─────────────────────────────────────────
function SummaryCard({
  label, value, sub, valueClass, dim,
}: {
  label: string; value: string; sub?: string;
  valueClass?: string; dim?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5 text-center">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-bold mt-0.5 tabular-nums", valueClass, dim && "text-muted-foreground")}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
