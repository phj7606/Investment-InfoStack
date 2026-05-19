"use client";

/**
 * 종목별 성과 테이블
 *
 * 엑셀 파싱 데이터를 기반으로 KR/US 개별 종목 성과 표시
 * - 전량 매도 완료 종목: "매도완료" 뱃지로 표시, 흐리게 처리
 * - 현재 보유 종목: 정상 표시
 * - 컬럼: 종목명 / ticker / 월별 MoM% / 누적수익률
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {/* 기본 정보 컬럼 */}
            <TableHead className="font-semibold text-foreground w-36 sticky left-0 bg-muted/30">
              종목명
            </TableHead>
            <TableHead className="font-semibold text-foreground w-24">
              {currency === "KRW" ? "종목코드" : "심볼"}
            </TableHead>
            <TableHead className="font-semibold text-foreground w-20 text-center">
              상태
            </TableHead>
            {/* 월별 MoM% 컬럼 — 현재 진행 중인 월은 "(진행)" 표시 */}
            {allPeriods.map((period) => (
              <TableHead
                key={period}
                className={`font-semibold text-right w-20 ${
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
            {/* 누적 수익률 — 마지막 데이터 월 기준 */}
            <TableHead className="font-semibold text-foreground text-right w-24">
              누적 수익률
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {/* ── 포트폴리오/계좌 합계 행 (상단 고정) ── */}
          {portfolioMonths && portfolioMonths.length > 0 && (() => {
            const lastP = portfolioMonths[portfolioMonths.length - 1];
            return (
              <TableRow className="bg-blue-50/60 dark:bg-blue-950/25 border-b-2 border-border font-medium">
                {/* 행 레이블 */}
                <TableCell className="font-semibold sticky left-0 bg-blue-50/60 dark:bg-blue-950/25 text-blue-700 dark:text-blue-300">
                  포트폴리오 합계
                </TableCell>
                {/* 코드 없음 */}
                <TableCell className="text-muted-foreground text-xs tabular-nums">—</TableCell>
                {/* 상태 뱃지 */}
                <TableCell className="text-center">
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 text-blue-600 dark:text-blue-400 border-blue-400/40"
                  >
                    합계
                  </Badge>
                </TableCell>
                {/* 월별 MoM% — 벤치마크 초과 시 셀 하이라이트 */}
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
                      className={`text-right text-sm ${
                        beatsMonth ? "bg-amber-50 dark:bg-amber-950/30" : ""
                      }`}
                    >
                      <PctCell pct={p?.momPct} />
                    </TableCell>
                  );
                })}
                {/* 누적 수익률 — 포트폴리오 합계는 Dec 2025 기준 벤치마크와 비교 */}
                <TableCell className="text-right text-sm font-semibold">
                  <PctCell pct={lastP?.cumPct} />
                </TableCell>
              </TableRow>
            );
          })()}

          {/* ── 개별 종목 행 ── */}
          {stocks.map((stock) => {
            // 월별 성과를 period 맵으로 변환
            const monthMap = new Map(stock.months.map((m) => [m.period, m]));
            // 마지막 데이터 월의 누적 수익률
            const lastMonth = stock.months[stock.months.length - 1];
            // 종목 첫 거래월 (기간 매칭 벤치마크 기준점)
            const startPeriod = stock.months[0]?.period;

            // 기간 매칭 벤치마크 누적 수익률
            // — 종목 시작월부터 마지막 월까지 벤치마크 누적 수익률 (Dec 2025 기준이 아닌 종목 시작 기준)
            const matchedBenchCum =
              benchmarkData && startPeriod && lastMonth
                ? getPeriodMatchedBenchmarkCum(
                    benchmarkData,
                    startPeriod,
                    lastMonth.period
                  )
                : undefined;

            // 누적 수익률 셀 하이라이트: 기간 매칭 벤치마크 초과 여부
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
                {/* 종목명 */}
                <TableCell className="font-medium sticky left-0 bg-background">
                  {stock.stockName}
                </TableCell>

                {/* 티커 — 다른 수치 폰트와 동일하게 tabular-nums 적용 */}
                <TableCell className="text-muted-foreground text-xs tabular-nums">
                  {stock.ticker}
                </TableCell>

                {/* 상태 뱃지 */}
                <TableCell className="text-center">
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

                {/* 월별 MoM% — 해당 월 벤치마크 MoM% 초과 시 셀 하이라이트 */}
                {allPeriods.map((period) => {
                  const monthData = monthMap.get(period);
                  const benchMoM  = benchMoMMap.get(period);
                  // 데이터가 있는 월에만 하이라이트 적용 (전량 매도 이후 공란 셀 제외)
                  const beatsMonth =
                    monthData?.momPct !== undefined &&
                    benchMoM !== undefined &&
                    monthData.momPct > benchMoM;
                  return (
                    <TableCell
                      key={period}
                      className={`text-right text-sm ${
                        beatsMonth ? "bg-amber-50 dark:bg-amber-950/30" : ""
                      }`}
                    >
                      <PctCell pct={monthData?.momPct} />
                    </TableCell>
                  );
                })}

                {/* 누적 수익률 — 기간 매칭 벤치마크 초과 시 셀 하이라이트 */}
                <TableCell
                  className={`text-right text-sm font-semibold ${
                    beatsCumBenchmark ? "bg-amber-50 dark:bg-amber-950/30" : ""
                  }`}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <PctCell pct={lastMonth?.cumPct} />
                    {/* 기간 매칭 벤치마크 (동일 보유기간 기준) */}
                    {matchedBenchCum !== undefined && (
                      <span className="text-[10px] text-muted-foreground/70 tabular-nums">
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
