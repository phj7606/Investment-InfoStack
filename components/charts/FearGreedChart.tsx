"use client";

/**
 * Fear & Greed Oscillator 차트 (한국 시장)
 *
 * recharts는 클래스 컴포넌트 기반이므로 'use client' 필수
 * RSC에서 직접 import 금지 — kr-market/page.tsx에서 props로 데이터 전달
 *
 * 2-Track 구조:
 *   Track 1 — F&G Level: 0~100 지수 + 5존 색상 배경 (극단공포~극단탐욕)
 *   Track 2 — F&G Momentum (MACD): 방향 전환 타이밍 보조 신호
 */

import {
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { FearGreedHistoryPoint, MarketRegime } from "@/types";

// 각 Regime의 한글 레이블
const REGIME_LABELS: Record<MarketRegime, string> = {
  extreme_fear:  "극단적 공포",
  fear:          "공포",
  neutral:       "중립",
  greed:         "탐욕",
  extreme_greed: "극단적 탐욕",
};

// Regime별 색상 (Track 1 라인 색상에도 사용)
const REGIME_COLORS: Record<MarketRegime, string> = {
  extreme_fear:  "#ef4444",
  fear:          "#f97316",
  neutral:       "#6b7280",
  greed:         "#84cc16",
  extreme_greed: "#22c55e",
};

// 5-zone 배경 구간 정의
const ZONES = [
  { y1: 0,  y2: 20,  fill: "#ef4444", label: "극단적 공포" },
  { y1: 20, y2: 40,  fill: "#f97316", label: "공포" },
  { y1: 40, y2: 60,  fill: "#6b7280", label: "중립" },
  { y1: 60, y2: 80,  fill: "#84cc16", label: "탐욕" },
  { y1: 80, y2: 100, fill: "#22c55e", label: "극단적 탐욕" },
] as const;

interface FearGreedChartProps {
  data: FearGreedHistoryPoint[];
  /** Track 1 높이 (px, 기본: 240) */
  track1Height?: number;
  /** Track 2 높이 (px, 기본: 160) */
  track2Height?: number;
}

// XAxis 날짜 포맷: "YYYY-MM-DD" → "MM-DD"
function formatDateTick(date: string): string {
  return date.slice(5);
}

// ────────────────────────────────────────────────────────────────
// Track 1 커스텀 툴팁
// ────────────────────────────────────────────────────────────────

interface Track1TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: FearGreedHistoryPoint }>;
  label?: string;
}

function Track1Tooltip({ active, payload, label }: Track1TooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const comp  = point.components;

  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-md">
      {/* 날짜 및 지수 요약 */}
      <div className="mb-2 font-semibold">{label}</div>
      <div
        className="mb-2 text-lg font-bold"
        style={{ color: REGIME_COLORS[point.regime] }}
      >
        {point.value.toFixed(1)}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          {REGIME_LABELS[point.regime]}
        </span>
      </div>

      {/* 7개 구성 요소 */}
      <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
        <ComponentRow label="모멘텀"        value={comp.momentum} />
        <ComponentRow label="변동성(반전)"   value={comp.volatility} />
        <ComponentRow label="신용스프레드(반전)" value={comp.creditSpread} />
        <ComponentRow label="P/C 비율(반전)" value={comp.pcRatio} />
        <ComponentRow label="A/D Line"      value={comp.adLine} />
        <ComponentRow label="외국인순매수"   value={comp.foreignNet} />
        <ComponentRow label="신용잔고변화율" value={comp.marginBalance} />
      </div>
    </div>
  );
}

function ComponentRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value === null) return null;
  return (
    <div className="flex justify-between gap-4">
      <span>{label}</span>
      <span className="tabular-nums">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Track 2 커스텀 툴팁
// ────────────────────────────────────────────────────────────────

interface Track2TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: string;
}

function Track2Tooltip({ active, payload, label }: Track2TooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover p-3 text-sm shadow-md">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((entry) =>
        entry.value !== null ? (
          <div key={entry.name} className="flex justify-between gap-4 text-xs">
            <span style={{ color: entry.color }}>{entry.name}</span>
            <span className="tabular-nums">{entry.value.toFixed(3)}</span>
          </div>
        ) : null
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ────────────────────────────────────────────────────────────────

export function FearGreedChart({
  data,
  track1Height = 240,
  track2Height = 160,
}: FearGreedChartProps) {
  if (!data.length) return null;

  return (
    // 두 트랙 사이의 간격 없이 수직 배치
    <div className="w-full">
      {/* ── Track 1: F&G Level ── */}
      <div style={{ height: track1Height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />

            {/* 5-zone 배경: 각 구간을 연한 색으로 채워 심리 레벨 직관화 */}
            {ZONES.map((zone) => (
              <ReferenceArea
                key={zone.y1}
                y1={zone.y1}
                y2={zone.y2}
                fill={zone.fill}
                fillOpacity={0.07}
              />
            ))}

            {/* 50 중립선 */}
            <ReferenceLine
              y={50}
              stroke="hsl(var(--border))"
              strokeDasharray="4 2"
              label={{ value: "50", position: "right", fontSize: 10 }}
            />

            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              // 가독성을 위해 약 월 1회 빈도로 표시
              interval={Math.floor(data.length / 12)}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />

            <Tooltip content={<Track1Tooltip />} />

            {/* F&G Index Area 라인 */}
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.15}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ── Track 2: F&G Momentum (MACD) ── */}
      <div style={{ height: track2Height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 0, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />

            {/* 제로선: 심리 전환 기준선 */}
            <ReferenceLine
              y={0}
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
            />

            <XAxis
              dataKey="date"
              tickFormatter={formatDateTick}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10 }}
              interval={Math.floor(data.length / 12)}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={30}
            />

            <Tooltip content={<Track2Tooltip />} />

            {/* 히스토그램 바: 양수=탐욕(초록), 음수=공포(빨강) */}
            <Bar dataKey="fgHistogram" name="히스토그램" maxBarSize={4}>
              {data.map((entry, index) => (
                <Cell
                  key={index}
                  fill={
                    entry.fgHistogram !== null && entry.fgHistogram >= 0
                      ? "#22c55e"
                      : "#ef4444"
                  }
                  fillOpacity={0.75}
                />
              ))}
            </Bar>

            {/* MACD 라인 */}
            <Line
              type="monotone"
              dataKey="fgMacd"
              name="MACD"
              stroke="#3b82f6"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
            />

            {/* Signal 라인 (점선) */}
            <Line
              type="monotone"
              dataKey="fgSignal"
              name="Signal"
              stroke="#f97316"
              strokeWidth={1}
              strokeDasharray="4 2"
              dot={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 범례 */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Track 2 범례:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-5 bg-blue-500" /> MACD
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-5 bg-orange-400" style={{ borderTop: "1px dashed" }} /> Signal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-green-500 opacity-75" /> 상승 모멘텀
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm bg-red-500 opacity-75" /> 하락 모멘텀
        </span>
      </div>
    </div>
  );
}
