"use client";

// ETF Mansfield RS 랭킹 테이블 클라이언트 컴포넌트
// recharts 대신 shadcn Table + Progress 조합으로 데이터 시각화
// 컬럼 클릭으로 정렬 토글 기능 내장

import { useState, useCallback } from "react";
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
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { EtfRsResult } from "@/types";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import { EtfDetailSheet } from "@/components/charts/EtfDetailSheet";

type SortKey = "rank" | "rsRaw" | "rsPercentile" | "rsRaw63" | "rsPercentile63";
type SortDir = "asc" | "desc";

interface EtfRsTableProps {
  data: EtfRsResult[];
  market: "kr" | "us";
}

/**
 * RS Percentile 값에 따른 색상 클래스 반환
 * 높을수록(강세) 초록, 낮을수록(약세) 빨강
 */
function getPercentileColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 75) return "text-green-500 font-semibold";
  if (pct >= 50) return "text-green-400";
  if (pct >= 25) return "text-orange-400";
  return "text-red-500";
}

/**
 * RS Raw 값에 따른 색상 클래스 반환
 * 양수(0 이상)이면 초록, 음수면 빨강
 */
function getRawColor(raw: number | null): string {
  if (raw === null) return "text-muted-foreground";
  if (raw > 5) return "text-green-500 font-semibold";
  if (raw > 0) return "text-green-400";
  if (raw > -5) return "text-orange-400";
  return "text-red-500";
}

export function EtfRsTable({ data, market }: EtfRsTableProps) {
  // 기본 정렬: rank 오름차순 (1위부터 표시)
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // 이름 클릭 시 Sheet 열기 — 선택된 row를 상태로 관리
  const [selectedRow, setSelectedRow] = useState<EtfRsResult | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 컬럼 헤더 클릭 시 정렬 토글
  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        // 같은 컬럼 재클릭 → 방향 반전
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        // 다른 컬럼 클릭 → 해당 컬럼 내림차순으로 시작
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  // 정렬 아이콘 렌더링 헬퍼
  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  // 정렬 적용 (null 값은 항상 최하위로)
  const sorted = [...data].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "rank") return mul * (a.rank - b.rank);

    // 정렬 키에 해당하는 값 추출
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (valA === null && valB === null) return 0;
    if (valA === null) return 1;
    if (valB === null) return -1;
    return mul * ((valA as number) - (valB as number));
  });

  return (
    <>
    {/* 종목 클릭 시 열리는 상세 Sheet */}
    <EtfDetailSheet
      row={selectedRow}
      market={market}
      open={sheetOpen}
      onOpenChange={setSheetOpen}
    />
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {/* 순위 컬럼 */}
            <TableHead className="w-14">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-0 font-semibold"
                onClick={() => handleSort("rank")}
              >
                순위 <SortIcon col="rank" />
              </Button>
            </TableHead>
            {/* 심볼 */}
            <TableHead className="w-24">심볼</TableHead>
            {/* ETF 이름 */}
            <TableHead>이름</TableHead>
            {/* 카테고리 */}
            <TableHead className="w-28">카테고리</TableHead>
            {/* RS Raw(63) — 실질 순위 결정 기준 */}
            <TableHead className="w-28 text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-0 font-semibold"
                onClick={() => handleSort("rsRaw63")}
              >
                RS Raw(63) <SortIcon col="rsRaw63" />
              </Button>
            </TableHead>
            {/* RS Percentile(63) — 단기 순위 */}
            <TableHead className="w-40">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-0 font-semibold"
                onClick={() => handleSort("rsPercentile63")}
              >
                RS%(63) <SortIcon col="rsPercentile63" />
              </Button>
            </TableHead>
            {/* RS Raw(252) — 장기 구조 보조 */}
            <TableHead className="w-28 text-right">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-0 font-semibold text-muted-foreground"
                onClick={() => handleSort("rsRaw")}
              >
                RS Raw(252) <SortIcon col="rsRaw" />
              </Button>
            </TableHead>
            {/* RS Percentile(252) — 장기 구조 보조 */}
            <TableHead className="w-40">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-0 font-semibold text-muted-foreground"
                onClick={() => handleSort("rsPercentile")}
              >
                RS%(252) <SortIcon col="rsPercentile" />
              </Button>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.symbol}>
              {/* 순위 배지 — 상위 5위는 강조 */}
              <TableCell>
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                    ${row.rank <= 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "text-muted-foreground"}`}
                >
                  {row.rank}
                </span>
              </TableCell>

              {/* 심볼 — 이름과 동일한 폰트 크기(text-sm)로 통일 */}
              <TableCell className="text-sm font-semibold">
                {row.symbol}
              </TableCell>

              {/* ETF 전체 이름 — 클릭 시 상세 Sheet 오픈 */}
              <TableCell className="text-sm">
                <button
                  className="text-left hover:underline hover:text-primary cursor-pointer transition-colors"
                  onClick={() => { setSelectedRow(row); setSheetOpen(true); }}
                >
                  {row.name}
                </button>
              </TableCell>

              {/* 카테고리 Badge */}
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {CATEGORY_LABELS[row.category] ?? row.category}
                </Badge>
              </TableCell>

              {/* RS Raw(63) — 실질 순위 결정 기준, 강조 표시 */}
              <TableCell className={`text-xs tabular-nums text-right font-semibold ${getRawColor(row.rsRaw63)}`}>
                {row.rsRaw63 !== null ? row.rsRaw63.toFixed(2) : "—"}
              </TableCell>

              {/* RS Percentile(63) — 단기 순위, Progress 바 + 숫자 */}
              <TableCell>
                <div className="flex items-center gap-2 min-w-32">
                  <Progress
                    value={row.rsPercentile63 ?? 0}
                    className="h-2 flex-1"
                  />
                  <span className={`text-xs tabular-nums w-10 text-right ${getPercentileColor(row.rsPercentile63)}`}>
                    {row.rsPercentile63 !== null ? `${row.rsPercentile63.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </TableCell>

              {/* RS Raw(252) — 장기 구조 보조, 흐리게 표시 */}
              <TableCell className={`text-xs tabular-nums text-right opacity-60 ${getRawColor(row.rsRaw)}`}>
                {row.rsRaw !== null ? row.rsRaw.toFixed(2) : "—"}
              </TableCell>

              {/* RS Percentile(252) — 장기 구조 보조 */}
              <TableCell className="opacity-60">
                <div className="flex items-center gap-2 min-w-32">
                  <Progress
                    value={row.rsPercentile ?? 0}
                    className="h-2 flex-1"
                  />
                  <span className={`text-xs tabular-nums w-10 text-right ${getPercentileColor(row.rsPercentile)}`}>
                    {row.rsPercentile !== null ? `${row.rsPercentile.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 데이터 없을 때 안내 */}
      {sorted.length === 0 && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          데이터가 없습니다.
        </div>
      )}
    </div>
    </>
  );
}
