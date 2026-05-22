"use client";

// Education 계좌(1470) 대시보드 — 파일 기반 수동 관리 컴포넌트
// 3탭: 포지션 | 거래내역 | Risk Management
//
// 포지션: 현재가 API 자동 조회, 계좌 총합, 손익 실시간 표시
// 거래내역: 성과 요약 상단 + 정렬/필터 기능
// Risk Management: RiskManagementPanel + PositionRiskTable

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, CloudUpload, CloudDownload } from "lucide-react";
import { cn } from "@/lib/utils";
import { RiskManagementPanel } from "@/components/portfolio/RiskManagementPanel";
import { PositionRiskTable } from "@/components/portfolio/PositionRiskTable";
import { AddPositionDialog } from "./AddPositionDialog";
import { SellPositionDialog } from "./SellPositionDialog";
import { AddTradeDialog } from "./AddTradeDialog";
import { EditPositionDialog } from "@/components/portfolio/shared/EditPositionDialog";
import { EditTradeDialog } from "@/components/portfolio/shared/EditTradeDialog";
import type {
  EducationPosition,
  EducationTrade,
  PerformanceSummary,
  RiskManagementConfig,
} from "@/types/portfolio";
import { DEFAULT_RISK_CONFIG } from "@/types/portfolio";

// ─────────────────────────────────────────
// 상수
// ─────────────────────────────────────────
const RISK_STORAGE_KEY  = "portfolio-risk-management-config-education-v1";
const POSITION_TABLE_KEY = "portfolio-position-risk-table-education-v1";

// ─────────────────────────────────────────
// 색상·포맷 헬퍼
// ─────────────────────────────────────────
function plColor(v: number) {
  return v > 0 ? "text-red-500" : v < 0 ? "text-blue-500" : "text-muted-foreground";
}
function fmt(v: number) { return v.toLocaleString(); }
function fmtPct(v: number, d = 2) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

// ─────────────────────────────────────────
// 정렬 유틸
// ─────────────────────────────────────────
type TradeCol =
  | "stockName" | "sector" | "buyDate" | "sellDate"
  | "buyPrice" | "sellPrice" | "quantity"
  | "profitLoss" | "profitLossPct" | "holdingDays" | "result";

// 포지션 테이블 정렬 가능 컬럼
type PosCol =
  | "stockName" | "sector" | "buyDate"
  | "avgPrice" | "quantity" | "buyAmount"
  | "currentPrice" | "profitLoss" | "profitLossPct";

type SortDir = "asc" | "desc";

interface SortState    { col: TradeCol; dir: SortDir }
interface PosSortState { col: PosCol;   dir: SortDir }

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

type EnrichedPos = EducationPosition & {
  currentPrice: number; evalAmount: number;
  profitLoss: number; profitLossPct: number;
};
function sortPositions(positions: EnrichedPos[], sort: PosSortState): EnrichedPos[] {
  return [...positions].sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    if (sort.col === "buyAmount") {
      aVal = a.avgPrice * a.quantity;
      bVal = b.avgPrice * b.quantity;
    } else {
      aVal = a[sort.col] as number | string;
      bVal = b[sort.col] as number | string;
    }
    const v = typeof aVal === "number" && typeof bVal === "number"
      ? aVal - bVal
      : String(aVal ?? "").localeCompare(String(bVal ?? ""), "ko");
    return sort.dir === "asc" ? v : -v;
  });
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function EducationAccountDashboardClient() {
  // ── 데이터 ─────────────────────────────────
  const [positions, setPositions] = useState<EducationPosition[]>([]);
  const [trades, setTrades]       = useState<EducationTrade[]>([]);
  const [summary, setSummary]     = useState<PerformanceSummary | null>(null);
  const [loading, setLoading]     = useState(false);

  // ── 현재가 ──────────────────────────────────
  // Record<stockCode, price>
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [priceLoading, setPriceLoading]   = useState(false);
  const [priceAt, setPriceAt]             = useState<string | null>(null);

  // ── Risk Management ─────────────────────────
  const [riskConfig, setRiskConfig] = useState<RiskManagementConfig>(() => {
    if (typeof window === "undefined") return DEFAULT_RISK_CONFIG;
    try {
      const s = localStorage.getItem(RISK_STORAGE_KEY);
      if (s) return JSON.parse(s) as RiskManagementConfig;
    } catch { /* ignore */ }
    return DEFAULT_RISK_CONFIG;
  });

  // ── 다이얼로그 ─────────────────────────────
  const [addPosOpen, setAddPosOpen]       = useState(false);
  const [editPos, setEditPos]             = useState<EducationPosition | null>(null);
  const [sellPos, setSellPos]             = useState<EducationPosition | null>(null);
  const [addTradeOpen, setAddTradeOpen]   = useState(false);
  const [editTrade, setEditTrade]         = useState<EducationTrade | null>(null);

  // ── 백업/복원 ───────────────────────────────
  // 파일 선택 input ref (hidden) — 복원 시 사용
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  // ── 포지션 정렬 ────────────────────────────
  const [posSort, setPosSort] = useState<PosSortState>({ col: "buyDate", dir: "desc" });

  // ── 거래내역 정렬/필터 ─────────────────────
  const [sort, setSort]           = useState<SortState>({ col: "sellDate", dir: "desc" });
  const [resultFilter, setResultFilter] = useState<"all" | "Win" | "Lose">("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");

  // ─────────────────────────────────────────
  // 데이터 로드
  // ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [posRes, tradeRes] = await Promise.all([
        fetch("/api/portfolio/education/positions"),
        fetch("/api/portfolio/education/trades"),
      ]);
      const posData   = await posRes.json()   as { positions: EducationPosition[] };
      const tradeData = await tradeRes.json() as { trades: EducationTrade[]; summary: PerformanceSummary };
      setPositions(posData.positions);
      setTrades(tradeData.trades);
      setSummary(tradeData.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ─────────────────────────────────────────
  // 현재가 일괄 조회
  // ─────────────────────────────────────────
  const fetchPrices = useCallback(async (posArr: EducationPosition[]) => {
    if (posArr.length === 0) return;
    setPriceLoading(true);
    try {
      const codes = posArr.map((p) => p.stockCode).join(",");
      const res = await fetch(`/api/portfolio/risk/prices?codes=${encodeURIComponent(codes)}`);
      if (!res.ok) return;
      const data = await res.json() as { prices: Record<string, number>; fetchedAt: string };
      setCurrentPrices(data.prices);
      setPriceAt(data.fetchedAt);
    } finally {
      setPriceLoading(false);
    }
  }, []);

  // 포지션 로드 완료 시 자동 조회
  useEffect(() => {
    if (positions.length > 0) void fetchPrices(positions);
  }, [positions, fetchPrices]);

  // ─────────────────────────────────────────
  // 포지션 계산값
  // ─────────────────────────────────────────
  const enrichedPositions = useMemo(() =>
    positions.map((p) => {
      const cur = currentPrices[p.stockCode] ?? 0;
      const evalAmount  = cur > 0 ? cur * p.quantity : 0;
      const buyAmount   = p.avgPrice * p.quantity;
      const profitLoss  = cur > 0 ? evalAmount - buyAmount : 0;
      const profitLossPct = cur > 0 ? (profitLoss / buyAmount) * 100 : 0;
      return { ...p, currentPrice: cur, evalAmount, profitLoss, profitLossPct };
    }),
  [positions, currentPrices]);

  const totalBuyAmount  = enrichedPositions.reduce((s, p) => s + p.avgPrice * p.quantity, 0);
  const totalEvalAmount = enrichedPositions.reduce((s, p) => s + p.evalAmount, 0);
  const totalPosPL      = totalEvalAmount - totalBuyAmount;
  const totalPosPLPct   = totalBuyAmount > 0 ? (totalPosPL / totalBuyAmount) * 100 : 0;
  const hasPrices       = Object.keys(currentPrices).length > 0;

  // ─────────────────────────────────────────
  // 거래내역 계산값
  // ─────────────────────────────────────────
  // TPI = winRate × (profitFactor + 1)  (엑셀 S열 공식 역산)
  const tpi = useMemo(() => {
    if (!summary || summary.totalTrades === 0) return null;
    const pf = isFinite(summary.profitFactor) ? summary.profitFactor : 0;
    return Math.round(summary.winRate * (pf + 1) * 10000) / 10000;
  }, [summary]);

  const tradeTotalBuy = trades.reduce((s, t) => s + t.buyAmount, 0);
  const tradeTotalPL  = trades.reduce((s, t) => s + t.profitLoss, 0);

  // 섹터 목록 (필터용)
  const sectors = useMemo(() =>
    ["all", ...Array.from(new Set(trades.map((t) => t.sector).filter(Boolean))).sort()],
  [trades]);

  // 필터 + 정렬 적용
  const filteredTrades = useMemo(() => {
    let arr = [...trades];
    if (resultFilter !== "all") arr = arr.filter((t) => t.result === resultFilter);
    if (sectorFilter !== "all") arr = arr.filter((t) => t.sector === sectorFilter);
    return sortTrades(arr, sort);
  }, [trades, resultFilter, sectorFilter, sort]);

  // ─────────────────────────────────────────
  // 헬퍼: 정렬 헤더 클릭
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

  // ─────────────────────────────────────────
  // JSON 백업 다운로드
  // GET /api/portfolio/education/backup → attachment 파일로 저장
  // ─────────────────────────────────────────
  async function handleJsonBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/portfolio/education/backup");
      if (!res.ok) throw new Error("백업 API 오류");
      const blob = await res.blob();
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `education-backup-${today}.json`;
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
  // 파일 선택 → overwrite/merge 선택 → POST
  // ─────────────────────────────────────────
  async function handleJsonRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBackupLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        positions?: unknown[];
        trades?: unknown[];
      };

      if (!Array.isArray(parsed.positions) || !Array.isArray(parsed.trades)) {
        alert("유효한 백업 파일이 아닙니다. (positions/trades 배열 없음)");
        return;
      }

      // overwrite 선택 시 현재 데이터 전체 교체 경고
      const useOverwrite = window.confirm(
        `백업 파일: 포지션 ${parsed.positions.length}건 / 거래 ${parsed.trades.length}건\n\n` +
        `[확인] 전체 덮어쓰기 (overwrite) — 현재 데이터가 모두 교체됩니다.\n` +
        `[취소] 병합 추가 (merge) — 중복 제외한 신규 건만 추가됩니다.`
      );

      const res = await fetch("/api/portfolio/education/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions: parsed.positions,
          trades: parsed.trades,
          mode: useOverwrite ? "overwrite" : "merge",
        }),
      });

      if (!res.ok) throw new Error("복원 API 오류");
      const result = await res.json() as {
        ok: boolean;
        restoredPositions: number;
        restoredTrades: number;
        skippedPositions: number;
        skippedTrades: number;
      };

      alert(
        `복원 완료\n` +
        `포지션: 저장 ${result.restoredPositions}건 / 건너뜀 ${result.skippedPositions}건\n` +
        `거래:   저장 ${result.restoredTrades}건 / 건너뜀 ${result.skippedTrades}건`
      );

      void loadData();
    } catch (err) {
      console.error("JSON 복원 실패:", err);
      alert("JSON 복원에 실패했습니다. 파일 형식을 확인해 주세요.");
    } finally {
      setBackupLoading(false);
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
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
  // 정렬 헤더 — 포지션 테이블
  // ─────────────────────────────────────────
  function togglePosSort(col: PosCol) {
    setPosSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" }
    );
  }

  function PosSortIcon({ col }: { col: PosCol }) {
    if (posSort.col !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-0.5" />;
    return posSort.dir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-0.5 text-emerald-500" />
      : <ArrowDown className="h-3 w-3 ml-0.5 text-emerald-500" />;
  }

  function ThPosSort({ col, label, align = "right" }: { col: PosCol; label: string; align?: "left" | "right" }) {
    return (
      <th
        className={cn(
          "p-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors",
          align === "right" ? "text-right" : "text-left"
        )}
        onClick={() => togglePosSort(col)}
      >
        <span className={cn("inline-flex items-center gap-0.5", align === "right" ? "justify-end" : "")}>
          {label}
          <PosSortIcon col={col} />
        </span>
      </th>
    );
  }

  // ─────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <Tabs defaultValue="positions">
        <TabsList className="grid w-full grid-cols-3 bg-emerald-500/5 border">
          {[
            { value: "positions", label: "Open Positions",  count: positions.length },
            { value: "trades",    label: "Executed Trade", count: trades.length },
            { value: "account",   label: "Risk Management", count: undefined },
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
            탭 1: 포지션
        ══════════════════════════════════════ */}
        <TabsContent value="positions" className="mt-4 space-y-3">

          {/* ── 상단 툴바 ── */}
          {/* 파일 선택 input — hidden, backupFileRef로 제어 */}
          <input
            ref={backupFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleJsonRestore(e)}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{positions.length}종목 보유</p>
            <div className="flex gap-2">
              {/* 복원 버튼 — 파일 선택 input 클릭 트리거 */}
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => backupFileRef.current?.click()}
                disabled={backupLoading}
              >
                <CloudDownload className="h-3 w-3" />
                Restore
              </Button>
              {/* 백업 다운로드 */}
              <Button variant="outline" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void handleJsonBackup()}
                disabled={backupLoading}
              >
                <CloudUpload className="h-3 w-3" />
                Backup
              </Button>
              <Button variant="ghost" size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => void fetchPrices(positions)}
                disabled={priceLoading || positions.length === 0}
              >
                <RefreshCw className={cn("h-3 w-3", priceLoading && "animate-spin")} />
                현재가 조회
              </Button>
              <Button size="sm"
                className="h-7 text-xs gap-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={() => setAddPosOpen(true)}
              >
                <Plus className="h-3 w-3" />
                매수 추가
              </Button>
            </div>
          </div>

          {/* ── 계좌 총합 ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryCard label="총 매수금액" value={`${fmt(totalBuyAmount)}원`} />
            <SummaryCard
              label="총 평가금액"
              value={hasPrices ? `${fmt(totalEvalAmount)}원` : "-"}
              dim={!hasPrices}
            />
            <SummaryCard
              label="총 평가손익"
              value={hasPrices ? `${totalPosPL >= 0 ? "+" : ""}${fmt(totalPosPL)}원` : "-"}
              valueClass={hasPrices ? plColor(totalPosPL) : undefined}
              dim={!hasPrices}
            />
            <SummaryCard
              label="수익률"
              value={hasPrices ? fmtPct(totalPosPLPct) : "-"}
              valueClass={hasPrices ? plColor(totalPosPLPct) : undefined}
              dim={!hasPrices}
              sub={priceAt ? `${new Date(priceAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준` : undefined}
            />
          </div>

          {/* ── 포지션 테이블 ── */}
          {positions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              보유 포지션이 없습니다.
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] text-muted-foreground bg-muted/20">
                        <ThPosSort col="stockName"    label="종목"     align="left" />
                        <ThPosSort col="sector"       label="섹터"     align="left" />
                        <ThPosSort col="buyDate"      label="매수일" />
                        <ThPosSort col="avgPrice"     label="매수가" />
                        <ThPosSort col="quantity"     label="수량" />
                        <ThPosSort col="buyAmount"    label="매수금액" />
                        <th className="text-right p-2 font-medium">Unit</th>
                        <ThPosSort col="currentPrice" label="현재가" />
                        <ThPosSort col="profitLoss"   label="손익" />
                        <th className="p-2 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {sortPositions(enrichedPositions, posSort).map((p) => {
                        const hasCur = p.currentPrice > 0;
                        return (
                          <tr key={p.id} className="hover:bg-muted/30">
                            <td className="p-2 pl-3">
                              <div className="font-medium">{p.stockName}</div>
                              <div className="text-[10px] text-muted-foreground">{p.stockCode}</div>
                            </td>
                            <td className="p-2 text-muted-foreground">{p.sector || "-"}</td>
                            <td className="text-right p-2 text-muted-foreground tabular-nums">{p.buyDate ?? "-"}</td>
                            <td className="text-right p-2 tabular-nums">{fmt(p.avgPrice)}</td>
                            <td className="text-right p-2 tabular-nums">{p.quantity}</td>
                            <td className="text-right p-2 tabular-nums font-medium">{fmt(p.avgPrice * p.quantity)}</td>
                            <td className="text-right p-2 text-muted-foreground">{p.unit || "-"}</td>
                            {/* 현재가 — 로딩 중이면 스피너 */}
                            <td className="text-right p-2 tabular-nums">
                              {priceLoading ? (
                                <span className="text-muted-foreground text-[10px]">조회 중…</span>
                              ) : hasCur ? (
                                <span className="font-medium">{fmt(p.currentPrice)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            {/* 손익 (금액 + 수익률) */}
                            <td className="text-right p-2 pr-3 tabular-nums">
                              {hasCur ? (
                                <div>
                                  <div className={cn("font-semibold", plColor(p.profitLoss))}>
                                    {p.profitLoss >= 0 ? "+" : ""}{fmt(p.profitLoss)}
                                  </div>
                                  <div className={cn("text-[10px]", plColor(p.profitLossPct))}>
                                    {fmtPct(p.profitLossPct)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setEditPos(p)}
                                >
                                  편집
                                </Button>
                                <Button variant="outline" size="sm"
                                  className="h-6 text-[10px] px-2 border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                  onClick={() => setSellPos(p)}
                                >
                                  매도
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* 합계 행 */}
                    {hasPrices && (
                      <tfoot>
                        <tr className="border-t-2 bg-muted/30 text-xs font-semibold">
                          <td colSpan={5} className="p-2 pl-3 text-muted-foreground">합계</td>
                          <td className="text-right p-2 tabular-nums">{fmt(totalBuyAmount)}</td>
                          <td />
                          <td className="text-right p-2 tabular-nums">{fmt(totalEvalAmount)}</td>
                          <td className={cn("text-right p-2 pr-3 tabular-nums", plColor(totalPosPL))}>
                            {totalPosPL >= 0 ? "+" : ""}{fmt(totalPosPL)}
                            <div className={cn("text-[10px] font-medium", plColor(totalPosPLPct))}>
                              {fmtPct(totalPosPLPct)}
                            </div>
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════
            탭 2: 거래내역
        ══════════════════════════════════════ */}
        <TabsContent value="trades" className="mt-4 space-y-3">

          {/* ── 성과 요약 (테이블 상단) ── */}
          {summary && summary.totalTrades > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              <SummaryCard label="총 완료 거래" value={`${summary.totalTrades}건`}
                sub={`${summary.winCount}승 ${summary.lossCount}패`}
              />
              <SummaryCard label="승률"
                value={`${Math.round(summary.winRate * 100)}%`}
              />
              <SummaryCard label="누적 손익"
                value={`${tradeTotalPL >= 0 ? "+" : ""}${fmt(tradeTotalPL)}원`}
                valueClass={plColor(tradeTotalPL)}
              />
              <SummaryCard label="손익비 (PF)"
                value={isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : "∞"}
              />
              <SummaryCard label="평균 수익"
                value={`+${summary.avgWinPct.toFixed(1)}%`}
                valueClass="text-red-500"
              />
              <SummaryCard label="평균 손실"
                value={`-${summary.avgLossPct.toFixed(1)}%`}
                valueClass="text-blue-500"
              />
              <SummaryCard label="TPI"
                value={tpi !== null ? tpi.toFixed(2) : "-"}
                sub="winRate × (PF+1)"
                valueClass={tpi !== null ? (tpi >= 1 ? "text-red-500" : "text-blue-500") : undefined}
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
              {/* 복원/백업 — 포지션 탭과 동일한 API 사용 (positions+trades 동시 처리) */}
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
                onClick={() => setAddTradeOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Add Trade
              </Button>
            </div>
          </div>

          {/* ── 거래내역 테이블 ── */}
          {filteredTrades.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {trades.length === 0 ? "완료된 거래가 없습니다." : "필터 조건에 해당하는 거래가 없습니다."}
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
                                onClick={() => setEditTrade(t)}
                                className="text-[10px] text-muted-foreground hover:text-foreground"
                                title="편집"
                              >
                                ✏
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm(`[${t.stockName}] 거래를 삭제하시겠습니까?`)) return;
                                  await fetch(`/api/portfolio/education/trades?id=${t.id}`, { method: "DELETE" });
                                  void loadData();
                                }}
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
            탭 3: Risk Management
        ══════════════════════════════════════ */}
        <TabsContent value="account" className="mt-4 space-y-4">
          <RiskManagementPanel
            positions={[]}
            winRate={summary?.winRate ?? 0}
            storageKey={RISK_STORAGE_KEY}
            onConfigChange={setRiskConfig}
          />
          <PositionRiskTable config={riskConfig} storageKey={POSITION_TABLE_KEY} />
        </TabsContent>
      </Tabs>

      {/* ── 다이얼로그 ── */}
      <AddPositionDialog open={addPosOpen} onOpenChange={setAddPosOpen}
        onSaved={() => { void loadData(); }} />
      {editPos && (
        <EditPositionDialog
          open={!!editPos} position={editPos}
          apiBase="/api/portfolio/education/positions"
          onOpenChange={(open) => { if (!open) setEditPos(null); }}
          onSaved={() => { setEditPos(null); void loadData(); }}
        />
      )}
      {sellPos && (
        <SellPositionDialog open={!!sellPos} position={sellPos}
          onOpenChange={(open) => { if (!open) setSellPos(null); }}
          onSaved={() => { setSellPos(null); void loadData(); }}
        />
      )}
      <AddTradeDialog open={addTradeOpen} onOpenChange={setAddTradeOpen}
        onSaved={() => { void loadData(); }} />
      {editTrade && (
        <EditTradeDialog
          open={!!editTrade} trade={editTrade}
          apiBase="/api/portfolio/education/trades"
          onOpenChange={(open) => { if (!open) setEditTrade(null); }}
          onSaved={() => { setEditTrade(null); void loadData(); }}
        />
      )}
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
