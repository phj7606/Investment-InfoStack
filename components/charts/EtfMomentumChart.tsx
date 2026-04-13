"use client";

// ETF 변동성 조정 모멘텀 세로 막대 차트 클라이언트 컴포넌트
// recharts BarChart 기반 — RSC 호환 불가이므로 "use client" 필수
//
// 기본 뷰: 종합 score 단일 바 (세로 막대, 1위가 왼쪽)
// 상세 뷰: m3/m6/m12 3색 Grouped Bar

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import type { EtfMomentumResult } from "@/types";

interface EtfMomentumChartProps {
  data: EtfMomentumResult[];
  market: "kr" | "us";
}

// recharts tooltip 커스텀 스타일
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "12px",
  color: "hsl(var(--foreground))",
};

// 차트 색상 팔레트 — CSS 변수 대신 직접 지정 (다크모드 렌더링 일관성)
const COLORS = {
  // 종합 점수: 짙은 남색 (양수) / 빨강 (음수)
  positive: "#1e3a8a",  // navy blue-900
  negative: "#ef4444",  // red-500
  // 3M/6M/12M 기간별 구분색
  m3:  "#1e40af",       // blue-800 — 단기 모멘텀
  m6:  "#0891b2",       // cyan-600 — 중기 모멘텀
  m12: "#7c3aed",       // violet-600 — 장기 모멘텀
};

/**
 * 단일 바 색상 결정
 * score >= 0: 짙은 남색(긍정 모멘텀), < 0: 빨강(부정 모멘텀)
 */
function barFill(value: number): string {
  return value >= 0 ? COLORS.positive : COLORS.negative;
}

export function EtfMomentumChart({ data, market }: EtfMomentumChartProps) {
  // false: 종합 score 뷰 / true: m3/m6/m12 상세 뷰
  const [showDetail, setShowDetail] = useState(false);

  // Top 10만 표시, rank 오름차순 (1위가 왼쪽)
  const chartData = [...data]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10)
    .map((d) => ({
      symbol: d.symbol,
      name: d.name,
      score: parseFloat(d.score.toFixed(3)),
      m3:  parseFloat(d.periods.m3.toFixed(3)),
      m6:  parseFloat(d.periods.m6.toFixed(3)),
      m12: parseFloat(d.periods.m12.toFixed(3)),
      // 한국 ETF는 브랜드 접두어 제거해 X축 레이블 단축
      label: market === "us"
        ? d.symbol
        : d.name.replace(/^(KODEX|TIGER|KBSTAR|HANARO|ARIRANG) /, ""),
    }));

  return (
    <div className="space-y-3">
      {/* 뷰 전환 버튼 */}
      <div className="flex items-center gap-2 justify-end">
        <Button
          variant={showDetail ? "outline" : "default"}
          size="sm"
          onClick={() => setShowDetail(false)}
        >
          종합 점수
        </Button>
        <Button
          variant={showDetail ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDetail(true)}
        >
          3M/6M/12M 상세
        </Button>
      </div>

      {/* 세로 막대 차트 — X축: 심볼/ETF명, Y축: 모멘텀 점수 */}
      <ResponsiveContainer width="100%" height={320}>
        {showDetail ? (
          // ── 상세 뷰: 3개 기간 Grouped Bar ──────────────────────────
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 60, left: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              // 레이블이 겹치지 않도록 45도 기울임
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tickFormatter={(v) => v.toFixed(1)}
              tick={{ fontSize: 11 }}
              width={36}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number) => [v.toFixed(3), ""]}
            />
            <Legend
              formatter={(value: string) => {
                const labels: Record<string, string> = { m3: "3M(63일)", m6: "6M(126일)", m12: "12M(252일)" };
                return labels[value] ?? value;
              }}
              wrapperStyle={{ fontSize: 12 }}
              verticalAlign="top"
            />
            {/* 0선 기준선 */}
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="m3"  name="m3"  fill={COLORS.m3}  radius={[2, 2, 0, 0]} />
            <Bar dataKey="m6"  name="m6"  fill={COLORS.m6}  radius={[2, 2, 0, 0]} />
            <Bar dataKey="m12" name="m12" fill={COLORS.m12} radius={[2, 2, 0, 0]} />
          </BarChart>
        ) : (
          // ── 기본 뷰: 종합 score 단일 세로 바 ───────────────────────
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 60, left: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              angle={-40}
              textAnchor="end"
              interval={0}
            />
            <YAxis
              tickFormatter={(v) => v.toFixed(1)}
              tick={{ fontSize: 11 }}
              width={36}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, _name, props) => [
                v.toFixed(3),
                props.payload?.name ?? "점수",
              ]}
            />
            {/* 0선 기준선 */}
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="score" radius={[3, 3, 0, 0]}>
              {/* 양수/음수에 따라 바 색상 분기 */}
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={barFill(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        )}
      </ResponsiveContainer>

      {/* 차트 데이터 없을 때 안내 */}
      {chartData.length === 0 && (
        <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
          모멘텀 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
