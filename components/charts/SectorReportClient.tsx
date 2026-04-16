"use client";

// P8-04 AI 섹터 보고서 클라이언트 컴포넌트
// 기능: 섹터 입력 → 멀티 LLM 보고서 생성(Claude/OpenAI/Gemini) → Q&A → 저장(MD/PDF)

import { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot,
  Search,
  Loader2,
  RotateCcw,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  FileDown,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import type { LLMProvider } from "@/lib/sector-report/llm-client";

// ── 상수 ────────────────────────────────────────────────────────

// 6섹션 메타데이터 — 스트리밍 텍스트에서 헤딩 감지 시 진행 표시 업데이트
const SECTIONS = [
  { key: "consensus",    heading: "## 1. 증권사 컨센서스 요약",   label: "컨센서스" },
  { key: "market",       heading: "## 2. Market Overview",       label: "Market" },
  { key: "competitive",  heading: "## 3. Competitive Landscape", label: "Competitive" },
  { key: "valuation",    heading: "## 4. Valuation",             label: "Valuation" },
  { key: "implications", heading: "## 5. Investment Implications",label: "Implications" },
  { key: "references",   heading: "## 6. References",            label: "References" },
] as const;

// 예시 섹터 칩
const EXAMPLE_SECTORS = [
  "AI 반도체", "K-바이오테크", "전기차 배터리", "방산",
  "클라우드 SaaS", "조선", "글로벌 핀테크", "원자력 에너지",
];

// LLM provider 선택지 (레이블 + 부연)
const LLM_OPTIONS: Array<{ value: LLMProvider; label: string; note: string }> = [
  { value: "claude",  label: "Claude Sonnet 4.6", note: "web_search 지원 · 기본" },
  { value: "openai",  label: "GPT-5.4",           note: "OPENAI_API_KEY 필요" },
  { value: "gemini",  label: "Gemini 3.1 Pro",    note: "GOOGLE_API_KEY 필요" },
];

// ── 유틸리티 ─────────────────────────────────────────────────────

/** SSE 스트림을 읽어 텍스트 청크를 콜백으로 전달 */
async function consumeSSE(
  res: Response,
  onChunk: (text: string) => void,
): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const raw = part.startsWith("data: ") ? part.slice(6) : part;
      if (!raw.trim()) continue;
      let parsed: { text?: string; done?: boolean; error?: string };
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.done) return;
      if (parsed.text) onChunk(parsed.text);
    }
  }
}

/** 보고서 Markdown을 파일로 다운로드 */
function downloadMarkdown(content: string, sectorName: string) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `sector-report_${sectorName.replace(/\s+/g, "-")}_${date}.md`;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 브라우저 인쇄 API로 PDF 저장 다이얼로그 열기
 *  인쇄 대상: id="sector-report-print" 영역만 출력
 *  사용자가 "PDF로 저장"을 선택하면 PDF 생성됨 (별도 라이브러리 불필요)
 */
function printAsPDF() {
  window.print();
}

// ── Q&A 메시지 타입 ───────────────────────────────────────────────
interface QAMessage {
  role: "user" | "assistant";
  content: string;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

export function SectorReportClient() {
  // 입력 상태
  const [sectorName, setSectorName]   = useState("");
  const [provider, setProvider]       = useState<LLMProvider>("claude");

  // 보고서 상태
  const [report, setReport]           = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError]       = useState<string | null>(null);
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());

  // Q&A 상태
  const [qaOpen, setQaOpen]           = useState(false);
  const [qaMessages, setQaMessages]   = useState<QAMessage[]>([]);
  const [qaInput, setQaInput]         = useState("");
  const [isAsking, setIsAsking]       = useState(false);
  const [qaError, setQaError]         = useState<string | null>(null);

  const abortRef  = useRef<AbortController | null>(null);
  const qaEndRef  = useRef<HTMLDivElement | null>(null);

  // ── 보고서 생성 ────────────────────────────────────────────────
  const generateReport = useCallback(async (sector: string) => {
    if (!sector.trim() || isGenerating) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setReport("");
    setGenError(null);
    setCompletedSections(new Set());
    setQaMessages([]);
    setQaOpen(false);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/sector/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorName: sector, provider }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "알 수 없는 오류" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      let accumulated = "";
      await consumeSSE(res, (text) => {
        accumulated += text;
        setReport(accumulated);

        // 헤딩 감지 → 섹션 진행 업데이트
        setCompletedSections((prev) => {
          const next = new Set(prev);
          for (const sec of SECTIONS) {
            if (!prev.has(sec.key) && accumulated.includes(sec.heading)) {
              next.add(sec.key);
            }
          }
          return next;
        });
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setGenError((err as Error).message ?? "보고서 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGenerating(false);
    }
  }, [isGenerating, provider]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generateReport(sectorName);
  };

  const handleChipClick = (sector: string) => {
    setSectorName(sector);
    generateReport(sector);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setReport("");
    setGenError(null);
    setCompletedSections(new Set());
    setSectorName("");
    setIsGenerating(false);
    setQaMessages([]);
    setQaOpen(false);
  };

  // ── Q&A 질문 제출 ───────────────────────────────────────────────
  const handleAsk = async () => {
    const question = qaInput.trim();
    if (!question || isAsking || !report) return;

    setQaInput("");
    setQaError(null);
    setIsAsking(true);

    // 사용자 메시지 즉시 표시
    const userMsg: QAMessage = { role: "user", content: question };
    setQaMessages((prev) => [...prev, userMsg]);

    // 빈 assistant 메시지 자리 확보 — 스트리밍으로 채움
    const assistantPlaceholder: QAMessage = { role: "assistant", content: "" };
    setQaMessages((prev) => [...prev, assistantPlaceholder]);

    try {
      const res = await fetch("/api/sector/ai-report-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportMarkdown: report,
          messages: qaMessages, // 현재까지의 이력 (새 질문 제외)
          question,
          sectorName,
          provider,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "알 수 없는 오류" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      await consumeSSE(res, (text) => {
        // 마지막 assistant 메시지 누적 업데이트
        setQaMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: last.content + text };
          }
          return updated;
        });
        // 스크롤 끝으로
        qaEndRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    } catch (err) {
      setQaError((err as Error).message ?? "답변 생성 중 오류가 발생했습니다.");
      // 실패한 placeholder 제거
      setQaMessages((prev) => prev.filter((_, i) => i !== prev.length - 1));
    } finally {
      setIsAsking(false);
    }
  };

  const handleQaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter로 제출
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAsk();
    }
  };

  // ── 렌더링 ─────────────────────────────────────────────────────
  return (
    <>
      {/*
        PDF 인쇄 스타일
        display: none 방식은 Next.js 최상위 div가 숨겨지면 중첩된 자식도 함께 사라져서 사용 불가.
        visibility: hidden → visible 방식으로 교체:
          - * { visibility: hidden } 으로 전체를 숨기되 레이아웃은 유지
          - #sector-report-print 과 그 자식에만 visibility: visible 복원
          - visibility는 부모가 hidden이어도 자식에서 visible로 개별 덮어쓸 수 있음
          - position: absolute 로 페이지 좌상단 배치하여 여백 없이 출력
      */}
      <style>{`
        @media print {
          * { visibility: hidden; }
          #sector-report-print,
          #sector-report-print * { visibility: visible; }
          #sector-report-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            font-size: 12pt;
            line-height: 1.6;
            color: #1a1a1a;
          }
          #sector-report-print table {
            border-collapse: collapse;
            width: 100%;
          }
          #sector-report-print th,
          #sector-report-print td {
            border: 1px solid #ccc;
            padding: 5px 8px;
            font-size: 10pt;
          }
          #sector-report-print h1 { font-size: 18pt; }
          #sector-report-print h2 { font-size: 14pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          #sector-report-print h3 { font-size: 12pt; }
        }
      `}</style>

      <div className="space-y-4">
        {/* ── 입력 패널 ── */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            {/* 섹터 입력 + LLM 선택 + 생성 버튼 */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={sectorName}
                  onChange={(e) => setSectorName(e.target.value)}
                  placeholder="섹터명 입력 (예: AI 반도체, 전기차 배터리...)"
                  className="pl-8 text-sm"
                  disabled={isGenerating}
                />
              </div>

              {/* LLM provider 선택 */}
              <Select
                value={provider}
                onValueChange={(v) => setProvider(v as LLMProvider)}
                disabled={isGenerating}
              >
                <SelectTrigger className="w-40 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LLM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span className="font-medium text-xs">{opt.label}</span>
                        <span className="text-[10px] text-muted-foreground">{opt.note}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="submit"
                disabled={isGenerating || !sectorName.trim()}
                size="sm"
                className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                ) : (
                  <><Bot className="h-3.5 w-3.5 mr-1.5" />보고서 생성</>
                )}
              </Button>

              {/* 초기화 버튼 */}
              {(report || isGenerating) && (
                <Button type="button" variant="outline" size="sm" onClick={handleReset} className="shrink-0">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </form>

            {/* 예시 섹터 칩 */}
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_SECTORS.map((sector) => (
                <Badge
                  key={sector}
                  variant="secondary"
                  className="cursor-pointer text-xs hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900 dark:hover:text-indigo-300 transition-colors"
                  onClick={() => handleChipClick(sector)}
                >
                  {sector}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── 섹션 진행 표시 ── */}
        {(isGenerating || report) && (
          <div className="flex flex-wrap gap-2">
            {SECTIONS.map((sec) => {
              const isDone = completedSections.has(sec.key);
              const nextIdx = SECTIONS.findIndex((s) => !completedSections.has(s.key));
              const isCurrent = isGenerating && SECTIONS[nextIdx]?.key === sec.key;

              return (
                <div
                  key={sec.key}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors
                    ${isDone
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : isCurrent
                      ? "border-indigo-400 bg-indigo-100 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900 dark:text-indigo-200 animate-pulse"
                      : "border-muted text-muted-foreground"
                    }`}
                >
                  {isDone ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                  {sec.label}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 에러 ── */}
        {genError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-destructive">{genError}</p>
            </CardContent>
          </Card>
        )}

        {/* ── 빈 상태 ── */}
        {!report && !isGenerating && !genError && (
          <Card className="border-dashed">
            <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
              <Sparkles className="h-8 w-8 text-muted-foreground/50" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">AI 섹터 보고서</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  섹터명을 입력하거나 예시를 클릭하세요.
                  <br />
                  Claude(기본) · GPT-4o · Gemini 중 선택 가능합니다.
                </p>
              </div>
              <p className="text-xs text-muted-foreground/50">
                증권사 컨센서스 · Market Overview · Competitive · Valuation · Investment Implications
              </p>
            </CardContent>
          </Card>
        )}

        {/* ── 보고서 본문 ── */}
        {report && (
          <>
            <Separator />

            {/* 액션 바: 저장 버튼 + Q&A 토글 */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {/* Markdown 다운로드 */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadMarkdown(report, sectorName)}
                  className="text-xs"
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  MD 저장
                </Button>
                {/* PDF 저장 (브라우저 인쇄 → PDF) */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={printAsPDF}
                  className="text-xs"
                >
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />
                  PDF 저장
                </Button>
              </div>

              {/* Q&A 패널 토글 */}
              <Button
                variant={qaOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setQaOpen((v) => !v)}
                className={`text-xs ${qaOpen ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                보고서 Q&A
                {qaOpen ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
              </Button>
            </div>

            {/* ── Q&A 패널 ── */}
            {qaOpen && (
              <Card className="border-indigo-200 dark:border-indigo-800">
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-indigo-500" />
                    보고서 Q&A
                    <Badge variant="secondary" className="text-[10px] ml-1">
                      {LLM_OPTIONS.find((o) => o.value === provider)?.label}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {/* 대화 이력 */}
                  {qaMessages.length === 0 && (
                    <p className="text-xs text-muted-foreground py-2">
                      보고서 내용에 대해 자유롭게 질문하세요. (Cmd+Enter로 전송)
                    </p>
                  )}

                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {qaMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3 py-2 text-sm ${
                          msg.role === "user"
                            ? "bg-indigo-50 dark:bg-indigo-950 ml-6"
                            : "bg-muted mr-6"
                        }`}
                      >
                        <span className="text-[10px] font-semibold text-muted-foreground block mb-1">
                          {msg.role === "user" ? "질문" : "답변"}
                        </span>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content || (isAsking && i === qaMessages.length - 1 ? "…" : "")}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <p className="text-sm">{msg.content}</p>
                        )}
                      </div>
                    ))}
                    <div ref={qaEndRef} />
                  </div>

                  {/* Q&A 에러 */}
                  {qaError && (
                    <p className="text-xs text-destructive">{qaError}</p>
                  )}

                  {/* 질문 입력 */}
                  <div className="flex gap-2">
                    <Textarea
                      value={qaInput}
                      onChange={(e) => setQaInput(e.target.value)}
                      onKeyDown={handleQaKeyDown}
                      placeholder="보고서 내용에 대해 질문하세요... (Cmd+Enter 전송)"
                      className="text-sm min-h-[60px] resize-none"
                      disabled={isAsking}
                    />
                    <Button
                      onClick={handleAsk}
                      disabled={isAsking || !qaInput.trim()}
                      size="sm"
                      className="self-end shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      {isAsking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Markdown 보고서 본문 (PDF 인쇄 대상) ── */}
            <div
              id="sector-report-print"
              className="prose prose-sm dark:prose-invert max-w-none
                [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse
                [&_th]:text-left [&_th]:py-1.5 [&_th]:px-2 [&_th]:border [&_th]:border-muted
                [&_td]:py-1 [&_td]:px-2 [&_td]:border [&_td]:border-muted
                [&_pre]:overflow-x-auto [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report}
              </ReactMarkdown>
            </div>

            {/* 스트리밍 진행 중 끝단 스피너 */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                분석 중...
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
