"use client";

// 보유 종목별 Alpha 수평 바 차트
// Alpha = TWR(종목) - 벤치마크 HPR (동일 보유기간)
// 에메랄드(양수) / 레드(음수) — Alpha 내림차순 정렬
// recharts BarChart (layout="vertical") — HoldingsBarChart 패턴 준수

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { HoldingPerformance } from "@/lib/portfolio/holdings-performance";

interface Props {
  holdings: HoldingPerformance[];
  currency: "KRW" | "USD";
}

// ─────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────

/** 종목명 말줄임 (Y축 공간 제한) */
function truncateName(name: string, max = 9): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

/** 수익률 포맷 (+/- 부호 포함) */
function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// ─────────────────────────────────────────
// 커스텀 툴팁 — 종목명 / Alpha / TWR / 벤치마크
// ─────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartRow;

  return (
    <div className="rounded-lg border bg-background/95 p-3 shadow-xl text-xs min-w-[170px]">
      <p className="font-semibold mb-1.5 truncate max-w-[200px]">{d.fullName}</p>
      <p className="text-[9px] text-muted-foreground mb-2">{d.stockCode} · 보유 {d.holdingDays}일</p>
      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Alpha</span>
          <span
            className={`font-semibold tabular-nums ${
              d.alpha >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400"
            }`}
          >
            {fmt(d.alpha)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">HPR (TWR)</span>
          <span className="font-medium tabular-nums">{fmt(d.twr)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">벤치마크 HPR</span>
          <span className="font-medium tabular-nums">{fmt(d.benchmarkTwr)}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 바 끝 레이블 — TWR / 벤치마크 요약 (SVG text)
// LabelList content prop으로 사용 — recharts는 SVG text 직접 반환 필요
// ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarLabel(props: any) {
  const { x, y, width, height, value, twr, benchmarkTwr } = props as {
    x: number; y: number; width: number; height: number;
    value: number; twr: number | null; benchmarkTwr: number | null;
  };
  if (value == null) return null;

  // 양수: 바 오른쪽 끝 바깥, 음수: 왼쪽 끝 바깥
  const labelX = value >= 0 ? x + Math.max(width, 0) + 4 : x + Math.min(width, 0) - 4;
  const anchor = value >= 0 ? "start" : "end";

  return (
    <text
      x={labelX}
      y={y + height / 2 + 3}
      textAnchor={anchor}
      fontSize={8}
      fill="hsl(var(--muted-foreground))"
    >
      {fmt(twr)} | B:{fmt(benchmarkTwr)}
    </text>
  );
}

// ─────────────────────────────────────────
// 차트 데이터 타입
// ─────────────────────────────────────────

interface ChartRow {
  name: string;
  fullName: string;
  stockCode: string;
  holdingDays: number;
  alpha: number;
  twr: number;
  benchmarkTwr: number | null;
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function HoldingsAlphaBarChart({ holdings, currency }: Props) {
  // 통화 필터 + Alpha 계산 가능한 종목만 포함 (Alpha 내림차순 정렬)
  const data: ChartRow[] = useMemo(() => {
    return holdings
      .filter(
        (h): h is HoldingPerformance & { twr: number; alpha: number } =>
          h.currency === currency && h.twr != null && h.alpha != null
      )
      .map((h) => ({
        name: truncateName(h.stockName),
        fullName: h.stockName,
        stockCode: h.stockCode,
        holdingDays: h.holdingDays ?? 0,
        alpha: h.alpha,
        twr: h.twr,
        benchmarkTwr: h.benchmarkTwr ?? null,
      }))
      .sort((a, b) => b.alpha - a.alpha);
  }, [holdings, currency]);

  // Y축 너비: 종목명 길이 기반 동적 계산
  const yAxisWidth = Math.min(88, Math.max(52, data.reduce((m, d) => Math.max(m, d.name.length * 7), 52)));

  // 차트 높이: 종목 수 × 34px (최소 160px)
  const height = Math.max(160, data.length * 34);

  const benchmarkLabel = currency === "KRW" ? "KOSPI" : "S&P 500";

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Alpha vs 벤치마크</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 flex items-center justify-center text-xs text-muted-foreground">
            현재가 입력된 종목이 없어 Alpha를 계산할 수 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Alpha vs 벤치마크
        </CardTitle>
        <CardDescription className="text-[10px]">
          HPR(TWR) − {benchmarkLabel} HPR (동일 보유기간 기준) · Alpha 내림차순
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            layout="vertical"
            // 오른쪽 여백: 바 끝 레이블(TWR|벤치)이 잘리지 않도록 넉넉히
            margin={{ top: 4, right: 96, left: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.4}
            />
            <XAxis
              type="number"
              tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              // dataMin/dataMax + 여유분: 레이블이 x=0 기준선과 겹치지 않도록
              domain={["dataMin - 8", "dataMax + 8"]}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={yAxisWidth}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "hsl(var(--muted-foreground)/0.08)" }}
            />

            {/* 0 기준선 — Alpha 0을 시각적으로 분리 */}
            <ReferenceLine x={0} stroke="hsl(var(--border))" strokeWidth={1.5} />

            <Bar dataKey="alpha" radius={[0, 3, 3, 0]} maxBarSize={22}>
              {/* 종목별 색상: Alpha 양수=에메랄드, 음수=레드 */}
              {data.map((entry) => (
                <Cell
                  key={`${entry.stockCode}-alpha`}
                  fill={entry.alpha >= 0 ? "#10b981" : "#ef4444"}
                  fillOpacity={0.85}
                />
              ))}

              {/* 바 끝 레이블: TWR | B:벤치마크 */}
              <LabelList
                dataKey="alpha"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                content={(props: any) => {
                  const d = data[props.index as number];
                  return (
                    <BarLabel
                      {...props}
                      twr={d?.twr}
                      benchmarkTwr={d?.benchmarkTwr}
                    />
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 범례 */}
        <p className="text-[10px] text-muted-foreground mt-1.5">
          에메랄드 = 벤치마크 초과, 레드 = 벤치마크 부진 · 레이블: HPR% | B: 벤치마크 HPR%
        </p>
      </CardContent>
    </Card>
  );
}
