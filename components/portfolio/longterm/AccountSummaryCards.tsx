"use client";

// 중장기 계좌 KPI 요약 카드
// - KR Account: 총 평가금액(KRW) / 누적 실현손익 / 현재 평가손익 / 배당금 4개 카드
// - US Account: 총 평가금액(USD) / 누적 실현손익 / 현재 평가손익 / 배당금 4개 카드
// - KR/US 완전 분리 — 절대 혼산하지 않음

import { TrendingUp, TrendingDown, DollarSign, Wallet, BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LongtermPosition } from "@/types/portfolio";
import type { LongtermSummary } from "@/lib/portfolio/longterm-calc";

interface AccountSummaryCardsProps {
  krSummary: LongtermSummary;
  usSummary: LongtermSummary;
  positions: LongtermPosition[];
  isLoading: boolean;
}

function plColor(value: number): string {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-500 dark:text-red-400";
  return "text-muted-foreground";
}

// 부호 포함 문자열 포맷
function signedStr(v: number): string {
  return v >= 0 ? `+${v.toLocaleString()}` : v.toLocaleString();
}

// KPI 미니 카드 컴포넌트
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ElementType;
  valueClass?: string;
}) {
  return (
    <Card className="flex-1 min-w-[120px]">
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">{label}</p>
            <p className={cn("text-sm font-bold tabular-nums mt-0.5 truncate", valueClass)}>
              {value}
            </p>
            {sub && (
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>
            )}
          </div>
          {Icon && (
            <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// 섹션 구분선 헬퍼
function SectionTitle({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </h3>
      {badge && (
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  );
}

export function AccountSummaryCards({
  krSummary,
  usSummary,
  positions,
  isLoading,
}: AccountSummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="flex-1 h-20 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // KR/US 포지션 분리
  const krPositions = positions.filter((p) => p.currency === "KRW");
  const usPositions = positions.filter((p) => p.currency === "USD");

  return (
    <div className="space-y-6">
      {/* ════════════════════════════════
          KR 섹션 (원화, KRW)
      ════════════════════════════════ */}
      <div>
        <SectionTitle label="KR Account" badge={`${krSummary.positionCount}종목`} />

        {/* KPI 카드 4개 */}
        <div className="flex flex-wrap gap-3">
          {/* 총 평가금액 */}
          <KpiCard
            label="총 평가금액"
            value={`${krSummary.totalEvalAmount.toLocaleString()}원`}
            sub={`투자원금 ${krSummary.totalInvested.toLocaleString()}원`}
            icon={Wallet}
          />

          {/* 누적 실현손익 */}
          <KpiCard
            label="누적 실현손익"
            value={`${signedStr(krSummary.totalRealizedPL)}원`}
            icon={BarChart2}
            valueClass={plColor(krSummary.totalRealizedPL)}
          />

          {/* 현재 평가손익 */}
          <KpiCard
            label="현재 평가손익"
            value={
              krSummary.totalEvalPL !== 0 || krPositions.some((p) => p.currentPrice !== undefined)
                ? `${signedStr(krSummary.totalEvalPL)}원`
                : "-"
            }
            icon={TrendingUp}
            valueClass={plColor(krSummary.totalEvalPL)}
          />

          {/* 배당금 */}
          <KpiCard
            label="배당금 합계"
            value={`${krSummary.dividendTotal.toLocaleString()}원`}
            icon={DollarSign}
            valueClass={krSummary.dividendTotal > 0 ? "text-emerald-600 dark:text-emerald-400" : undefined}
          />
        </div>

      </div>

      {/* ════════════════════════════════
          US 섹션 (달러, USD)
      ════════════════════════════════ */}
      <div>
        <SectionTitle label="US Account" badge={`${usSummary.positionCount}종목`} />

        {/* KPI 카드 4개 (KR Account와 동일한 포맷) */}
        <div className="flex flex-wrap gap-3">
          {/* 총 평가금액 */}
          <KpiCard
            label="총 평가금액"
            value={`$${usSummary.totalEvalAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            sub={`투자원금 $${usSummary.totalInvested.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            icon={Wallet}
          />

          {/* 누적 실현손익 */}
          <KpiCard
            label="누적 실현손익"
            value={`${usSummary.totalRealizedPL >= 0 ? "+" : ""}$${Math.abs(usSummary.totalRealizedPL).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            icon={BarChart2}
            valueClass={plColor(usSummary.totalRealizedPL)}
          />

          {/* 현재 평가손익 */}
          <KpiCard
            label="현재 평가손익"
            value={
              usSummary.totalEvalPL !== 0 || usPositions.some((p) => p.currentPrice !== undefined)
                ? `${usSummary.totalEvalPL >= 0 ? "+" : ""}$${Math.abs(usSummary.totalEvalPL).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`
                : "-"
            }
            icon={usSummary.totalEvalPL >= 0 ? TrendingUp : TrendingDown}
            valueClass={plColor(usSummary.totalEvalPL)}
          />

          {/* 배당금 합계 */}
          <KpiCard
            label="배당금 합계"
            value={`$${usSummary.dividendTotal.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}`}
            icon={DollarSign}
            valueClass={usSummary.dividendTotal > 0 ? "text-emerald-600" : undefined}
          />
        </div>

        {/* 포지션 없을 때 안내 */}
        {usPositions.length === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            해외 거래 내역이 없습니다.
          </p>
        )}
      </div>

      {/* ════════════════════════════════
          전체 합산 안내 (KR/US 혼산 불가 경고)
      ════════════════════════════════ */}
      <p className="text-[10px] text-muted-foreground">
        * KR(원화)와 US(달러)는 별도 계산됩니다. 환산 합산을 지원하지 않습니다.
      </p>
    </div>
  );
}
