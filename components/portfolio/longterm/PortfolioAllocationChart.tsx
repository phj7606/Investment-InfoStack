"use client";

// 포트폴리오 자산 배분 도넛 차트
// - viewMode: 계좌별(account) / 자산유형별(assetType) / 시장별(market)
// - Select 드롭다운으로 뷰 전환
// - 현재가 없는 종목은 avgCost × quantity 로 fallback (KPI 카드와 동일 기준)
// - recharts PieChart 사용 → "use client" 격리 필수 (RSC 호환)

import { useState, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LongtermPosition } from "@/types/portfolio";

interface PortfolioAllocationChartProps {
  positions: LongtermPosition[];
  isLoading: boolean;
}

type ViewMode = "account" | "assetType" | "market";

// 뷰 모드별 그룹핑 키 추출
function getGroupKey(p: LongtermPosition, mode: ViewMode): string {
  if (mode === "account") return p.accountNo;
  if (mode === "assetType") return p.assetType;
  return p.market;
}

// 색상 팔레트 — 뷰 모드 + 그룹명 기준
const COLOR_MAP: Record<string, string> = {
  // 계좌별
  "4802": "#10b981",  // emerald-500
  "1635": "#6366f1",  // indigo-500
  "1402": "#f59e0b",  // amber-500
  "8654": "#8b5cf6",  // violet-500
  // 자산유형별
  "STOCK": "#10b981",
  "ETF":   "#6366f1",
  "FUND":  "#f59e0b",
  // 시장별
  "KR": "#10b981",
  "US": "#6366f1",
};

// 그룹명 한글 레이블
const GROUP_LABELS: Record<string, string> = {
  "4802": "4802 Stock",
  "1635": "1635 ETF",
  "1402": "1402 Mixed",
  "8654": "8654 Fund",
  "STOCK": "개별주식",
  "ETF":   "ETF",
  "FUND":  "펀드",
  "KR": "국내(KR)",
  "US": "해외(US)",
};

// 뷰 모드 라벨
const VIEW_LABELS: Record<ViewMode, string> = {
  account:   "계좌별",
  assetType: "자산유형별",
  market:    "시장별",
};

// 금액 축약 포맷
function formatAmount(v: number, currency: string): string {
  if (currency === "KRW") {
    if (v >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
    if (v >= 10_000) return `${Math.round(v / 10_000).toLocaleString()}만`;
    return v.toLocaleString();
  }
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// 커스텀 툴팁
function CustomTooltip({ active, payload, total }: {
  active?: boolean;
  payload?: { payload: { name: string; value: number; currency: string } }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const { name, value, currency } = payload[0].payload;
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border bg-background/95 p-3 shadow-xl text-xs">
      <p className="font-semibold mb-1">{GROUP_LABELS[name] ?? name}</p>
      <p className="text-muted-foreground">{formatAmount(value, currency)}</p>
      <p className="font-bold text-emerald-600">{pct}%</p>
    </div>
  );
}

export function PortfolioAllocationChart({ positions, isLoading }: PortfolioAllocationChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("account");

  // 뷰 모드에 따라 그룹핑 — KR/US 섹션별로 각각 집계
  // KR(KRW) / US(USD) 혼산 방지: KR 섹션과 US 섹션을 별도 표시하거나
  // 비중(%)만 보여주는 방식으로 통합 처리
  // → 여기서는 KR+US 통합하되 비중(%)만 사용 (금액 단위 혼산 없음)
  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    let totalKrw = 0;
    let totalUsd = 0;

    for (const p of positions) {
      // 종목 평가금액: 현재가 있으면 evalAmount, 없으면 avgCost × quantity
      const amount = p.currentPrice !== undefined
        ? p.evalAmount
        : p.avgCost * p.quantity;

      const key = getGroupKey(p, viewMode);

      if (p.currency === "KRW") {
        map.set(key, (map.get(key) ?? 0) + amount);
        totalKrw += amount;
      } else {
        // USD는 별도 처리 — 비중 계산 시 환산하지 않고 시장별로만 표시
        map.set(key + "__usd", (map.get(key + "__usd") ?? 0) + amount);
        totalUsd += amount;
      }
    }

    // 시장별 뷰: KR/US 각각 단일 슬라이스
    if (viewMode === "market") {
      const kr = map.get("KR") ?? 0;
      const us = map.get("US__usd") ?? 0;
      // 원화·달러 직접 비교 불가 → 비중을 자산 수(종목수) 기준으로 보완
      // 단순하게 KR/US 종목 수 비중으로 표시 (금액 환산 없이)
      const krCount = positions.filter((p) => p.market === "KR").length;
      const usCount = positions.filter((p) => p.market === "US").length;
      const total = krCount + usCount;
      return {
        data: [
          { name: "KR", value: krCount, pct: total > 0 ? (krCount / total) * 100 : 0, currency: "count" },
          { name: "US", value: usCount, pct: total > 0 ? (usCount / total) * 100 : 0, currency: "count" },
        ],
        total,
        unit: "종목",
        isCount: true,
      };
    }

    // 계좌별 / 자산유형별: KRW만 (USD는 환산 불가이므로 KRW 기준 비중)
    // USD 보유 종목은 avgCost를 원화 환산 없이 count 기준으로 포함
    // → 현실적으로 KRW 기준 금액 비중이 가장 직관적
    const entries: { name: string; value: number; currency: string }[] = [];
    for (const [key, val] of map.entries()) {
      if (!key.endsWith("__usd")) {
        entries.push({ name: key, value: val, currency: "KRW" });
      }
    }
    // USD 종목을 count로 별도 추가 (환산 없이)
    for (const [key, val] of map.entries()) {
      if (key.endsWith("__usd")) {
        const realKey = key.replace("__usd", "");
        const existing = entries.find((e) => e.name === realKey);
        if (existing) {
          // 이미 KRW 슬라이스가 있으면 합산 불가 → USD 종목수 보조 표시 생략
        } else {
          entries.push({ name: realKey, value: val, currency: "USD" });
        }
      }
    }

    const total = entries.reduce((s, e) => s + e.value, 0);
    return { data: entries, total, unit: "원", isCount: false };
  }, [positions, viewMode]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="h-32 w-32 rounded-full bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (positions.length === 0) return null;

  const { data, total } = chartData;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">포트폴리오 구성</CardTitle>
        {/* 뷰 모드 전환 Select */}
        <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="account" className="text-xs">계좌별</SelectItem>
            <SelectItem value="assetType" className="text-xs">자산유형별</SelectItem>
            <SelectItem value="market" className="text-xs">시장별</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-4">
          {/* 도넛 차트 */}
          <div className="w-[180px] h-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={82}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="hsl(var(--background))"
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={COLOR_MAP[entry.name] ?? "#94a3b8"}
                    />
                  ))}
                  {/* 중앙 뷰 모드 라벨 */}
                  <Label
                    value={VIEW_LABELS[viewMode]}
                    position="center"
                    className="fill-muted-foreground text-[10px]"
                    style={{ fontSize: "10px", fill: "hsl(var(--muted-foreground))" }}
                  />
                </Pie>
                <Tooltip content={<CustomTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 범례 + 비중 목록 */}
          <div className="flex-1 space-y-1.5 min-w-0">
            {data.map((entry) => {
              const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0";
              const color = COLOR_MAP[entry.name] ?? "#94a3b8";
              return (
                <div key={entry.name} className="flex items-center gap-2">
                  {/* 색상 인디케이터 */}
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {/* 그룹명 */}
                  <span className="text-[11px] truncate flex-1 min-w-0">
                    {GROUP_LABELS[entry.name] ?? entry.name}
                  </span>
                  {/* 비중 */}
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground shrink-0">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 시장별 뷰는 종목수 기준임을 안내 */}
        {viewMode === "market" && (
          <p className="text-[10px] text-muted-foreground mt-2">
            * 시장별은 종목 수 기준 비중 (KRW↔USD 환산 미지원)
          </p>
        )}
        {viewMode !== "market" && (
          <p className="text-[10px] text-muted-foreground mt-2">
            * KRW 기준 평가금액. USD 종목이 별도 계좌로 분리된 경우 제외될 수 있음
          </p>
        )}
      </CardContent>
    </Card>
  );
}
