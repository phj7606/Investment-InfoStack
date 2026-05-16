"use client";

// 재무 체크포인트 3 — 극대화 가능한가
//
// 데이터 소스:
//   - ROA/ROE/ROIC 트렌드: ratioItems (FnGuide SVD_FinanceRatio.asp — 사전 계산값)
//   - DuPont 분해: rawItems (IS/BS 연간)
//   - 비용 구조: rawItems (IS 섹션)
//
// 차트 구성:
//   1) ROA / ROE / ROIC 트렌드 (Line 3개 + WACC 기준선)
//   2) DuPont 통합 차트: Margin(Bar,%) + AT(Line,×) + Leverage(Line,×) + ROE(Line,%)
//   3) 비용 구조: cogsRatio/sgaRatio(Grouped Bar) + opMargin(Line)

import { useState } from "react";
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
import type { FinancialStatements, RawDartItem } from "@/types/fundamental-screening";

// ── 색상 ─────────────────────────────────────────────────────────────────────

const COLORS = {
  roa:           "#10b981",  // 에메랄드 — ROA
  roe:           "#6366f1",  // 인디고 — ROE
  roic:          "#8b5cf6",  // 바이올렛 — ROIC
  wacc:          "#ef4444",  // 레드 — WACC 기준선
  margin:        "#6366f1",  // 인디고 — 순이익률 Bar
  roeActual:     "#0f172a",  // 다크 — ROE Line (실제값)
  assetTurnover: "#10b981",  // 에메랄드 — 자산회전율 Line
  leverage:      "#f97316",  // 오렌지 — 레버리지 Line
  cogsRatio:     "#ef4444",  // 레드 — 매출원가율
  sgaRatio:      "#f97316",  // 오렌지 — 판관비율
  opMargin:      "#10b981",  // 에메랄드 — 영업이익률 Line
  refLine:       "#94a3b8",  // 슬레이트 — y=100 기준선
} as const;

// ── 계정 키워드 ───────────────────────────────────────────────────────────────

const RATIO_KW = {
  roa:  ["ROA"],
  roe:  ["ROE"],
  roic: ["ROIC"],
};

const KR = {
  revenue:       ["매출액"],
  netIncome:     ["당기순이익"],
  operatingInc:  ["영업이익"],
  cogs:          ["매출원가"],
  sga:           ["판매비와관리비", "판매비및관리비"],
  // FnGuide BS: 연결재무제표는 "자산총계" 대신 "자산" 단독 표기를 사용하는 경우 있음
  // "자산"만 키워드로 쓰면 "유동자산"/"비유동자산"에 오매칭 → exactOnly=true로 완전일치만 허용
  totalAssets:   ["자산총계", "자산합계", "자산"],
  controlEquity: ["지배기업주주지분", "지배지분", "지배기업의소유주지분"],  // DuPont Leverage 분모 우선
  totalEquity:   ["자본총계", "자본합계", "자본"],                          // fallback
};

const US = {
  revenue:      ["Total Revenue"],
  netIncome:    ["Net Income"],
  operatingInc: ["Operating Income"],
  cogs:         ["Cost of Revenue"],
  sga:          ["SG&A Expense"],
  totalAssets:  ["Total Assets"],
  totalEquity:  ["Total Stockholders Equity"],
};

// ── 유틸 ─────────────────────────────────────────────────────────────────────

function stripHtml(str: string): string {
  return str.replace(/&nbsp;/g, "").replace(/&amp;/g, "&").trim();
}

function extractAccount(
  items: RawDartItem[],
  sj_div: string,
  keywords: string[],
  isKR: boolean,
  // exactOnly=true: account_nm 완전 일치만 허용 — "자산"이 "유동자산"에 오매칭되지 않도록
  exactOnly: boolean = false
): RawDartItem | null {
  const matched = items
    .filter((i) => i.sj_div === sj_div)
    .filter((i) => {
      const nm = stripHtml(i.account_nm);
      if (exactOnly) return keywords.some((k) => nm === k);
      return isKR
        ? keywords.some((k) => nm.includes(k))
        : keywords.includes(i.account_nm);
    });
  if (matched.length === 0) return null;
  return matched.sort((a, b) => (a.level ?? 99) - (b.level ?? 99))[0];
}

function getVal(item: RawDartItem | null, year: string): number | null {
  return item?.amounts.find((a) => a.year === year)?.value ?? null;
}

function extractYears(items: RawDartItem[]): string[] {
  const s = new Set<string>();
  items.forEach((i) => i.amounts.forEach((a) => s.add(a.year)));
  return [...s].sort();
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────────────

/** 혼합 단위 툴팁 (% 또는 ×) */
function MixedTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => {
        const isX = String(p.name).endsWith("(×)");
        return (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular-nums font-medium">
              {p.value != null
                ? isX
                  ? `${(p.value as number).toFixed(2)}×`
                  : `${(p.value as number).toFixed(1)}%`
                : "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** % 전용 툴팁 */
function PctTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums font-medium">
            {p.value != null ? `${(p.value as number).toFixed(1)}%` : "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rawData: FinancialStatements;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function Checkpoint3Client({ rawData }: Props) {
  const isKR = rawData.exchange === "KRX";

  // 분기 토글: 비용구조 차트(Panel C)와 ROA/ROE/ROIC 차트에 적용
  const hasQuarterly      = isKR && !!rawData.quarterlyItems?.length;
  const hasQuarterlyRatio = isKR && !!rawData.quarterlyRatioItems?.length;

  const [period, setPeriod]       = useState<"annual" | "quarterly">("annual");
  const [waccInput, setWaccInput] = useState<string>("10");
  const wacc = parseFloat(waccInput) || 10;

  // ── 데이터 선택 ─────────────────────────────────────────────────────────────

  // ratioItems — 분기 토글 반영
  const ratioDisplay =
    period === "quarterly" && hasQuarterlyRatio
      ? rawData.quarterlyRatioItems!
      : rawData.ratioItems ?? [];

  // IS/BS 표시용 — 비용구조 차트 분기 토글 반영
  const fsDisplay =
    period === "quarterly" && hasQuarterly
      ? rawData.quarterlyItems!
      : rawData.rawItems;

  // DuPont은 항상 연간 (분기 BS로 계산하면 계절성 왜곡)
  const annualItems = rawData.rawItems;

  // ── 연도 배열 ───────────────────────────────────────────────────────────────

  const ratioYears  = extractYears(ratioDisplay);
  const fsYears     = extractYears(fsDisplay);
  const annualYears = extractYears(annualItems);

  // ── 차트 1: ROA / ROE / ROIC ─────────────────────────────────────────────

  const roaItem  = extractAccount(ratioDisplay, "RATIO", RATIO_KW.roa,  true);
  const roeItem  = extractAccount(ratioDisplay, "RATIO", RATIO_KW.roe,  true);
  const roicItem = extractAccount(ratioDisplay, "RATIO", RATIO_KW.roic, true);

  type ReturnRow = { year: string; roa: number | null; roe: number | null; roic: number | null };
  const returnData: ReturnRow[] = ratioYears.map((yr) => ({
    year: yr,
    roa:  getVal(roaItem,  yr),
    roe:  getVal(roeItem,  yr),
    roic: getVal(roicItem, yr),
  }));

  const hasReturnData = ratioDisplay.length > 0 && (roaItem || roeItem || roicItem);

  // ── 차트 2: DuPont 통합 ──────────────────────────────────────────────────

  const kw = isKR ? KR : US;
  const revItem      = extractAccount(annualItems, "IS", kw.revenue,      isKR);
  const netIncItem   = extractAccount(annualItems, "IS", kw.netIncome,     isKR);
  // BS 총계 항목은 exactOnly=true — "자산"이 "유동자산"에 오매칭되는 것 방지
  const assetsItem   = extractAccount(annualItems, "BS", kw.totalAssets,   isKR, isKR);
  const ctrlEqItem   = isKR ? extractAccount(annualItems, "BS", KR.controlEquity, true, true) : null;
  const totalEqItem  = extractAccount(annualItems, "BS", kw.totalEquity,   isKR, isKR);
  const equityItem   = ctrlEqItem ?? totalEqItem;
  const leverageNote = ctrlEqItem ? "지배주주지분 기준" : "자본총계 기준";

  // ratioItems에서 ROE 실제값 (KR만)
  const roeForDupont = extractAccount(rawData.ratioItems ?? [], "RATIO", RATIO_KW.roe, true);

  type DupontRow = {
    year: string;
    margin: number | null;          // % — Bar, 왼쪽 Y
    assetTurnover: number | null;   // × — Line, 오른쪽 Y
    leverage: number | null;        // × — Line, 오른쪽 Y
    roeActual: number | null;       // % — Line, 왼쪽 Y
  };

  const dupontData: DupontRow[] = annualYears.map((yr) => {
    const rev = getVal(revItem, yr);
    const net = getVal(netIncItem, yr);
    const ast = getVal(assetsItem, yr);
    const eq  = getVal(equityItem, yr);
    const margin = rev && rev !== 0 && net != null ? (net / rev) * 100 : null;
    const at     = rev && ast && ast !== 0 ? rev / ast : null;
    const lev    = ast && eq && eq !== 0   ? ast / eq : null;
    const roeActual = getVal(roeForDupont, yr);
    return { year: yr, margin, assetTurnover: at, leverage: lev, roeActual };
  });

  // ── 차트 3: 비용 구조 비율 ───────────────────────────────────────────────

  const cogsItem  = extractAccount(fsDisplay, "IS", kw.cogs,        isKR);
  const sgaItem   = extractAccount(fsDisplay, "IS", kw.sga,         isKR);
  const opIncItem = extractAccount(fsDisplay, "IS", kw.operatingInc, isKR);
  const revFsItem = extractAccount(fsDisplay, "IS", kw.revenue,      isKR);

  type CostRow = { year: string; cogsRatio: number | null; sgaRatio: number | null; opMargin: number | null };
  const costData: CostRow[] = fsYears.map((yr) => {
    const rev   = getVal(revFsItem, yr);
    const cogs  = getVal(cogsItem,  yr);
    const sga   = getVal(sgaItem,   yr);
    const opInc = getVal(opIncItem, yr);
    return {
      year:      yr,
      cogsRatio: rev && rev !== 0 && cogs != null  ? (cogs  / rev) * 100 : null,
      sgaRatio:  rev && rev !== 0 && sga  != null  ? (sga   / rev) * 100 : null,
      opMargin:  rev && rev !== 0 && opInc != null ? (opInc / rev) * 100 : null,
    };
  });

  // 매출원가율이 100%를 넘는 연도 — gross loss 경고
  const hasGrossLoss = costData.some((r) => (r.cogsRatio ?? 0) > 100);

  // ── 렌더링 ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── 기간 토글 ── */}
      {(hasQuarterly || hasQuarterlyRatio) && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">기간</span>
          {(["annual", "quarterly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={[
                "px-3 py-1 text-xs rounded-md border transition-colors",
                period === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted",
              ].join(" ")}
            >
              {p === "annual" ? "연간" : "분기"}
            </button>
          ))}
          {period === "quarterly" && (
            <span className="text-xs text-muted-foreground">※ DuPont 분석은 항상 연간 기준</span>
          )}
        </div>
      )}

      {/* ── 차트 1: ROA / ROE / ROIC ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-sm">ROA / ROE / ROIC 트렌드</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                FnGuide 사전 계산값 (%)
              </CardDescription>
            </div>
            {/* WACC 입력 */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">WACC</span>
              <input
                type="number"
                min={0}
                max={30}
                step={0.5}
                value={waccInput}
                onChange={(e) => setWaccInput(e.target.value)}
                className="w-20 px-2 py-1 text-xs rounded border border-border bg-background text-right tabular-nums"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!hasReturnData ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground text-xs">
              <Badge variant="outline">KR 전용 (FnGuide 재무비율)</Badge>
              <p>KR 종목이 아니거나 재무비율 수집에 실패했습니다. 새로고침을 시도하세요.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={returnData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10 }}
                  width={46}
                />
                <Tooltip content={<PctTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={0}    stroke="hsl(var(--border))" strokeWidth={1} />
                <ReferenceLine
                  y={wacc}
                  stroke={COLORS.wacc}
                  strokeDasharray="2 2"
                  label={{ value: `WACC ${wacc}%`, position: "insideTopRight", fontSize: 10, fill: COLORS.wacc }}
                />
                <Line dataKey="roa"  name="ROA"  stroke={COLORS.roa}  dot={false} strokeWidth={2} connectNulls />
                <Line dataKey="roe"  name="ROE"  stroke={COLORS.roe}  dot={false} strokeWidth={2} connectNulls />
                <Line dataKey="roic" name="ROIC" stroke={COLORS.roic} dot={false} strokeWidth={2} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── 차트 2: DuPont 분해 — 3개 요소 독립 미니 차트 ── */}
      {/* 각 factor마다 Y축 스케일이 달라 하나의 차트에 묶으면 묻히는 문제 해결:
          순이익률(%) / 자산회전율(×) / 레버리지(×) 를 각자 독립 차트로 나란히 배치 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">DuPont 분해 — ROE = 순이익률 × 자산회전율 × 레버리지</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            {leverageNote} · ROE 실제값은 상단 ROA/ROE/ROIC 차트 참조
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">

            {/* Panel A: 순이익률 (%) */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1 text-center">
                순이익률 (Net Margin %)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={dupontData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fontSize: 9 }} width={40} />
                  <Tooltip content={<PctTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                  <Bar dataKey="margin" name="순이익률" fill={COLORS.margin} fillOpacity={0.75} radius={[2,2,0,0]}>
                    {dupontData.map((d, i) => (
                      <Cell key={i} fill={(d.margin ?? 0) < 0 ? COLORS.wacc : COLORS.margin} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Panel B: 자산회전율 (×배수) */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1 text-center">
                자산회전율 (Asset Turnover ×)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={dupontData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v.toFixed(2)}×`} tick={{ fontSize: 9 }} width={40} />
                  <Tooltip content={<MixedTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                  <Bar dataKey="assetTurnover" name="자산회전율(×)" fill={COLORS.assetTurnover} fillOpacity={0.75} radius={[2,2,0,0]} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Panel C: 레버리지 (×배수) */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1 text-center">
                레버리지 (Equity Multiplier ×)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={dupontData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v.toFixed(1)}×`} tick={{ fontSize: 9 }} width={40} />
                  <Tooltip content={<MixedTooltip />} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                  <Bar dataKey="leverage" name="레버리지(×)" fill={COLORS.leverage} fillOpacity={0.75} radius={[2,2,0,0]}>
                    {dupontData.map((d, i) => (
                      <Cell key={i} fill={(d.leverage ?? 0) < 0 ? COLORS.wacc : COLORS.leverage} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* ── 차트 3: 비용 구조 비율 ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-sm">비용 구조 (매출 대비 비율)</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                왼쪽 Y축: 매출원가율·판관비율(%) · 오른쪽 Y축: 영업이익률(%)
              </CardDescription>
            </div>
            {hasGrossLoss && (
              <Badge variant="destructive" className="text-[10px] shrink-0">
                일부 연도 Gross Loss (매출원가율 &gt; 100%)
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={costData} margin={{ top: 8, right: 52, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              {/* 왼쪽 Y: 비용률 */}
              <YAxis
                yAxisId="cost"
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10 }}
                width={46}
              />
              {/* 오른쪽 Y: 영업이익률 */}
              <YAxis
                yAxisId="margin"
                orientation="right"
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10 }}
                width={46}
              />
              <Tooltip content={<PctTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* 100% 기준선 — gross loss 경계 */}
              <ReferenceLine yAxisId="cost" y={100} stroke={COLORS.refLine} strokeDasharray="2 2"
                label={{ value: "100%", position: "insideTopLeft", fontSize: 9, fill: COLORS.refLine }} />
              <ReferenceLine yAxisId="margin" y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              <Bar yAxisId="cost"   dataKey="cogsRatio" name="매출원가율" fill={COLORS.cogsRatio} fillOpacity={0.7} radius={[2,2,0,0]} />
              <Bar yAxisId="cost"   dataKey="sgaRatio"  name="판관비율"   fill={COLORS.sgaRatio}  fillOpacity={0.7} radius={[2,2,0,0]} />
              <Line yAxisId="margin" dataKey="opMargin"  name="영업이익률" stroke={COLORS.opMargin} dot={false} strokeWidth={2} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── 공식 안내 ── */}
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-0.5">
        <p className="font-medium text-foreground mb-1">DuPont 분해 공식</p>
        <p>ROE = 순이익률(%) × 자산회전율(×) × 레버리지(×)</p>
        <p>순이익률 = 당기순이익 / 매출액 × 100</p>
        <p>자산회전율 = 매출액 / 총자산</p>
        <p>레버리지 = 총자산 / {isKR ? "지배기업주주지분 (없으면 자본총계)" : "자기자본"}</p>
      </div>
    </div>
  );
}
