"use client";

// 재무 체크포인트 4 — 현금을 버는가
//
// 데이터 소스:
//   - Operating CF / Financing CF: rawItems (sj_div="CF") level 0
//   - Capex: rawItems (CF 섹션 level 1, 기본값 = 유형자산의증가 + 무형자산의증가)
//   - Net Income: rawItems (sj_div="IS", 당기순이익)
//
// 차트 구성:
//   1) CCR (Cash Conversion Ratio) = Operating CF / Net Income (Line — 추세 파악에 최적)
//   2) FCF 구성 트렌드 — 영업CF + |Capex| + FCF (선 그래프)
//   3) 현금흐름 전체 — 영업CF + 재무CF + FCF (선 그래프)
//
// Capex 계정과목 설정: Checkpoint1 AccountSelector 패턴 동일
//   - 기본값: 유형자산의증가 + 무형자산의증가 (KR), Capital Expenditure (CapEx) (US)
//   - 사용자가 CF 항목 중 추가/제거 가능

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { X, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FinancialStatements, RawDartItem } from "@/types/fundamental-screening";

// ── KR 기본 키워드 ────────────────────────────────────────────────────────────

// partial match — FnGuide 계정명에 포함 여부로 매칭
const KR_CF = {
  operatingCF:  ["영업활동으로인한현금흐름"],
  financingCF:  ["재무활동으로인한현금흐름"],
  // Capex = 유형자산의증가 + 무형자산의증가 (현금유출항목)
  capexDefault: ["유형자산의증가", "무형자산의증가"],
};

// Net Income: IS 섹션 — "지배주주순이익" 등 하위항목보다 상위 level 우선
const KR_IS = { netIncome: ["당기순이익"] };

// ── US 기본 계정명 (Alpha Vantage label, exact match) ─────────────────────────

const US_CF = {
  operatingCF:  ["Operating Cash Flow"],
  financingCF:  ["Financing Cash Flow"],
  capexDefault: ["Capital Expenditure (CapEx)"],
};

const US_IS = { netIncome: ["Net Income"] };

// ── 색상 ─────────────────────────────────────────────────────────────────────

const COLORS = {
  operatingCF: "#10b981",  // 에메랄드 — 영업CF (양수 = 현금 창출)
  capex:       "#ef4444",  // 레드 — Capex (음수 방향으로 표시)
  financingCF: "#f97316",  // 오렌지 — 재무CF
  fcf:         "#6366f1",  // 인디고 — FCF
  ccrPos:      "#10b981",  // 에메랄드 — CCR ≥ 1
  ccrMid:      "#f59e0b",  // 앰버 — 0 ≤ CCR < 1
  ccrNeg:      "#ef4444",  // 레드 — CCR < 0
} as const;

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** HTML 엔티티 제거 — FnGuide account_nm에 &nbsp; 등 포함 */
function stripHtml(str: string): string {
  return str.replace(/&nbsp;/g, "").replace(/&amp;/g, "&").trim();
}

/**
 * rawItems에서 특정 계정 항목 추출
 * - KR: partial match (account_nm에 키워드 포함 여부)
 * - US: exact match (Alpha Vantage 레이블 정확 일치)
 * - 여러 항목 매칭 시 level 0(대분류) 우선 — 중복 계산 방지
 */
function extractAccount(
  items: RawDartItem[],
  sj_div: string,
  keywords: string[],
  isKR: boolean
): RawDartItem | null {
  const matched = items
    .filter((i) => i.sj_div === sj_div)
    .filter((i) =>
      isKR
        ? keywords.some((k) => stripHtml(i.account_nm).includes(k))
        : keywords.includes(i.account_nm)
    );
  if (matched.length === 0) return null;
  return matched.sort((a, b) => (a.level ?? 99) - (b.level ?? 99))[0];
}

/** RawDartItem에서 특정 연도의 값 추출 */
function getVal(item: RawDartItem | null, year: string): number | null {
  return item?.amounts.find((a) => a.year === year)?.value ?? null;
}

/** 연도 목록 추출 (오름차순) */
function extractYears(items: RawDartItem[]): string[] {
  const s = new Set<string>();
  items.forEach((i) => i.amounts.forEach((a) => s.add(a.year)));
  return [...s].sort();
}

/**
 * 선택된 account_nm 기준으로 연도별 합산
 * Checkpoint1 sumByYearSelected와 동일 패턴
 */
function sumByYearSelected(
  cfItems: RawDartItem[],
  selectedNames: string[],
  years: string[]
): Record<string, number | null> {
  return Object.fromEntries(
    years.map((yr) => {
      const matched = cfItems.filter((i) => selectedNames.includes(i.account_nm));
      if (matched.length === 0) return [yr, null];
      const total = matched.reduce((sum, item) => {
        const val = item.amounts.find((a) => a.year === yr)?.value ?? 0;
        return sum + (val ?? 0);
      }, 0);
      return [yr, total];
    })
  );
}

/**
 * KR/US exchange에 따른 기본 Capex 계정 자동 선택
 * CF 항목 중 기본 키워드에 매칭되는 account_nm 목록 반환
 */
function getDefaultCapexSelections(
  cfItems: RawDartItem[],
  exchange: string
): string[] {
  const isKR = exchange === "KRX";
  const keys = isKR ? KR_CF.capexDefault : US_CF.capexDefault;
  return cfItems
    .filter((i) =>
      isKR
        ? keys.some((k) => stripHtml(i.account_nm).includes(k))
        : keys.includes(i.account_nm)
    )
    .map((i) => i.account_nm);
}

/**
 * Y축 숫자 포맷 — 단위 자동 축약 (Checkpoint2 fmtAxis 패턴)
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

/** CCR 차트 툴팁 — CCR 배수 + Operating CF + Net Income 금액 */
function CcrTooltip({
  active, payload, label, unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums font-medium">
            {/* ccr 키는 배수, 나머지는 금액 */}
            {p.dataKey === "ccr"
              ? `${(p.value as number).toFixed(2)}×`
              : `${((p.value as number) ?? 0).toLocaleString("ko-KR")} ${unit}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** CF 트렌드 차트 툴팁 — 금액 + 단위 */
function CfTooltip({
  active, payload, label, unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[200px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tabular-nums font-medium">
            {p.value != null
              ? `${((p.value as number) ?? 0).toLocaleString("ko-KR")} ${unit}`
              : "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 계정과목 선택 패널 (Checkpoint1 AccountSelector 패턴) ─────────────────────

interface AccountSelectorProps {
  title: string;
  selected: string[];
  // CF 항목 중 아직 선택되지 않은 항목 — 추가 드롭다운에 표시
  candidates: RawDartItem[];
  onRemove: (nm: string) => void;
  onAdd: (nm: string) => void;
}

function AccountSelector({ title, selected, candidates, onRemove, onAdd }: AccountSelectorProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>

      {/* 선택된 계정 배지 목록 */}
      <div className="min-h-[52px] space-y-1">
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">선택된 계정 없음</p>
        ) : (
          selected.map((nm) => (
            <div
              key={nm}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 group"
            >
              <span className="text-xs text-foreground/90 truncate">{stripHtml(nm)}</span>
              {/* 항목 제거 버튼 */}
              <button
                onClick={() => onRemove(nm)}
                className="shrink-0 opacity-40 group-hover:opacity-100 transition-opacity hover:text-destructive"
                aria-label={`${nm} 제거`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* 항목 추가 드롭다운 — CF 미선택 항목 전체 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 w-full"
            disabled={candidates.length === 0}
          >
            <Plus className="h-3 w-3" />
            항목 추가
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-56 overflow-y-auto w-72">
          {candidates.map((item) => (
            <DropdownMenuItem
              key={item.account_nm}
              onClick={() => onAdd(item.account_nm)}
              className="text-xs cursor-pointer"
            >
              {/* level에 따른 들여쓰기 — 계층 구조 시각화 */}
              <span style={{ paddingLeft: `${(item.level ?? 0) * 12}px` }}>
                {stripHtml(item.account_nm)}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  rawData: FinancialStatements;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function Checkpoint4Client({ rawData }: Props) {
  const isKR = rawData.exchange === "KRX";
  const unit = rawData.unit;

  const hasQuarterly = isKR && !!rawData.quarterlyItems?.length;
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");

  // ── Capex 계정 선택 상태 ─────────────────────────────────────────────────────

  const [selectedCapex, setSelectedCapex] = useState<string[]>([]);

  // 종목 변경 시 기본 Capex 계정 재초기화
  useEffect(() => {
    const cfItems = rawData.rawItems.filter((i) => i.sj_div === "CF");
    setSelectedCapex(getDefaultCapexSelections(cfItems, rawData.exchange));
  // rawData.ticker + exchange 조합이 변경될 때만 재초기화
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData.ticker, rawData.exchange]);

  // ── 기간별 데이터 선택 ───────────────────────────────────────────────────────

  // CF/IS 표시용 items — 분기 토글 반영
  const displayItems =
    period === "quarterly" && hasQuarterly
      ? rawData.quarterlyItems!
      : rawData.rawItems;

  // CF 항목 필터
  const cfItems = displayItems.filter((i) => i.sj_div === "CF");

  // Capex 드롭다운 후보: 선택되지 않은 CF 항목 전체
  const unselectedCf = cfItems.filter((i) => !selectedCapex.includes(i.account_nm));

  // ── 연도 배열 ───────────────────────────────────────────────────────────────

  const cfYears = extractYears(cfItems).filter((y) =>
    period === "annual" ? !y.includes("Q") : true
  );

  // ── 계정 추출 ───────────────────────────────────────────────────────────────

  const cfKw = isKR ? KR_CF : US_CF;
  const isKw = isKR ? KR_IS : US_IS;

  // Operating CF / Financing CF — CF 섹션 level 0 우선
  const opCfItem  = extractAccount(displayItems, "CF", cfKw.operatingCF,  isKR);
  const finCfItem = extractAccount(displayItems, "CF", cfKw.financingCF,  isKR);

  // Net Income — IS 섹션 (CF의 당기순손익 대신 IS 기준 사용)
  const netIncItem = extractAccount(displayItems, "IS", isKw.netIncome, isKR);

  // Capex 합산 (선택된 계정 연도별 합산)
  const capexByYear = sumByYearSelected(cfItems, selectedCapex, cfYears);
  const hasCapex = selectedCapex.length > 0;

  // ── 차트 1: CCR 데이터 ────────────────────────────────────────────────────

  type CcrRow = { year: string; ccr: number | null; opCf: number | null; netInc: number | null };
  const ccrData: CcrRow[] = cfYears.map((yr) => {
    const opCf  = getVal(opCfItem,  yr);
    const net   = getVal(netIncItem, yr);
    // Net Income = 0 이면 CCR 계산 불가
    const ccr   = opCf != null && net != null && net !== 0 ? opCf / net : null;
    return { year: yr, ccr, opCf, netInc: net };
  });

  // ── 차트 2 & 3: CF 트렌드 데이터 ────────────────────────────────────────

  type CfRow = {
    year: string;
    opCf:        number | null;  // 영업CF (양수 Bar → +방향)
    capexNeg:    number | null;  // Capex 음수 변환 (Bar → -방향, 현금유출 시각화)
    financingCf: number | null;  // 재무CF (Line)
    fcf:         number | null;  // FCF = 영업CF − |Capex| (Line)
  };

  const cfTrendData: CfRow[] = cfYears.map((yr) => {
    const opCf     = getVal(opCfItem,  yr);
    const finCf    = getVal(finCfItem, yr);
    const capexRaw = capexByYear[yr];  // 양수값 (현금유출 절대값)
    // Capex를 음수로 변환 — Bar가 0선 아래로 표시되어 현금유출 방향을 직관적으로 표현
    const capexNeg = capexRaw != null ? -Math.abs(capexRaw) : null;
    // FCF = 영업CF − |Capex| (Capex가 없으면 null)
    const fcf      = opCf != null && capexRaw != null ? opCf - Math.abs(capexRaw) : null;
    return {
      year:        yr,
      opCf,
      capexNeg,
      financingCf: finCf,
      fcf,
    };
  });

  // CF 데이터가 없으면 안내 카드
  if (cfItems.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          현금흐름표(CF) 데이터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  // ── 렌더링 ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── 기간 토글 ── */}
      {hasQuarterly && (
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
        </div>
      )}

      {/* ── 차트 1: CCR (Cash Conversion Ratio) — 선 그래프 ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">CCR (Cash Conversion Ratio)</CardTitle>
          <CardDescription className="text-xs">
            CCR = 영업현금흐름 ÷ 당기순이익. CCR &gt; 1 = 이익보다 현금을 더 많이 창출.
            점 색상: 에메랄드(≥1) · 앰버(0~1) · 레드(&lt;0)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!opCfItem || !netIncItem ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              영업현금흐름 또는 순이익 계정을 찾을 수 없습니다.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={ccrData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => `${(v as number).toFixed(1)}×`}
                  tick={{ fontSize: 10 }}
                  width={44}
                />
                <Tooltip content={<CcrTooltip unit={unit} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* y=0 기준선 */}
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                {/* CCR=1 기준선 — 이 이상이면 이익보다 현금을 더 버는 우량 상태 */}
                <ReferenceLine
                  y={1}
                  stroke={COLORS.ccrPos}
                  strokeDasharray="2 2"
                  label={{ value: "CCR=1", position: "insideTopRight", fontSize: 10, fill: COLORS.ccrPos }}
                />
                {/* CCR 선 그래프 — 추세 파악에 최적화, 각 점은 CCR 값에 따라 3색 구분 */}
                <Line
                  dataKey="ccr"
                  name="CCR"
                  stroke="#64748b"
                  strokeWidth={2}
                  connectNulls
                  dot={(props: { cx: number; cy: number; payload: { ccr: number | null; year: string } }) => {
                    const { cx, cy, payload } = props;
                    // CCR 값에 따라 점 색상 결정: 우량(에메랄드) / 보통(앰버) / 부정(레드)
                    const color =
                      payload.ccr == null ? COLORS.ccrMid
                      : payload.ccr >= 1  ? COLORS.ccrPos
                      : payload.ccr >= 0  ? COLORS.ccrMid
                      : COLORS.ccrNeg;
                    return (
                      <circle
                        key={`ccr-dot-${payload.year}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={color}
                        stroke="white"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── 차트 2 & 3: 2열 그리드 배치 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── 차트 2: FCF 구성 트렌드 — 영업CF(Bar+) / Capex(Bar-) / FCF(Line) ── */}
        {/* Bar 조합: 영업CF는 양수 방향, Capex는 음수 방향 → FCF = 두 Bar의 합을 선으로 표시 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-sm">FCF 구성 트렌드</CardTitle>
                <CardDescription className="text-xs">
                  영업CF(녹색 Bar+) · Capex(레드 Bar−) · FCF = 영업CF−|Capex|(인디고 선)
                </CardDescription>
              </div>
              {!hasCapex && (
                <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                  Capex 미선택
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-2">
            <ResponsiveContainer width="100%" height={240}>
              {/*
                barGap 미설정 — recharts가 카테고리 폭에 맞춰 두 Bar를 자동 크기로 배치
                opCf (양수) → 0선 위, capexNeg (음수) → 0선 아래, 각자 0에서 출발
              */}
              <ComposedChart
                data={cfTrendData}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis
                  tickFormatter={(v) => fmtAxis(v as number, unit)}
                  tick={{ fontSize: 10 }}
                  width={52}
                />
                <Tooltip content={<CfTooltip unit={unit} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                {/* 영업CF — 양수값, 0선 위로 */}
                <Bar
                  dataKey="opCf"
                  name={`영업CF (${unit})`}
                  fill={COLORS.operatingCF}
                  fillOpacity={0.85}
                  radius={[2, 2, 0, 0]}
                />
                {/* Capex — 음수값(capexNeg), 0선 아래로 */}
                {hasCapex && (
                  <Bar
                    dataKey="capexNeg"
                    name={`Capex (${unit})`}
                    fill={COLORS.capex}
                    fillOpacity={0.75}
                    radius={[0, 0, 2, 2]}
                  />
                )}
                {/* FCF 선 — 영업CF − |Capex| 잉여현금 추세 */}
                {hasCapex && (
                  <Line
                    dataKey="fcf"
                    name={`FCF (${unit})`}
                    stroke={COLORS.fcf}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── 차트 3: 현금흐름 전체 트렌드 — 영업CF / 재무CF / FCF (선 그래프) ── */}
        {/* 영업·재무 현금흐름과 FCF의 구조적 관계를 한 눈에 파악 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-sm">현금흐름 트렌드</CardTitle>
                <CardDescription className="text-xs">
                  영업CF(에메랄드) · 재무CF(오렌지 점선) · FCF(인디고)
                </CardDescription>
              </div>
              {!hasCapex && (
                <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">
                  Capex 미선택
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-2">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={cfTrendData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                <YAxis
                  tickFormatter={(v) => fmtAxis(v as number, unit)}
                  tick={{ fontSize: 10 }}
                  width={52}
                />
                <Tooltip content={<CfTooltip unit={unit} />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {/* 0 기준선 — 가는 점선으로 양/음 경계 표시 */}
                <ReferenceLine
                  y={0}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                {/* 영업CF — 핵심 현금 창출력 */}
                <Line
                  dataKey="opCf"
                  name={`영업CF (${unit})`}
                  stroke={COLORS.operatingCF}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                {/* 재무CF — 차입/상환/배당 등 재무 활동 */}
                <Line
                  dataKey="financingCf"
                  name={`재무CF (${unit})`}
                  stroke={COLORS.financingCF}
                  strokeWidth={2}
                  strokeDasharray="3 2"
                  dot={{ r: 3 }}
                  connectNulls
                />
                {/* FCF — 주주에게 귀속되는 잉여현금 */}
                {hasCapex && (
                  <Line
                    dataKey="fcf"
                    name={`FCF (${unit})`}
                    stroke={COLORS.fcf}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>{/* end grid */}

      {/* ── Capex 계정과목 설정 패널 ── */}
      {/* Checkpoint1 AccountSelector와 동일 패턴 — CF 항목 중 선택/추가/제거 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Capex 계정과목 설정</CardTitle>
          <CardDescription className="text-xs">
            FCF 계산에 사용할 자본지출(Capex) 항목을 선택하세요.
            기본값: 유형자산의증가 + 무형자산의증가 (KR) / Capital Expenditure (US)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountSelector
            title="Capex 구성 계정"
            selected={selectedCapex}
            // 미선택 CF 항목만 추가 후보로 제공
            candidates={unselectedCf}
            onRemove={(nm) => setSelectedCapex((prev) => prev.filter((n) => n !== nm))}
            onAdd={(nm) => setSelectedCapex((prev) => [...prev, nm])}
          />

          {/* 선택 계정의 최신 연도 합산값 미리보기 */}
          {hasCapex && cfYears.length > 0 && (() => {
            const lastYr = cfYears[cfYears.length - 1];
            const total  = capexByYear[lastYr];
            return total != null ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {lastYr}년 Capex 합계:{" "}
                <span className="font-semibold text-foreground">
                  {total.toLocaleString("ko-KR")} {unit}
                </span>
              </p>
            ) : null;
          })()}
        </CardContent>
      </Card>

      {/* ── 공식 안내 ── */}
      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-0.5">
        <p className="font-medium text-foreground mb-1">현금흐름 분석 공식</p>
        <p>CCR (Cash Conversion Ratio) = 영업현금흐름 ÷ 당기순이익</p>
        <p>Capex = 유형자산의증가 + 무형자산의증가 (설정 패널에서 변경 가능)</p>
        <p>FCF (Free Cash Flow) = 영업현금흐름 − |Capex|</p>
        <p className="pt-1 text-[11px]">
          CCR 차트 — 점 색상: 에메랄드(≥1 우량) · 앰버(0~1 보통) · 레드(&lt;0 부정)
        </p>
        <p className="text-[11px]">
          FCF 구성 차트 — 녹색 Bar(영업CF+) + 레드 Bar(Capex−) + 인디고 선(FCF): Bar 높이 차이 = FCF
        </p>
        <p className="text-[11px]">
          현금흐름 트렌드 — 영업·재무 CF와 FCF의 구조적 관계를 선으로 한 눈에 비교
        </p>
      </div>

    </div>
  );
}
