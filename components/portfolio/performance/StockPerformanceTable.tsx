"use client";

/**
 * 종목별 성과 테이블
 *
 * 엑셀 파싱 데이터를 기반으로 KR/US 개별 종목 성과 표시
 * - 전량 매도 완료 종목: "매도완료" 뱃지로 표시, 흐리게 처리
 * - 현재 보유 종목: 정상 표시
 * - 컬럼: 종목명 / ticker / 월별 MoM% / 누적수익률
 * - 컬럼 헤더 클릭으로 정렬 전환 (종목명·상태·누적 수익률)
 */

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
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type {
  StockMonthPerformance,
  PerformanceMonthPoint,
  BenchmarkMonthPoint,
} from "@/types/portfolio";

interface Props {
  stocks: StockMonthPerformance[];
  currency: "KRW" | "USD";
  /** 포트폴리오/계좌 합계 행 — 상단에 별도 표시 */
  portfolioMonths?: PerformanceMonthPoint[];
  /** 벤치마크 데이터 — 초과 종목 하이라이트 기준 */
  benchmarkData?: BenchmarkMonthPoint[];
}

/** 수익률 표시용 셀 스타일 */
function PctCell({ pct }: { pct: number | undefined }) {
  if (pct === undefined) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  const color = pct > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : pct < 0
    ? "text-red-500 dark:text-red-400"
    : "text-muted-foreground";

  return (
    <span className={`font-medium tabular-nums ${color}`}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

/** "YYYY-MM" → "M월" */
function toShortLabel(period: string): string {
  return `${parseInt(period.slice(5))}월`;
}

/** 현재 진행 중인 월 (YYYY-MM) — 월말 종가 미확정 상태 표시용 */
const CURRENT_PERIOD = new Date().toISOString().slice(0, 7);

// ─────────────────────────────────────────
// 정렬 상태 타입
// ─────────────────────────────────────────
type SortKey = "stockName" | "status" | "cumPct";
type SortDir = "asc" | "desc";

/**
 * 종목 보유 기간에 맞춘 벤치마크 누적 수익률 계산 (기간 매칭)
 *
 * 문제: 벤치마크 cumReturnPct는 Dec 2025 기준 누적값이므로,
 *       Feb 2026에 매수한 종목과 비교하면 Jan 2026 수익이 분자에 포함되어 불공정
 *
 * 해결: 종목의 첫 거래월(startPeriod) 직전 말 종가를 새 기준점으로 삼아
 *       기하학적으로 재계산
 *
 * 공식: benchCum_adj = (1 + benchCum_last/100) / (1 + benchCum_beforeStart/100) - 1
 *
 * @param benchmarkData - Dec 2025 기준 벤치마크 월별 데이터
 * @param startPeriod   - 종목의 첫 거래월 ("YYYY-MM")
 * @param lastPeriod    - 비교 기준 마지막 월 ("YYYY-MM")
 * @returns 기간 매칭 벤치마크 누적 수익률 (%), 데이터 없으면 undefined
 */
function getPeriodMatchedBenchmarkCum(
  benchmarkData: BenchmarkMonthPoint[],
  startPeriod: string,
  lastPeriod: string
): number | undefined {
  // period → cumReturnPct 맵
  const benchMap = new Map(benchmarkData.map((b) => [b.period, b.cumReturnPct]));

  // 마지막 월의 벤치마크 누적 수익률
  const benchCumAtLast = benchMap.get(lastPeriod);
  if (benchCumAtLast === undefined) return undefined;

  // 종목 시작 직전 월의 벤치마크 누적 수익률
  // startPeriod가 Jan 2026이면 직전월은 Dec 2025 = 0% (기준점)
  const sortedPeriods = benchmarkData.map((b) => b.period).sort();
  const startIdx = sortedPeriods.indexOf(startPeriod);
  // startPeriod가 벤치마크 범위 밖(Jan 2026 이전)이면 Dec 2025 = 0%
  const prevCum = startIdx > 0 ? (benchMap.get(sortedPeriods[startIdx - 1]) ?? 0) : 0;

  // 기하학적 기간 매칭 수익률
  return Math.round(
    ((1 + benchCumAtLast / 100) / (1 + prevCum / 100) - 1) * 10000
  ) / 100;
}

export function StockPerformanceTable({ stocks, currency, portfolioMonths, benchmarkData }: Props) {
  // 기본 정렬: 누적 수익률 내림차순 (성과 좋은 종목이 위)
  const [sortKey, setSortKey] = useState<SortKey>("cumPct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 컬럼 헤더 클릭 — 같은 키면 방향 전환, 다른 키면 내림차순 초기화
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // 정렬 아이콘
  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey)
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 ml-0.5 inline-block" />;
    return sortDir === "desc"
      ? <ArrowDown className="h-3 w-3 text-foreground ml-0.5 inline-block" />
      : <ArrowUp className="h-3 w-3 text-foreground ml-0.5 inline-block" />;
  }

  // 종목 목록 정렬 (포트폴리오 합계 행은 항상 최상단 고정)
  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      if (sortKey === "stockName") {
        const cmp = a.stockName.localeCompare(b.stockName, "ko");
        return sortDir === "desc" ? -cmp : cmp;
      }
      if (sortKey === "status") {
        // 보유중(false) → 매도완료(true) 순, desc면 반대
        const av = a.fullyExited ? 1 : 0;
        const bv = b.fullyExited ? 1 : 0;
        return sortDir === "desc" ? av - bv : bv - av;
      }
      if (sortKey === "cumPct") {
        const av = a.months[a.months.length - 1]?.cumPct ?? -Infinity;
        const bv = b.months[b.months.length - 1]?.cumPct ?? -Infinity;
        return sortDir === "desc" ? bv - av : av - bv;
      }
      return 0;
    });
  }, [stocks, sortKey, sortDir]);

  if (stocks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        종목 데이터가 없습니다
      </div>
    );
  }

  // 전체 기간 목록 수집 (모든 종목 + 포트폴리오 행의 period 합집합, 정렬)
  const allPeriods = Array.from(
    new Set([
      ...stocks.flatMap((s) => s.months.map((m) => m.period)),
      ...(portfolioMonths?.map((m) => m.period) ?? []),
    ])
  ).sort();

  // 데이터 전체 기간 범위 (누적 수익률 컬럼 헤더에 표시)
  // 각 종목의 cumPct는 종목 첫 매수월부터 계산되므로 "보유기간별" 기준임을 명시
  const dataStartPeriod = allPeriods[0] ?? "";
  const dataEndPeriod = allPeriods[allPeriods.length - 1] ?? "";

  // 벤치마크 월별 MoM% 맵 (period → momReturnPct) — 월별 셀 하이라이트용
  const benchMoMMap = new Map(
    benchmarkData?.map((b) => [b.period, b.momReturnPct]) ?? []
  );

  // 포트폴리오 월별 성과 맵
  const portfolioMap = new Map(
    portfolioMonths?.map((m) => [m.period, m]) ?? []
  );

  return (
    <div className="overflow-x-auto rounded-lg border">
      {/* text-xs 통일 + 컬럼 폭 고정 → 데이터 양·종목명 길이에 무관하게 일정한 레이아웃 */}
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {/* 종목명: sticky left + 클릭 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-foreground w-[140px] min-w-[140px] max-w-[140px] sticky left-0 bg-muted/30 cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("stockName")}
            >
              <span className="flex items-center">
                종목명
                <SortIcon col="stockName" />
              </span>
            </TableHead>
            <TableHead className="py-2 text-xs font-semibold text-foreground w-[76px] min-w-[76px]">
              {currency === "KRW" ? "종목코드" : "심볼"}
            </TableHead>
            {/* 상태: 보유중/매도완료 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-foreground w-[64px] min-w-[64px] text-center cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("status")}
            >
              <span className="flex items-center justify-center">
                상태
                <SortIcon col="status" />
              </span>
            </TableHead>
            {/* 월별 MoM% — 모든 열 동일 폭으로 고정 */}
            {allPeriods.map((period) => (
              <TableHead
                key={period}
                className={`py-2 text-xs font-semibold text-right w-[76px] min-w-[76px] ${
                  period === CURRENT_PERIOD
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-foreground"
                }`}
              >
                {toShortLabel(period)} MoM%
                {period === CURRENT_PERIOD && (
                  <span className="block text-[9px] font-normal text-blue-500/70 leading-none">
                    진행중
                  </span>
                )}
              </TableHead>
            ))}
            {/* 누적 수익률 — 클릭 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-foreground text-right w-[96px] min-w-[96px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("cumPct")}
            >
              <span className="flex items-center justify-end">
                누적 수익률
                <SortIcon col="cumPct" />
              </span>
              {dataStartPeriod && dataEndPeriod && (
                <span className="block text-[9px] font-normal text-muted-foreground leading-tight mt-0.5 text-right">
                  {dataStartPeriod} ~ {dataEndPeriod}
                </span>
              )}
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* ── 포트폴리오/계좌 합계 행 (상단 고정) ── */}
          {portfolioMonths && portfolioMonths.length > 0 && (() => {
            const lastP = portfolioMonths[portfolioMonths.length - 1];
            return (
              <TableRow className="bg-blue-50/60 dark:bg-blue-950/25 border-b-2 border-border font-medium">
                <TableCell className="py-2 text-xs font-semibold sticky left-0 bg-blue-50/60 dark:bg-blue-950/25 text-blue-700 dark:text-blue-300 max-w-[140px] truncate">
                  포트폴리오 합계
                </TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground tabular-nums">—</TableCell>
                <TableCell className="py-2 text-center">
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 text-blue-600 dark:text-blue-400 border-blue-400/40"
                  >
                    합계
                  </Badge>
                </TableCell>
                {allPeriods.map((period) => {
                  const p = portfolioMap.get(period);
                  const benchMoM = benchMoMMap.get(period);
                  const beatsMonth =
                    p?.momPct !== undefined &&
                    benchMoM !== undefined &&
                    p.momPct > benchMoM;
                  return (
                    <TableCell
                      key={period}
                      className={`py-2 text-xs text-right tabular-nums ${
                        beatsMonth ? "bg-amber-50 dark:bg-amber-950/30" : ""
                      }`}
                    >
                      <PctCell pct={p?.momPct} />
                    </TableCell>
                  );
                })}
                <TableCell className="py-2 text-xs text-right font-semibold tabular-nums">
                  <PctCell pct={lastP?.cumPct} />
                </TableCell>
              </TableRow>
            );
          })()}

          {/* ── 개별 종목 행 (정렬 적용) ── */}
          {sortedStocks.map((stock) => {
            const monthMap = new Map(stock.months.map((m) => [m.period, m]));
            const lastMonth = stock.months[stock.months.length - 1];
            const startPeriod = stock.months[0]?.period;

            const matchedBenchCum =
              benchmarkData && startPeriod && lastMonth
                ? getPeriodMatchedBenchmarkCum(
                    benchmarkData,
                    startPeriod,
                    lastMonth.period
                  )
                : undefined;

            const beatsCumBenchmark =
              !stock.fullyExited &&
              lastMonth !== undefined &&
              matchedBenchCum !== undefined &&
              lastMonth.cumPct > matchedBenchCum;

            return (
              <TableRow
                key={`${stock.market}-${stock.ticker}-${stock.stockName}`}
                className={stock.fullyExited ? "opacity-50" : ""}
              >
                {/* 종목명 — 고정 폭, 넘치면 말줄임 + 호버로 전체 이름 확인 */}
                <TableCell
                  className="py-2 text-xs font-medium sticky left-0 bg-background w-[140px] max-w-[140px]"
                  title={stock.stockName}
                >
                  <span className="block truncate">{stock.stockName}</span>
                </TableCell>

                <TableCell className="py-2 text-xs text-muted-foreground tabular-nums">
                  {stock.ticker}
                </TableCell>

                <TableCell className="py-2 text-center">
                  {stock.fullyExited ? (
                    <Badge variant="secondary" className="text-[10px] py-0">
                      매도완료
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 text-emerald-600 border-emerald-500/30"
                    >
                      보유중
                    </Badge>
                  )}
                </TableCell>

                {/* 월별 MoM% — tabular-nums로 숫자 정렬 통일 */}
                {allPeriods.map((period) => {
                  const monthData = monthMap.get(period);
                  const benchMoM  = benchMoMMap.get(period);
                  const beatsMonth =
                    monthData?.momPct !== undefined &&
                    benchMoM !== undefined &&
                    monthData.momPct > benchMoM;
                  return (
                    <TableCell
                      key={period}
                      className={`py-2 text-xs text-right tabular-nums ${
                        beatsMonth ? "bg-amber-50 dark:bg-amber-950/30" : ""
                      }`}
                    >
                      <PctCell pct={monthData?.momPct} />
                    </TableCell>
                  );
                })}

                {/* 누적 수익률 + 벤치마크 비교 — flex-col로 2줄이지만 leading-none으로 높이 최소화 */}
                <TableCell
                  className={`py-2 text-xs text-right font-semibold tabular-nums ${
                    beatsCumBenchmark ? "bg-amber-50 dark:bg-amber-950/30" : ""
                  }`}
                >
                  <div className="flex flex-col items-end leading-tight">
                    <PctCell pct={lastMonth?.cumPct} />
                    {matchedBenchCum !== undefined && (
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums leading-none mt-0.5">
                        벤치 {matchedBenchCum >= 0 ? "+" : ""}
                        {matchedBenchCum.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
