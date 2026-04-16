"use client";

// P8-02 한국 섹터 탭 — 섹터별 대표 ETF 수익률 테이블
// /api/sector/kr-returns 에서 데이터 fetch (일 1회 캐시)
// 컬럼: 섹터 | 대표 ETF | 1M | 3M | 12M | RS강도(rsRaw63)
// 주도섹터 판별: RS전략5 기반 — rsRaw63 내림차순 정렬, rsRaw(252)<0 행 시각적 구분
// 레이어 필터: 전체 / 전통업종(GICS) / 성장테마(한국 고유)
// 행 클릭 → EtfDetailSheet (기존 컴포넌트 재활용)

import { useState, useEffect } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, AlertCircle } from "lucide-react";
import { EtfDetailSheet } from "./EtfDetailSheet";
import type { KrSectorReturn } from "@/lib/etf/sector-returns";
import type { EtfRsResult } from "@/types";

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
 * 0 기준선 — 양수=KOSPI 아웃퍼폼, 음수=언더퍼폼
 */
function rsRawColor(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

/**
 * RS252 추세 인디케이터 (Strategy 5 Step 3 필터 기준)
 * rsRaw(252) > 0: ▲ 초록 — 장기 추세 확인, 주도 섹터 후보
 * rsRaw(252) < 0: ▼ 빨강 — 장기 약세, 전략5 제외 대상
 */
function Rs252Badge({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value > 0) return <span className="text-emerald-500 dark:text-emerald-400 ml-1 text-[10px]">▲</span>;
  return <span className="text-red-500 dark:text-red-400 ml-1 text-[10px]">▼</span>;
}

// ─── 레이어 필터 타입 ──────────────────────────────────────────────────────────
type LayerFilter = "all" | "layer1" | "layer2" | "index";

const LAYER_TABS: { value: LayerFilter; label: string }[] = [
  { value: "all",    label: "전체" },
  { value: "layer1", label: "전통업종" },
  { value: "layer2", label: "성장테마" },
  { value: "index",  label: "지수 검증" },
];

// ─── 정렬 키 타입 — rsRaw63이 주도섹터 기본 정렬 기준 ─────────────────────────
type SortKey = "return1M" | "return3M" | "return12M" | "rsRaw63";

interface SortState {
  key: SortKey;
  asc: boolean;
}

/** KrSectorReturn → EtfRsResult 변환 (EtfDetailSheet 재활용용) */
function toEtfRsResult(row: KrSectorReturn): EtfRsResult {
  return {
    symbol: row.symbol,
    name: row.name,
    category: row.category,
    rsRaw: row.rsRaw,
    rsPercentile: row.rsPercentile,
    rsRaw63: row.rsRaw63,
    rsPercentile63: row.rsPercentile63,
    rank: row.rank,
    rsRawHistory: row.rsRawHistory,
    rsRawHistory63: row.rsRawHistory63,
    rsAccelerationHistory: row.rsAccelerationHistory,
    // calcEtfRs에서 조인된 ADX 값을 그대로 전달
    adx: row.adx,
    compositeSignal: row.compositeSignal,
    adxHistory: row.adxHistory,
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
export function KrSectorTable() {
  const [rows, setRows] = useState<KrSectorReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [layerFilter, setLayerFilter] = useState<LayerFilter>("all");

  // 기본 정렬: rsRaw63 내림차순 (Strategy 5 Step 2 — 단기 모멘텀 기준 정렬)
  const [sort, setSort] = useState<SortState>({ key: "rsRaw63", asc: false });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<KrSectorReturn | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/sector/kr-returns");
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

  // 레이어 필터 + 정렬 적용
  // "all" = 섹터 ETF만 (index 제외) — 지수 ETF는 "지수 검증" 탭 전용
  const filtered = rows.filter((r) => {
    if (layerFilter === "all") return r.sectorLayer !== "index";
    return r.sectorLayer === layerFilter;
  });
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    return sort.asc ? av - bv : bv - av;
  });

  function handleRowClick(row: KrSectorReturn) {
    setSelectedRow(row);
    setSheetOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">섹터 데이터 로드 중...</span>
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

  return (
    <>
      {/* ── 레이어 필터 탭 ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-3">
        {LAYER_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setLayerFilter(value)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              layerFilter === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {value === "all"    && ` (${rows.filter(r => r.sectorLayer !== "index").length})`}
            {value === "layer1" && ` (${rows.filter(r => r.sectorLayer === "layer1").length})`}
            {value === "layer2" && ` (${rows.filter(r => r.sectorLayer === "layer2").length})`}
          </button>
        ))}
        {/* RS강도 컬럼 범례 안내 */}
        <span className="ml-2 text-[10px] text-muted-foreground self-center">
          RS강도: KOSPI 대비 상대강도 · ▲장기추세확인 ▼장기약세
        </span>
      </div>

      {/* ── 섹터 테이블 ───────────────────────────────────────────────────── */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground w-[130px]">
                섹터
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                대표 ETF
              </th>
              {(
                [
                  ["return1M", "1M"],
                  ["return3M", "3M"],
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
              // Strategy 5 Step 3: RS252 < 0인 행은 장기 약세 — 시각적으로 구분
              // index 레이어(벤치마크 ETF)는 해당 없음
              const isLongTermWeak = row.sectorLayer !== "index" && row.rsRaw !== null && row.rsRaw < 0;
              const isIndex = row.sectorLayer === "index";

              return (
                <tr
                  key={row.symbol}
                  className={`border-b last:border-0 cursor-pointer transition-colors ${
                    isIndex
                      ? "bg-muted/10 hover:bg-muted/20"
                      : isLongTermWeak
                        ? "opacity-50 hover:opacity-70 hover:bg-muted/20"
                        : "hover:bg-muted/30"
                  }`}
                  onClick={() => handleRowClick(row)}
                >
                  {/* 섹터 그룹명 + 레이어 배지 */}
                  <td className="px-4 py-3">
                    <div className="text-xs font-medium text-muted-foreground leading-tight">
                      {row.sectorGroup}
                    </div>
                    {/* 지수 ETF: 벤치마크 설명, 섹터 ETF: 레이어 배지 */}
                    {isIndex ? (
                      <span className="text-[9px] font-medium mt-0.5 inline-block text-amber-500 dark:text-amber-400">
                        벤치마크
                      </span>
                    ) : layerFilter === "all" && (
                      <span className={`text-[9px] font-medium mt-0.5 inline-block ${
                        row.sectorLayer === "layer1"
                          ? "text-blue-500 dark:text-blue-400"
                          : "text-purple-500 dark:text-purple-400"
                      }`}>
                        {row.sectorLayer === "layer1" ? "GICS" : "테마"}
                      </span>
                    )}
                  </td>
                  {/* ETF 이름 + 코드 */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm leading-tight">{row.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {row.symbol} · {row.exchange}
                    </div>
                  </td>
                  {/* 수익률 */}
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
            섹터 데이터가 없습니다.
          </div>
        )}
      </div>

      <EtfDetailSheet
        row={selectedRow ? toEtfRsResult(selectedRow) : null}
        market="kr"
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
