"use client";

// 재무 체크포인트 1 — 돈이 많은 기업인가
//
// 비영업자산 vs 금융부채를 연도별로 합산하여 비교
//   비영업자산 = 유동금융자산 + 현금및현금성자산 + 장기금융자산 + 관계기업등지분관련투자자산 (KR 기본값)
//                Cash & Cash Equivalents + Short/Long Term Investments (US 기본값)
//   금융부채   = 단기사채 + 단기차입금 + ... (KR), Short/Long Term Debt 등 (US)
//
// 계정과목은 재무제표 로드 후 사용자가 추가/제거 가능 — KR·US 무관하게 정확한 분석 지원

import { useState, useEffect } from "react";
import {
  ComposedChart,
  Bar,
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

// ── KR 기본 키워드 (FnGuide 계정명 partial match) ────────────────────────────

const KR_NON_OP_KEYS = [
  "유동금융자산",
  "현금및현금성자산",
  "장기금융자산",
  "관계기업등지분관련투자자산",
];

const KR_FIN_LIAB_KEYS = [
  "단기사채",
  "단기차입금",
  "유동성장기부채",
  "유동금융부채",
  "장기차입금",
  "비유동금융부채",
];

// ── US 기본 계정명 (Alpha Vantage label, exact match) ────────────────────────

const US_NON_OP_NAMES = [
  "Cash & Cash Equivalents",
  "Short Term Investments",
  "Long Term Investments",
];

const US_FIN_LIAB_NAMES = [
  "Short Term Debt",
  "Current Debt",
  "Long Term Debt",
  "Long Term Debt (Non-current)",
];

// ── 색상 ────────────────────────────────────────────────────────────────────
const COLORS = {
  nonOpAsset: "#6366f1",  // indigo-500
  finLiab:    "#f43f5e",  // rose-500
  pos:        "#10b981",  // emerald-500 (차이 양수)
  neg:        "#ef4444",  // red-500 (차이 음수)
} as const;

// ── 유틸 ────────────────────────────────────────────────────────────────────

/** HTML 엔티티 제거 — FnGuide account_nm에 &nbsp; 등 포함 */
function stripHtml(str: string): string {
  return str.replace(/&nbsp;/g, "").replace(/&amp;/g, "&").trim();
}

/** 숫자 포맷 (천 단위 + 단위 표시) */
function fmtVal(v: number, unit: string): string {
  return `${v.toLocaleString("ko-KR")} ${unit}`;
}

/**
 * KR/US exchange에 따른 기본 계정 자동 선택
 * - KR: 키워드 partial match (FnGuide 계정명에 공백·특수문자 혼재)
 * - US: exact match (Alpha Vantage label이 고정값)
 */
function getDefaultSelections(
  bsItems: RawDartItem[],
  exchange: string
): { nonOp: string[]; finLiab: string[] } {
  const isKR = exchange === "KRX";

  const matchNonOp = (nm: string) =>
    isKR
      ? KR_NON_OP_KEYS.some((k) => stripHtml(nm).includes(k))
      : US_NON_OP_NAMES.includes(nm);

  const matchFinLiab = (nm: string) =>
    isKR
      ? KR_FIN_LIAB_KEYS.some((k) => stripHtml(nm).includes(k))
      : US_FIN_LIAB_NAMES.includes(nm);

  const nonOp   = bsItems.filter((i) => matchNonOp(i.account_nm)).map((i) => i.account_nm);
  const finLiab = bsItems.filter((i) => matchFinLiab(i.account_nm)).map((i) => i.account_nm);

  return { nonOp, finLiab };
}

/**
 * 선택된 account_nm 목록 기준으로 연도별 합산
 * 기존 키워드 partial match 대신 정확 매칭 — 사용자 선택이 truth
 */
function sumByYearSelected(
  bsItems: RawDartItem[],
  selectedNames: string[],
  years: string[]
): Record<string, number> {
  return Object.fromEntries(
    years.map((yr) => {
      const total = bsItems
        .filter((item) => selectedNames.includes(item.account_nm))
        .reduce((sum, item) => {
          const val = item.amounts.find((a) => a.year === yr)?.value ?? 0;
          return sum + (val ?? 0);
        }, 0);
      return [yr, total];
    })
  );
}

// ── 커스텀 Tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({
  active, payload, label, unit,
}: TooltipProps<number, string> & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md p-3 text-xs space-y-1 min-w-[180px]">
      <p className="font-semibold mb-1">{label}년</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
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

// ── 계정과목 선택 패널 ───────────────────────────────────────────────────────
// 선택된 계정 목록 표시 + 제거(×) + 미선택 항목에서 추가(+)
interface AccountSelectorProps {
  title: string;
  selected: string[];
  candidates: RawDartItem[];  // 양쪽 모두에 미포함된 BS 항목
  onRemove: (nm: string) => void;
  onAdd: (nm: string) => void;
}

function AccountSelector({ title, selected, candidates, onRemove, onAdd }: AccountSelectorProps) {
  return (
    // 비영업자산 / 금융부채 각각의 패널
    <div className="space-y-2">
      {/* 섹션 제목 */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>

      {/* 선택된 계정 목록 */}
      <div className="min-h-[60px] space-y-1">
        {selected.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">선택된 계정 없음</p>
        ) : (
          selected.map((nm) => (
            <div
              key={nm}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 group"
            >
              {/* 계정명 — &nbsp; 등 제거해서 표시 */}
              <span className="text-xs text-foreground/90 truncate">{stripHtml(nm)}</span>
              {/* 제거 버튼 */}
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

      {/* 항목 추가 드롭다운 — 양쪽 모두에 없는 BS 항목만 표시 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 w-full" disabled={candidates.length === 0}>
            <Plus className="h-3 w-3" />
            항목 추가
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-48 overflow-y-auto w-64"
        >
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

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  rawData: FinancialStatements;
}

export function Checkpoint1Client({ rawData }: Props) {
  // BS(재무상태표) 항목만 필터
  const bsItems = rawData.rawItems.filter((i) => i.sj_div === "BS");

  // 연도 목록 (오름차순 — 차트 좌→우: 과거→현재)
  const years = Array.from(
    new Set(bsItems.flatMap((i) => i.amounts.map((a) => a.year)))
  )
    .filter((y) => !y.includes("Q")) // 분기 제외
    .sort();

  // ── 계정 선택 상태 ─────────────────────────────────────────────────────────
  const [selectedNonOp,   setSelectedNonOp]   = useState<string[]>([]);
  const [selectedFinLiab, setSelectedFinLiab] = useState<string[]>([]);

  // 종목 변경 시 기본 계정 재초기화
  // rawData.ticker + exchange 조합으로 종목 식별 — rawData 객체 참조 변경마다 실행
  useEffect(() => {
    const bs = rawData.rawItems.filter((i) => i.sj_div === "BS");
    const { nonOp, finLiab } = getDefaultSelections(bs, rawData.exchange);
    setSelectedNonOp(nonOp);
    setSelectedFinLiab(finLiab);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData.ticker, rawData.exchange]);

  // 양쪽 선택 목록에 없는 BS 항목 — 두 패널 모두에서 공유하는 후보 풀
  const alreadySelected = new Set([...selectedNonOp, ...selectedFinLiab]);
  const unselected = bsItems.filter((i) => !alreadySelected.has(i.account_nm));

  // ── 연도별 합산 ────────────────────────────────────────────────────────────
  const nonOpAssets = sumByYearSelected(bsItems, selectedNonOp,   years);
  const finLiabs    = sumByYearSelected(bsItems, selectedFinLiab, years);

  // 차트 데이터 구성
  const chartData = years.map((yr) => ({
    year:   yr,
    비영업자산: nonOpAssets[yr] ?? 0,
    금융부채:   finLiabs[yr]    ?? 0,
    차이:       (nonOpAssets[yr] ?? 0) - (finLiabs[yr] ?? 0),
  }));

  // 최신 연도 순현금 여부 판단
  const latest    = chartData[chartData.length - 1];
  const isNetCash = latest ? latest.차이 >= 0 : null;
  const unit      = rawData.unit;

  if (years.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          재무상태표(BS) 데이터가 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 요약 배지 ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant="outline"
          className={
            isNetCash === null
              ? ""
              : isNetCash
              ? "border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
              : "border-red-500 text-red-600 bg-red-50 dark:bg-red-950/30"
          }
        >
          {isNetCash === null
            ? "데이터 부족"
            : isNetCash
            ? `순현금 보유 기업 (+${latest.차이.toLocaleString("ko-KR")} ${unit})`
            : `순차입 기업 (${latest.차이.toLocaleString("ko-KR")} ${unit})`}
        </Badge>
        <span className="text-xs text-muted-foreground">기준: {latest?.year}년</span>
      </div>

      {/* ── 계정과목 설정 패널 ── */}
      {/* 재무제표 로드 후 표시 — 비영업자산·금융부채 계정을 재무제표에서 직접 선택/제거 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">계정과목 설정</CardTitle>
          <CardDescription className="text-xs">
            재무제표에서 비영업자산·금융부채에 해당하는 계정을 조정하세요.
            기본값은 exchange({rawData.exchange}) 기준으로 자동 설정됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* 비영업자산 선택 */}
            <AccountSelector
              title="비영업자산"
              selected={selectedNonOp}
              candidates={unselected}
              onRemove={(nm) => setSelectedNonOp((prev) => prev.filter((x) => x !== nm))}
              onAdd={(nm) => setSelectedNonOp((prev) => [...prev, nm])}
            />
            {/* 금융부채 선택 */}
            <AccountSelector
              title="금융부채"
              selected={selectedFinLiab}
              candidates={unselected}
              onRemove={(nm) => setSelectedFinLiab((prev) => prev.filter((x) => x !== nm))}
              onAdd={(nm) => setSelectedFinLiab((prev) => [...prev, nm])}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 차트 1: 비영업자산 vs 금융부채 ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">비영업자산 vs 금융부채</CardTitle>
          <CardDescription className="text-xs">
            비영업자산이 금융부채보다 많으면 순현금 보유 기업 — 두 항목의 차이와 +/- 여부가 핵심
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => {
                  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(0)}조`;
                  if (Math.abs(v) >= 1000)  return `${(v / 1000).toFixed(0)}천억`;
                  return `${v}`;
                }}
              />
              <Tooltip content={<CustomTooltip unit={unit} />} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
              <ReferenceLine y={0} stroke="hsl(var(--border))" />
              <Bar dataKey="비영업자산" fill={COLORS.nonOpAsset} radius={[2, 2, 0, 0]} maxBarSize={48} />
              <Bar dataKey="금융부채"   fill={COLORS.finLiab}    radius={[2, 2, 0, 0]} maxBarSize={48} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── 차트 2: 차이 (비영업자산 - 금융부채) ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">순현금 / 순차입 추이</CardTitle>
          <CardDescription className="text-xs">
            비영업자산 − 금융부채 — 양수(초록) = 순현금, 음수(빨강) = 순차입
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => {
                  if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(0)}조`;
                  if (Math.abs(v) >= 1000)  return `${(v / 1000).toFixed(0)}천억`;
                  return `${v}`;
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const val = payload[0]?.value as number ?? 0;
                  return (
                    <div className="rounded-lg border bg-background shadow-md p-3 text-xs">
                      <p className="font-semibold mb-1">{label}년</p>
                      <p className={val >= 0 ? "text-emerald-600" : "text-red-600"}>
                        차이: {val.toLocaleString("ko-KR")} {unit}
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
              <Bar dataKey="차이" radius={[2, 2, 0, 0]} maxBarSize={48}>
                {chartData.map((entry) => (
                  <Cell key={entry.year} fill={entry.차이 >= 0 ? COLORS.pos : COLORS.neg} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
