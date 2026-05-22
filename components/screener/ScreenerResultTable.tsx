"use client";

// 스크리너 결과 테이블 클라이언트 컴포넌트
// 클라이언트 사이드 필터링 + 컬럼 정렬 + CSV 내보내기 내장

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown, Check, X, CloudDownload } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { ScreenerResult, ScreenerFilters } from "@/types";

interface ScreenerResultTableProps {
  data: ScreenerResult[];
  filters: ScreenerFilters;
  market: "kr" | "us";
}

type SortKey = "rsRank" | "rsPercentile" | "rsRaw" | "momentumRank" | "momentumScore" | "category";
type SortDir = "asc" | "desc";

// ────────────────────────────────────────────────────────────────
// 클라이언트 사이드 필터 함수 (테스트 파일의 applyFilters와 동일 로직)
// ────────────────────────────────────────────────────────────────

export function applyScreenerFilters(data: ScreenerResult[], filters: ScreenerFilters): ScreenerResult[] {
  return data.filter((r) => {
    // RS Percentile 임계값 (null은 항상 제외)
    if (r.rsPercentile === null || r.rsPercentile < filters.rsPercentileMin) return false;
    // 모멘텀 Top N (0 = 비활성)
    if (filters.topNMomentum > 0) {
      if (r.momentumRank === null || r.momentumRank > filters.topNMomentum) return false;
    }
    // MA 필터 (true일 때만 해당 MA 위에 있어야 함, null이면 제외)
    if (filters.requireMa10 && r.aboveMa10 !== true) return false;
    if (filters.requireMa20 && r.aboveMa20 !== true) return false;
    if (filters.requireMa50 && r.aboveMa50 !== true) return false;
    // 카테고리 ("" = 전체)
    if (filters.categoryFilter !== "" && r.category !== filters.categoryFilter) return false;
    return true;
  });
}

// ────────────────────────────────────────────────────────────────
// CSV 내보내기
// ────────────────────────────────────────────────────────────────

function exportToCsv(data: ScreenerResult[], market: string) {
  const headers = [
    "RS순위", "심볼", "이름", "카테고리",
    "RS_Percentile", "RS_Raw",
    "모멘텀순위", "모멘텀점수", "M3(3개월)", "M6(6개월)", "M12(12개월)",
    "MA10위", "MA20위", "MA50위", "현재가",
  ];

  const rows = data.map((r) => [
    r.rsRank,
    r.symbol,
    r.name,
    CATEGORY_LABELS[r.category] ?? r.category,
    r.rsPercentile ?? "",
    r.rsRaw ?? "",
    r.momentumRank ?? "",
    r.momentumScore ?? "",
    r.momentumPeriods?.m3 ?? "",
    r.momentumPeriods?.m6 ?? "",
    r.momentumPeriods?.m12 ?? "",
    r.aboveMa10 === null ? "" : r.aboveMa10 ? "Y" : "N",
    r.aboveMa20 === null ? "" : r.aboveMa20 ? "Y" : "N",
    r.aboveMa50 === null ? "" : r.aboveMa50 ? "Y" : "N",
    r.currentPrice ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // BOM 추가 — Excel에서 한글 깨짐 방지
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `screener-${market}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────────
// 색상 헬퍼
// ────────────────────────────────────────────────────────────────

function getPercentileColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 75) return "text-green-500 font-semibold";
  if (pct >= 50) return "text-green-400";
  if (pct >= 25) return "text-orange-400";
  return "text-red-500";
}

function getRawColor(raw: number | null): string {
  if (raw === null) return "text-muted-foreground";
  if (raw > 5) return "text-green-500 font-semibold";
  if (raw > 0) return "text-green-400";
  if (raw > -5) return "text-orange-400";
  return "text-red-500";
}

function getMomentumColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score > 1) return "text-green-500 font-semibold";
  if (score > 0) return "text-green-400";
  if (score > -1) return "text-orange-400";
  return "text-red-500";
}

// MA 위/아래 아이콘
function MaIcon({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-muted-foreground text-xs">—</span>;
  return value
    ? <Check className="h-3.5 w-3.5 text-green-500 mx-auto" />
    : <X className="h-3.5 w-3.5 text-red-400 mx-auto" />;
}

// ────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────────

export function ScreenerResultTable({ data, filters, market }: ScreenerResultTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rsRank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // 필터 적용 (메모이제이션으로 불필요한 재계산 방지)
  const filtered = useMemo(() => applyScreenerFilters(data, filters), [data, filters]);

  // 컬럼 클릭 정렬 토글
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rsRank" || key === "momentumRank" ? "asc" : "desc");
    }
  };

  // 정렬 적용 (null은 항상 최하위)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      const va = a[sortKey as keyof ScreenerResult];
      const vb = b[sortKey as keyof ScreenerResult];
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "string" && typeof vb === "string") return mul * va.localeCompare(vb);
      return mul * (Number(va) - Number(vb));
    });
  }, [filtered, sortKey, sortDir]);

  // 정렬 아이콘
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const SortBtn = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto px-0 font-semibold text-xs"
      onClick={() => handleSort(col)}
    >
      {children}<SortIcon col={col} />
    </Button>
  );

  return (
    <div className="space-y-2">
      {/* 결과 건수 + CSV 다운로드 버튼 */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          결과 <span className="font-semibold text-foreground">{sorted.length}</span>건
          {data.length !== sorted.length && ` / 전체 ${data.length}종`}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => exportToCsv(sorted, market)}
          disabled={sorted.length === 0}
        >
          <CloudDownload className="h-3 w-3" />
          CSV 다운로드
        </Button>
      </div>

      {/* 결과 테이블 */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14"><SortBtn col="rsRank">RS순위</SortBtn></TableHead>
              <TableHead className="w-20">심볼</TableHead>
              <TableHead>이름</TableHead>
              <TableHead className="w-24"><SortBtn col="category">카테고리</SortBtn></TableHead>
              <TableHead className="w-36"><SortBtn col="rsPercentile">RS %ile</SortBtn></TableHead>
              <TableHead className="w-20"><SortBtn col="rsRaw">RS Raw</SortBtn></TableHead>
              <TableHead className="w-16"><SortBtn col="momentumRank">Mom순위</SortBtn></TableHead>
              <TableHead className="w-20"><SortBtn col="momentumScore">Mom점수</SortBtn></TableHead>
              <TableHead className="w-12 text-center">MA10↑</TableHead>
              <TableHead className="w-12 text-center">MA20↑</TableHead>
              <TableHead className="w-12 text-center">MA50↑</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={`${row.symbol}-${market}`}>
                {/* RS 순위 */}
                <TableCell>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                    ${row.rsRank <= 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "text-muted-foreground"}`}>
                    {row.rsRank}
                  </span>
                </TableCell>

                {/* 심볼 */}
                <TableCell className="text-xs font-semibold">{row.symbol}</TableCell>

                {/* 이름 */}
                <TableCell className="text-xs max-w-[200px] truncate" title={row.name}>{row.name}</TableCell>

                {/* 카테고리 */}
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {CATEGORY_LABELS[row.category] ?? row.category}
                  </Badge>
                </TableCell>

                {/* RS Percentile (Progress 바) */}
                <TableCell>
                  <div className="flex items-center gap-1.5 min-w-28">
                    <Progress value={row.rsPercentile ?? 0} className="h-1.5 flex-1" />
                    <span className={`text-xs tabular-nums w-10 text-right ${getPercentileColor(row.rsPercentile)}`}>
                      {row.rsPercentile !== null ? `${row.rsPercentile.toFixed(1)}%` : "—"}
                    </span>
                  </div>
                </TableCell>

                {/* RS Raw */}
                <TableCell className={`tabular-nums text-xs ${getRawColor(row.rsRaw)}`}>
                  {row.rsRaw !== null ? row.rsRaw.toFixed(2) : "—"}
                </TableCell>

                {/* 모멘텀 순위 */}
                <TableCell className="text-xs text-center tabular-nums">
                  {row.momentumRank !== null
                    ? <span className="font-semibold">{row.momentumRank}</span>
                    : <span className="text-muted-foreground">—</span>
                  }
                </TableCell>

                {/* 모멘텀 점수 */}
                <TableCell className={`tabular-nums text-xs ${getMomentumColor(row.momentumScore)}`}>
                  {row.momentumScore !== null ? row.momentumScore.toFixed(3) : "—"}
                </TableCell>

                {/* MA10 위 */}
                <TableCell className="text-center"><MaIcon value={row.aboveMa10} /></TableCell>

                {/* MA20 위 */}
                <TableCell className="text-center"><MaIcon value={row.aboveMa20} /></TableCell>

                {/* MA50 위 */}
                <TableCell className="text-center"><MaIcon value={row.aboveMa50} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {sorted.length === 0 && (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            필터 조건에 맞는 종목이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
