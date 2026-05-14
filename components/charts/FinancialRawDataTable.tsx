"use client";

// 수집된 재무제표 원시 계정 테이블
// rawItems(연간) / quarterlyItems(분기)를 sj_div별로 그룹화하여 표시
// 연간/분기 탭 전환 — FnGuide KR 종목에서 활성화

import { useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FinancialStatements, RawDartItem } from "@/types/fundamental-screening";

interface Props {
  statements: FinancialStatements;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

/** HTML 엔티티(&nbsp; 등) 제거 — DART API 데이터에 들여쓰기용 &nbsp;가 포함되어 있어 제거 */
function stripHtml(str: string): string {
  return str.replace(/&nbsp;/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/** 숫자를 천 단위 구분자로 포맷 */
function fmt(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("ko-KR");
}

/** rawItems를 sj_div 기준으로 그룹화 */
function groupBySjDiv(items: RawDartItem[]): Record<string, RawDartItem[]> {
  const known = new Set(["IS", "CIS", "BS", "CF", "SCE"]);
  const groups: Record<string, RawDartItem[]> = {};
  for (const item of items) {
    // 알려진 sj_div는 그대로, 나머지는 "기타"로 묶음
    const key = known.has(item.sj_div ?? "") ? (item.sj_div ?? "기타") : "기타";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

/** sj_div 코드 → 한국어 레이블 */
const SJ_DIV_LABELS: Record<string, string> = {
  IS: "손익계산서 (IS)",
  CIS: "포괄손익계산서 (CIS)",
  BS: "재무상태표 (BS)",
  CF: "현금흐름표 (CF)",
  SCE: "자본변동표 (SCE)",
  기타: "기타",
};

/** 섹션 표시 순서 — CIS는 IS 바로 다음 */
const SJ_DIV_ORDER = ["IS", "CIS", "BS", "CF", "SCE", "기타"];

interface SectionProps {
  label: string;
  items: RawDartItem[];
  years: string[];
}

/** 개별 섹션 — 접기/펼치기 가능 */
function StatementSection({ label, items, years }: SectionProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b last:border-b-0">
      {/* 섹션 헤더 — 클릭으로 접기/펼치기 */}
      <button
        className="w-full flex items-center gap-1.5 px-4 py-2 bg-muted/40 text-left hover:bg-muted/60 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        }
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{items.length}개 계정</span>
      </button>

      {/* 테이블 */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="bg-muted/20">
                <th className="text-left px-4 py-1.5 text-[11px] font-medium text-muted-foreground w-52 min-w-[160px]">
                  계정명
                </th>
                {years.map((yr) => (
                  <th
                    key={yr}
                    className="text-right px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {yr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((item, idx) => {
                // level 0 = 대분류(총계/헤더): 굵게, 배경 강조
                // level 1 = 중분류: 기본
                // level 2 = 세목: 들여쓰기 + 흐리게
                const lvl = item.level ?? 1;
                const indentClass = lvl === 0 ? "pl-4" : lvl === 2 ? "pl-10" : "pl-6";
                const textClass =
                  lvl === 0
                    ? "font-semibold text-foreground"
                    : lvl === 2
                    ? "text-foreground/55"
                    : "text-foreground/80";
                const rowBg = lvl === 0 ? "bg-muted/25 hover:bg-muted/35" : "hover:bg-muted/15";

                return (
                <tr key={`${item.sj_div}__${item.account_nm}__${idx}`} className={`transition-colors ${rowBg}`}>
                  <td className={`py-1 text-[11px] max-w-[220px] truncate ${indentClass} ${textClass}`}>
                    {stripHtml(item.account_nm)}
                  </td>
                  {years.map((yr) => {
                    const found = item.amounts.find((a) => a.year === yr);
                    const val = found?.value ?? null;
                    return (
                      <td
                        key={yr}
                        className={`px-3 py-1 text-right text-[11px] tabular-nums ${
                          val === null
                            ? "text-muted-foreground/40"
                            : val < 0
                            ? "text-red-500 dark:text-red-400"
                            : ""
                        }`}
                      >
                        {fmt(val)}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function FinancialRawDataTable({ statements, onRefresh, isRefreshing = false }: Props) {
  const { ticker, dataSource, unit, rawItems, quarterlyItems, cachedAt, dataFrom } = statements;

  // 연간/분기 탭 — quarterlyItems가 있을 때만 활성화
  const hasQuarterly = !!quarterlyItems && quarterlyItems.length > 0;
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");

  // 현재 탭의 표시 항목
  const displayItems = period === "quarterly" && hasQuarterly ? quarterlyItems! : rawItems;

  // 전체 연도 목록 (최신 → 오래된 순)
  // 연간: "2022", "2023"... / 분기: "2025Q1", "2025Q2"...
  const allYears = Array.from(
    new Set(displayItems.flatMap((i) => i.amounts.map((a) => a.year)))
  ).sort((a, b) => b.localeCompare(a));

  // sj_div별 그룹화
  const groups = groupBySjDiv(displayItems);

  return (
    <div className="rounded-lg border bg-card text-card-foreground text-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">수집된 재무제표</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-xs">{ticker}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-xs">{dataSource}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground text-xs">단위: {unit}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{displayItems.length}개 계정</span>
          {dataFrom === "cache" && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              캐시
            </Badge>
          )}
          {cachedAt && (
            <span className="text-[10px] text-muted-foreground">
              수집일: {new Date(cachedAt).toLocaleDateString("ko-KR")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 연간/분기 탭 — FnGuide KR 종목에서만 표시 */}
          {hasQuarterly && (
            <div className="flex rounded-md border overflow-hidden">
              <button
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  period === "annual"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
                onClick={() => setPeriod("annual")}
              >
                연간
              </button>
              <button
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors border-l ${
                  period === "quarterly"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50"
                }`}
                onClick={() => setPeriod("quarterly")}
              >
                분기
              </button>
            </div>
          )}
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          )}
        </div>
      </div>

      {/* sj_div별 섹션 */}
      <div>
        {SJ_DIV_ORDER.map((sjDiv) => {
          const items = groups[sjDiv];
          if (!items || items.length === 0) return null;
          return (
            <StatementSection
              key={sjDiv}
              label={SJ_DIV_LABELS[sjDiv] ?? sjDiv}
              items={items}
              years={allYears}
            />
          );
        })}
      </div>
    </div>
  );
}
