"use client";

// AI 섹터 보고서 클라이언트 컴포넌트
// 상태와 스트리밍 로직은 SectorReportContext에서 관리 (페이지 이동 후에도 유지)
// 이 컴포넌트는 Context에서 읽어 렌더링만 담당

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Search,
  ChevronDown,
  CloudDownload,
  Printer,
  Send,
  Loader2,
  CloudUpload,
  FileText,
  AlertCircle,
  RotateCcw,
  Play,
} from "lucide-react";
import { useSectorReport } from "@/lib/sector-report/context";
import type { LLMProvider } from "@/lib/sector-report/llm-client";

// ── 예시 섹터 칩 ─────────────────────────────────────────────────
const EXAMPLE_SECTORS = [
  "AI 반도체", "K-바이오테크", "전기차 배터리", "방산",
  "클라우드 SaaS", "조선", "글로벌 핀테크", "원자력 에너지",
];

// ── LLM 선택기 드롭다운 옵션 ─────────────────────────────────────
const LLM_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: "claude", label: "Claude Sonnet 4.6" },
  { value: "openai", label: "GPT-5.4" },
  { value: "gemini", label: "Gemini 3.1 Pro" },
];

// ── PDF 인쇄용 스타일 ─────────────────────────────────────────────
// 새 창에 보고서 HTML을 삽입할 때 사용하는 기본 prose 스타일
// Next.js 레이아웃 밖에서 독립적으로 렌더링하므로 @media print가 올바르게 동작함
const PDF_PRINT_STYLES = `
  body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; font-size: 13px; line-height: 1.7; color: #111; padding: 24px 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.5rem; font-weight: 700; margin: 1.5rem 0 0.5rem; }
  h2 { font-size: 1.2rem; font-weight: 600; margin: 1.2rem 0 0.4rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3rem; }
  h3 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.3rem; }
  p { margin: 0.5rem 0; }
  ul, ol { padding-left: 1.5rem; margin: 0.5rem 0; }
  li { margin: 0.2rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 0.8rem 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-size: 11px; font-family: monospace; }
  blockquote { border-left: 3px solid #d1d5db; padding-left: 12px; margin: 0.5rem 0; color: #555; }
  strong { font-weight: 600; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1rem 0; }
  @media print { body { padding: 0; } }
`;

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export function SectorReportClient() {
  // Context에서 전역 상태와 액션을 가져옴
  const {
    state,
    setSectorName,
    setProvider,
    setPreviousReport,
    handleGenerate,
    handleQuestion,
    reset,
  } = useSectorReport();

  const {
    sectorName,
    provider,
    previousReport,
    report,
    reportStatus,
    collectedSources,
    errorMessage,
    qaMessages,
    qaLoading,
  } = state;

  // 이전 리포트 패널 열림/닫힘 — UI 전용
  const [prevReportOpen, setPrevReportOpen] = useState(false);
  // Q&A 입력 — 전송 후 초기화
  const [question, setQuestion] = useState("");

  // 보고서 렌더링 DOM 참조 — PDF 내보내기 시 innerHTML 추출
  const reportContentRef = useRef<HTMLDivElement>(null);

  // 스크롤 ref
  const reportEndRef = useRef<HTMLDivElement>(null);
  const qaEndRef = useRef<HTMLDivElement>(null);

  // 보고서 스트리밍 중 자동 스크롤
  useEffect(() => {
    if (reportStatus === "loading") {
      reportEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [report, reportStatus]);

  // Q&A 응답 중 자동 스크롤
  useEffect(() => {
    if (qaLoading) {
      qaEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [qaMessages, qaLoading]);

  // ── Q&A 전송 래퍼 ────────────────────────────────────────────
  const onSendQuestion = async () => {
    if (!question.trim() || qaLoading) return;
    const q = question.trim();
    setQuestion("");
    await handleQuestion(q);
  };

  // ── Markdown Export ──────────────────────────────────────────
  const handleExportMarkdown = () => {
    if (!report) return;
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sectorName.trim() || "sector"}-report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── PDF Export ───────────────────────────────────────────────
  // window.print()은 Next.js 레이아웃 구조에서 @media print 셀렉터가
  // 올바르게 적용되지 않으므로, 새 창에 보고서 HTML만 삽입 후 인쇄
  const handleExportPdf = () => {
    if (!reportContentRef.current) return;
    const reportHtml = reportContentRef.current.innerHTML;

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${sectorName.trim() || "섹터"} 분석 보고서</title>
  <style>${PDF_PRINT_STYLES}</style>
</head>
<body>
  ${reportHtml}
</body>
</html>`);
    printWindow.document.close();
    // 이미지 등 로드 완료 후 인쇄 다이얼로그 표시
    printWindow.onload = () => printWindow.print();
    printWindow.print();
  };

  // ── 파일 업로드 처리 ─────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviousReport((ev.target?.result as string) ?? "");
    };
    reader.readAsText(file, "utf-8");
  };

  const isGenerating = reportStatus === "collecting" || reportStatus === "loading";
  const hasReport = report.length > 0;

  return (
    <div className="space-y-4">
      {/* ── 입력 패널 ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          {/* 섹터 입력 + 초기화 버튼 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isGenerating) handleGenerate();
                }}
                placeholder="섹터명 입력 (예: AI 반도체, 전기차 배터리...)"
                className="pl-8 text-sm"
                disabled={isGenerating}
              />
            </div>
            {(hasReport || reportStatus !== "idle") && (
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                disabled={isGenerating}
                className="shrink-0 h-9 px-2 text-muted-foreground hover:text-destructive"
                title="보고서 초기화"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* 예시 섹터 칩 */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_SECTORS.map((sector) => (
              <Badge
                key={sector}
                variant="secondary"
                className="cursor-pointer text-xs hover:bg-[#D97757]/15 hover:text-[#D97757] transition-colors"
                onClick={() => setSectorName(sector)}
              >
                {sector}
              </Badge>
            ))}
          </div>

          {/* LLM 드롭다운 + 분석 시작 버튼 (같은 라인) */}
          <div className="flex items-center gap-2">
            {/* LLM 모델 드롭다운 */}
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as LLMProvider)}
              disabled={isGenerating}
            >
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LLM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 분석 시작 버튼 — 드롭다운 우측, 소형 */}
            <Button
              onClick={handleGenerate}
              disabled={!sectorName.trim() || isGenerating}
              size="sm"
              className="h-8 px-3 text-xs bg-[#D97757] hover:bg-[#c4694a] text-white shrink-0"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  {reportStatus === "collecting" ? "수집 중..." : "생성 중..."}
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1.5" />
                  분석 시작
                </>
              )}
            </Button>

            {/* 수집된 데이터 소스 (인라인) */}
            {collectedSources.length > 0 && (
              <span className="text-[10px] text-muted-foreground truncate">
                {collectedSources.join(", ")}
              </span>
            )}
          </div>

          {/* 이전 리포트 참조 (Collapsible) */}
          <Collapsible open={prevReportOpen} onOpenChange={setPrevReportOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${prevReportOpen ? "rotate-180" : ""}`}
                />
                이전 리포트 참조 (비교 분석용)
                {previousReport && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                    설정됨
                  </Badge>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <Tabs defaultValue="file">
                <TabsList className="h-7">
                  <TabsTrigger value="file" className="text-xs px-3 h-6">
                    <CloudUpload className="h-3 w-3 mr-1" />
                    파일 업로드
                  </TabsTrigger>
                  <TabsTrigger value="text" className="text-xs px-3 h-6">
                    <FileText className="h-3 w-3 mr-1" />
                    텍스트 입력
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="file" className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-md p-3 hover:bg-muted/50 transition-colors">
                    <CloudUpload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {previousReport
                        ? `파일 로드됨 (${previousReport.length.toLocaleString()}자)`
                        : ".md, .txt 파일을 선택하세요"}
                    </span>
                    <input
                      type="file"
                      accept=".md,.txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                </TabsContent>
                <TabsContent value="text" className="mt-2">
                  <Textarea
                    value={previousReport}
                    onChange={(e) => setPreviousReport(e.target.value)}
                    placeholder="이전 분석 리포트 내용을 붙여넣으세요..."
                    className="text-xs min-h-[80px] resize-none"
                  />
                </TabsContent>
              </Tabs>
              {previousReport && (
                <button
                  onClick={() => setPreviousReport("")}
                  className="mt-1 text-[10px] text-muted-foreground hover:text-destructive"
                >
                  초기화
                </button>
              )}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* ── 오류 메시지 ─────────────────────────────────────────── */}
      {reportStatus === "error" && (
        <Card className="border-destructive/50">
          <CardContent className="pt-4 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive whitespace-pre-wrap">{errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* ── 보고서 영역 ─────────────────────────────────────────── */}
      {(isGenerating || hasReport) && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#D97757]" />
                  보고서 생성 중...
                </span>
              ) : (
                "섹터 분석 보고서"
              )}
            </CardTitle>
            {reportStatus === "done" && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportMarkdown}
                  className="h-7 text-xs gap-1"
                >
                  <CloudDownload className="h-3 w-3" />
                  Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPdf}
                  className="h-7 text-xs gap-1"
                >
                  <Printer className="h-3 w-3" />
                  PDF
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {/* ref로 DOM 참조 — PDF 내보내기 시 innerHTML 사용 */}
            <div
              ref={reportContentRef}
              className="prose prose-sm dark:prose-invert max-w-none text-sm
                prose-headings:font-semibold
                prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                prose-table:text-xs
                prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:rounded"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {report}
              </ReactMarkdown>
              {isGenerating && (
                <span className="inline-block w-0.5 h-4 bg-[#D97757] animate-pulse ml-0.5" />
              )}
            </div>
            <div ref={reportEndRef} />
          </CardContent>
        </Card>
      )}

      {/* ── Q&A 영역 ────────────────────────────────────────────── */}
      {reportStatus === "done" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Q&A</CardTitle>
            <p className="text-xs text-muted-foreground">
              보고서 내용에 대해 질문하거나 추가 정보를 요청하세요 (웹검색 포함)
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {qaMessages.length > 0 && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {qaMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`
                        max-w-[85%] rounded-lg px-3 py-2 text-sm
                        ${msg.role === "user"
                          ? "bg-[#D97757] text-white"
                          : "bg-muted text-foreground"
                        }
                      `}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm prose-p:my-1 prose-headings:my-1">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                          {qaLoading && idx === qaMessages.length - 1 && (
                            <span className="inline-block w-0.5 h-3.5 bg-foreground animate-pulse ml-0.5" />
                          )}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={qaEndRef} />
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !qaLoading) {
                    e.preventDefault();
                    onSendQuestion();
                  }
                }}
                placeholder="보고서에 대해 질문하세요..."
                className="text-sm"
                disabled={qaLoading}
              />
              <Button
                onClick={onSendQuestion}
                disabled={!question.trim() || qaLoading}
                size="sm"
                className="shrink-0 bg-[#D97757] hover:bg-[#c4694a] text-white px-3"
              >
                {qaLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
