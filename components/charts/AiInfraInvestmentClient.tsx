"use client";

// AI 인프라 투자 탭 클라이언트 컴포넌트
// 섹션 1: Neocloud 3사 정규화 주가 비교 차트 (recharts)
// 섹션 2: AI 인프라 뉴스 — 정형 카드(Alpha Vantage + Yahoo) + AI 웹검색 스트리밍

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ExternalLink, AlertCircle } from "lucide-react";
import type { AiInfraBar, AiInfraNewsItem } from "@/types/market-analysis";
import type { LLMProvider } from "@/lib/sector-report/llm-client";

// ─── 색상 상수 ───────────────────────────────────────────────────────────────
const COLORS = {
  crwv: "#6366f1",   // indigo-500 — CoreWeave
  nbis: "#f97316",   // orange-500 — Nebius
  iren: "#10b981",   // emerald-500 — Iris Energy
  base: "#94a3b8",   // slate-400 — 기준선 100
} as const;

// ─── LLM 선택 옵션 ──────────────────────────────────────────────────────────
const LLM_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: "claude", label: "Claude Sonnet" },
  { value: "openai", label: "GPT-4.1" },
  { value: "gemini", label: "Gemini Pro" },
];

// ─── 기본 AI 검색 쿼리 ──────────────────────────────────────────────────────
const DEFAULT_QUERY =
  "neocloud hyperscaler AI infrastructure capex investment 2025 CoreWeave Nebius";

// ─── X축 날짜 포맷 ──────────────────────────────────────────────────────────
function formatXTick(value: string): string {
  if (!value) return "";
  const date = new Date(value + "T00:00:00Z");
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

// ─── 커스텀 툴팁 ────────────────────────────────────────────────────────────
interface ChartTooltipProps extends TooltipProps<number, string> {
  rawMap: Record<string, string>; // dataKey → rawKey 매핑 (원가격 표시)
}

function ChartTooltip({ active, payload, label, rawMap }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const LABELS: Record<string, string> = {
    crwv: "CoreWeave (CRWV)",
    nbis: "Nebius (NBIS)",
    iren: "Iris Energy (IREN)",
  };

  return (
    <div className="bg-background border border-border rounded-md px-3 py-2 text-xs shadow-md min-w-[180px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((entry) => {
        const key = entry.dataKey as string;
        const rawKey = rawMap[key];
        // payload 내에서 원가격 찾기
        const rawEntry = payload.find((p) => p.dataKey === rawKey);
        const rawVal = rawEntry?.value;
        return (
          <p key={key} style={{ color: entry.color }} className="flex justify-between gap-3">
            <span>{LABELS[key] ?? key}</span>
            <span className="font-mono">
              {entry.value?.toFixed(1)}
              {rawVal != null ? ` ($${(rawVal as number).toFixed(2)})` : ""}
            </span>
          </p>
        );
      })}
    </div>
  );
}

// ─── 클릭 토글 레전드 ──────────────────────────────────────────────────────
interface LegendItem {
  key: string;
  label: string;
  color: string;
}

function ToggleLegend({
  items,
  hidden,
  onToggle,
}: {
  items: LegendItem[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 mt-1">
      {items.map(({ key, label, color }) => {
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
            style={{ opacity: isHidden ? 0.35 : 1 }}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{
                backgroundColor: isHidden ? "transparent" : color,
                border: `2px solid ${color}`,
              }}
            />
            <span
              className="text-muted-foreground"
              style={{ textDecoration: isHidden ? "line-through" : "none" }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── 감성 배지 ──────────────────────────────────────────────────────────────
function SentimentBadge({ sentiment }: { sentiment?: "Bullish" | "Bearish" | "Neutral" }) {
  if (!sentiment) return null;
  const map = {
    Bullish: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    Bearish: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    Neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${map[sentiment]}`}>
      {sentiment}
    </span>
  );
}

// ─── 뉴스 카드 ──────────────────────────────────────────────────────────────
function NewsCard({ item }: { item: AiInfraNewsItem }) {
  // Unix timestamp → 한국 시간 표시
  const dateStr =
    item.publishedAt > 0
      ? new Date(item.publishedAt * 1000).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
    >
      <Card className="transition-colors hover:bg-muted/40">
        <CardContent className="p-4 space-y-1.5">
          {/* 감성 배지 + 제목 */}
          <div className="flex items-start gap-2">
            {item.sentiment && (
              <div className="flex-shrink-0 mt-0.5">
                <SentimentBadge sentiment={item.sentiment} />
              </div>
            )}
            <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
              {item.title}
            </p>
          </div>

          {/* 요약 (있는 경우) */}
          {item.summary && (
            <p className="text-xs text-muted-foreground line-clamp-2">{item.summary}</p>
          )}

          {/* 메타 정보: 출처, 날짜, 관련 종목 */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-[11px] text-muted-foreground">{item.publisher}</span>
            {dateStr && (
              <span className="text-[11px] text-muted-foreground">· {dateStr}</span>
            )}
            {item.relatedTickers?.slice(0, 4).map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                {t}
              </Badge>
            ))}
            <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface AiInfraInvestmentClientProps {
  /** 주가 비교 데이터 (부모에서 전달) */
  data: AiInfraBar[];
  loading: boolean;
  error: string | null;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────
export function AiInfraInvestmentClient({
  data,
  loading,
  error,
}: AiInfraInvestmentClientProps) {
  // ── 차트 레전드 토글 상태 ──
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  // ── 정형 뉴스 상태 ──
  const [newsItems, setNewsItems] = useState<AiInfraNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  // 뉴스는 컴포넌트 마운트 시 1회 자동 로드
  const newsFetchedRef = useRef(false);

  // ── AI 웹검색 상태 ──
  const [searchQuery, setSearchQuery] = useState(DEFAULT_QUERY);
  const [provider, setProvider] = useState<LLMProvider>("claude");
  const [searchResult, setSearchResult] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const resultEndRef = useRef<HTMLDivElement>(null);

  // ── 뉴스 자동 로드 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (newsFetchedRef.current) return;
    newsFetchedRef.current = true;

    async function loadNews() {
      setNewsLoading(true);
      setNewsError(null);
      try {
        const res = await fetch("/api/market/ai-infra-news");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setNewsItems(json.data ?? []);
      } catch (err) {
        setNewsError(err instanceof Error ? err.message : "뉴스를 불러오지 못했습니다.");
      } finally {
        setNewsLoading(false);
      }
    }

    loadNews();
  }, []);

  // ── AI 웹검색 스트리밍 핸들러 ─────────────────────────────────────────
  async function handleSearch() {
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult("");

    try {
      const res = await fetch("/api/market/ai-infra-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, provider }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

      const decoder = new TextDecoder();

      // SSE 파싱 루프
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.text) {
              setSearchResult((prev) => prev + payload.text);
              // 스트리밍 중 자동 스크롤
              resultEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
            }
            if (payload.error) {
              setSearchError(payload.error);
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다.");
    } finally {
      setSearching(false);
    }
  }

  // ── 레전드 토글 핸들러 ──────────────────────────────────────────────────
  function toggleLine(key: string) {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ── 차트 레전드 아이템 ──────────────────────────────────────────────────
  const legendItems: LegendItem[] = [
    { key: "crwv", label: "CoreWeave (CRWV)", color: COLORS.crwv },
    { key: "nbis", label: "Nebius (NBIS)", color: COLORS.nbis },
    { key: "iren", label: "Iris Energy (IREN)", color: COLORS.iren },
  ];

  // ── 렌더링 ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── 섹션 1: Neocloud 주가 비교 차트 ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Neocloud 주가 비교</CardTitle>
          <CardDescription className="text-xs">
            CoreWeave · Nebius · Iris Energy — 조회 시작일 = 100 기준 정규화
          </CardDescription>
          <ToggleLegend
            items={legendItems}
            hidden={hiddenLines}
            onToggle={toggleLine}
          />
        </CardHeader>
        <CardContent className="pt-0">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">주가 데이터 로드 중...</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {!loading && !error && data.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              선택한 기간에 데이터가 없습니다.
            </div>
          )}
          {!loading && !error && data.length > 0 && (
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={data}
                syncId="market-analysis"
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXTick}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={60}
                />
                <YAxis
                  tickFormatter={(v: number) => v.toFixed(0)}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      rawMap={{ crwv: "crwvRaw", nbis: "nbisRaw", iren: "irenRaw" }}
                    />
                  }
                />
                {/* 기준선 100 — 시작 대비 수익률 0% */}
                <ReferenceLine
                  y={100}
                  stroke={COLORS.base}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                {/* 각 Neocloud 주가 라인 */}
                {!hiddenLines.has("crwv") && (
                  <Line
                    type="monotone"
                    dataKey="crwv"
                    stroke={COLORS.crwv}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {!hiddenLines.has("nbis") && (
                  <Line
                    type="monotone"
                    dataKey="nbis"
                    stroke={COLORS.nbis}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
                {!hiddenLines.has("iren") && (
                  <Line
                    type="monotone"
                    dataKey="iren"
                    stroke={COLORS.iren}
                    dot={false}
                    strokeWidth={1.5}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── 섹션 2: AI 웹검색 (스트리밍) ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">AI 인프라 투자 리서치</CardTitle>
          <CardDescription className="text-xs">
            Claude · OpenAI · Gemini 웹검색으로 최신 동향을 실시간 분석합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 검색창 + LLM 선택 + 검색 버튼 */}
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색어를 입력하세요..."
              className="text-sm h-9 flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as LLMProvider)}
            >
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9 px-3"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-1.5 hidden sm:inline">검색</span>
            </Button>
          </div>

          {/* 스트리밍 결과 영역 */}
          {(searchResult || searching || searchError) && (
            <div className="rounded-md border bg-muted/20 p-4 min-h-[120px]">
              {searchError && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{searchError}</span>
                </div>
              )}
              {searchResult && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {searchResult}
                  </ReactMarkdown>
                </div>
              )}
              {searching && !searchResult && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>웹 검색 중...</span>
                </div>
              )}
              {/* 자동 스크롤 앵커 */}
              <div ref={resultEndRef} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 섹션 3: 정형 뉴스 카드 ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">AI 인프라 투자 뉴스</CardTitle>
          <CardDescription className="text-xs">
            Alpha Vantage · Yahoo Finance — Neocloud + 하이퍼스케일러 최신 기사
          </CardDescription>
        </CardHeader>
        <CardContent>
          {newsLoading && (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">뉴스 로드 중...</span>
            </div>
          )}
          {!newsLoading && newsError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{newsError}</span>
            </div>
          )}
          {!newsLoading && !newsError && newsItems.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              뉴스 데이터가 없습니다.
            </div>
          )}
          {!newsLoading && newsItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {newsItems.map((item) => (
                <NewsCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
