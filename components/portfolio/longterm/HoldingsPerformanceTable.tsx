"use client";

/**
 * 보유 종목별 성과 테이블
 *
 * TWR 기반 Alpha / 연환산 Alpha 를 중심으로 각 종목의 벤치마크 대비 우위/열위를 표시.
 * - Alpha 컬럼 기준 기본 정렬 (내림차순)
 * - Alpha 양수 = 에메랄드, 음수 = 레드
 * - 현재가 없는 종목: TWR/Alpha 셀 "현재가 필요" 표시
 * - 고급 지표(Hit Rate, MDD, Up/Down Capture) 없는 경우 "—" 표시
 * - 컬럼 헤더 클릭으로 정렬 전환
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
import type { HoldingPerformance } from "@/lib/portfolio/holdings-performance";

interface Props {
  holdings: HoldingPerformance[];
  isLoading: boolean;
  /** 통화 필터 — KRW 또는 USD */
  currency: "KRW" | "USD";
}

// ─────────────────────────────────────────
// 정렬 상태 타입
// ─────────────────────────────────────────

type SortKey =
  | "stockName"
  | "mdr"
  | "alpha"
  | "annualizedAlpha"
  | "twr"
  | "benchmarkTwr"
  | "evalPLPct"
  | "hitRate"
  | "mdd"
  | "holdingDays"
  | "currentWeight"
  | "portfolioContributionPct"
  | "upCapture"
  | "downCapture";

type SortDir = "asc" | "desc";

// ─────────────────────────────────────────
// 퍼센트 셀 컴포넌트
// ─────────────────────────────────────────

/** 수익률 수치 표시 — 양수 에메랄드, 음수 레드 */
function PctCell({
  pct,
  decimals = 2,
  fallback,
}: {
  pct: number | undefined | null;
  decimals?: number;
  fallback?: string;
}) {
  // JSON 직렬화 시 undefined → null 변환, NaN → null 변환되므로 null 및 NaN 모두 체크
  if (pct == null || isNaN(pct)) {
    return (
      <span className="text-muted-foreground/40 text-[10px]">
        {fallback ?? "—"}
      </span>
    );
  }
  const color =
    pct > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : pct < 0
      ? "text-red-500 dark:text-red-400"
      : "text-muted-foreground";

  return (
    <span className={`font-medium tabular-nums ${color}`}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(decimals)}%
    </span>
  );
}

/** Alpha 셀 — 벤치마크 TWR을 서브 텍스트로 표시 */
function AlphaCell({
  alpha,
  benchmarkTwr,
  twr,
}: {
  alpha: number | undefined | null;
  benchmarkTwr: number | undefined | null;
  twr: number | undefined | null;
}) {
  // 현재가 없어서 twr 자체를 계산 못 한 경우 (null/undefined 모두 포함)
  if (twr == null) {
    return (
      <span className="text-[10px] text-muted-foreground/50 italic">
        현재가 필요
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end leading-tight">
      <PctCell pct={alpha} />
      {benchmarkTwr != null && (
        <span className="text-[9px] text-muted-foreground/60 tabular-nums leading-none mt-0.5">
          벤치 {benchmarkTwr >= 0 ? "+" : ""}
          {benchmarkTwr.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

/** 보유기간 표시 (일 → 년/월 단위 병기) */
function HoldingDaysCell({ days }: { days: number | null | undefined }) {
  const d = days ?? 0;
  const years = Math.floor(d / 365);
  const months = Math.floor((d % 365) / 30);
  let label = "";
  if (years > 0) label += `${years}년 `;
  if (months > 0 || years === 0) label += `${months}개월`;
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="tabular-nums text-foreground">{d}일</span>
      {label.trim() && (
        <span className="text-[9px] text-muted-foreground/60 leading-none mt-0.5">
          ({label.trim()})
        </span>
      )}
    </div>
  );
}

/** 평가손익 셀 */
function PLCell({ pl, currency }: { pl: number | null | undefined; currency: "KRW" | "USD" }) {
  const v = pl ?? 0;
  const color =
    v > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : v < 0
      ? "text-red-500 dark:text-red-400"
      : "text-muted-foreground";

  const formatted =
    currency === "USD"
      ? `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : `${v >= 0 ? "+" : ""}${v.toLocaleString()}`;

  return (
    <span className={`font-medium tabular-nums ${color}`}>{formatted}</span>
  );
}

// ─────────────────────────────────────────
// 정렬 헬퍼
// ─────────────────────────────────────────

/** 정렬 키에서 숫자 값 추출 (undefined는 정렬 끝으로) */
function getSortValue(h: HoldingPerformance, key: SortKey): number {
  switch (key) {
    case "stockName":                return 0; // 문자열 정렬은 별도 처리
    case "mdr":                      return h.mdr ?? -Infinity;
    case "alpha":                    return h.alpha ?? -Infinity;
    case "annualizedAlpha":          return h.annualizedAlpha ?? -Infinity;
    case "twr":                      return h.twr ?? -Infinity;
    case "benchmarkTwr":             return h.benchmarkTwr ?? -Infinity;
    case "evalPLPct":                return h.evalPLPct ?? 0;
    case "hitRate":                  return h.hitRate ?? -Infinity;
    case "mdd":                      return h.mdd ?? Infinity; // MDD는 낮을수록 나쁨 → 큰 음수가 아래로
    case "holdingDays":              return h.holdingDays ?? 0;
    case "currentWeight":            return h.currentWeight ?? 0;
    case "portfolioContributionPct": return h.portfolioContributionPct ?? -Infinity;
    case "upCapture":                return h.upCapture ?? -Infinity;
    case "downCapture":              return h.downCapture ?? Infinity; // 낮을수록 방어적(좋음)
  }
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function HoldingsPerformanceTable({ holdings, isLoading, currency }: Props) {
  // 기본 정렬: Alpha 내림차순 (Alpha가 높은 종목이 위)
  const [sortKey, setSortKey] = useState<SortKey>("alpha");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // 통화 필터 적용
  const filtered = useMemo(
    () => holdings.filter((h) => h.currency === currency),
    [holdings, currency]
  );

  // 같은 종목코드가 여러 계좌에 걸쳐 중복 존재하는지 확인
  // 중복이 있으면 계좌번호를 종목명 셀 서브텍스트로 표시해 구분
  const dupCodes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of filtered) counts.set(h.stockCode, (counts.get(h.stockCode) ?? 0) + 1);
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([code]) => code));
  }, [filtered]);

  // 정렬 적용 — stockName은 문자열 비교, 나머지는 숫자 비교
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortKey === "stockName") {
        const cmp = a.stockName.localeCompare(b.stockName, "ko");
        return sortDir === "desc" ? -cmp : cmp;
      }
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortKey, sortDir]);

  // 컬럼 헤더 클릭 핸들러 — 같은 키면 방향 전환, 다른 키면 내림차순 초기화
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // 정렬 아이콘 컴포넌트
  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey)
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40 ml-0.5" />;
    return sortDir === "desc" ? (
      <ArrowDown className="h-3 w-3 text-foreground ml-0.5" />
    ) : (
      <ArrowUp className="h-3 w-3 text-foreground ml-0.5" />
    );
  }

  // 로딩 스켈레톤
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-8 rounded-md bg-muted animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 rounded-md bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        {currency === "KRW" ? "보유 국내 종목이 없습니다." : "보유 해외 종목이 없습니다."}
      </div>
    );
  }

  // 고급 지표(Hit Rate / MDD / Up/Down Capture)를 가진 종목이 하나라도 있는지 확인
  // 없으면 해당 컬럼 전체를 숨겨 테이블 폭 최적화
  const hasHitRate   = sorted.some((h) => h.hitRate != null);
  const hasMDD       = sorted.some((h) => h.mdd != null);
  const hasCapture   = sorted.some((h) => h.upCapture != null || h.downCapture != null);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            {/* 종목명: sticky left — 클릭으로 가나다순 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-foreground w-[130px] min-w-[130px] max-w-[130px] sticky left-0 bg-muted/30 cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("stockName")}
            >
              <span className="flex items-center">
                종목명
                <SortIcon col="stockName" />
              </span>
            </TableHead>
            <TableHead className="py-2 text-xs font-semibold text-foreground w-[48px] min-w-[48px] text-center">
              시장
            </TableHead>
            {/* 비중% — 클릭으로 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[56px] min-w-[56px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("currentWeight")}
              title="전체 포트폴리오 대비 해당 통화(KRW/USD) 내 종목 비중. 평가금액 기준."
            >
              <span className="flex items-center justify-end">
                비중
                <SortIcon col="currentWeight" />
              </span>
            </TableHead>
            {/* 보유기간 — 클릭으로 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[80px] min-w-[80px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("holdingDays")}
              title="첫 매입일부터 오늘까지 경과한 캘린더 일수."
            >
              <span className="flex items-center justify-end">
                보유기간
                <SortIcon col="holdingDays" />
              </span>
            </TableHead>
            {/* TWR — 종목 가격 수익률 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[72px] min-w-[72px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("twr")}
              title="TWR: 추가 매수 시점마다 구간을 나눠 각 구간 수익률을 기하 연결. 단일 종목에서는 중간 가격이 상쇄되어 P_현재/P_첫매입 − 1과 동일해짐."
            >
              <span className="flex items-center justify-end">
                HPR%
                <SortIcon col="twr" />
              </span>
              <span className="block text-[9px] font-normal text-muted-foreground leading-none mt-0.5">
                (TWR)
              </span>
            </TableHead>
            {/* MDR — Modified Dietz 연환산 수익률 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[80px] min-w-[80px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("mdr")}
              title="MDR(Modified Dietz): 순이익 ÷ 시간가중 투입자본. 각 매수 금액이 실제로 운용된 기간을 가중치로 삼아 수익률을 계산. HPR이 가격 변화만 보는 것과 달리, 언제 얼마를 투자했는지까지 반영한 실질 투자 효율성."
            >
              <span className="flex items-center justify-end">
                MDR
                <SortIcon col="mdr" />
              </span>
              <span className="block text-[9px] font-normal text-muted-foreground leading-none mt-0.5">
                (연환산)
              </span>
            </TableHead>

            {/* Alpha — 기본 정렬 컬럼, 벤치마크 TWR 서브 텍스트 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[88px] min-w-[88px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("alpha")}
              title="Alpha = 종목 HPR − 벤치마크 HPR (동일 보유기간 기준). 양수면 벤치마크 초과, 음수면 벤치마크 부진. 벤치마크: KRW → KOSPI(^KS11), USD → S&P500(^GSPC)."
            >
              <span className="flex items-center justify-end">
                Alpha%
                <SortIcon col="alpha" />
              </span>
              <span className="block text-[9px] font-normal text-muted-foreground leading-none mt-0.5">
                vs 벤치마크
              </span>
            </TableHead>
            {/* 연환산 Alpha */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[80px] min-w-[80px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("annualizedAlpha")}
              title="연환산 Alpha = (1 + Alpha/100)^(365/보유일수) − 1. 보유기간이 다른 종목 간 Alpha를 연 단위로 표준화. Alpha가 −100% 미만이면 수학적으로 계산 불가(음수의 분수 거듭제곱)."
            >
              <span className="flex items-center justify-end">
                연환산 α
                <SortIcon col="annualizedAlpha" />
              </span>
              <span className="block text-[9px] font-normal text-muted-foreground leading-none mt-0.5">
                (CAGR)
              </span>
            </TableHead>
            {/* 고급 지표 — 데이터 있을 때만 컬럼 표시 */}
            {hasHitRate && (
              <TableHead
                className="py-2 text-xs font-semibold text-right text-foreground w-[68px] min-w-[68px] cursor-pointer select-none hover:bg-muted/50"
                onClick={() => handleSort("hitRate")}
                title="Hit Rate = 종목 월수익률 > 벤치마크 월수익률인 달의 비율. 종목이 벤치마크를 월 단위로 이긴 빈도."
              >
                <span className="flex items-center justify-end">
                  Hit Rate
                  <SortIcon col="hitRate" />
                </span>
              </TableHead>
            )}
            {hasMDD && (
              <TableHead
                className="py-2 text-xs font-semibold text-right text-foreground w-[64px] min-w-[64px] cursor-pointer select-none hover:bg-muted/50"
                onClick={() => handleSort("mdd")}
                title="MDD(최대 낙폭) = 보유기간 중 고점 대비 저점의 최대 하락폭(%). 음수. 클수록 리스크가 높았음을 의미."
              >
                <span className="flex items-center justify-end">
                  MDD%
                  <SortIcon col="mdd" />
                </span>
              </TableHead>
            )}
            {hasCapture && (
              <>
                <TableHead
                  className="py-2 text-xs font-semibold text-right text-foreground w-[72px] min-w-[72px] cursor-pointer select-none hover:bg-muted/50"
                  onClick={() => handleSort("upCapture")}
                  title="Up Capture = 벤치마크 상승 구간에서 종목 평균 수익률 / 벤치마크 평균 수익률. 100% 초과면 상승장에서 벤치마크보다 더 올랐음."
                >
                  <span className="flex items-center justify-end">
                    Up Cap
                    <SortIcon col="upCapture" />
                  </span>
                  <span className="block text-[9px] font-normal text-muted-foreground leading-none mt-0.5 text-right">
                    상승 포착
                  </span>
                </TableHead>
                <TableHead
                  className="py-2 text-xs font-semibold text-right text-foreground w-[72px] min-w-[72px] cursor-pointer select-none hover:bg-muted/50"
                  onClick={() => handleSort("downCapture")}
                  title="Down Capture = 벤치마크 하락 구간에서 종목 평균 손실률 / 벤치마크 평균 손실률. 100% 미만이면 하락장에서 벤치마크보다 덜 빠졌음(방어적)."
                >
                  <span className="flex items-center justify-end">
                    Dn Cap
                    <SortIcon col="downCapture" />
                  </span>
                  <span className="block text-[9px] font-normal text-muted-foreground leading-none mt-0.5 text-right">
                    하락 포착
                  </span>
                </TableHead>
              </>
            )}
            {/* 평가손익 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[96px] min-w-[96px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("evalPLPct")}
              title="평가손익 = (현재가 − 평균매입단가) × 보유수량. 아래 서브텍스트는 평균매입단가 기준 수익률(%)."
            >
              <span className="flex items-center justify-end">
                평가손익
                <SortIcon col="evalPLPct" />
              </span>
            </TableHead>
            {/* 기여도 — 클릭으로 정렬 */}
            <TableHead
              className="py-2 text-xs font-semibold text-right text-foreground w-[68px] min-w-[68px] cursor-pointer select-none hover:bg-muted/50"
              onClick={() => handleSort("portfolioContributionPct")}
              title="포트폴리오 기여도 = 종목 평가손익 / 전체 평가손익 합계(%). 어느 종목이 전체 수익/손실에 얼마나 기여하는지 나타냄."
            >
              <span className="flex items-center justify-end">
                기여도
                <SortIcon col="portfolioContributionPct" />
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sorted.map((h) => (
            <TableRow
              key={`${h.stockCode}-${h.accountNo}`}
              className={
                // Alpha 양수 종목은 연한 에메랄드 배경으로 강조
                h.alpha != null && h.alpha > 0
                  ? "bg-emerald-50/30 dark:bg-emerald-950/10"
                  : h.alpha != null && h.alpha < 0
                  ? "bg-red-50/20 dark:bg-red-950/10"
                  : ""
              }
            >
              {/* 종목명 — sticky left */}
              <TableCell
                className="py-2 text-xs font-medium sticky left-0 bg-background w-[130px] max-w-[130px]"
                title={h.stockName}
              >
                <span className="block truncate">{h.stockName}</span>
                <span className="block text-[9px] text-muted-foreground/60 tabular-nums leading-none mt-0.5">
                  {h.stockCode}
                  {/* 같은 종목코드가 여러 계좌에 분산 보유된 경우 계좌번호 표시 */}
                  {dupCodes.has(h.stockCode) && (
                    <span className="ml-1 text-amber-500/70">#{h.accountNo}</span>
                  )}
                </span>
              </TableCell>

              {/* 시장 뱃지 */}
              <TableCell className="py-2 text-center">
                <Badge
                  variant="outline"
                  className={`text-[9px] py-0 px-1 ${
                    h.market === "KR"
                      ? "text-blue-600 border-blue-400/40"
                      : "text-violet-600 border-violet-400/40"
                  }`}
                >
                  {h.market}
                </Badge>
              </TableCell>

              {/* 비중% */}
              <TableCell className="py-2 text-xs text-right tabular-nums text-muted-foreground">
                {((h.currentWeight ?? 0) * 100).toFixed(1)}%
              </TableCell>

              {/* 보유기간 */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                <HoldingDaysCell days={h.holdingDays} />
              </TableCell>

              {/* HPR% (TWR) */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                {h.twr != null ? (
                  <PctCell pct={h.twr} />
                ) : (
                  <span className="text-[10px] text-muted-foreground/40">현재가 필요</span>
                )}
              </TableCell>

              {/* MDR — 현재가 없으면 계산 불가 */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                {h.mdr != null ? (
                  <PctCell pct={h.mdr} />
                ) : h.twr != null ? (
                  <span className="text-[9px] text-muted-foreground/40">—</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground/40">현재가 필요</span>
                )}
              </TableCell>

              {/* Alpha% + 벤치마크 TWR 서브 텍스트 */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                <AlphaCell
                  alpha={h.alpha}
                  benchmarkTwr={h.benchmarkTwr}
                  twr={h.twr}
                />
              </TableCell>

              {/* 연환산 Alpha — alpha가 -100% 미만이면 수학적으로 계산 불가 */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                {h.annualizedAlpha != null ? (
                  <PctCell pct={h.annualizedAlpha} />
                ) : h.alpha != null && h.twr != null ? (
                  // alpha가 존재하지만 연환산 불가 = alpha < -100% (음수 거듭제곱 불가)
                  <span
                    className="text-[9px] text-muted-foreground/50 italic"
                    title="Alpha가 −100% 미만이면 (1+α)의 분수 거듭제곱이 허수가 되어 연환산 계산이 수학적으로 불가합니다."
                  >
                    계산불가
                  </span>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </TableCell>

              {/* Hit Rate */}
              {hasHitRate && (
                <TableCell className="py-2 text-xs text-right tabular-nums">
                  <PctCell pct={h.hitRate} decimals={0} fallback="—" />
                </TableCell>
              )}

              {/* MDD */}
              {hasMDD && (
                <TableCell className="py-2 text-xs text-right tabular-nums">
                  {/* MDD는 음수 값 — 0이면 무손실, 음수일수록 낙폭 큼 */}
                  {h.mdd != null ? (
                    <span
                      className={`font-medium tabular-nums ${
                        h.mdd < -10
                          ? "text-red-500 dark:text-red-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {h.mdd.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </TableCell>
              )}

              {/* Up/Down Capture */}
              {hasCapture && (
                <>
                  <TableCell className="py-2 text-xs text-right tabular-nums">
                    {h.upCapture != null ? (
                      <span
                        className={`font-medium ${
                          h.upCapture >= 100
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        {h.upCapture.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">
                    {h.downCapture != null ? (
                      <span
                        className={`font-medium ${
                          h.downCapture <= 100
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {h.downCapture.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                </>
              )}

              {/* 평가손익 + 평가손익률 서브 텍스트 */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                <div className="flex flex-col items-end leading-tight">
                  <PLCell pl={h.evalPL} currency={h.currency} />
                  <span className="text-[9px] text-muted-foreground/60 tabular-nums leading-none mt-0.5">
                    {(h.evalPLPct ?? 0) >= 0 ? "+" : ""}
                    {(h.evalPLPct ?? 0).toFixed(2)}%
                  </span>
                </div>
              </TableCell>

              {/* 기여도 */}
              <TableCell className="py-2 text-xs text-right tabular-nums">
                {h.portfolioContributionPct != null ? (
                  <PctCell pct={h.portfolioContributionPct} />
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* ─────────────────────────────────────────────────────
          지표 용어 설명 — 각 컬럼이 무엇을 의미하는지 안내
          테이블 바로 아래 작은 글씨로 표시
      ───────────────────────────────────────────────────── */}
      <div className="mt-3 px-3 pb-3 space-y-2.5 text-[10px] text-muted-foreground border-t pt-3">

        {/* ── 핵심 수익률 지표 ── */}
        <div>
          <p className="font-semibold text-foreground mb-1">수익률 지표</p>
          <ul className="space-y-1 leading-relaxed">
            <li>
              <span className="font-medium text-foreground">MDR (Modified Dietz Return)</span>
              {" — "}
              순이익 ÷ 시간가중 투입자본으로 직접 계산하는 연환산 수익률.
              각 매수 금액이 실제로 운용된 기간을 가중치로 삼아 "내 돈이 연 몇 %로 불어났는가"를 구합니다.
              {" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                HPR이 가격 변화만 보는 것과 달리, 추가 매수의 타이밍과 금액이 모두 반영됩니다.
              </span>
              {" "}저가에 대량 추가 매수했다면 MDR &gt; HPR, 고가에 추가 매수했다면 MDR &lt; HPR이 됩니다.
              {" "}반복 계산 없는 직접 공식이라 XIRR보다 단순하며, 단기 보유 종목에서 거의 동일한 결과를 냅니다.
            </li>
            <li>
              <span className="font-medium text-foreground">HPR% (TWR)</span>
              {" — "}
              보유기간 가격 수익률. 추가 매수 시점마다 구간을 나눠 각 구간 수익률을 기하 연결하는
              시간 가중 수익률(TWR) 방식을 따르지만, 단일 종목에서는 중간 가격이
              분모·분자로 상쇄되어 <span className="italic">P_현재 / P_첫매입 − 1</span>과
              수학적으로 동일해집니다.
              {" "}
              <span className="text-amber-600 dark:text-amber-400">
                보유기간 효과(100일 +20% vs 1,000일 +20%)는 이 숫자에 반영되지 않으며,
                연환산 α를 통해서만 비교 가능합니다.
              </span>
              {" "}추가 매수 금액·시기까지 반영한 실질 투자 수익률은 XIRR(내부수익률)로 측정해야 합니다.
            </li>
            <li>
              <span className="font-medium text-foreground">Alpha%</span>
              {" — "}
              초과 수익률 = 종목 HPR − 벤치마크 HPR (동일 보유기간 기준).
              양수면 벤치마크를 이긴 것(시장 초과 수익), 음수면 그냥 인덱스 펀드를 샀을 때보다 못한 것.
              벤치마크: KRW 종목 → KOSPI(^KS11), USD 종목 → S&P500(^GSPC).
            </li>
            <li>
              <span className="font-medium text-foreground">연환산 α (CAGR)</span>
              {" — "}
              Alpha를 연 단위로 표준화. 계산식: (1 + Alpha/100)^(365/보유일수) − 1.
              1년 보유했을 때의 Alpha로 환산하므로 보유기간이 다른 종목 간 비교가 가능합니다.
              {" "}
              <span className="text-amber-600 dark:text-amber-400">
                단, Alpha가 −100% 미만이면 (1+α)가 음수가 되어 분수 거듭제곱이 허수가 되므로 수학적으로 계산 불가.
              </span>
            </li>
          </ul>
        </div>

        {/* ── 성과 지속성 지표 (Hit Rate가 있을 때만 표시) ── */}
        {hasHitRate && (
          <div>
            <p className="font-semibold text-foreground mb-1">성과 지속성</p>
            <ul className="space-y-1 leading-relaxed">
              <li>
                <span className="font-medium text-foreground">Hit Rate</span>
                {" — "}
                보유기간 중 종목의 월수익률이 벤치마크 월수익률을 초과한 달의 비율.
                50% 이상이면 절반 이상의 달에서 벤치마크를 이긴 것. Alpha가 크더라도 Hit Rate가 낮으면 소수의 강한 달에 의존하는 집중형 수익 패턴임을 의미합니다.
              </li>
            </ul>
          </div>
        )}

        {/* ── 리스크 지표 (MDD가 있을 때만 표시) ── */}
        {hasMDD && (
          <div>
            <p className="font-semibold text-foreground mb-1">리스크</p>
            <ul className="space-y-1 leading-relaxed">
              <li>
                <span className="font-medium text-foreground">MDD%</span>
                {" — "}
                최대 낙폭(Maximum Drawdown). 보유기간 중 고점 대비 저점의 최대 하락폭(음수).
                −10% 이면 고점에서 10% 빠진 구간이 있었다는 뜻. 클수록 심리적 손절 압박이 컸음을 의미하며 리스크 대비 Alpha를 평가하는 데 활용합니다.
              </li>
            </ul>
          </div>
        )}

        {/* ── 시장 환경별 특성 (Capture Ratio가 있을 때만 표시) ── */}
        {hasCapture && (
          <div>
            <p className="font-semibold text-foreground mb-1">시장 환경별 특성</p>
            <ul className="space-y-1 leading-relaxed">
              <li>
                <span className="font-medium text-foreground">Up Capture (상승 포착률)</span>
                {" — "}
                벤치마크 상승 구간에서 종목 평균 수익률 ÷ 벤치마크 평균 수익률.
                100% 초과면 상승장에서 벤치마크보다 더 올랐음(공격적). 성장주·고베타 종목에서 높게 나타납니다.
              </li>
              <li>
                <span className="font-medium text-foreground">Down Capture (하락 포착률)</span>
                {" — "}
                벤치마크 하락 구간에서 종목 평균 손실률 ÷ 벤치마크 평균 손실률.
                100% 미만이면 하락장에서 벤치마크보다 덜 빠졌음(방어적). 이상적인 종목은 Up Capture 높고 Down Capture 낮은 조합입니다.
              </li>
            </ul>
          </div>
        )}

        {/* ── 포트폴리오 맥락 지표 ── */}
        <div>
          <p className="font-semibold text-foreground mb-1">포트폴리오 맥락</p>
          <ul className="space-y-1 leading-relaxed">
            <li>
              <span className="font-medium text-foreground">비중</span>
              {" — "}
              동일 통화(KRW/USD) 내 전체 평가금액 대비 해당 종목의 비율. 포트폴리오 내 노출 크기를 나타냅니다.
            </li>
            <li>
              <span className="font-medium text-foreground">평가손익</span>
              {" — "}
              (현재가 − 평균매입단가) × 보유수량. 실현되지 않은 장부상 손익. 아래 소수점은 평균매입단가 기준 수익률(%)입니다.
            </li>
            <li>
              <span className="font-medium text-foreground">기여도</span>
              {" — "}
              종목 평가손익 ÷ 전체 종목 평가손익 합계. 포트폴리오 전체 수익/손실에서 해당 종목이 차지하는 비중.
              절댓값이 크면 이 종목이 포트폴리오 성과를 주도하고 있음을 의미합니다.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
