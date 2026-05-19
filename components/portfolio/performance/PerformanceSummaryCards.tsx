/**
 * 포트폴리오 성과 요약 KPI 카드 (4개)
 *
 * 표시 항목:
 * - 누적수익률: 가장 최신 월의 Cum%
 * - 현재잔고: 가장 최신 월의 Balance
 * - 최고 월수익: 전체 기간 중 MoM% 최대값 (월명 포함)
 * - 최저 월수익: 전체 기간 중 MoM% 최소값 (월명 포함)
 */

import type { PerformanceMonthPoint } from "@/types/portfolio";

interface Props {
  months: PerformanceMonthPoint[];
  currency: "KRW" | "USD";
}

/** 숫자를 통화 형식으로 표시 */
function formatBalance(value: number, currency: "KRW" | "USD"): string {
  if (currency === "KRW") {
    // 억 단위로 표시 (1억 = 100,000,000)
    if (Math.abs(value) >= 100_000_000) {
      return `${(value / 100_000_000).toFixed(2)}억`;
    }
    return `${Math.round(value / 10_000).toLocaleString()}만`;
  }
  // USD는 천 단위 콤마
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** 수익률 색상 클래스 결정 */
function pctColor(pct: number): string {
  if (pct > 0) return "text-emerald-600 dark:text-emerald-400";
  if (pct < 0) return "text-red-500 dark:text-red-400";
  return "text-muted-foreground";
}

/** "YYYY-MM" → "YY년 M월" 형식 */
function formatPeriodShort(period: string): string {
  const [year, month] = period.split("-");
  return `${year.slice(2)}년 ${parseInt(month)}월`;
}

export function PerformanceSummaryCards({ months, currency }: Props) {
  if (months.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
            <div className="h-4 w-20 bg-muted rounded mb-2" />
            <div className="h-7 w-28 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const latest = months[months.length - 1];

  // 최고/최저 MoM% 월 탐색
  let bestMonth = months[0];
  let worstMonth = months[0];
  for (const m of months) {
    if (m.momPct > bestMonth.momPct) bestMonth = m;
    if (m.momPct < worstMonth.momPct) worstMonth = m;
  }

  const cards = [
    {
      label: "누적 수익률",
      value: `${latest.cumPct >= 0 ? "+" : ""}${latest.cumPct.toFixed(2)}%`,
      sub: `누적 손익 ${currency === "KRW"
        ? `${latest.cumPL >= 0 ? "+" : ""}${Math.round(latest.cumPL / 10_000).toLocaleString()}만`
        : `${latest.cumPL >= 0 ? "+" : ""}$${Math.abs(latest.cumPL).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}`,
      colorClass: pctColor(latest.cumPct),
    },
    {
      label: "현재 잔고",
      value: formatBalance(latest.balance, currency),
      sub: formatPeriodShort(latest.period) + " 기준",
      colorClass: "text-foreground",
    },
    {
      label: "최고 월수익",
      value: `+${bestMonth.momPct.toFixed(2)}%`,
      sub: formatPeriodShort(bestMonth.period),
      colorClass: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "최저 월수익",
      value: `${worstMonth.momPct.toFixed(2)}%`,
      sub: formatPeriodShort(worstMonth.period),
      colorClass: worstMonth.momPct < 0
        ? "text-red-500 dark:text-red-400"
        : "text-muted-foreground",
    },
  ];

  return (
    /* 2열 → 4열 반응형 그리드 */
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border bg-card p-4 shadow-sm">
          {/* 라벨 */}
          <p className="text-xs font-medium text-muted-foreground mb-1">{card.label}</p>
          {/* 주요 수치 */}
          <p className={`text-2xl font-bold tracking-tight ${card.colorClass}`}>
            {card.value}
          </p>
          {/* 보조 텍스트 */}
          <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
