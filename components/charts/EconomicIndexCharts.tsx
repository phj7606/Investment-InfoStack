"use client";

// 경제지표 차트 — Index 탭용 월별 차트 3종
// recharts 클라이언트 격리 필수 ("use client")
// 월별 데이터(FRED AHETPI/MPMIE, ECOS 한국 수출) 기반
//
// 차트 구성:
//   1. 실질임금 상승률 (%) — FRED AHETPI YoY - CPIAUCSL YoY 근사값
//   2. Markit 제조업 PMI — FRED MPMIE, 50 기준선
//   3. 한국 월간 수출 (백만달러) — ECOS 관세청 기준 601Y031

import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { EconomicIndexBar } from "@/app/api/market/economic-index/route";

// ─── 색상 상수 ──────────────────────────────────────────────────────────────
const COLORS = {
  realWagePos: "#10b981",  // emerald-500 — 실질임금 플러스 (구매력 증가)
  realWageNeg: "#ef4444",  // red-500 — 실질임금 마이너스 (구매력 감소)
  ism: "#6366f1",          // indigo-500 — 제조업 활동 지표
  koreaExport: "#f59e0b",  // amber-500 — 한국 수출
} as const;

// ─── 공통 차트 설정 ─────────────────────────────────────────────────────────
const SYNC_ID = "economic-index";

/** X축 날짜 포맷: "YYYY-MM-DD" → "MMM YY" */
function formatXTick(value: string): string {
  if (!value) return "";
  const date = new Date(value + "T00:00:00Z");
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

const commonXAxisProps = {
  dataKey: "date" as const,
  tickFormatter: formatXTick,
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  axisLine: { stroke: "hsl(var(--border))" },
  tickLine: false,
  interval: "preserveStartEnd" as const,
  minTickGap: 60,
};

const cartesianGridProps = {
  strokeDasharray: "3 3",
  stroke: "hsl(var(--border))",
  vertical: false,
};

// ─── 커스텀 툴팁 ─────────────────────────────────────────────────────────────
interface ChartTooltipProps extends TooltipProps<number, string> {
  labelMap: Record<string, string>;
  formatters?: Record<string, (v: number) => string>;
}

function ChartTooltip({ active, payload, label, labelMap, formatters }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry) => {
        const key = entry.dataKey as string;
        const displayLabel = labelMap[key] ?? key;
        const fmt = formatters?.[key];
        const val = entry.value;
        const formatted =
          val == null
            ? "—"
            : fmt
            ? fmt(val)
            : val.toLocaleString("en-US", { maximumFractionDigits: 2 });
        return (
          <p key={key} style={{ color: entry.color }} className="flex justify-between gap-4">
            <span>{displayLabel}</span>
            <span className="tabular-nums">{formatted}</span>
          </p>
        );
      })}
    </div>
  );
}

// ─── 빈 데이터 표시 ──────────────────────────────────────────────────────────
function NoDataPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ─── Chart 1: 실질임금 상승률 ────────────────────────────────────────────────
// FRED AHETPI YoY(%) - CPIAUCSL YoY(%) = 실질임금 상승률 근사
// 양수(녹색)=실질 구매력 증가, 음수(적색)=실질 구매력 감소
export function RealWageChart({ data }: { data: EconomicIndexBar[] }) {
  const hasData = data.some((d) => d.realWageGrowth !== undefined);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">실질임금 상승률</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          명목임금 YoY (FRED AHETPI) − CPI YoY (FRED CPIAUCSL) 근사치 · 단위: %
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {!hasData ? (
          <NoDataPlaceholder message="FRED AHETPI / CPIAUCSL 데이터 로드 중이거나 조회 기간을 늘려주세요." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart
              data={data}
              syncId={SYNC_ID}
              margin={{ top: 4, right: 63, left: 8, bottom: 4 }}
            >
              <CartesianGrid {...cartesianGridProps} />
              <XAxis {...commonXAxisProps} />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: COLORS.realWagePos }}
                axisLine={false}
                tickLine={false}
                width={55}
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              {/* 0% 기준선 — 실질임금 플러스/마이너스 구분 */}
              <ReferenceLine
                yAxisId="left"
                y={0}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: "0%", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelMap={{ realWageGrowth: "실질임금 상승률" }}
                    formatters={{ realWageGrowth: (v) => `${v.toFixed(2)}%` }}
                  />
                }
              />
              {/* Bar — 값에 따라 양수=녹색, 음수=빨강으로 색상 분리 */}
              <Bar
                dataKey="realWageGrowth"
                yAxisId="left"
                name="실질임금 상승률"
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.realWageGrowth === undefined
                        ? "transparent"
                        : entry.realWageGrowth >= 0
                        ? COLORS.realWagePos
                        : COLORS.realWageNeg
                    }
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Chart 2: Markit Manufacturing PMI (MPMIE 레벨) ─────────────────────────
// FRED MPMIE — S&P Global(Markit) 제조업 PMI 지수 레벨 (50 이상: 경기 확장, 이하: 수축)
// NAPM(ISM) 데이터 공유 계약 종료 이후 대체 지표로 사용
export function MpmieChart({ data }: { data: EconomicIndexBar[] }) {
  const hasData = data.some((d) => d.mpmie !== undefined);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Markit 제조업 PMI</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          <span style={{ color: COLORS.ism }}>● S&P Global Manufacturing PMI</span>
          &nbsp;(Alpha Vantage) — 50 이상: 확장 / 50 이하: 수축
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {!hasData ? (
          <NoDataPlaceholder message="데이터 없음 — ALPHA_VANTAGE_KEY를 확인하거나 API 일일 한도(25회)를 초과했을 수 있습니다." />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart
              data={data}
              syncId={SYNC_ID}
              margin={{ top: 4, right: 63, left: 8, bottom: 4 }}
            >
              <CartesianGrid {...cartesianGridProps} />
              <XAxis {...commonXAxisProps} />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: COLORS.ism }}
                axisLine={false}
                tickLine={false}
                width={55}
                domain={[30, 70]}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              {/* 50 기준선 — PMI 확장/수축 경계 */}
              <ReferenceLine
                yAxisId="left"
                y={50}
                stroke="#94a3b8"
                strokeDasharray="4 4"
                strokeWidth={1}
                label={{ value: "50", position: "insideTopRight", fontSize: 10, fill: "#94a3b8" }}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelMap={{ mpmie: "Markit PMI" }}
                    formatters={{ mpmie: (v) => v.toFixed(1) }}
                  />
                }
              />
              {/* Line — PMI는 레벨 값이므로 라인 차트가 추세를 더 잘 표현 */}
              <Line
                type="monotone"
                dataKey="mpmie"
                yAxisId="left"
                stroke={COLORS.ism}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                name="ISM PMI"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Chart 4: 한국 월간 수출 ─────────────────────────────────────────────────
// ECOS 관세청 기준 601Y031 — 수출금액(백만달러)
export function KoreaExportChart({ data }: { data: EconomicIndexBar[] }) {
  const hasData = data.some((d) => d.koreaExport !== undefined);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">한국 월간 수출</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          <span style={{ color: COLORS.koreaExport }}>● 수출금액 (백만달러)</span>
          &nbsp;— 관세청 통관 기준 (ECOS 601Y031)
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {!hasData ? (
          <NoDataPlaceholder message="ECOS_API_KEY 또는 stat code 설정 필요 (601Y031)" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart
              data={data}
              syncId={SYNC_ID}
              margin={{ top: 4, right: 63, left: 8, bottom: 4 }}
            >
              <CartesianGrid {...cartesianGridProps} />
              <XAxis {...commonXAxisProps} />
              <YAxis
                yAxisId="left"
                orientation="left"
                tick={{ fontSize: 11, fill: COLORS.koreaExport }}
                axisLine={false}
                tickLine={false}
                width={55}
                domain={["auto", "auto"]}
                // 백만달러 → 십억달러 변환 (가독성)
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}B`}
              />
              <Tooltip
                content={
                  <ChartTooltip
                    labelMap={{ koreaExport: "한국 수출" }}
                    formatters={{ koreaExport: (v) => `$${v.toLocaleString()}M` }}
                  />
                }
              />
              <Bar
                dataKey="koreaExport"
                yAxisId="left"
                name="한국 수출"
                fill={COLORS.koreaExport}
                fillOpacity={0.8}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
