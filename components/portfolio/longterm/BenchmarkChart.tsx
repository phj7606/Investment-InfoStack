"use client";

// 벤치마크 비교 라인 차트 (recharts)
// - "내 누적손익" vs "벤치마크" (KOSPI/S&P500) 두 라인 비교
// - 반드시 "use client" — React 19 RSC에서 recharts 직접 사용 불가
// - 0 기준선 점선 표시 (기존 EquityCurveChart 패턴: strokeDasharray="2 2")
// - 벤치마크 없으면 내 곡선만 표시
// - X축: YYYY-MM, Y축: 누적 손익 (원화 또는 USD)

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface MonthlyPLPoint {
  year: number;
  month: number;
  pl: number;
}

interface BenchmarkPoint {
  /** YYYY-MM 형식 */
  period: string;
  value: number;
}

interface BenchmarkChartProps {
  monthlyPL: MonthlyPLPoint[];
  currency: "KRW" | "USD";
  /** 벤치마크 데이터 (부모에서 페치해서 전달) — 없으면 내 곡선만 표시 */
  benchmarkData?: BenchmarkPoint[];
  /** 벤치마크 이름 (기본: KRW=KOSPI, USD=S&P500) */
  benchmarkLabel?: string;
}

// Y축 금액 축약 포맷
function formatYAxis(value: number, currency: "KRW" | "USD"): string {
  if (currency === "KRW") {
    if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(0)}억`;
    if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
    return `${value}`;
  }
  // USD
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value}`;
}

// 툴팁 커스텀
function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
  currency: "KRW" | "USD";
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-background/95 px-3 py-2 shadow-md text-xs space-y-1">
      <p className="text-muted-foreground">{label}</p>
      {payload.map((entry) => {
        const v = entry.value as number;
        const formatted =
          currency === "USD"
            ? `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `${v >= 0 ? "+" : ""}${v.toLocaleString()}원`;

        return (
          <p key={entry.dataKey} style={{ color: entry.color }} className="font-semibold">
            {entry.name}: {formatted}
          </p>
        );
      })}
    </div>
  );
}

export function BenchmarkChart({
  monthlyPL,
  currency,
  benchmarkData,
  benchmarkLabel,
}: BenchmarkChartProps) {
  // monthlyPL → 누적 손익 Equity Curve 계산
  const sortedMonthly = [...monthlyPL].sort(
    (a, b) => a.year - b.year || a.month - b.month
  );

  let cumulative = 0;
  const myEquityCurve: { period: string; myPL: number }[] = sortedMonthly.map((m) => {
    cumulative += m.pl;
    const period = `${m.year}-${String(m.month).padStart(2, "0")}`;
    return { period, myPL: cumulative };
  });

  // 벤치마크 데이터와 병합 (period 기준 left join)
  const benchmarkLabel_ =
    benchmarkLabel ?? (currency === "KRW" ? "KOSPI" : "S&P 500");

  const chartData = myEquityCurve.map((point) => {
    const bm = benchmarkData?.find((b) => b.period === point.period);
    return {
      period: point.period,
      myPL: point.myPL,
      benchmark: bm?.value,
    };
  });

  // 마지막 누적손익
  const finalValue = myEquityCurve[myEquityCurve.length - 1]?.myPL ?? 0;
  const myLineColor = finalValue >= 0 ? "#10b981" : "#ef4444"; // 에메랄드/레드
  const bmLineColor = "#6366f1"; // 인디고 (벤치마크)

  if (monthlyPL.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">누적손익 vs 벤치마크</CardTitle>
          <CardDescription className="text-xs">
            {currency === "KRW" ? "KOSPI 비교 (원화)" : "S&P 500 비교 (USD)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-xs text-muted-foreground">
            매도 거래 내역이 없어 차트를 표시할 수 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">누적손익 vs 벤치마크</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {currency === "KRW" ? `KOSPI 비교 (원화)` : `S&P 500 비교 (USD)`}
              {!benchmarkData && (
                <span className="ml-2 text-muted-foreground/60">
                  (벤치마크 데이터 없음)
                </span>
              )}
            </CardDescription>
          </div>
          {/* 최종 누적손익 표시 */}
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">누적 손익</p>
            <p
              className="text-sm font-bold tabular-nums"
              style={{ color: myLineColor }}
            >
              {finalValue >= 0 ? "+" : ""}
              {currency === "USD"
                ? `$${Math.abs(finalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : `${finalValue.toLocaleString()}원`}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatYAxis(v, currency)}
              width={52}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />

            {/* 범례 (벤치마크 있을 때만) */}
            {benchmarkData && (
              <Legend
                iconType="line"
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              />
            )}

            {/* 0 기준선 — 수익/손실 구분 점선 (기존 EquityCurveChart와 동일 패턴) */}
            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 2"
              strokeOpacity={0.6}
            />

            {/* 내 누적손익 라인 */}
            <Line
              type="linear"
              dataKey="myPL"
              name="내 누적손익"
              stroke={myLineColor}
              strokeWidth={2}
              dot={chartData.length <= 24 ? { r: 3, fill: myLineColor } : false}
              activeDot={{ r: 4 }}
            />

            {/* 벤치마크 라인 (데이터 있을 때만) */}
            {benchmarkData && (
              <Line
                type="linear"
                dataKey="benchmark"
                name={benchmarkLabel_}
                stroke={bmLineColor}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                activeDot={{ r: 3 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
