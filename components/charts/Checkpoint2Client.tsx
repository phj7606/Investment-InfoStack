"use client";

// 재무 체크포인트 2 — 이익을 내는가
//
// IS(손익계산서) + BS(재무상태표) 데이터를 기반으로 수익성 5개 차트 렌더링
//
// 차트 구성:
//   1) 매출액 트렌드 + YoY/QoQ 증감율 (이중 Y축: Bar + Line)
//   2) 영업이익 트렌드 + YoY/QoQ 증감율 (이중 Y축: Bar + Line)
//   3) 매출액 vs 매출채권 (Grouped Bar — 채권 회수 속도 추적)
//   4) 매출원가 vs 재고자산 (Grouped Bar — 재고 누적 여부 추적)
//   5) Cash Conversion Cycle (DSO/DIO/DPO 분해 Bar + CCC Line)
//
// CCC 계산 방식:
//   - KR: Naver 활동성 API(/api/naver-activity)에서 사전 계산된 회전율 사용
//          DSO/DIO/DPO = 365 / 각 회전율 (Naver가 이미 평균 BS 기준으로 계산)
//   - US: rawItems에서 직접 계산 — 분모=매출액, 분자=(전기+당기)/2 평균
//
// 기간 토글:
//   - 연간(rawItems): 차트 1~5 모두 가능
//   - 분기(quarterlyItems): 차트 1~4만 가능 (CCC는 항상 연간)
//   - 분기 탭은 KR && quarterlyItems 존재 시에만 활성화

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FinancialStatements, RawDartItem, NaverActivityResult } from "@/types/fundamental-screening";

// ── 색상 ─────────────────────────────────────────────────────────────────────
const COLORS = {
  revenue:      "#6366f1",  // 인디고 — 매출액
  operatingInc: "#10b981",  // 에메랄드 — 영업이익
  cogs:         "#ef4444",  // 레드 — 매출원가
  receivables:  "#8b5cf6",  // 바이올렛 — 매출채권
  inventory:    "#f97316",  // 오렌지 — 재고자산
  growth:       "#94a3b8",  // 슬레이트 — YoY/QoQ 증감율 라인
  dso:          "#6366f1",  // 인디고 — DSO
  dio:          "#f97316",  // 오렌지 — DIO
  dpo:          "#10b981",  // 에메랄드 — DPO (음수 bar)
  ccc:          "#0f172a",  // 다크 — CCC 합계 라인
} as const;

// ── KR 계정명 키워드 (FnGuide 계정명에 partial match) ─────────────────────────

const KR = {
  revenue:      ["매출액"],
  operatingInc: ["영업이익"],
  cogs:         ["매출원가"],
  receivables:  ["매출채권"],   // "매출채권및기타채권" 포함
  inventory:    ["재고자산"],
  payables:     ["매입채무"],   // US CCC 계산 fallback용
};

// ── US 계정명 (Alpha Vantage label, exact match) ─────────────────────────────

const US = {
  revenue:      ["Total Revenue"],
  operatingInc: ["Operating Income"],
  cogs:         ["Cost of Revenue"],
  receivables:  ["Trade Receivable"],
  inventory:    ["Inventory"],
  payables:     ["Accounts Payable"],
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** HTML 엔티티 제거 — FnGuide account_nm에 &nbsp; 등 포함 */
function stripHtml(str: string): string {
  return str.replace(/&nbsp;/g, "").replace(/&amp;/g, "&").trim();
}

/**
 * rawItems에서 특정 계정 항목 추출
 * - KR: partial match (FnGuide 계정명 일부 포함 여부)
 * - US: exact match (Alpha Vantage 레이블 정확 일치)
 * - 여러 항목 매칭 시 level 0(대분류) 우선 — 이중 계산 방지
 */
function extractAccount(
  items: RawDartItem[],
  sj_div: string,
  keywords: string[],
  isKR: boolean
): RawDartItem | null {
  const sectionItems = items.filter((i) => i.sj_div === sj_div);
  const matched = sectionItems.filter((i) =>
    isKR
      ? keywords.some((k) => stripHtml(i.account_nm).includes(k))
      : keywords.includes(i.account_nm)
  );
  if (matched.length === 0) return null;
  // level 오름차순 정렬 → 대분류(level 0) 우선 선택
  return matched.sort((a, b) => (a.level ?? 99) - (b.level ?? 99))[0];
}

/** RawDartItem에서 연도별 값 배열 추출 */
function getValues(item: RawDartItem | null, years: string[]): (number | null)[] {
  if (!item) return years.map(() => null);
  return years.map((yr) => item.amounts.find((a) => a.year === yr)?.value ?? null);
}

/**
 * 연도별 증감율 계산
 * - 연간 모드: YoY (전년 대비)
 * - 분기 모드: QoQ (전분기 대비)
 * - 직전 값이 null 또는 0이면 null 반환
 */
function calcGrowthRate(values: (number | null)[]): (number | null)[] {
  return values.map((v, i) => {
    if (i === 0 || v === null) return null;
    const prev = values[i - 1];
    if (prev === null || prev === 0) return null;
    return ((v - prev) / Math.abs(prev)) * 100;
  });
}

/**
 * 숫자 Y축 포맷터 — 단위 자동 축약
 * KR(억원): 10000억 → 1조, 1000억 → 1천억
 * US(백만달러): 1000M → 1B
 */
function fmtAxis(v: number, unit: string): string {
  const isKR = unit === "억원";
  if (isKR) {
    if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(0)}조`;
    if (Math.abs(v) >= 1000)  return `${(v / 1000).toFixed(1)}천억`;
    return `${v}`;
  } else {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}B`;
    return `${v}M`;
  }
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────────────

/** 금액 + 증감율 혼합 툴팁 (이중 Y축 차트용) */
function TrendTooltip({
  active, payload, label, unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => {
        // 증감율 항목은 '%' 단위로 표시
        const isGrowth = String(p.name).includes("증감율");
        return (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: p.color }}
              />
              {p.name}
            </span>
            <span className="tabular-nums font-medium">
              {isGrowth
                ? `${((p.value as number) ?? 0).toFixed(1)}%`
                : `${((p.value as number) ?? 0).toLocaleString("ko-KR")} ${unit}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** 단순 금액 툴팁 (grouped bar 차트용) */
function SimpleTooltip({
  active, payload, label, unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ background: p.color }}
            />
            {p.name}
          </span>
          <span className="tabular-nums">
            {((p.value as number) ?? 0).toLocaleString("ko-KR")} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/** CCC 차트 툴팁 — 일수 단위 */
function CccTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold mb-1">{label}년</p>
      {payload.map((p) => {
        const val = (p.value as number) ?? 0;
        const isCcc = p.name === "CCC";
        return (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: p.color ?? (isCcc ? COLORS.ccc : undefined) }}
              />
              {p.name}
            </span>
            <span className={`tabular-nums font-medium ${isCcc && val < 0 ? "text-emerald-600" : ""}`}>
              {val.toFixed(1)}일
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── 서브 차트 컴포넌트 ────────────────────────────────────────────────────────

/** 공용 XAxis/YAxis 스타일 */
const axisStyle = {
  tick: { fontSize: 11, fill: "hsl(var(--muted-foreground))" },
  axisLine: { stroke: "hsl(var(--border))" },
  tickLine: false as const,
};

/** 차트 1/2 공용: 값 Bar + 증감율 Line (이중 Y축) */
function TrendChart({
  data,
  valueKey,
  valueLabel,
  valueColor,
  growthLabel,
  unit,
}: {
  data: { year: string; value: number | null; growth: number | null }[];
  valueKey: string;
  valueLabel: string;
  valueColor: string;
  growthLabel: string;
  unit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="year" {...axisStyle} />

        {/* 왼쪽 Y축: 금액 (억원 / 백만달러) */}
        <YAxis
          yAxisId="left"
          orientation="left"
          {...axisStyle}
          axisLine={false}
          tickFormatter={(v: number) => fmtAxis(v, unit)}
        />

        {/* 오른쪽 Y축: 증감율 (%) */}
        <YAxis
          yAxisId="right"
          orientation="right"
          {...axisStyle}
          axisLine={false}
          unit="%"
          tickFormatter={(v: number) => `${v.toFixed(0)}`}
        />

        <Tooltip content={<TrendTooltip unit={unit} />} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
        <ReferenceLine yAxisId="right" y={0} stroke="hsl(var(--border))" strokeDasharray="4 2" />

        {/* 금액 Bar — 왼쪽 축 */}
        <Bar
          yAxisId="left"
          dataKey="value"
          name={valueLabel}
          fill={valueColor}
          radius={[2, 2, 0, 0]}
          maxBarSize={48}
        />

        {/* 증감율 Line — 오른쪽 축 */}
        <Line
          yAxisId="right"
          dataKey="growth"
          name={growthLabel}
          stroke={COLORS.growth}
          strokeWidth={1.5}
          dot={{ r: 3, fill: COLORS.growth }}
          connectNulls={false}
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** 차트 3/4 공용: 두 항목 Grouped Bar */
function GroupedBarChart({
  data,
  keyA,
  labelA,
  colorA,
  keyB,
  labelB,
  colorB,
  unit,
}: {
  data: { year: string; [key: string]: number | null | string }[];
  keyA: string;
  labelA: string;
  colorA: string;
  keyB: string;
  labelB: string;
  colorB: string;
  unit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="year" {...axisStyle} />
        <YAxis
          {...axisStyle}
          axisLine={false}
          tickFormatter={(v: number) => fmtAxis(v, unit)}
        />
        <Tooltip content={<SimpleTooltip unit={unit} />} />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
        <Bar dataKey={keyA} name={labelA} fill={colorA} radius={[2, 2, 0, 0]} maxBarSize={36} />
        <Bar dataKey={keyB} name={labelB} fill={colorB} radius={[2, 2, 0, 0]} maxBarSize={36} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface Props {
  rawData: FinancialStatements;
}

export function Checkpoint2Client({ rawData }: Props) {
  const isKR = rawData.exchange === "KRX";
  const hasQuarterly = isKR && !!rawData.quarterlyItems?.length;
  const unit = rawData.unit;

  // 기간 토글 상태 — CCC는 항상 연간 사용
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");

  // KR 종목: Naver 활동성 API에서 CCC용 회전율 데이터 수집
  const [activityData, setActivityData] = useState<NaverActivityResult | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  useEffect(() => {
    if (!isKR) return;
    setActivityData(null);
    setActivityLoading(true);
    fetch(`/api/naver-activity?ticker=${rawData.ticker}`)
      .then((r) => r.json())
      .then((data: NaverActivityResult) => setActivityData(data))
      .catch((err) => console.error("[Checkpoint2] Naver activity 수집 실패:", err))
      .finally(() => setActivityLoading(false));
  // rawData.ticker + exchange 변경 시 재수집
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData.ticker, rawData.exchange]);

  // 선택된 기간의 items
  const displayItems =
    period === "quarterly" && hasQuarterly ? rawData.quarterlyItems! : rawData.rawItems;

  // 연도 목록 추출 (IS 기준, 오름차순)
  const years = Array.from(
    new Set(
      displayItems
        .filter((i) => i.sj_div === "IS")
        .flatMap((i) => i.amounts.map((a) => a.year))
    )
  ).sort();

  // 연간 연도 목록 (CCC 계산용 — 항상 rawItems 기준)
  const annualYears = Array.from(
    new Set(
      rawData.rawItems
        .filter((i) => i.sj_div === "IS")
        .flatMap((i) => i.amounts.map((a) => a.year))
        .filter((y) => !y.includes("Q"))
    )
  ).sort();

  if (years.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          손익계산서(IS) 데이터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  // ── 계정 추출 ──────────────────────────────────────────────────────────────

  const revItem  = extractAccount(displayItems, "IS", isKR ? KR.revenue      : US.revenue,      isKR);
  const opItem   = extractAccount(displayItems, "IS", isKR ? KR.operatingInc : US.operatingInc, isKR);
  const cogsItem = extractAccount(displayItems, "IS", isKR ? KR.cogs         : US.cogs,         isKR);
  const recvItem = extractAccount(displayItems, "BS", isKR ? KR.receivables  : US.receivables,  isKR);
  const invItem  = extractAccount(displayItems, "BS", isKR ? KR.inventory    : US.inventory,    isKR);

  const revValues  = getValues(revItem,  years);
  const opValues   = getValues(opItem,   years);
  const cogsValues = getValues(cogsItem, years);
  const recvValues = getValues(recvItem, years);
  const invValues  = getValues(invItem,  years);

  // 증감율 계산 (연간=YoY, 분기=QoQ)
  const revGrowth = calcGrowthRate(revValues);
  const opGrowth  = calcGrowthRate(opValues);

  // 라벨 접미사
  const growthSuffix = period === "quarterly" ? "QoQ 증감율" : "YoY 증감율";

  // ── 차트 1: 매출액 트렌드 ──────────────────────────────────────────────────
  const revenueChartData = years.map((yr, i) => ({
    year: yr,
    value:  revValues[i],
    growth: revGrowth[i],
  }));

  // ── 차트 2: 영업이익 트렌드 ────────────────────────────────────────────────
  const opIncChartData = years.map((yr, i) => ({
    year: yr,
    value:  opValues[i],
    growth: opGrowth[i],
  }));

  // ── 차트 3: 매출액 vs 매출채권 ────────────────────────────────────────────
  const revRecvChartData = years.map((yr, i) => ({
    year:    yr,
    매출액:  revValues[i],
    매출채권: recvValues[i],
  }));

  // ── 차트 4: 매출원가 vs 재고자산 ──────────────────────────────────────────
  const cogsInvChartData = years.map((yr, i) => ({
    year:    yr,
    매출원가: cogsValues[i],
    재고자산: invValues[i],
  }));

  // ── 차트 5: CCC ────────────────────────────────────────────────────────────

  /**
   * KR: Naver API 회전율 → DSO/DIO/DPO 계산
   * US: rawItems에서 직접 계산 (Revenue 기준, (전기+당기)/2 평균)
   */
  const cccChartData = (() => {
    if (isKR) {
      // Naver API 데이터 사용
      if (!activityData?.rows?.length) return [];
      return activityData.rows
        .filter((r) => r.receivableTurnover && r.inventoryTurnover && r.payableTurnover)
        .map((r) => {
          const dso = 365 / r.receivableTurnover!;
          const dio = 365 / r.inventoryTurnover!;
          const dpo = 365 / r.payableTurnover!;
          const ccc = dso + dio - dpo;
          return {
            year: r.year,
            DSO: parseFloat(dso.toFixed(1)),
            DIO: parseFloat(dio.toFixed(1)),
            DPO: parseFloat((-dpo).toFixed(1)), // 음수로 표시 — bar가 아래로 향함
            CCC: parseFloat(ccc.toFixed(1)),
          };
        });
    } else {
      // US: rawItems 직접 계산 (분모=Revenue, 분자=(전기+당기)/2 평균)
      const annualItems = rawData.rawItems;
      const revUs   = extractAccount(annualItems, "IS", US.revenue,     false);
      const recvUs  = extractAccount(annualItems, "BS", US.receivables,  false);
      const invUs   = extractAccount(annualItems, "BS", US.inventory,    false);
      const payUs   = extractAccount(annualItems, "BS", US.payables,     false);

      const revVals  = getValues(revUs,  annualYears);
      const recvVals = getValues(recvUs, annualYears);
      const invVals  = getValues(invUs,  annualYears);
      const payVals  = getValues(payUs,  annualYears);

      return annualYears
        .map((yr, i) => {
          // 전기 데이터가 없는 첫 연도는 계산 불가
          if (i === 0) return null;
          const rev  = revVals[i];
          const recv = recvVals[i];
          const inv  = invVals[i];
          const pay  = payVals[i];
          const recvPrev = recvVals[i - 1];
          const invPrev  = invVals[i - 1];
          const payPrev  = payVals[i - 1];

          if (!rev || !recv || !inv || !pay || !recvPrev || !invPrev || !payPrev) return null;

          const avgRecv = (recvPrev + recv) / 2;
          const avgInv  = (invPrev  + inv)  / 2;
          const avgPay  = (payPrev  + pay)  / 2;

          const dso = (avgRecv / rev) * 365;
          const dio = (avgInv  / rev) * 365;
          const dpo = (avgPay  / rev) * 365;
          const ccc = dso + dio - dpo;

          return {
            year: yr,
            DSO: parseFloat(dso.toFixed(1)),
            DIO: parseFloat(dio.toFixed(1)),
            DPO: parseFloat((-dpo).toFixed(1)), // 음수 표시
            CCC: parseFloat(ccc.toFixed(1)),
          };
        })
        .filter((d): d is NonNullable<typeof d> => d !== null);
    }
  })();

  // 최신 연도 CCC — 배지 표시용
  const latestCcc = cccChartData[cccChartData.length - 1];

  return (
    <div className="space-y-4">
      {/* ── 기간 토글 ── */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">기간:</span>
        <div className="flex rounded-md border overflow-hidden text-xs">
          <button
            onClick={() => setPeriod("annual")}
            className={`px-3 py-1.5 transition-colors ${
              period === "annual"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            연간
          </button>
          <button
            onClick={() => setPeriod("quarterly")}
            disabled={!hasQuarterly}
            className={`px-3 py-1.5 transition-colors border-l disabled:opacity-40 disabled:cursor-not-allowed ${
              period === "quarterly"
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            분기 {!hasQuarterly && isKR === false && "(US 미지원)"}
          </button>
        </div>
        {period === "quarterly" && (
          <span className="text-[10px] text-muted-foreground">
            * CCC 차트는 연간 데이터 기준으로 표시됩니다.
          </span>
        )}
      </div>

      {/* ── 차트 1 + 2: 2열 그리드 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* 차트 1: 매출액 트렌드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">매출액 트렌드</CardTitle>
            <CardDescription className="text-xs">
              절대 금액({unit}) + {growthSuffix} — 매출 성장세 확인
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revItem ? (
              <TrendChart
                data={revenueChartData}
                valueKey="value"
                valueLabel={`매출액 (${unit})`}
                valueColor={COLORS.revenue}
                growthLabel={`매출액 ${growthSuffix}`}
                unit={unit}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                매출액 계정을 찾을 수 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 차트 2: 영업이익 트렌드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">영업이익 트렌드</CardTitle>
            <CardDescription className="text-xs">
              절대 금액({unit}) + {growthSuffix} — 이익 창출 능력 확인
            </CardDescription>
          </CardHeader>
          <CardContent>
            {opItem ? (
              <TrendChart
                data={opIncChartData}
                valueKey="value"
                valueLabel={`영업이익 (${unit})`}
                valueColor={COLORS.operatingInc}
                growthLabel={`영업이익 ${growthSuffix}`}
                unit={unit}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                영업이익 계정을 찾을 수 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── 차트 3 + 4: 2열 그리드 ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* 차트 3: 매출액 vs 매출채권 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">매출액 vs 매출채권</CardTitle>
            <CardDescription className="text-xs">
              매출채권이 매출액 대비 빠르게 증가하면 대금 회수 지연 신호
            </CardDescription>
          </CardHeader>
          <CardContent>
            {revItem && recvItem ? (
              <GroupedBarChart
                data={revRecvChartData}
                keyA="매출액"
                labelA={`매출액 (${unit})`}
                colorA={COLORS.revenue}
                keyB="매출채권"
                labelB={`매출채권 (${unit})`}
                colorB={COLORS.receivables}
                unit={unit}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                매출액 또는 매출채권 계정을 찾을 수 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

        {/* 차트 4: 매출원가 vs 재고자산 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">매출원가 vs 재고자산</CardTitle>
            <CardDescription className="text-xs">
              재고자산이 매출원가 대비 빠르게 증가하면 재고 누적 — 수요 둔화 가능성
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cogsItem && invItem ? (
              <GroupedBarChart
                data={cogsInvChartData}
                keyA="매출원가"
                labelA={`매출원가 (${unit})`}
                colorA={COLORS.cogs}
                keyB="재고자산"
                labelB={`재고자산 (${unit})`}
                colorB={COLORS.inventory}
                unit={unit}
              />
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                매출원가 또는 재고자산 계정을 찾을 수 없습니다.
              </p>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── 차트 5: Cash Conversion Cycle ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            Cash Conversion Cycle (CCC)
            {/* 최신 연도 CCC 요약 배지 */}
            {latestCcc && (
              <Badge
                variant="outline"
                className={
                  latestCcc.CCC <= 0
                    ? "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                    : latestCcc.CCC <= 30
                    ? "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                    : "border-slate-400 text-slate-600"
                }
              >
                {latestCcc.year}년: {latestCcc.CCC}일
                {latestCcc.CCC <= 0 && " (음수 — 탁월)"}
              </Badge>
            )}
            {activityLoading && isKR && (
              <span className="text-xs text-muted-foreground font-normal animate-pulse">
                수집 중...
              </span>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            CCC = DSO + DIO − DPO (일수). 낮을수록(음수 포함) 현금 순환이 빠름.
            DSO(매출채권) + DIO(재고) 양수 bar, DPO(매입채무) 음수 bar. 모두 매출액 기준.
            {isKR ? " · Naver 활동성 지표 기반 (연간)" : " · rawItems 직접 계산 (연간)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cccChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart
                data={cccChartData}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis dataKey="year" {...axisStyle} />
                <YAxis
                  {...axisStyle}
                  axisLine={false}
                  unit="일"
                  tickFormatter={(v: number) => `${v.toFixed(0)}`}
                />
                <Tooltip content={<CccTooltip />} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
                {/* y=0 기준선 */}
                <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                {/* DSO bar — 매출채권 회수일수 (양수) */}
                <Bar
                  dataKey="DSO"
                  name="DSO (매출채권)"
                  fill={COLORS.dso}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={48}
                />
                {/* DIO bar — 재고 소진일수 (양수, DSO 위에 쌓지 않음 = 별도 bar) */}
                <Bar
                  dataKey="DIO"
                  name="DIO (재고자산)"
                  fill={COLORS.dio}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={48}
                />
                {/* DPO bar — 매입채무 지급일수 (음수, 아래 방향) */}
                <Bar
                  dataKey="DPO"
                  name="DPO (매입채무, 음수)"
                  fill={COLORS.dpo}
                  radius={[0, 0, 2, 2]}
                  maxBarSize={48}
                >
                  {cccChartData.map((entry) => (
                    <Cell
                      key={entry.year}
                      fill={COLORS.dpo}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
                {/* CCC 합계 라인 */}
                <Line
                  dataKey="CCC"
                  name="CCC"
                  stroke={COLORS.ccc}
                  strokeWidth={2}
                  dot={{ r: 4, fill: COLORS.ccc, strokeWidth: 0 }}
                  type="monotone"
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : activityLoading ? (
            <p className="text-xs text-muted-foreground py-8 text-center animate-pulse">
              Naver 활동성 데이터 수집 중...
            </p>
          ) : (
            <p className="text-xs text-muted-foreground py-8 text-center">
              CCC 계산에 필요한 데이터가 부족합니다.
              {isKR ? " (매출채권/재고자산/매입채무 회전율 없음)" : " (매출채권/재고자산/매입채무 계정 없음)"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
