"use client";

// 중장기 투자 계좌 대시보드 — 메인 컨테이너 컴포넌트
// 7개 탭:
//   대시보드     — KR/US 섹션 KPI 카드 + TOP3 종목
//   포지션       — 보유 종목 + 현재가 인라인 편집
//   거래 내역    — 검색·필터 + 거래 추가 + Excel 임포트
//   Executed Trade — 전량 매도 완료 종목 실현손익 집계
//   종목별       — 종목별 이력 accordion (총 매수/매도/잔량/손익 소계)
//   성과 분석    — KR/US 별도 Equity Curve + 히트맵 + KPI
//   리밸런싱     — 목표 비중 입력 + 제안 테이블
//
// 계좌 필터: 전체 | 4802 (주식) | 1635 (ETF) | 1402 (중장기+) | 8654 (펀드)

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CloudDownload, CloudUpload, RefreshCw, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

import { AccountSummaryCards } from "./AccountSummaryCards";
import { PortfolioAllocationChart } from "./PortfolioAllocationChart";
import { HoldingsBarChart } from "./HoldingsBarChart";
import { LongtermPositionsTable } from "./LongtermPositionsTable";
import { TransactionTable } from "./TransactionTable";
import { TransactionForm } from "./TransactionForm";
import { StockHistoryTable } from "./StockHistoryTable";
import { RebalancingPanel } from "./RebalancingPanel";
import { HoldingsPerformanceTable } from "./HoldingsPerformanceTable";
import { HoldingsAlphaBarChart } from "./HoldingsAlphaBarChart";

import {
  exportLongtermExcel,
  parseHierarchicalExcel,
} from "@/lib/portfolio/excel";
import type {
  LongtermTransaction,
  LongtermPosition,
} from "@/types/portfolio";
import type { LongtermSummary } from "@/lib/portfolio/longterm-calc";
import type { PerformanceSummary } from "@/types/portfolio";
import type { HoldingPerformance } from "@/lib/portfolio/holdings-performance";

// ─────────────────────────────────────────
// Executed Trade — 전량 매도 완료 종목 1건 타입
// (잔량 0인 종목을 종목+계좌 단위로 집계)
// ─────────────────────────────────────────
interface ExecutedTrade {
  key: string;               // `${stockCode}::${stockName}::${accountNo}`
  stockCode: string;
  stockName: string;
  accountNo: "4802" | "1635" | "1402" | "8654";
  market: "KR" | "US";
  assetType: "STOCK" | "ETF" | "FUND";
  currency: "KRW" | "USD";
  buyDate: string;           // 최초 매수일
  sellDate: string;          // 최종 매도일
  avgBuyPrice: number;       // 총매수금액 / 총매수수량
  avgSellPrice: number;      // 총매도금액 / 총매도수량
  totalQty: number;          // 매도 수량(= 매수 수량)
  totalBuyAmt: number;       // 총 매수금액
  profitLoss: number;        // 실현손익 합계
  profitLossPct: number;     // 실현수익률 (%)
  holdingDays: number;       // 보유 일수
  monthlyGeoReturn: number | null; // 월별 기하수익률: (1 + r)^(30.4375/days) - 1
}

// ─────────────────────────────────────────
// 손익 색상 헬퍼
// ─────────────────────────────────────────
function exPlColor(n: number): string {
  return n > 0 ? "text-emerald-600 dark:text-emerald-400" : n < 0 ? "text-red-500 dark:text-red-400" : "text-muted-foreground";
}

// KRW/USD 숫자 포매터
function exFmt(n: number, ccy: "KRW" | "USD"): string {
  return ccy === "USD"
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(n).toLocaleString("ko-KR");
}

function exFmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

// 성과 요약 카드 서브컴포넌트
function ExCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 space-y-0.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums", valueClass)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// 계좌 필터 값 타입
type AccountFilterValue = "all" | "4802" | "1635" | "1402" | "8654";

// 계좌 필터 버튼 그룹 — 각 탭 상단에서 공유 사용
function AccountFilterBar({
  value,
  onChange,
}: {
  value: AccountFilterValue;
  onChange: (v: AccountFilterValue) => void;
}) {
  return (
    <div className="flex gap-1">
      {(["all", "4802", "1635", "1402", "8654"] as const).map((f) => (
        <Button
          key={f}
          variant={value === f ? "default" : "outline"}
          size="sm"
          className={cn("h-7 px-2.5 text-[11px]", value === f && "bg-blue-600 hover:bg-blue-700 text-white")}
          onClick={() => onChange(f)}
        >
          {f === "all" ? "전체계좌" : f}
        </Button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// 로컬스토리지 현재가 저장 키
// ─────────────────────────────────────────
const CURRENT_PRICES_KEY = "portfolio-longterm-current-prices-v1";

// ─────────────────────────────────────────
// 빈 요약 기본값 (로딩 전 / 데이터 없을 때)
// ─────────────────────────────────────────
function makeEmptySummary(currency: "KRW" | "USD"): LongtermSummary {
  return {
    currency,
    totalInvested: 0,
    totalEvalAmount: 0,
    totalRealizedPL: 0,
    totalEvalPL: 0,
    dividendTotal: 0,
    positionCount: 0,
  };
}

export function LongtermDashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── URL 파라미터 업데이트 헬퍼 ───────────────
  // 기존 파라미터를 유지하면서 단일 키만 변경 → 페이지 이동 후 복귀 시 상태 복원 가능
  const updateUrlParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // ── 계좌 / 시장 필터 ─────────────────────────
  // URL ?account= 파라미터에서 초기값 복원
  const [accountFilter, setAccountFilter] = useState<AccountFilterValue>(
    () => (searchParams.get("account") as AccountFilterValue) ?? "all"
  );
  // URL ?tab= 파라미터에서 초기값 복원
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get("tab") ?? "overview"
  );

  // ── 거래 내역 ──────────────────────────────────
  const [transactions, setTransactions] = useState<LongtermTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  // ── 포지션 ──────────────────────────────────────
  const [positions, setPositions] = useState<LongtermPosition[]>([]);
  const [krSummary, setKrSummary] = useState<LongtermSummary>(makeEmptySummary("KRW"));
  const [usSummary, setUsSummary] = useState<LongtermSummary>(makeEmptySummary("USD"));
  const [posLoading, setPosLoading] = useState(false);

  // ── 보유 종목별 성과 (TWR / Alpha) ───────────────
  const [holdingsPerf, setHoldingsPerf] = useState<HoldingPerformance[]>([]);
  const [holdingsPerfLoading, setHoldingsPerfLoading] = useState(false);

  // ── 성과 분석 ──────────────────────────────────
  const [krPerfSummary, setKrPerfSummary] = useState<PerformanceSummary | null>(null);
  const [usPerfSummary, setUsPerfSummary] = useState<PerformanceSummary | null>(null);
  const [krMonthlyPL, setKrMonthlyPL] = useState<{ year: number; month: number; pl: number }[]>([]);
  const [usMonthlyPL, setUsMonthlyPL] = useState<{ year: number; month: number; pl: number }[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  // ── 현재가 (Yahoo Finance 자동 조회 + localStorage 수동 오버라이드) ──────
  // lazy initializer로 localStorage를 동기적으로 읽어 초기값 세팅:
  // fetchPositions 실행 시 currentPricesRef에 캐시 가격이 이미 존재해 즉시 반영 가능
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(CURRENT_PRICES_KEY);
      return saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });
  // ref로 유지 → fetchPositions 내부에서 최신 prices를 읽되 deps에 포함시키지 않아 무한 루프 방지
  const currentPricesRef = useRef(currentPrices);

  // ── 현재가 조회 상태 ────────────────────────────
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesFetchedAt, setPricesFetchedAt] = useState<string | null>(null);

  // ── 거래 추가/편집 다이얼로그 ──────────────────
  const [showForm, setShowForm] = useState(false);
  // 편집 중인 거래 (null이면 추가 모드)
  const [editingTx, setEditingTx] = useState<LongtermTransaction | undefined>(undefined);

  // ── Excel import 파일 ref ────────────────────────
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);

  // ── JSON 백업/복원 파일 ref ───────────────────────
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const [jsonLoading, setJsonLoading] = useState(false);

  // ── 성과 분석 탭 KR/US 선택 ─────────────────────
  // URL ?perf= 파라미터에서 초기값 복원
  const [perfCurrency, setPerfCurrency] = useState<"KRW" | "USD">(
    () => (searchParams.get("perf") as "KRW" | "USD") ?? "KRW"
  );

  // ── HoldingsBarChart KR/US 탭 (URL 동기화를 위해 부모에서 관리) ──
  // URL ?market= 파라미터에서 초기값 복원
  const [holdingsMarket, setHoldingsMarket] = useState<"KR" | "US">(
    () => (searchParams.get("market") as "KR" | "US") ?? "KR"
  );

  // ── Executed Trade 탭 필터·정렬 ───────────────────────
  type ExTradeSortCol = "stockName" | "accountNo" | "market" | "assetType" | "buyDate" | "sellDate" | "avgBuyPrice" | "totalQty" | "avgSellPrice" | "profitLoss" | "profitLossPct" | "monthlyGeoReturn" | "holdingDays";
  const [exTradeSort,   setExTradeSort]   = useState<{ col: ExTradeSortCol; dir: "asc" | "desc" }>({ col: "sellDate", dir: "desc" });
  const [exTradeMarket, setExTradeMarket] = useState<"all" | "KR" | "US">("all");
  const [exTradeAcct,   setExTradeAcct]   = useState<"all" | "4802" | "1635" | "1402" | "8654">("all");
  const [exTradeAsset,  setExTradeAsset]  = useState<"all" | "STOCK" | "ETF" | "FUND">("all");

  // ── 종목별 탭 필터 ─────────────────────────────────
  const [stocksMarket, setStocksMarket] = useState<"all" | "KR" | "US">("all"); // "all" = 전체시장
  const [stocksAcct,   setStocksAcct]   = useState<"all" | "4802" | "1635" | "1402" | "8654">("all");
  const [stocksType,   setStocksType]   = useState<"all" | "STOCK" | "FUND" | "ETF">("all");

  // ── Performance 탭 계좌 필터 ────────────────────────
  const [perfAcct, setPerfAcct] = useState<"all" | "4802" | "1635" | "1402" | "8654">("all");

  // ── 리밸런싱 탭 필터 ────────────────────────────────
  const [rebMarket,  setRebMarket]  = useState<"KR" | "US">("KR");
  const [rebAcct,    setRebAcct]    = useState<"all" | "4802" | "1635" | "1402" | "8654">("all");
  const [rebType,    setRebType]    = useState<"all" | "STOCK" | "FUND" | "ETF">("all");
  const [rebAction,  setRebAction]  = useState<"all" | "BUY" | "SELL" | "HOLD">("all");

  // currentPricesRef를 state와 항상 동기화 (fetchPositions에서 deps 없이 최신값 읽기 위해)
  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  // ────────────────────────────────────────────────
  // Executed Trade — transactions에서 파생
  //
  // StockHistoryTable과 동일한 그룹 키(stockCode::stockName::accountNo)로 묶고,
  // 잔량 0 (전량 매도 완료) + 매도 이력 있는 종목만 Executed Trade로 집계.
  // positions가 로드된 뒤 잔량을 직접 확인; 로드 전에는 트랜잭션 집계치 사용.
  // ────────────────────────────────────────────────
  const executedTrades = useMemo((): ExecutedTrade[] => {
    // 종목+계좌 복합키로 그룹화
    const groupMap = new Map<string, {
      stockCode: string; stockName: string;
      accountNo: "4802" | "1635" | "1402" | "8654";
      market: "KR" | "US"; assetType: "STOCK" | "ETF" | "FUND";
      currency: "KRW" | "USD"; txs: LongtermTransaction[];
    }>();

    for (const tx of transactions) {
      const key = `${tx.stockCode}::${tx.stockName}::${tx.accountNo}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          stockCode: tx.stockCode, stockName: tx.stockName,
          accountNo: tx.accountNo, market: tx.market,
          assetType: tx.assetType, currency: tx.currency, txs: [],
        });
      }
      groupMap.get(key)!.txs.push(tx);
    }

    const result: ExecutedTrade[] = [];

    for (const [key, g] of groupMap) {
      // 날짜 오름차순 (잔량 추적 정확성)
      g.txs.sort((a, b) => a.date.localeCompare(b.date));

      const buys  = g.txs.filter((t) => t.tradeType === "BUY");
      const sells = g.txs.filter((t) => t.tradeType === "SELL");

      // 매도 이력 없으면 제외
      if (sells.length === 0) continue;

      const totalBuyQty  = buys.reduce((s, t) => s + t.quantity, 0);
      const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0);

      // positions에서 잔량 확인; positions 미로드 시 트랜잭션 계산치로 대체
      const pos = positions.find(
        (p) => p.stockCode === g.stockCode && p.accountNo === g.accountNo
      );
      const balance = pos?.quantity ?? Math.max(0, totalBuyQty - totalSellQty);

      // 잔량이 남아있으면 아직 미완료 → 제외
      if (balance !== 0) continue;

      const totalBuyAmt  = buys.reduce((s, t) => s + t.amount, 0);
      const totalSellAmt = sells.reduce((s, t) => s + t.amount, 0);
      const avgBuyPrice  = totalBuyQty  > 0 ? totalBuyAmt  / totalBuyQty  : 0;
      const avgSellPrice = totalSellQty > 0 ? totalSellAmt / totalSellQty : 0;

      const buyDate  = buys[0]?.date                    ?? sells[0]?.date ?? "";
      const sellDate = sells[sells.length - 1]?.date    ?? "";

      // 실현손익: SELL에 realizedPL 저장된 경우 우선 사용, 없으면 FIFO로 직접 계산
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

      // 월별 기하수익률: (1 + totalReturn)^(30.4375/holdingDays) - 1
      // holdingDays < 1이면 계산 불가 → null
      const monthlyGeoReturn = holdingDays >= 1
        ? (Math.pow(1 + profitLossPct / 100, 30.4375 / holdingDays) - 1) * 100
        : null;

      result.push({
        key,
        stockCode: g.stockCode, stockName: g.stockName,
        accountNo: g.accountNo, market: g.market,
        assetType: g.assetType, currency: g.currency,
        buyDate, sellDate,
        avgBuyPrice:  g.currency === "KRW" ? Math.round(avgBuyPrice)  : Math.round(avgBuyPrice * 100) / 100,
        avgSellPrice: g.currency === "KRW" ? Math.round(avgSellPrice) : Math.round(avgSellPrice * 100) / 100,
        totalQty: totalSellQty, totalBuyAmt,
        profitLoss:    Math.round(profitLoss),
        profitLossPct: Math.round(profitLossPct * 100) / 100,
        holdingDays,
        monthlyGeoReturn: monthlyGeoReturn !== null ? Math.round(monthlyGeoReturn * 100) / 100 : null,
      });
    }

    // 기본 정렬: 최종 매도일 내림차순
    return result.sort((a, b) => b.sellDate.localeCompare(a.sellDate));
  }, [transactions, positions]);

  // Executed Trade 성과 요약 (Win/Lose 통계)
  // result 필드 없이 profitLoss 부호로 직접 분류
  const executedSummary = useMemo(() => {
    if (executedTrades.length === 0) return null;
    const wins   = executedTrades.filter((t) => t.profitLoss >= 0);
    const losses = executedTrades.filter((t) => t.profitLoss < 0);
    const totalWinPL  = wins.reduce((s, t) => s + t.profitLoss, 0);
    const totalLossPL = Math.abs(losses.reduce((s, t) => s + t.profitLoss, 0));
    const winRate     = executedTrades.length > 0 ? wins.length / executedTrades.length : 0;
    const pf          = totalLossPL > 0 ? totalWinPL / totalLossPL : Infinity;
    const avgWinPct   = wins.length   > 0 ? wins.reduce((s, t) => s + t.profitLossPct, 0) / wins.length   : 0;
    const avgLossPct  = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.profitLossPct, 0)) / losses.length : 0;
    return { totalTrades: executedTrades.length, winCount: wins.length, lossCount: losses.length, winRate, pf, avgWinPct, avgLossPct };
  }, [executedTrades]);

  // TPI = winRate × (PF + 1)
  const exTpi = useMemo(() => {
    if (!executedSummary || executedSummary.totalTrades === 0) return null;
    const pf = isFinite(executedSummary.pf) ? executedSummary.pf : 0;
    return Math.round(executedSummary.winRate * (pf + 1) * 10000) / 10000;
  }, [executedSummary]);

  const exTotalBuy = executedTrades.reduce((s, t) => s + t.totalBuyAmt, 0);
  const exTotalPL  = executedTrades.reduce((s, t) => s + t.profitLoss, 0);

  // 필터 + 정렬 적용
  const filteredExecutedTrades = useMemo(() => {
    let arr = [...executedTrades];
    if (exTradeMarket !== "all") arr = arr.filter((t) => t.market === exTradeMarket);
    if (exTradeAcct   !== "all") arr = arr.filter((t) => t.accountNo === exTradeAcct);
    if (exTradeAsset  !== "all") arr = arr.filter((t) => t.assetType === exTradeAsset);

    return arr.sort((a, b) => {
      let cmp = 0;
      switch (exTradeSort.col) {
        case "stockName":     cmp = a.stockName.localeCompare(b.stockName, "ko"); break;
        case "accountNo":     cmp = a.accountNo.localeCompare(b.accountNo);       break;
        case "market":        cmp = a.market.localeCompare(b.market);             break;
        case "assetType":     cmp = a.assetType.localeCompare(b.assetType);       break;
        case "buyDate":       cmp = a.buyDate.localeCompare(b.buyDate);           break;
        case "sellDate":      cmp = a.sellDate.localeCompare(b.sellDate);         break;
        case "avgBuyPrice":      cmp = a.avgBuyPrice  - b.avgBuyPrice;                                               break;
        case "totalQty":         cmp = a.totalQty     - b.totalQty;                                                break;
        case "avgSellPrice":     cmp = a.avgSellPrice - b.avgSellPrice;                                            break;
        case "profitLoss":       cmp = a.profitLoss   - b.profitLoss;                                              break;
        case "profitLossPct":    cmp = a.profitLossPct - b.profitLossPct;                                          break;
        case "monthlyGeoReturn": cmp = (a.monthlyGeoReturn ?? -Infinity) - (b.monthlyGeoReturn ?? -Infinity);      break;
        case "holdingDays":      cmp = a.holdingDays  - b.holdingDays;                                             break;
      }
      return exTradeSort.dir === "asc" ? cmp : -cmp;
    });
  }, [executedTrades, exTradeMarket, exTradeAsset, exTradeSort]);

  // ────────────────────────────────────────────────
  // 거래 내역 조회
  // ────────────────────────────────────────────────
  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    try {
      const params = new URLSearchParams();
      if (accountFilter !== "all") params.set("account", accountFilter);
      const res = await fetch(`/api/portfolio/longterm/transactions?${params}`);
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      // GET /api/portfolio/longterm/transactions 는 배열을 직접 반환
      const d = await res.json() as LongtermTransaction[];
      setTransactions(d);
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "거래 내역 조회 실패");
    } finally {
      setTxLoading(false);
    }
  }, [accountFilter]);

  // ────────────────────────────────────────────────
  // 포지션 + 요약 조회
  // ────────────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    setPosLoading(true);
    try {
      const params = new URLSearchParams();
      if (accountFilter !== "all") params.set("account", accountFilter);
      const res = await fetch(`/api/portfolio/longterm/positions?${params}`);
      if (!res.ok) return;
      const d = await res.json() as {
        positions: LongtermPosition[];
        krSummary: LongtermSummary;
        usSummary: LongtermSummary;
      };
      // 서버 포지션에 현재가 병합 (ref로 읽어 deps 순환 방지)
      const pricesSnap = currentPricesRef.current;
      const merged = d.positions.map((p) => {
        const cp = pricesSnap[p.stockCode];
        if (cp === undefined) return p;
        const evalAmount = cp * p.quantity;
        const evalPL = evalAmount - p.avgCost * p.quantity;
        const evalPLPct = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
        return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
      });
      setPositions(merged);
      // 현재가 병합 후 evalPL/evalAmount를 재집계해서 summary 보정
      const krEvalAmount = merged
        .filter((p) => p.currency === "KRW")
        .reduce((s, p) => s + p.evalAmount, 0);
      const usEvalAmount = merged
        .filter((p) => p.currency === "USD")
        .reduce((s, p) => s + p.evalAmount, 0);
      const krEvalPL = merged
        .filter((p) => p.currency === "KRW")
        .reduce((s, p) => s + p.evalPL, 0);
      const usEvalPL = merged
        .filter((p) => p.currency === "USD")
        .reduce((s, p) => s + p.evalPL, 0);

      setKrSummary({
        ...d.krSummary,
        totalEvalAmount: krEvalAmount || d.krSummary.totalEvalAmount,
        totalEvalPL: krEvalPL,
      });
      setUsSummary({
        ...d.usSummary,
        totalEvalAmount: usEvalAmount || d.usSummary.totalEvalAmount,
        totalEvalPL: usEvalPL,
      });
    } finally {
      setPosLoading(false);
    }
  // currentPrices는 ref로 읽으므로 deps에서 제외 — 가격 변경 시 fetchPositions 재호출 불필요
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountFilter]);

  // ────────────────────────────────────────────────
  // 성과 조회 (KR / US 각각)
  // ────────────────────────────────────────────────
  const fetchPerformance = useCallback(async () => {
    setPerfLoading(true);
    try {
      const params = new URLSearchParams();
      if (accountFilter !== "all") params.set("account", accountFilter);

      const [krRes, usRes] = await Promise.all([
        fetch(`/api/portfolio/longterm/performance?${params}&currency=KRW`),
        fetch(`/api/portfolio/longterm/performance?${params}&currency=USD`),
      ]);
      if (krRes.ok) {
        const d = await krRes.json() as {
          summary: PerformanceSummary;
          monthlyPL: { year: number; month: number; pl: number }[];
        };
        setKrPerfSummary(d.summary);
        setKrMonthlyPL(d.monthlyPL);
      }
      if (usRes.ok) {
        const d = await usRes.json() as {
          summary: PerformanceSummary;
          monthlyPL: { year: number; month: number; pl: number }[];
        };
        setUsPerfSummary(d.summary);
        setUsMonthlyPL(d.monthlyPL);
      }
    } finally {
      setPerfLoading(false);
    }
  }, [accountFilter]);

  // ────────────────────────────────────────────────
  // 보유 종목별 성과 조회 (TWR / Alpha / Hit Rate 등)
  // Yahoo Finance 히스토리 데이터를 종목마다 조회하므로 별도 로딩 상태 관리
  // ────────────────────────────────────────────────
  const fetchHoldingsPerf = useCallback(async () => {
    setHoldingsPerfLoading(true);
    try {
      const qs = new URLSearchParams();
      if (accountFilter !== "all") qs.set("account", accountFilter);
      const res = await fetch(`/api/portfolio/longterm/holdings-performance?${qs}`);
      if (!res.ok) return;
      const d = await res.json() as { holdings?: HoldingPerformance[] };
      setHoldingsPerf(d.holdings ?? []);
    } catch (err) {
      console.error("[fetchHoldingsPerf] 실패:", err);
    } finally {
      setHoldingsPerfLoading(false);
    }
  }, [accountFilter]);

  // ────────────────────────────────────────────────
  // 현재가 실시간 조회 (Yahoo Finance)
  // ────────────────────────────────────────────────
  const fetchLivePrices = useCallback(async () => {
    setPricesLoading(true);
    try {
      const qs = new URLSearchParams();
      if (accountFilter !== "all") qs.set("account", accountFilter);
      const res = await fetch(`/api/portfolio/longterm/prices?${qs}`);
      if (!res.ok) return;
      const d = await res.json() as {
        prices: Record<string, number>;
        fetchedAt: string;
        notFound?: string[];
      };

      // API 가격 위에 기존 수동 오버라이드값 우선 유지: { ...apiPrices, ...manualOverrides }
      const merged = { ...d.prices, ...currentPricesRef.current };
      currentPricesRef.current = merged;
      setCurrentPrices(merged);
      setPricesFetchedAt(d.fetchedAt);

      // currentPrices 변경이 fetchPositions 재호출을 트리거하지 않으므로
      // positions 상태를 여기서 직접 갱신 + KR/US 요약(evalPL, evalAmount)도 함께 재계산
      setPositions((prev) => {
        const next = prev.map((p) => {
          const cp = merged[p.stockCode];
          if (cp === undefined) return p;
          const evalAmount = cp * p.quantity;
          const evalPL = evalAmount - p.avgCost * p.quantity;
          const evalPLPct = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
        });

        // 가격 반영 후 KR/US 요약 재계산 — fetchPositions의 summary는 prices 없이 계산되므로
        // fetchLivePrices 완료 시점에 최신 evalPL/evalAmount로 덮어써야 정확한 값을 표시할 수 있음
        const krEvalPL = next.filter((p) => p.currency === "KRW").reduce((s, p) => s + p.evalPL, 0);
        const usEvalPL = next.filter((p) => p.currency === "USD").reduce((s, p) => s + p.evalPL, 0);
        const krEvalAmount = next.filter((p) => p.currency === "KRW").reduce((s, p) => s + p.evalAmount, 0);
        const usEvalAmount = next.filter((p) => p.currency === "USD").reduce((s, p) => s + p.evalAmount, 0);
        setKrSummary((s) => ({ ...s, totalEvalPL: krEvalPL, totalEvalAmount: krEvalAmount }));
        setUsSummary((s) => ({ ...s, totalEvalPL: usEvalPL, totalEvalAmount: usEvalAmount }));

        return next;
      });
    } catch (err) {
      console.error("[fetchLivePrices] 현재가 조회 실패:", err);
    } finally {
      setPricesLoading(false);
    }
  }, [accountFilter]);

  // ── 마운트 + 필터 변경 시 데이터 로드 ──────────
  // fetchPositions 완료 후 fetchLivePrices 실행:
  //   positions가 세팅된 상태에서 가격을 덮어써야 evalPL이 올바르게 반영됨.
  //   fetchTransactions / fetchPerformance / fetchHoldingsPerf는 독립적이라 병렬 실행.
  // fetchHoldingsPerf는 Yahoo 히스토리를 종목마다 조회하므로 느릴 수 있음.
  // 캐시(5분 TTL)를 통해 반복 방문 시 빠르게 응답.
  useEffect(() => {
    void fetchTransactions();
    void fetchPerformance();
    void fetchHoldingsPerf();
    void fetchPositions().then(() => fetchLivePrices());
  }, [fetchTransactions, fetchPositions, fetchPerformance, fetchLivePrices, fetchHoldingsPerf]);

  // ────────────────────────────────────────────────
  // 현재가 업데이트 핸들러 (LongtermPositionsTable → 여기서 관리)
  // ────────────────────────────────────────────────
  const handlePriceUpdate = useCallback(
    (stockCode: string, price: number) => {
      setCurrentPrices((prev) => {
        const next = { ...prev, [stockCode]: price };
        try {
          localStorage.setItem(CURRENT_PRICES_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
      // 포지션에 즉시 반영 (API 재조회 없이 로컬 업데이트)
      setPositions((prev) =>
        prev.map((p) => {
          if (p.stockCode !== stockCode) return p;
          const evalAmount = price * p.quantity;
          const evalPL = evalAmount - p.avgCost * p.quantity;
          const evalPLPct = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: price, evalAmount, evalPL, evalPLPct };
        })
      );
    },
    []
  );

  // ────────────────────────────────────────────────
  // 거래 추가 핸들러
  // ────────────────────────────────────────────────
  const handleAddTransaction = useCallback(
    async (tx: Omit<LongtermTransaction, "id"> | LongtermTransaction) => {
      try {
        // id가 있으면 편집(PUT), 없으면 추가(POST)
        const isEdit = "id" in tx && !!tx.id;
        const res = await fetch(
          isEdit
            ? `/api/portfolio/longterm/transactions/${(tx as LongtermTransaction).id}`
            : "/api/portfolio/longterm/transactions",
          {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tx),
          }
        );
        if (!res.ok) throw new Error(isEdit ? "수정 실패" : "저장 실패");
        await Promise.all([fetchTransactions(), fetchPositions(), fetchPerformance()]);
        setShowForm(false);
        setEditingTx(undefined);
      } catch (err) {
        console.error("거래 추가/수정 실패:", err);
      }
    },
    [fetchTransactions, fetchPositions, fetchPerformance]
  );

  // ────────────────────────────────────────────────
  // 거래 편집 열기 핸들러
  // ────────────────────────────────────────────────
  const handleOpenEdit = useCallback((tx: LongtermTransaction) => {
    setEditingTx(tx);
    setShowForm(true);
  }, []);

  // ────────────────────────────────────────────────
  // 거래 삭제 핸들러
  // ────────────────────────────────────────────────
  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/portfolio/longterm/transactions/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("삭제 실패");
        await Promise.all([fetchTransactions(), fetchPositions(), fetchPerformance()]);
      } catch (err) {
        console.error("거래 삭제 실패:", err);
      }
    },
    [fetchTransactions, fetchPositions, fetchPerformance]
  );

  // ────────────────────────────────────────────────
  // Excel Export
  // ────────────────────────────────────────────────
  function handleExport() {
    const allMonthlyPL = [
      ...krMonthlyPL.map((m) => ({ ...m, currency: "KRW" as const })),
      ...usMonthlyPL.map((m) => ({ ...m, currency: "USD" as const })),
    ];
    exportLongtermExcel(transactions, positions, allMonthlyPL, []);
  }

  // ────────────────────────────────────────────────
  // Excel Import (FS 2026.xlsx 계층 구조 파서)
  // Stock Investment 시트 lookup → Stock Trading + Fund Trading 일괄 파싱
  // ────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      // 계좌 필터와 무관하게 전체 거래를 가져와서 dedup 기준으로 사용
      // (state의 transactions는 필터 적용 부분집합일 수 있어 dedup 누락 방지)
      const allTxsRes = await fetch("/api/portfolio/longterm/transactions");
      const allTxs: LongtermTransaction[] = allTxsRes.ok ? await allTxsRes.json() as LongtermTransaction[] : transactions;

      // Stock Investment 시트의 종목 메타를 lookup 기준으로 두 시트 한 번에 파싱
      const result = await parseHierarchicalExcel(file, allTxs);
      const { transactions: newTxs, duplicates, stats } = result;

      if (newTxs.length === 0) {
        alert(`임포트할 새 거래가 없습니다. (중복 ${duplicates}건 건너뜀)`);
        return;
      }

      // 순차 저장 필수: enrichSellTransaction이 서버에서 readTransactions()로 파일을 다시 읽으므로
      // 이전 BUY가 먼저 저장된 상태여야 SELL의 realizedPL(avgCost 기반)이 정확히 계산됨
      let savedCount = 0;
      let failedCount = 0;
      for (const tx of newTxs) {
        const res = await fetch("/api/portfolio/longterm/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tx),
        });
        if (res.ok) savedCount++;
        else failedCount++;
      }
      if (failedCount > 0) {
        console.error(`임포트 부분 실패: ${failedCount}건 저장 실패, ${savedCount}건 저장됨`);
      }

      // 계좌별 건수 요약 메시지
      const accountSummary = Object.entries(stats.byAccount)
        .map(([acc, cnt]) => `${acc}: ${cnt}건`)
        .join(" | ");
      const totalMsg = failedCount > 0
        ? `${savedCount}건 저장 완료, ${failedCount}건 실패`
        : `${savedCount}건 임포트 완료`;
      alert(
        `${totalMsg}\n` +
        `국내: 매수 ${stats.krBuy} 매도 ${stats.krSell} | ` +
        `해외: 매수 ${stats.usBuy} 매도 ${stats.usSell}` +
        (stats.dividend > 0 ? ` | 배당 ${stats.dividend}` : "") +
        (duplicates > 0 ? `\n중복 ${duplicates}건 건너뜀` : "") +
        (accountSummary ? `\n[계좌별] ${accountSummary}` : "")
      );

      await Promise.all([fetchTransactions(), fetchPositions(), fetchPerformance()]);
    } catch (err) {
      console.error("Excel import 실패:", err);
      alert("Excel 임포트에 실패했습니다. 파일 형식을 확인해 주세요.");
    } finally {
      setImportLoading(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  // ────────────────────────────────────────────────
  // JSON 백업 다운로드
  // GET /api/portfolio/longterm/backup → attachment 파일로 저장
  // ────────────────────────────────────────────────
  async function handleJsonBackup() {
    setJsonLoading(true);
    try {
      const res = await fetch("/api/portfolio/longterm/backup");
      if (!res.ok) throw new Error("백업 API 오류");
      const blob = await res.blob();
      // Content-Disposition 헤더의 파일명을 그대로 사용해 다운로드
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `longterm-backup-${today}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error("JSON 백업 실패:", err);
      alert("JSON 백업 다운로드에 실패했습니다.");
    } finally {
      setJsonLoading(false);
    }
  }

  // ────────────────────────────────────────────────
  // JSON 복원
  // 파일 선택 → mode 선택(merge/overwrite) → POST
  // ────────────────────────────────────────────────
  async function handleJsonRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setJsonLoading(true);
    try {
      // 파일을 텍스트로 읽어 파싱
      const text = await file.text();
      const parsed = JSON.parse(text) as { transactions?: unknown[] };
      if (!Array.isArray(parsed.transactions) || parsed.transactions.length === 0) {
        alert("유효한 백업 파일이 아닙니다. (transactions 배열 없음)");
        return;
      }

      // overwrite는 전체 데이터를 교체하므로 명시적 확인 필요
      const useOverwrite = window.confirm(
        `백업 파일: ${parsed.transactions.length}건\n\n` +
        `[확인] 전체 덮어쓰기 (overwrite) — 현재 데이터가 모두 교체됩니다.\n` +
        `[취소] 병합 추가 (merge) — 중복 제외한 신규 건만 추가됩니다.`
      );

      const res = await fetch("/api/portfolio/longterm/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsed.transactions,
          mode: useOverwrite ? "overwrite" : "merge",
        }),
      });

      if (!res.ok) throw new Error("복원 API 오류");
      const result = await res.json() as { ok: boolean; restored: number; skipped: number };

      alert(
        `복원 완료\n` +
        `저장: ${result.restored}건 | 건너뜀(중복): ${result.skipped}건`
      );

      // 복원 후 전체 데이터 새로고침
      await Promise.all([fetchTransactions(), fetchPositions(), fetchPerformance()]);
    } catch (err) {
      console.error("JSON 복원 실패:", err);
      alert("JSON 복원에 실패했습니다. 파일 형식을 확인해 주세요.");
    } finally {
      setJsonLoading(false);
      if (jsonFileRef.current) jsonFileRef.current.value = "";
    }
  }

  // ────────────────────────────────────────────────
  // 성과 분석 탭에서 사용할 Equity Curve + 월별 수익률 데이터 변환
  // ────────────────────────────────────────────────

  // StockPerformance[] 어댑터: monthlyPL → EquityCurvePoint[]
  // toStockPerformances는 서버 사이드이므로, 클라이언트에서는

  // 계좌 필터 변경 — 상태 업데이트 + URL 파라미터 동기화
  const handleAccountFilter = useCallback((v: AccountFilterValue) => {
    setAccountFilter(v);
    updateUrlParam("account", v);
  }, [setAccountFilter, updateUrlParam]);

  // ────────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">

      {/* ══ 상단 도구 모음 ══════════════════════════ */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 새로고침 */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => {
            void fetchTransactions();
            void fetchPositions();
            void fetchPerformance();
          }}
          disabled={txLoading || posLoading || perfLoading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${txLoading || posLoading ? "animate-spin" : ""}`} />
          새로고침
        </Button>

        {/* Excel·JSON 도구 (오른쪽 정렬) */}
        <div className="ml-auto flex items-center gap-2">
          {/* 숨겨진 Excel import 파일 인풋 */}
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImport}
          />
          {/* 숨겨진 JSON 복원 파일 인풋 */}
          <input
            ref={jsonFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleJsonRestore}
          />

          {/* JSON 복원: 로컬 백업 파일 → 서버 데이터 복구 */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => jsonFileRef.current?.click()}
            disabled={jsonLoading}
          >
            <CloudDownload className="h-3.5 w-3.5" />
            {jsonLoading ? "처리 중..." : "Restore"}
          </Button>
          {/* JSON 백업: 서버 데이터 → 로컬 PC 저장 (오프사이트 안전망) */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleJsonBackup}
            disabled={jsonLoading || transactions.length === 0}
          >
            <CloudUpload className="h-3.5 w-3.5" />
            Backup
          </Button>

          {/* 구분선 */}
          <div className="w-px h-5 bg-border" />

          {/* 가져오기: PC → 앱 방향 = CloudDownload (파일을 올려서 읽는 개념) */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => importFileRef.current?.click()}
            disabled={importLoading}
          >
            <CloudDownload className="h-3.5 w-3.5" />
            {importLoading ? "처리 중..." : "Excel 가져오기"}
          </Button>
          {/* 내보내기: 앱 → PC 방향 = FileDown (파일을 내려받는 개념) */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExport}
            disabled={transactions.length === 0}
          >
            <CloudUpload className="h-3.5 w-3.5" />
            Excel 내보내기
          </Button>
        </div>
      </div>

      {/* ══ 에러 배너 ══════════════════════════════ */}
      {txError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          거래 내역 조회 오류: {txError}
        </div>
      )}

      {/* ══ 7개 탭 ═════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); updateUrlParam("tab", v); }}>
        <TabsList className="grid w-full grid-cols-7 bg-blue-500/5 border">
          {[
            { value: "overview",     label: "대시보드" },
            { value: "positions",    label: "Open Positions",    count: positions.length },
            { value: "transactions", label: "Transactions", count: transactions.length },
            { value: "executed",     label: "Executed Trade", count: executedTrades.length },
            { value: "stocks",       label: "종목별" },
            { value: "performance",  label: "Performance Analysis" },
            { value: "rebalancing",  label: "리밸런싱" },
          ].map(({ value, label, count }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs"
            >
              {label}
              {count != null && count > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ────────────────────────────────────────────
            탭 1: 대시보드 (KPI 카드 + TOP3 + 차트 3종)
        ──────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <AccountFilterBar value={accountFilter} onChange={handleAccountFilter} />
          {/* KPI 카드 + TOP3 종목 (기존 컴포넌트 유지) */}
          <AccountSummaryCards
            krSummary={krSummary}
            usSummary={usSummary}
            positions={positions}
            isLoading={posLoading}
          />

          {/* 차트 섹션 — 포지션 로드 완료 + 1종목 이상일 때만 표시 */}
          {!posLoading && positions.length > 0 && (
            <div className="mt-6 space-y-4">
              {/* 행 1: 포트폴리오 구성 도넛(좌) + 종목별 평가금액 수평바(우) */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <PortfolioAllocationChart positions={positions} isLoading={posLoading} />
                <HoldingsBarChart
                  positions={positions}
                  isLoading={posLoading}
                  marketTab={holdingsMarket}
                  onMarketTabChange={(m) => { setHoldingsMarket(m); updateUrlParam("market", m); }}
                />
              </div>


            </div>
          )}
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 2: 포지션 (현재가 인라인 편집)
        ──────────────────────────────────────────── */}
        <TabsContent value="positions" className="mt-4 space-y-3">
          {/* 툴바: 종목수 + Restore/Backup */}
          <div className="flex items-center justify-end gap-3">
            <p className="text-sm font-medium text-muted-foreground">{positions.length}종목 보유</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => jsonFileRef.current?.click()}
                disabled={jsonLoading}
              >
                <CloudDownload className="h-3.5 w-3.5" />
                Restore
              </Button>
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleJsonBackup}
                disabled={jsonLoading || transactions.length === 0}
              >
                <CloudUpload className="h-3.5 w-3.5" />
                Backup
              </Button>
            </div>
          </div>

          {/* KPI 요약 카드 — 총 매수금액 / 총 평가금액 / 총 평가손익 / 수익률
              KRW 포지션 기준으로 합산 (USD는 별도 통화로 혼산 방지)
              현재가가 입력된 종목만 평가금액·평가손익 계산에 반영 */}
          {(() => {
            const krwPos    = positions.filter((p) => p.currency === "KRW");
            const totalCost = krwPos.reduce((s, p) => s + p.avgCost * p.quantity, 0);
            const priced    = krwPos.filter((p) => p.currentPrice !== undefined);
            const hasPrices = priced.length > 0;
            const totalEval = priced.reduce((s, p) => s + p.evalAmount, 0);
            const totalPL   = priced.reduce((s, p) => s + p.evalPL, 0);
            const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : null;

            const fmt      = (n: number) => Math.round(n).toLocaleString("ko-KR");
            const plCls    = totalPL  >= 0 ? "text-emerald-600 dark:text-emerald-400"  : "text-red-500 dark:text-red-400";
            const pctCls   = (totalPLPct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
            const fetchedStr = pricesFetchedAt
              ? new Date(pricesFetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
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
                  <p className={`text-sm font-semibold tabular-nums ${hasPrices ? plCls : ""}`}>
                    {hasPrices ? `${totalPL >= 0 ? "+" : ""}${fmt(totalPL)}` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground mb-1">수익률</p>
                  <p className={`text-sm font-semibold tabular-nums ${hasPrices && totalPLPct !== null ? pctCls : ""}`}>
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

          <LongtermPositionsTable
            positions={positions}
            isLoading={posLoading}
            pricesLoading={pricesLoading}
            pricesFetchedAt={pricesFetchedAt}
            onPriceUpdate={handlePriceUpdate}
            onPricesRefresh={fetchLivePrices}
          />
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 3: 거래 내역 (검색·필터 + 거래 추가 + 삭제)
        ──────────────────────────────────────────── */}
        <TabsContent value="transactions" className="mt-4 space-y-3">
          {/* 거래 추가 버튼 */}
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => { setEditingTx(undefined); setShowForm(true); }}
            >
              + Add Trade
            </Button>
          </div>

          {/* 계좌 필터는 TransactionTable 내부 필터 사용 */}
          <TransactionTable
            transactions={transactions}
            isLoading={txLoading}
            onDelete={handleDeleteTransaction}
            onEdit={handleOpenEdit}
          />

          {/* 거래 추가/편집 다이얼로그 */}
          <TransactionForm
            open={showForm}
            onOpenChange={(v) => { setShowForm(v); if (!v) setEditingTx(undefined); }}
            initialTx={editingTx}
            onSubmit={handleAddTransaction}
          />
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 4: Executed Trade — 전량 매도 완료 종목
            시장(KR/US) · 계좌 · 종류 필터 포함
        ──────────────────────────────────────────── */}
        <TabsContent value="executed" className="mt-4 space-y-3">

          {/* 계좌 총합 요약 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <ExCard label="총 매수금액"
              value={`${Math.round(exTotalBuy).toLocaleString("ko-KR")}`}
            />
            <ExCard label="총 실현 손익"
              value={`${exTotalPL >= 0 ? "+" : ""}${Math.round(exTotalPL).toLocaleString("ko-KR")}`}
              valueClass={exPlColor(exTotalPL)}
            />
            <ExCard label="실현 수익률"
              value={exTotalBuy > 0 ? exFmtPct((exTotalPL / exTotalBuy) * 100) : "-"}
              valueClass={exPlColor(exTotalPL)}
            />
          </div>

          {/* 필터 바 — 시장 → 계좌 → 종류 (Transactions 스타일) */}
          <div className="flex flex-wrap gap-1.5">
            {/* 시장 */}
            {(["all", "KR", "US"] as const).map((m) => (
              <Button key={m} size="sm" variant={exTradeMarket === m ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", exTradeMarket === m && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setExTradeMarket(m)}>{m === "all" ? "전체시장" : m}</Button>
            ))}
            {/* 계좌 */}
            {(["all", "4802", "1635", "1402", "8654"] as const).map((a) => (
              <Button key={a} size="sm" variant={exTradeAcct === a ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", exTradeAcct === a && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setExTradeAcct(a)}>{a === "all" ? "전체계좌" : a}</Button>
            ))}
            {/* 종류 */}
            {(["all", "STOCK", "ETF", "FUND"] as const).map((t) => (
              <Button key={t} size="sm" variant={exTradeAsset === t ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", exTradeAsset === t && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setExTradeAsset(t)}>{t === "all" ? "전체종류" : t}</Button>
            ))}
            <span className="ml-1 text-[10px] text-muted-foreground self-center">{filteredExecutedTrades.length}건</span>
          </div>

          {/* 거래 테이블 */}
          {filteredExecutedTrades.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {executedTrades.length === 0
                ? "전량 매도 완료된 종목이 없습니다."
                : "필터 조건에 해당하는 거래가 없습니다."}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] text-muted-foreground bg-muted/20">
                        {([
                          { col: "stockName"       as ExTradeSortCol, label: "종목",       align: "left"   },
                          { col: "accountNo"       as ExTradeSortCol, label: "계좌",       align: "left"   },
                          { col: "market"          as ExTradeSortCol, label: "시장",       align: "center" },
                          { col: "assetType"       as ExTradeSortCol, label: "종류",       align: "center" },
                          { col: "buyDate"         as ExTradeSortCol, label: "매수일",     align: "right"  },
                          { col: "avgBuyPrice"     as ExTradeSortCol, label: "매수가",     align: "right"  },
                          { col: "sellDate"        as ExTradeSortCol, label: "매도일",     align: "right"  },
                          { col: "avgSellPrice"    as ExTradeSortCol, label: "매도가",     align: "right"  },
                          { col: "totalQty"        as ExTradeSortCol, label: "수량",       align: "right"  },
                          { col: "profitLoss"      as ExTradeSortCol, label: "손익",       align: "right"  },
                          { col: "profitLossPct"   as ExTradeSortCol, label: "%",          align: "right"  },
                          { col: "monthlyGeoReturn" as ExTradeSortCol, label: "월기하",    align: "right"  },
                          { col: "holdingDays"     as ExTradeSortCol, label: "보유",       align: "right"  },
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
                                  ? <ArrowUp   className="h-3 w-3 text-blue-600" />
                                  : <ArrowDown className="h-3 w-3 text-blue-600" />
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
                            <div className="text-[10px] text-muted-foreground">{t.stockCode}</div>
                          </td>
                          {/* 계좌 배지 */}
                          <td className="p-2">
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              {t.accountNo}
                            </span>
                          </td>
                          {/* 시장 배지 */}
                          <td className="p-2 text-center">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                              t.market === "KR"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-orange-100 text-orange-700"
                            )}>
                              {t.market}
                            </span>
                          </td>
                          {/* 종류 배지 */}
                          <td className="p-2 text-center">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                              t.assetType === "ETF"
                                ? "bg-violet-100 text-violet-700"
                                : t.assetType === "FUND"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-700"
                            )}>
                              {t.assetType}
                            </span>
                          </td>
                          {/* 매수일 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">{t.buyDate}</td>
                          {/* 평균 매수가 */}
                          <td className="text-right p-2 tabular-nums">{exFmt(t.avgBuyPrice, t.currency)}</td>
                          {/* 매도일 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">{t.sellDate}</td>
                          {/* 평균 매도가 */}
                          <td className="text-right p-2 tabular-nums">{exFmt(t.avgSellPrice, t.currency)}</td>
                          {/* 수량 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">
                            {t.totalQty.toLocaleString()}
                          </td>
                          {/* 실현손익 */}
                          <td className={cn("text-right p-2 tabular-nums font-medium", exPlColor(t.profitLoss))}>
                            {t.profitLoss >= 0 ? "+" : ""}{exFmt(t.profitLoss, t.currency)}
                          </td>
                          {/* 수익률 */}
                          <td className={cn("text-right p-2 tabular-nums font-semibold", exPlColor(t.profitLossPct))}>
                            {exFmtPct(t.profitLossPct)}
                          </td>
                          {/* 월별 기하수익률 */}
                          <td className={cn("text-right p-2 tabular-nums", t.monthlyGeoReturn !== null ? exPlColor(t.monthlyGeoReturn) : "text-muted-foreground")}>
                            {t.monthlyGeoReturn !== null ? exFmtPct(t.monthlyGeoReturn) : "—"}
                          </td>
                          {/* 보유일수 */}
                          <td className="text-right p-2 tabular-nums text-muted-foreground">
                            {t.holdingDays}일
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* 합계 행 — 필터 적용 결과 기준 */}
                    {(() => {
                      const sumQty   = filteredExecutedTrades.reduce((s, t) => s + t.totalQty, 0);
                      const sumBuy   = filteredExecutedTrades.reduce((s, t) => s + t.totalBuyAmt, 0);
                      const sumPL    = filteredExecutedTrades.reduce((s, t) => s + t.profitLoss, 0);
                      const sumPLPct = sumBuy > 0 ? (sumPL / sumBuy) * 100 : 0;
                      const validMgr = filteredExecutedTrades.filter((t) => t.monthlyGeoReturn !== null);
                      const avgMgr   = validMgr.length > 0
                        ? validMgr.reduce((s, t) => s + (t.monthlyGeoReturn ?? 0), 0) / validMgr.length
                        : null;
                      const avgDays  = filteredExecutedTrades.length > 0
                        ? Math.round(filteredExecutedTrades.reduce((s, t) => s + t.holdingDays, 0) / filteredExecutedTrades.length)
                        : 0;
                      return (
                        <tfoot>
                          <tr className="border-t-2 border-border bg-muted/30 text-xs font-semibold">
                            <td className="p-2 pl-3">
                              합계 <span className="text-muted-foreground font-normal">({filteredExecutedTrades.length}건)</span>
                            </td>
                            <td colSpan={7} />
                            <td className="text-right p-2 tabular-nums">{sumQty.toLocaleString()}</td>
                            <td className={cn("text-right p-2 tabular-nums", exPlColor(sumPL))}>
                              {sumPL >= 0 ? "+" : ""}{Math.round(sumPL).toLocaleString("ko-KR")}
                            </td>
                            <td className={cn("text-right p-2 tabular-nums", exPlColor(sumPLPct))}>
                              {exFmtPct(Math.round(sumPLPct * 100) / 100)}
                            </td>
                            <td className={cn("text-right p-2 tabular-nums", avgMgr !== null ? exPlColor(avgMgr) : "text-muted-foreground")}>
                              {avgMgr !== null ? exFmtPct(Math.round(avgMgr * 100) / 100) : "—"}
                            </td>
                            <td className="text-right p-2 tabular-nums text-muted-foreground">
                              {avgDays}일<span className="font-normal text-[10px] ml-0.5">(평균)</span>
                            </td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 5: 종목별 이력 (accordion + 소계)
        ──────────────────────────────────────────── */}
        <TabsContent value="stocks" className="mt-4 space-y-3">
          {/* 필터 — 시장 → 계좌 → 종류 (Transactions 스타일) */}
          <div className="flex flex-wrap gap-1.5">
            {/* 시장 */}
            {(["all", "KR", "US"] as const).map((m) => (
              <Button key={m} size="sm" variant={stocksMarket === m ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", stocksMarket === m && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setStocksMarket(m)}>{m === "all" ? "전체시장" : m}</Button>
            ))}
            {/* 계좌 */}
            {(["all", "4802", "1635", "1402", "8654"] as const).map((a) => (
              <Button key={a} size="sm" variant={stocksAcct === a ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", stocksAcct === a && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setStocksAcct(a)}>{a === "all" ? "전체계좌" : a}</Button>
            ))}
            {/* 종류 */}
            {(["all", "STOCK", "FUND", "ETF"] as const).map((t) => (
              <Button key={t} size="sm" variant={stocksType === t ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", stocksType === t && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setStocksType(t)}>{t === "all" ? "전체종류" : t}</Button>
            ))}
          </div>

          <StockHistoryTable
            transactions={transactions}
            isLoading={txLoading}
            marketFilter={stocksMarket}
            onMarketFilterChange={setStocksMarket}
            accountFilter={stocksAcct}
            onAccountFilterChange={setStocksAcct}
            assetTypeFilter={stocksType}
            onAssetTypeFilterChange={setStocksType}
          />
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 5: Performance Analysis (KR / US 탭 분리)
        ──────────────────────────────────────────── */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          {/* 필터 — 시장(KR/US) → 계좌 (Open Positions 스타일) */}
          <div className="flex flex-wrap gap-1.5">
            {/* 시장: KR/US, 전체 없음 */}
            {(["KRW", "USD"] as const).map((c) => (
              <Button key={c} size="sm" variant={perfCurrency === c ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", perfCurrency === c && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => { setPerfCurrency(c); updateUrlParam("perf", c); }}>
                {c === "KRW" ? "KR" : "US"}
              </Button>
            ))}
            {/* 계좌 */}
            {(["all", "4802", "1635", "1402", "8654"] as const).map((a) => (
              <Button key={a} size="sm" variant={perfAcct === a ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", perfAcct === a && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setPerfAcct(a)}>{a === "all" ? "전체계좌" : a}</Button>
            ))}
          </div>

          {/* 계좌 필터 적용된 보유 성과 데이터 */}
          {(() => {
            const filteredPerf = perfAcct === "all"
              ? holdingsPerf
              : holdingsPerf.filter((h) => h.accountNo === perfAcct);

            return (
              <>
                {/* ── 보유 종목별 성과 (TWR / Alpha) ──────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold">보유 종목 성과</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        TWR · Alpha · 연환산 Alpha · Hit Rate · MDD
                        {holdingsPerfLoading && (
                          <span className="ml-2 text-blue-500 animate-pulse">
                            Yahoo 히스토리 조회 중...
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <HoldingsPerformanceTable
                    holdings={filteredPerf}
                    isLoading={holdingsPerfLoading}
                    currency={perfCurrency}
                  />
                </div>

                {/* ── Alpha 바 차트 — 종목별 Alpha 그래픽 시각화 ── */}
                <HoldingsAlphaBarChart
                  holdings={filteredPerf}
                  currency={perfCurrency}
                />
              </>
            );
          })()}
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 6: 리밸런싱
        ──────────────────────────────────────────── */}
        <TabsContent value="rebalancing" className="mt-4 space-y-3">
          {/* 필터 — 시장(KR/US) → 계좌 (Open Positions 스타일) */}
          <div className="flex flex-wrap gap-1.5">
            {/* 시장: KR/US, 전체 없음 */}
            {(["KR", "US"] as const).map((m) => (
              <Button key={m} size="sm" variant={rebMarket === m ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", rebMarket === m && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setRebMarket(m)}>{m}</Button>
            ))}
            {/* 계좌 */}
            {(["all", "4802", "1635", "1402", "8654"] as const).map((a) => (
              <Button key={a} size="sm" variant={rebAcct === a ? "default" : "outline"}
                className={cn("h-7 px-2.5 text-[11px]", rebAcct === a && "bg-emerald-600 hover:bg-emerald-700 text-white")}
                onClick={() => setRebAcct(a)}>{a === "all" ? "전체계좌" : a}</Button>
            ))}
          </div>

          <RebalancingPanel
            positions={positions
              .filter((p) => p.market === rebMarket)
              .filter((p) => rebAcct === "all" || p.accountNo === rebAcct)
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
