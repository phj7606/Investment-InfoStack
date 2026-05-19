"use client";

// 중장기 투자 계좌 대시보드 — 메인 컨테이너 컴포넌트
// 6개 탭:
//   대시보드   — KR/US 섹션 KPI 카드 + TOP3 종목
//   포지션     — 보유 종목 + 현재가 인라인 편집
//   거래 내역  — 검색·필터 + 거래 추가 + Excel 임포트
//   종목별     — 종목별 이력 accordion (총 매수/매도/잔량/손익 소계)
//   성과 분석  — KR/US 별도 Equity Curve + 히트맵 + KPI
//   리밸런싱   — 목표 비중 입력 + 제안 테이블
//
// 계좌 필터: 전체 | 4802 (주식) | 1635 (ETF) | 1402 (중장기+) | 8654 (펀드)

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUp, FileDown, RefreshCw } from "lucide-react";

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
  const [accountFilter, setAccountFilter] = useState<"all" | "4802" | "1635" | "1402" | "8654">(
    () => (searchParams.get("account") as "all" | "4802" | "1635" | "1402" | "8654") ?? "all"
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
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
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

  // currentPricesRef를 state와 항상 동기화 (fetchPositions에서 deps 없이 최신값 읽기 위해)
  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  // ────────────────────────────────────────────────
  // localStorage 현재가 로드 (마운트 시)
  // ────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_PRICES_KEY);
      if (saved) setCurrentPrices(JSON.parse(saved) as Record<string, number>);
    } catch {
      // ignore
    }
  }, []);

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
      // positions 상태를 여기서 직접 갱신 (handlePriceUpdate와 동일 패턴)
      setPositions((prev) =>
        prev.map((p) => {
          const cp = merged[p.stockCode];
          if (cp === undefined) return p;
          const evalAmount = cp * p.quantity;
          const evalPL = evalAmount - p.avgCost * p.quantity;
          const evalPLPct = p.avgCost > 0 ? (evalPL / (p.avgCost * p.quantity)) * 100 : 0;
          return { ...p, currentPrice: cp, evalAmount, evalPL, evalPLPct };
        })
      );
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

  // ────────────────────────────────────────────────
  // 렌더
  // ────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">

      {/* ══ 상단 도구 모음 ══════════════════════════ */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 계좌 필터 */}
        <Select
          value={accountFilter}
          onValueChange={(v) => {
            setAccountFilter(v as typeof accountFilter);
            updateUrlParam("account", v);
          }}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="계좌 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 계좌</SelectItem>
            <SelectItem value="4802">4802 Stock</SelectItem>
            <SelectItem value="1635">1635 ETF</SelectItem>
            <SelectItem value="1402">1402 Mixed</SelectItem>
            <SelectItem value="8654">8654 (펀드)</SelectItem>
          </SelectContent>
        </Select>

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
            <FileUp className="h-3.5 w-3.5" />
            {jsonLoading ? "처리 중..." : "JSON 복원"}
          </Button>
          {/* JSON 백업: 서버 데이터 → 로컬 PC 저장 (오프사이트 안전망) */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleJsonBackup}
            disabled={jsonLoading || transactions.length === 0}
          >
            <FileDown className="h-3.5 w-3.5" />
            JSON 백업
          </Button>

          {/* 구분선 */}
          <div className="w-px h-5 bg-border" />

          {/* 가져오기: PC → 앱 방향 = FileUp (파일을 올려서 읽는 개념) */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => importFileRef.current?.click()}
            disabled={importLoading}
          >
            <FileUp className="h-3.5 w-3.5" />
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
            <FileDown className="h-3.5 w-3.5" />
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

      {/* ══ 6개 탭 ═════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); updateUrlParam("tab", v); }}>
        <TabsList className="grid w-full grid-cols-6 bg-blue-500/5 border">
          {[
            { value: "overview",     label: "대시보드" },
            { value: "positions",    label: "포지션",    count: positions.length },
            { value: "transactions", label: "거래 내역", count: transactions.length },
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
        <TabsContent value="overview" className="mt-4">
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
        <TabsContent value="positions" className="mt-4">
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
              + 거래 추가
            </Button>
          </div>

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
            탭 4: 종목별 이력 (accordion + 소계)
        ──────────────────────────────────────────── */}
        <TabsContent value="stocks" className="mt-4">
          <StockHistoryTable
            transactions={transactions}
            isLoading={txLoading}
          />
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 5: Performance Analysis (KR / US 탭 분리)
        ──────────────────────────────────────────── */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          {/* KR / US 서브 탭 */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={perfCurrency === "KRW" ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => { setPerfCurrency("KRW"); updateUrlParam("perf", "KRW"); }}
            >
              국내 (KRW)
            </Button>
            <Button
              size="sm"
              variant={perfCurrency === "USD" ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => { setPerfCurrency("USD"); updateUrlParam("perf", "USD"); }}
            >
              해외 (USD)
            </Button>
          </div>

          {/* ── 보유 종목별 성과 (TWR / Alpha) ──────────────────── */}
          {/* 섹션 헤더: 제목 + 로딩 상태 표시 */}
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
              holdings={holdingsPerf}
              isLoading={holdingsPerfLoading}
              currency={perfCurrency}
            />
          </div>

          {/* ── Alpha 바 차트 — 종목별 Alpha 그래픽 시각화 ── */}
          <HoldingsAlphaBarChart
            holdings={holdingsPerf}
            currency={perfCurrency}
          />
        </TabsContent>

        {/* ────────────────────────────────────────────
            탭 6: 리밸런싱
        ──────────────────────────────────────────── */}
        <TabsContent value="rebalancing" className="mt-4">
          <RebalancingPanel positions={positions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
