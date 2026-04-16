"use client";

// P8-03 미국 섹터 탭 — 테마 ETF 40개 수익률 + RS강도 테이블
// /api/sector/us-returns 에서 데이터 fetch (일 1회 캐시)
//
// 컬럼: 카테고리 | ETF | 1M | 3M | 12M | RS강도(rsRaw63)
// 필터 탭: 전체 / 테마(china_tech·반도체·AI 등 32개) / 광역시장(broad·배당 등 8개)
// 주도 테마 판별: rsRaw63(SPY 대비 단기 상대강도) 내림차순 정렬
// 장기 약세(rsRaw<0) 행: opacity 50% 시각 구분 (Strategy 5 Step 3 동일 적용)
// 행 클릭 → EtfDetailSheet(market="us") 재활용

import { useState, useEffect } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, AlertCircle } from "lucide-react";
import { EtfDetailSheet } from "./EtfDetailSheet";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { UsSectorReturn } from "@/lib/etf/us-sector-returns";
import type { EtfRsResult } from "@/types";

// ─── 테마 카테고리 집합 — 광역시장과 구분 ────────────────────────────────────────
// 광역시장: broad_market, dividend, infrastructure, consumer, japan
// 나머지는 모두 테마로 분류
const THEME_CATEGORIES = new Set([
  "china_tech", "battery_ev", "ai_software", "semiconductor",
  "defense", "energy", "resources", "healthcare",
  "mobility", "clean_energy", "innovation",
]);

function isBroad(category: string): boolean {
  return !THEME_CATEGORIES.has(category);
}

// ─── 수익률 색상 ──────────────────────────────────────────────────────────────
function returnColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

/** 수익률 포맷: "+3.21%" / "-1.40%" / "—" */
function fmtReturn(value: number | null): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * RS강도(rsRaw63) 색상
 * 0 기준선 — 양수=SPY 아웃퍼폼, 음수=언더퍼폼
 */
function rsRawColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

/**
 * RS252 추세 인디케이터 (Strategy 5 Step 3 필터 기준)
 * rsRaw(252) > 0: ▲ 초록 — SPY 대비 장기 추세 확인
 * rsRaw(252) < 0: ▼ 빨강 — 장기 약세, 전략5 제외 대상
 */
function Rs252Badge({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value > 0) return <span className="text-emerald-500 dark:text-emerald-400 ml-1 text-[10px]">▲</span>;
  return <span className="text-red-500 dark:text-red-400 ml-1 text-[10px]">▼</span>;
}

// ─── 카테고리 필터 탭 ─────────────────────────────────────────────────────────
type CategoryFilter = "all" | "theme" | "broad";

const FILTER_TABS: { value: CategoryFilter; label: string }[] = [
  { value: "all",   label: "전체" },
  { value: "theme", label: "테마" },
  { value: "broad", label: "광역시장" },
];

// ─── 정렬 키 — rsRaw63이 주도 테마 기본 정렬 기준 ────────────────────────────
type SortKey = "return1M" | "return3M" | "return12M" | "rsRaw63";

interface SortState {
  key: SortKey;
  asc: boolean;
}

/** UsSectorReturn → EtfRsResult 변환 (EtfDetailSheet 재활용) */
function toEtfRsResult(row: UsSectorReturn): EtfRsResult {
  return {
    symbol:               row.symbol,
    name:                 row.name,
    category:             row.category,
    rsRaw:                row.rsRaw,
    rsPercentile:         row.rsPercentile,
    rsRaw63:              row.rsRaw63,
    rsPercentile63:       row.rsPercentile63,
    rank:                 row.rank,
    rsRawHistory:         row.rsRawHistory,
    rsRawHistory63:       row.rsRawHistory63,
    rsAccelerationHistory: row.rsAccelerationHistory,
    adx:             row.adx,
    compositeSignal: row.compositeSignal,
    adxHistory:      row.adxHistory,
  };
}

// ─── 정렬 아이콘 ──────────────────────────────────────────────────────────────
function SortIcon({ sortKey, current }: { sortKey: SortKey; current: SortState }) {
  if (current.key !== sortKey)
    return <ArrowUpDown className="inline h-3 w-3 ml-1 text-muted-foreground/50" />;
  return current.asc
    ? <ArrowUp className="inline h-3 w-3 ml-1 text-primary" />
    : <ArrowDown className="inline h-3 w-3 ml-1 text-primary" />;
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export function UsSectorTable() {
  const [rows, setRows] = useState<UsSectorReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  // 기본 정렬: rsRaw63 내림차순 — SPY 대비 단기 강도 기준 주도 테마 순
  const [sort, setSort] = useState<SortState>({ key: "rsRaw63", asc: false });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<UsSectorReturn | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/sector/us-returns");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setRows(json.data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  function handleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, asc: !prev.asc } : { key, asc: false }
    );
  }

  // 카테고리 필터 + 정렬 적용
  const filtered = rows.filter((r) => {
    if (categoryFilter === "all")   return true;
    if (categoryFilter === "theme") return THEME_CATEGORIES.has(r.category);
    return isBroad(r.category); // "broad"
  });
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    return sort.asc ? av - bv : bv - av;
  });

  function handleRowClick(row: UsSectorReturn) {
    setSelectedRow(row);
    setSheetOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">미국 섹터 데이터 로드 중...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>데이터를 불러오지 못했습니다: {error}</span>
      </div>
    );
  }

  // 탭별 카운트 — 전체/테마/광역시장
  const themeCount = rows.filter((r) => THEME_CATEGORIES.has(r.category)).length;
  const broadCount = rows.filter((r) => isBroad(r.category)).length;

  return (
    <>
      {/* ── 카테고리 필터 탭 ──────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-3">
        {FILTER_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setCategoryFilter(value)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              categoryFilter === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {value === "all"   && ` (${rows.length})`}
            {value === "theme" && ` (${themeCount})`}
            {value === "broad" && ` (${broadCount})`}
          </button>
        ))}
        {/* RS강도 범례 안내 — SPY 기준임을 명시 */}
        <span className="ml-2 text-[10px] text-muted-foreground self-center">
          RS강도: SPY 대비 상대강도 · ▲장기추세확인 ▼장기약세
        </span>
      </div>

      {/* ── 섹터 테이블 ───────────────────────────────────────────────────── */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {/* 카테고리 배지 컬럼 */}
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[110px]">
                카테고리
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                ETF
              </th>
              {(
                [
                  ["return1M",  "1M"],
                  ["return3M",  "3M"],
                  ["return12M", "12M"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors w-[80px]"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon sortKey={key} current={sort} />
                </th>
              ))}
              {/* RS강도 컬럼 — rsRaw63 기준 정렬, RS252 인디케이터 포함 */}
              <th
                className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors w-[100px]"
                onClick={() => handleSort("rsRaw63")}
              >
                RS강도
                <SortIcon sortKey="rsRaw63" current={sort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              // Strategy 5 Step 3: RS252 < 0인 행은 SPY 장기 약세 — 시각적으로 구분
              const isLongTermWeak = row.rsRaw !== null && row.rsRaw < 0;

              return (
                <tr
                  key={row.symbol}
                  className={`border-b last:border-0 cursor-pointer transition-colors ${
                    isLongTermWeak
                      ? "opacity-50 hover:opacity-70 hover:bg-muted/20"
                      : "hover:bg-muted/30"
                  }`}
                  onClick={() => handleRowClick(row)}
                >
                  {/* 카테고리 배지 */}
                  <td className="px-4 py-3">
                    <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400">
                      {CATEGORY_LABELS[row.category] ?? row.category}
                    </span>
                  </td>
                  {/* ETF 이름 + 심볼 */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm leading-tight">{row.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {row.symbol}
                    </div>
                  </td>
                  {/* 수익률 3개 컬럼 */}
                  <td className={`px-4 py-3 text-right tabular-nums text-xs ${returnColor(row.return1M)}`}>
                    {fmtReturn(row.return1M)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs ${returnColor(row.return3M)}`}>
                    {fmtReturn(row.return3M)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs ${returnColor(row.return12M)}`}>
                    {fmtReturn(row.return12M)}
                  </td>
                  {/* RS강도: rsRaw63 수치 + RS252 추세 인디케이터 */}
                  <td className={`px-4 py-3 text-right tabular-nums text-xs ${rsRawColor(row.rsRaw63)}`}>
                    {row.rsRaw63 !== null
                      ? `${row.rsRaw63 >= 0 ? "+" : ""}${row.rsRaw63.toFixed(2)}`
                      : "—"}
                    <Rs252Badge value={row.rsRaw} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            미국 섹터 데이터가 없습니다.
          </div>
        )}
      </div>

      {/* 행 클릭 시 상세 Sheet — EtfDetailSheet(market="us") 재활용 */}
      <EtfDetailSheet
        row={selectedRow ? toEtfRsResult(selectedRow) : null}
        market="us"
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
