"use client";

// P8-07a 개별주식 스크리너 — idea-generation SKILL 준용
// 4단계 처리: A(ticker 발굴) → B(실제 API 수집) → C(필터 게이트) → D(SKILL Step 3~5 보고서)
// SSE 스트리밍으로 4단계 진행 상황을 실시간 표시

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ScanSearch,
  Loader2,
  Download,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Search,
  CheckCircle2,
  Circle,
  Database,
  Filter,
  FileText,
  BarChart3,
  Upload,
  X,
  BookMarked,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownRenderer } from "@/components/company-analysis/MarkdownRenderer";
import { useAnalysisHistory } from "@/components/company-analysis/AnalysisHistory";
import type { ScreenerFilters } from "@/lib/stock-screener/prompts";

// ── 4단계 진행 상태 타입 ────────────────────────────────────────────────────
type ScreenerPhase =
  | "idle"
  | "discovering"
  | "fetching"
  | "validating"
  | "reporting"
  | "done"
  | "error";

// SSE 이벤트 형태 (route.ts에서 전송하는 enqueue() 오브젝트와 대응)
interface ScreenerEvent {
  phase?: ScreenerPhase;
  message?: string;
  found?: number;        // Phase A: 발견한 후보 수
  total?: number;        // Phase B: 전체 종목 수
  done?: number | true;  // Phase B: 수집 완료 수 / Phase D: 완료 신호
  passed?: number;       // Phase C: 필터 통과 수
  passedCount?: number;  // Phase D done 신호의 최종 통과 수
  text?: string;         // Phase D: 스트리밍 텍스트 청크
  error?: string;
}

// ── 프리셋 정의 ─────────────────────────────────────────────────────────────
const PRESETS: {
  label: string;
  description: string;
  filters: Partial<ScreenerFilters>;
}[] = [
  {
    label: "가치주",
    description: "저PER·저PBR 우량 가치주",
    filters: {
      direction: "Long",
      style: "Value",
      maxDebtRatio: 100,
      maxPER: 12,
      maxPBR: 1.5,
    },
  },
  {
    label: "성장 우량주",
    description: "고ROE·안정적 이익성장",
    filters: {
      direction: "Long",
      style: "Quality",
      minROE: 15,
      minOperatingMargin: 10,
      maxDebtRatio: 80,
    },
  },
  {
    label: "하이퀄리티",
    description: "최고 수익성·재무건전성",
    filters: {
      direction: "Long",
      style: "Quality",
      minROE: 20,
      minOperatingMargin: 15,
      maxDebtRatio: 50,
    },
  },
  {
    label: "공매도 후보",
    description: "고부채·이익감소·고평가",
    filters: {
      direction: "Short",
      style: "Short",
      maxDebtRatio: 200,
      maxPER: 40,
    },
  },
];

// ── 4단계 진행 표시 컴포넌트 ────────────────────────────────────────────────
// 현재 단계에 따라 각 단계의 아이콘과 레이블을 색상으로 구분
function PhaseIndicator({
  currentPhase,
  fetchTotal,
  fetchDone,
  found,
  validPassed,
}: {
  currentPhase: ScreenerPhase;
  fetchTotal: number;
  fetchDone: number;
  found: number;
  validPassed: number;
}) {
  const phases: {
    key: ScreenerPhase;
    label: string;
    icon: React.ReactNode;
    doneLabel?: string;
  }[] = [
    {
      key: "discovering",
      label: "후보 종목 탐색 중 (SKILL Step 2)...",
      icon: <Search className="h-3.5 w-3.5" />,
      doneLabel: found > 0 ? `후보 ${found}개 발굴` : "탐색 완료",
    },
    {
      key: "fetching",
      label: `실제 데이터 수집 중 (${fetchDone} / ${fetchTotal})...`,
      icon: <Database className="h-3.5 w-3.5" />,
      doneLabel: `${fetchTotal}개 데이터 수집 완료`,
    },
    {
      key: "validating",
      label: "필터 게이트 검증 중...",
      icon: <Filter className="h-3.5 w-3.5" />,
      doneLabel: validPassed > 0 ? `${validPassed}개 통과` : "검증 완료",
    },
    {
      key: "reporting",
      label: "아이디어 보고서 생성 중 (SKILL Step 3~5)...",
      icon: <FileText className="h-3.5 w-3.5" />,
      doneLabel: "보고서 완성",
    },
  ];

  // 각 단계의 인덱스 — phases 배열 순서(0~3)와 동일
  const phaseIndexMap: Partial<Record<ScreenerPhase, number>> = {
    discovering: 0, fetching: 1, validating: 2, reporting: 3,
  };
  const currentIdx = phaseIndexMap[currentPhase] ?? (currentPhase === "done" ? 4 : -1);

  return (
    <div className="space-y-2">
      {phases.map((p, i) => {
        // 완료: 현재 단계 인덱스가 이 단계보다 뒤에 있거나, 전체 완료 상태
        const isDone = currentPhase === "done" || currentIdx > i;
        // 진행중: 현재 단계가 이 단계와 일치하고 아직 완료되지 않음
        const isRunningStep = !isDone && currentIdx === i;
        const isPending = !isDone && !isRunningStep;

        return (
          <div
            key={p.key}
            className={`flex items-center gap-2 text-xs transition-colors ${
              isDone
                ? "text-emerald-600 dark:text-emerald-400"
                : isRunningStep
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-muted-foreground"
            }`}
          >
            {/* 단계 아이콘 */}
            {isDone ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : isRunningStep ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 opacity-40" />
            )}

            {/* 레이블: 완료면 doneLabel, 진행중이면 동적 label */}
            <span className={isPending ? "opacity-40" : ""}>
              {isDone && p.doneLabel ? p.doneLabel : p.label}
            </span>
          </div>
        );
      })}

      {/* Phase B 진행률 바 */}
      {currentPhase === "fetching" && fetchTotal > 0 && (
        <Progress
          value={(fetchDone / fetchTotal) * 100}
          className="h-1.5 mt-1"
        />
      )}
    </div>
  );
}

// ── CSV 내보내기 헬퍼 ────────────────────────────────────────────────────────
// BOM(\uFEFF) 포함 → Excel에서 한글 깨짐 방지
// 보고서 텍스트에서 비교 테이블(| 로 시작하는 블록)을 CSV로 변환
function exportCsv(reportText: string, filters: ScreenerFilters) {
  // 마크다운 테이블 행 추출 (|로 시작/끝 행, 구분선 제외)
  const lines = reportText.split("\n");
  const tableLines = lines.filter(
    (l) => l.trim().startsWith("|") && !l.trim().match(/^\|[-| :]+\|$/)
  );

  if (tableLines.length === 0) {
    // 테이블이 없으면 보고서 전체를 txt로
    const blob = new Blob(["\uFEFF" + reportText], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `screener_${filters.market}_${filters.style}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    return;
  }

  // 마크다운 테이블 → CSV 변환
  const csvRows = tableLines.map((l) =>
    l
      .split("|")
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
      .map((cell) => `"${cell.trim().replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = "\uFEFF" + csvRows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `screener_${filters.market}_${filters.style}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// 보고서 텍스트에서 비교 테이블 섹션만 마크다운으로 추출
// Step 5 Comparison Table 식별 방법: "| Ticker" 또는 "| 종목" 헤더를 포함하는 테이블 블록
function extractComparisonTables(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const result: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.trim().startsWith("|");

    if (isTableRow && !inTable) {
      inTable = true;
      result.push(line);
    } else if (isTableRow && inTable) {
      result.push(line);
    } else if (!isTableRow && inTable) {
      inTable = false;
      result.push(""); // 테이블 후 빈 줄
    } else if (!isTableRow && !inTable) {
      // 섹션 헤딩은 포함 (Step 5 레이블)
      if (line.startsWith("##") || line.startsWith("###")) {
        result.push(line);
      }
    }
  }

  return result.join("\n") || "보고서에서 비교 테이블을 찾을 수 없습니다.\n\n보고서 탭을 확인하세요.";
}

// ── 기본 필터 초기값 ─────────────────────────────────────────────────────────
const DEFAULT_FILTERS: ScreenerFilters = {
  market: "KR",
  direction: "Long",
  style: "Value",
};

// ── 메인 스크리너 컴포넌트 ────────────────────────────────────────────────────
export function StockScreenerClient() {
  // 이전 분석 참고 상태 — MD 파일 업로드 or 분석 이력에서 선택
  const [previousReport, setPreviousReport] = useState<string | null>(null);
  const [prevReportLabel, setPrevReportLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 기업 분석 이력 — 이전 분석 참고 선택용
  const { history: analysisHistory } = useAnalysisHistory();

  // 필터 상태
  const [filters, setFilters] = useState<ScreenerFilters>({ ...DEFAULT_FILTERS });

  // 숫자 입력 필드를 위한 로컬 문자열 상태 (빈 문자열 → undefined 처리)
  const [roeTxt, setRoeTxt]           = useState("");
  const [opMarginTxt, setOpMarginTxt] = useState("");
  const [debtTxt, setDebtTxt]         = useState("");
  const [perTxt, setPerTxt]           = useState("");
  const [pbrTxt, setPbrTxt]           = useState("");
  const [evTxt, setEvTxt]             = useState("");

  // 실행 상태
  const [phase, setPhase]         = useState<ScreenerPhase>("idle");
  const [errorMsg, setErrorMsg]   = useState("");
  const [reportText, setReportText] = useState("");
  const [fetchTotal, setFetchTotal] = useState(0);
  const [fetchDone, setFetchDone]   = useState(0);
  const [found, setFound]           = useState(0);
  const [validPassed, setValidPassed] = useState(0);
  const [passedCount, setPassedCount] = useState(0);

  // 진행 중 스트리밍 abort 제어
  const abortRef = useRef<AbortController | null>(null);

  // ── 필터 업데이트 헬퍼 ────────────────────────────────────────────────────
  function updateFilter<K extends keyof ScreenerFilters>(key: K, val: ScreenerFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  // 숫자 입력 → filters 업데이트 (빈 값 → undefined 삭제)
  function handleNumInput(
    txt: string,
    setTxt: (v: string) => void,
    key: keyof ScreenerFilters
  ) {
    setTxt(txt);
    const n = parseFloat(txt);
    if (txt === "" || isNaN(n)) {
      setFilters((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setFilters((prev) => ({ ...prev, [key]: n }));
    }
  }

  // ── 프리셋 적용 ────────────────────────────────────────────────────────────
  function applyPreset(preset: (typeof PRESETS)[number]) {
    const merged: ScreenerFilters = {
      ...DEFAULT_FILTERS,
      ...preset.filters,
      theme: filters.theme, // 테마는 유지
    };
    setFilters(merged);
    setRoeTxt(merged.minROE?.toString() ?? "");
    setOpMarginTxt(merged.minOperatingMargin?.toString() ?? "");
    setDebtTxt(merged.maxDebtRatio?.toString() ?? "");
    setPerTxt(merged.maxPER?.toString() ?? "");
    setPbrTxt(merged.maxPBR?.toString() ?? "");
    setEvTxt(merged.maxEVEBITDA?.toString() ?? "");
  }

  // ── 파일 업로드 핸들러 ──────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviousReport(ev.target?.result as string);
      setPrevReportLabel(file.name);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  // ── 초기화 ─────────────────────────────────────────────────────────────────
  function resetAll() {
    abortRef.current?.abort();
    setFilters({ ...DEFAULT_FILTERS });
    setRoeTxt(""); setOpMarginTxt(""); setDebtTxt("");
    setPerTxt(""); setPbrTxt(""); setEvTxt("");
    setPhase("idle");
    setReportText("");
    setErrorMsg("");
    setFetchTotal(0); setFetchDone(0); setFound(0);
    setValidPassed(0); setPassedCount(0);
  }

  // ── 스크리닝 실행 ────────────────────────────────────────────────────────────
  async function runScreener() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("discovering");
    setReportText("");
    setErrorMsg("");
    setFetchTotal(0); setFetchDone(0); setFound(0);
    setValidPassed(0); setPassedCount(0);

    try {
      const res = await fetch("/api/equity-research/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // previousReport가 있으면 함께 전달 — LLM이 이전 분석을 참고해 스크리닝 결과 보완
        body: JSON.stringify({ filters, previousReport: previousReport ?? undefined }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      // SSE 스트림 읽기
      const reader = res.body?.getReader();
      if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트 파싱 — "data: {...}\n\n" 형태
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;

          try {
            const evt = JSON.parse(line) as ScreenerEvent;
            handleEvent(evt);
          } catch {
            // JSON 파싱 실패 → 무시
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  // ── SSE 이벤트 처리 ──────────────────────────────────────────────────────
  function handleEvent(evt: ScreenerEvent) {
    if (evt.error) {
      setErrorMsg(evt.error);
      setPhase("error");
      return;
    }

    // 단계별 phase 전환
    if (evt.phase) {
      setPhase(evt.phase);
    }

    // Phase A — 후보 발굴 완료
    if (evt.found !== undefined) {
      setFound(evt.found);
    }

    // Phase B — 데이터 수집 진행률
    if (evt.total !== undefined && typeof evt.total === "number") {
      setFetchTotal(evt.total);
    }
    // done이 숫자(수집 완료 수)인 경우 — Phase B 진행 카운터
    if (typeof evt.done === "number") {
      setFetchDone(evt.done);
    }

    // Phase C — 필터 통과 수
    if (evt.passed !== undefined) {
      setValidPassed(evt.passed);
    }

    // Phase D — 스트리밍 텍스트 청크 누적
    if (evt.text) {
      setReportText((prev) => prev + evt.text);
    }

    // 완료 신호 (done: true)
    if (evt.done === true) {
      setPassedCount(evt.passedCount ?? validPassed);
      setPhase("done");
    }
  }

  const isRunning = ["discovering", "fetching", "validating", "reporting"].includes(phase);

  return (
    <div className="space-y-4">
      {/* ── 이전 분석 참고 패널 ─────────────────────────────────────────────── */}
      {/* MD 파일 업로드 or 기업 분석 이력에서 선택 → 스크리닝 결과에 컨텍스트로 반영 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex items-center gap-2 flex-wrap">
        {previousReport ? (
          /* 참고 보고서 로드됨 */
          <div className="flex items-center gap-1.5 rounded-md border border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1.5 text-xs text-indigo-700 dark:text-indigo-300">
            <BookMarked className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[260px] truncate">참고 중: {prevReportLabel}</span>
            <button
              onClick={() => { setPreviousReport(null); setPrevReportLabel(null); }}
              className="ml-1 rounded-full p-0.5 hover:bg-indigo-200/60 transition-colors"
              title="참고 보고서 제거"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          /* 참고 보고서 없음 — 업로드 / 이력 선택 버튼 */
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={isRunning}
              >
                <BookMarked className="h-3.5 w-3.5" />
                이전 분석 참고
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs">
                이전 분석을 참고하면 스크리닝 방향·thesis가 보완됩니다
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {/* MD 파일 업로드 */}
              <DropdownMenuItem
                onSelect={() => fileInputRef.current?.click()}
                className="text-xs gap-2 cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5" />
                MD 파일 업로드
              </DropdownMenuItem>
              {/* 기업 분석 이력 목록 */}
              {analysisHistory.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                    기업 분석 이력
                  </DropdownMenuLabel>
                  {analysisHistory.slice(0, 8).map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => {
                        setPreviousReport(item.reportMarkdown);
                        setPrevReportLabel(`${item.companyName} (${item.ticker})`);
                      }}
                      className="text-xs gap-2 cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">{item.companyName} ({item.ticker})</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(item.generatedAt).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {analysisHistory.length === 0 && (
                <div className="px-2 py-2 text-[11px] text-muted-foreground">
                  저장된 기업 분석 이력이 없습니다
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── 필터 패널 ────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4 px-4 space-y-4">
          {/* Row 1: 방향 + 시장 */}
          <div className="flex flex-wrap gap-3 items-end">
            {/* 방향 선택 — Long/Short/Both 토글 버튼 */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">방향</Label>
              <div className="flex gap-1">
                {(["Long", "Short", "Both"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => updateFilter("direction", d)}
                    disabled={isRunning}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      filters.direction === d
                        ? d === "Long"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : d === "Short"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-indigo-600 text-white border-indigo-600"
                        : "border-border hover:bg-muted"
                    } disabled:opacity-50`}
                  >
                    {d === "Long" ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" /> Long
                      </span>
                    ) : d === "Short" ? (
                      <span className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" /> Short
                      </span>
                    ) : (
                      "Both"
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 시장 선택 */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">시장</Label>
              <Select
                value={filters.market}
                onValueChange={(v) => updateFilter("market", v as ScreenerFilters["market"])}
                disabled={isRunning}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KR">한국 (KOSPI/KOSDAQ)</SelectItem>
                  <SelectItem value="US">미국 (NYSE/NASDAQ)</SelectItem>
                  <SelectItem value="ALL">한국 + 미국</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 스타일 선택 */}
            <div className="space-y-1">
              <Label className="text-xs font-medium">스타일</Label>
              <Select
                value={filters.style}
                onValueChange={(v) => updateFilter("style", v as ScreenerFilters["style"])}
                disabled={isRunning}
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Value">Value (가치)</SelectItem>
                  <SelectItem value="Growth">Growth (성장)</SelectItem>
                  <SelectItem value="Quality">Quality (우량)</SelectItem>
                  <SelectItem value="Short">Short (공매도)</SelectItem>
                  <SelectItem value="Special Situation">Special Situation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: 테마 (선택 입력) */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">
              테마{" "}
              <span className="font-normal text-muted-foreground">(선택 — Step 3 가치사슬 분석 트리거)</span>
            </Label>
            <Input
              placeholder="예: AI 반도체, 원자력, 방산, K-바이오..."
              value={filters.theme ?? ""}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  theme: e.target.value || undefined,
                }))
              }
              disabled={isRunning}
              className="h-8 text-xs w-full max-w-sm"
            />
          </div>

          <Separator />

          {/* Row 3~4: 필터 게이트 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">재무 게이트</Label>
            <div className="flex flex-wrap gap-3">
              {/* ROE ≥ */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">ROE ≥ (%)</Label>
                <Input
                  type="number"
                  placeholder="—"
                  value={roeTxt}
                  onChange={(e) => handleNumInput(e.target.value, setRoeTxt, "minROE")}
                  disabled={isRunning}
                  className="h-7 w-20 text-xs"
                />
              </div>
              {/* 영업이익률 ≥ */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">영업이익률 ≥ (%)</Label>
                <Input
                  type="number"
                  placeholder="—"
                  value={opMarginTxt}
                  onChange={(e) => handleNumInput(e.target.value, setOpMarginTxt, "minOperatingMargin")}
                  disabled={isRunning}
                  className="h-7 w-24 text-xs"
                />
              </div>
              {/* 부채비율 ≤ */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">부채비율 ≤ (%)</Label>
                <Input
                  type="number"
                  placeholder="—"
                  value={debtTxt}
                  onChange={(e) => handleNumInput(e.target.value, setDebtTxt, "maxDebtRatio")}
                  disabled={isRunning}
                  className="h-7 w-20 text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">밸류에이션 게이트</Label>
            <div className="flex flex-wrap gap-3">
              {/* PER ≤ */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">PER ≤ (배)</Label>
                <Input
                  type="number"
                  placeholder="—"
                  value={perTxt}
                  onChange={(e) => handleNumInput(e.target.value, setPerTxt, "maxPER")}
                  disabled={isRunning}
                  className="h-7 w-20 text-xs"
                />
              </div>
              {/* PBR ≤ */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">PBR ≤ (배)</Label>
                <Input
                  type="number"
                  placeholder="—"
                  value={pbrTxt}
                  onChange={(e) => handleNumInput(e.target.value, setPbrTxt, "maxPBR")}
                  disabled={isRunning}
                  className="h-7 w-20 text-xs"
                />
              </div>
              {/* EV/EBITDA ≤ */}
              <div className="space-y-0.5">
                <Label className="text-[10px] text-muted-foreground">EV/EBITDA ≤ (배)</Label>
                <Input
                  type="number"
                  placeholder="—"
                  value={evTxt}
                  onChange={(e) => handleNumInput(e.target.value, setEvTxt, "maxEVEBITDA")}
                  disabled={isRunning}
                  className="h-7 w-24 text-xs"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Row 5: 프리셋 + 실행 버튼 */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 프리셋 칩 */}
            <span className="text-[10px] text-muted-foreground shrink-0">프리셋:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p)}
                disabled={isRunning}
                title={p.description}
                className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 dark:hover:bg-indigo-950/30 transition-colors disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}

            {/* 스페이서 */}
            <div className="flex-1" />

            {/* 초기화 버튼 */}
            <Button
              variant="ghost"
              size="sm"
              onClick={resetAll}
              className="h-8 px-3 text-xs gap-1.5"
            >
              <RotateCcw className="h-3 w-3" />
              초기화
            </Button>

            {/* 스크리닝 실행 버튼 */}
            <Button
              onClick={runScreener}
              disabled={isRunning}
              className="h-8 px-4 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <ScanSearch className="h-3.5 w-3.5" />
                  스크리닝 실행
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 4단계 진행 표시 ─────────────────────────────────────────────────── */}
      {isRunning && (
        <Card className="border-indigo-200 bg-indigo-50/40 dark:bg-indigo-950/20">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              스크리닝 진행 중...
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <PhaseIndicator
              currentPhase={phase}
              fetchTotal={fetchTotal}
              fetchDone={fetchDone}
              found={found}
              validPassed={validPassed}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Idle 안내 ─────────────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <ScanSearch className="h-10 w-10 text-indigo-300 dark:text-indigo-700" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              조건을 설정하고 스크리닝을 실행하세요
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              idea-generation SKILL Step 2~5 워크플로우를 그대로 실행합니다
            </p>
          </div>
          <div className="flex flex-col gap-1 text-xs text-left max-w-xs mt-1">
            {[
              "SKILL Step 2: 후보 종목 발굴 (Claude + web_search)",
              "Phase B: 실제 API 수치 수집 (Naver·DART / Yahoo·AlphaVantage)",
              "Phase C: 서버 사이드 필터 게이트 검증",
              "SKILL Step 3~5: 아이디어 보고서 생성 (스트리밍)",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">›</span>
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 에러 ──────────────────────────────────────────────────────────── */}
      {phase === "error" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive mb-1">오류 발생</p>
          <p className="text-xs text-destructive/80">{errorMsg}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPhase("idle")}
            className="mt-3 h-7 text-xs"
          >
            닫기
          </Button>
        </div>
      )}

      {/* ── 보고서 결과 — 스트리밍 중 / 완료 후 모두 표시 ────────────────── */}
      {(reportText || phase === "done") && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">아이디어 보고서</CardTitle>
                {phase === "done" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    {passedCount}개 아이디어 · 완료
                  </Badge>
                )}
                {phase === "reporting" && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400"
                  >
                    <Loader2 className="h-2.5 w-2.5 animate-spin mr-1" />
                    생성 중...
                  </Badge>
                )}
              </div>

              {/* CSV 다운로드 버튼 — 완료 후만 활성화 */}
              {phase === "done" && reportText && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportCsv(reportText, filters)}
                  className="h-7 px-2.5 text-xs gap-1.5"
                >
                  <Download className="h-3 w-3" />
                  CSV 저장
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-4">
            {/* 보고서 / 비교 테이블 탭 */}
            <Tabs defaultValue="report">
              <TabsList className="h-7 text-xs mb-3">
                <TabsTrigger value="report" className="h-6 text-xs gap-1">
                  <FileText className="h-3 w-3" />
                  보고서
                </TabsTrigger>
                <TabsTrigger value="comparison" className="h-6 text-xs gap-1">
                  <BarChart3 className="h-3 w-3" />
                  비교 테이블
                </TabsTrigger>
              </TabsList>

              {/* 보고서 탭 — SKILL Step 4~5 전체 마크다운 렌더링 */}
              <TabsContent value="report">
                <div className="max-h-[600px] overflow-y-auto pr-1">
                  <MarkdownRenderer content={reportText} />
                  {/* 스트리밍 중 커서 표시 */}
                  {phase === "reporting" && (
                    <span className="inline-block h-4 w-0.5 bg-indigo-600 animate-pulse ml-0.5" />
                  )}
                </div>
              </TabsContent>

              {/* 비교 테이블 탭 — Step 5 Comparison Table 섹션만 추출 */}
              <TabsContent value="comparison">
                <div className="max-h-[600px] overflow-y-auto pr-1">
                  {phase === "done" ? (
                    <MarkdownRenderer content={extractComparisonTables(reportText)} />
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      보고서 생성이 완료되면 비교 테이블이 표시됩니다.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
