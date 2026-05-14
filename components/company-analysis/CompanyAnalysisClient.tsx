"use client";

// 기업 분석 모듈 최상위 Client Component
// 스트리밍 상태 기계: idle → streaming → complete / error
//
// 영속성: 마지막 분석 결과를 localStorage에 자동 저장 → 페이지 이동 후 복원
// 이전 분석 참고: MD 파일 업로드 또는 이력에서 선택 → 새 분석에 컨텍스트로 전달
// 구성: 이전 분석 참고 패널 | 이력 버튼 | 입력 폼 | 리포트 렌더링 | Q&A 패널

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Upload, X, BookMarked, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnalysisInputForm } from "./AnalysisInputForm";
import { AnalysisReport } from "./AnalysisReport";
import { QAPanel } from "./QAPanel";
import { AnalysisHistory, useAnalysisHistory } from "./AnalysisHistory";
import type {
  CompanyAnalysisInput,
  CompanyAnalysisResult,
  StreamingStatus,
  AnalysisHistoryItem,
} from "@/types/company-analysis";

// ── localStorage 키 ──────────────────────────────────────────────────
// 마지막 분석 결과 유지 (페이지 이동 후 복원용)
const CURRENT_RESULT_KEY = "company-analysis-current-result";

// ── 유틸 ─────────────────────────────────────────────────────────────

// Markdown 파일 다운로드
function downloadMarkdown(reportMarkdown: string, ticker: string, generatedAt: string) {
  const blob = new Blob([reportMarkdown], { type: "text/markdown;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ticker}-analysis-${generatedAt.slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// SSE 스트리밍 수신 루프
async function fetchAnalysisStream(
  input: CompanyAnalysisInput,
  onChunk: (text: string) => void
): Promise<void> {
  const response = await fetch("/api/company-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "요청 실패" }));
    throw new Error(err.error ?? `HTTP ${response.status}`);
  }

  if (!response.body) throw new Error("응답 스트림이 없습니다.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.done) return;
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) onChunk(parsed.text);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}

interface CompanyAnalysisClientProps {
  // 스크리너에서 종목 클릭 시 전달되는 초기값
  initialInput?: CompanyAnalysisInput;
}

export function CompanyAnalysisClient({ initialInput }: CompanyAnalysisClientProps) {
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [streamingText, setStreamingText] = useState("");
  const [result, setResult] = useState<CompanyAnalysisResult | null>(null);
  const [currentInput, setCurrentInput] = useState<CompanyAnalysisInput | null>(null);

  // 이전 분석 참고 상태 — MD 파일 업로드 or 이력에서 선택
  const [previousReport, setPreviousReport] = useState<string | null>(null);
  const [prevReportLabel, setPrevReportLabel] = useState<string | null>(null); // 파일명 or "ticker 분석"

  // 파일 업로드 input ref — 숨김 처리, 버튼 클릭 시 프로그래밍 방식으로 열기
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { history, saveToHistory, deleteFromHistory, clearHistory } = useAnalysisHistory();

  // ── 영속성: 마지막 결과 복원 (마운트 시) ─────────────────────────
  // 페이지 이동 후 돌아와도 분석 결과가 남아 있도록 함
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_RESULT_KEY);
      if (!saved) return;
      const restored: CompanyAnalysisResult = JSON.parse(saved);
      setResult(restored);
      setStatus("complete");
      setCurrentInput({
        ticker: restored.ticker,
        exchange: restored.exchange as CompanyAnalysisInput["exchange"],
        companyName: restored.companyName,
      });
    } catch {
      // 역직렬화 실패 시 조용히 무시
    }
  }, []);

  // ── 영속성: 결과 변경 시 자동 저장 ─────────────────────────────
  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(CURRENT_RESULT_KEY, JSON.stringify(result));
    } catch {
      // 저장 실패 무시
    }
  }, [result]);

  // ── 분석 실행 ────────────────────────────────────────────────────
  const handleAnalyze = useCallback(
    async (input: CompanyAnalysisInput) => {
      setStatus("streaming");
      setStreamingText("");
      setResult(null);
      setCurrentInput(input);

      // 이전 분석 보고서가 있으면 함께 전달 — LLM이 비교 분석에 활용
      const fullInput: CompanyAnalysisInput = {
        ...input,
        previousReport: previousReport ?? undefined,
      };

      let accumulated = "";

      try {
        await fetchAnalysisStream(fullInput, (chunk) => {
          accumulated += chunk;
          setStreamingText(accumulated);
        });

        const newResult: CompanyAnalysisResult = {
          ticker: input.ticker,
          companyName: input.companyName ?? input.ticker,
          exchange: input.exchange,
          generatedAt: new Date().toISOString(),
          reportMarkdown: accumulated,
        };
        setResult(newResult);
        setStatus("complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "분석 중 오류 발생";
        toast.error(`분석 실패: ${msg}`);
        setStatus("error");
      }
    },
    [previousReport]
  );

  // 스크리너에서 넘어온 경우 마운트 직후 자동 분석
  useEffect(() => {
    if (initialInput?.ticker) {
      handleAnalyze(initialInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── MD 파일 업로드 ────────────────────────────────────────────────
  // .md 파일을 읽어 이전 분석 컨텍스트로 설정
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.name.endsWith(".md") && file.type !== "text/markdown") {
        toast.error("Markdown (.md) 파일만 지원합니다.");
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setPreviousReport(content);
        setPrevReportLabel(file.name);
        toast.success(`이전 분석 파일이 로드되었습니다: ${file.name}`);
      };
      reader.readAsText(file, "utf-8");

      // 동일 파일 재선택 가능하도록 초기화
      e.target.value = "";
    },
    []
  );

  // ── 이력에서 참고 선택 ──────────────────────────────────────────
  const handleUseAsReference = useCallback((item: AnalysisHistoryItem) => {
    setPreviousReport(item.reportMarkdown);
    setPrevReportLabel(`${item.companyName} (${item.ticker}) 분석`);
    toast.success(`이전 분석을 참고로 설정했습니다: ${item.companyName}`);
  }, []);

  // ── 참고 보고서 초기화 ───────────────────────────────────────────
  const handleClearPreviousReport = useCallback(() => {
    setPreviousReport(null);
    setPrevReportLabel(null);
  }, []);

  // ── 이력 저장 ────────────────────────────────────────────────────
  const handleSaveToHistory = useCallback(() => {
    if (!result) return;
    const item: AnalysisHistoryItem = {
      ...result,
      id: crypto.randomUUID(),
      summary: result.reportMarkdown.slice(0, 200),
    };
    saveToHistory(item);
    toast.success("이력에 저장되었습니다.");
  }, [result, saveToHistory]);

  // ── 이력 복원 ────────────────────────────────────────────────────
  const handleSelectHistory = useCallback((item: AnalysisHistoryItem) => {
    setResult(item);
    setCurrentInput({
      ticker: item.ticker,
      exchange: item.exchange as CompanyAnalysisInput["exchange"],
      companyName: item.companyName,
    });
    setStreamingText("");
    setStatus("complete");
  }, []);

  // ── MD 다운로드 ──────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!result) return;
    downloadMarkdown(result.reportMarkdown, result.ticker, result.generatedAt);
    toast.success("Markdown 파일이 다운로드되었습니다.");
  }, [result]);

  const isLoading = status === "streaming";

  return (
    <div className="space-y-4">
      {/* ── 상단: 이전 분석 참고 패널 + 이력 버튼 ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* 왼쪽: 이전 분석 참고 영역 */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* 숨김 파일 input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,text/markdown"
            className="hidden"
            onChange={handleFileChange}
          />

          {previousReport ? (
            /* 참고 보고서 로드됨 — 뱃지 + 제거 버튼 */
            <Badge
              variant="outline"
              className="gap-1.5 px-2.5 py-1 text-xs text-indigo-600 border-indigo-300 bg-indigo-50 dark:bg-indigo-950/30"
            >
              <BookMarked className="h-3 w-3" />
              참고 중: {prevReportLabel}
              <button
                onClick={handleClearPreviousReport}
                className="ml-1 rounded-full hover:bg-indigo-200/60 p-0.5 transition-colors"
                title="참고 보고서 제거"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ) : (
            /* 참고 보고서 없음 — 업로드 버튼 */
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="이전 분석 MD 파일을 업로드해 새 분석의 참고 컨텍스트로 활용"
            >
              <Upload className="h-3.5 w-3.5" />
              이전 분석 불러오기
            </Button>
          )}
        </div>

        {/* 오른쪽: 분석 이력 버튼 */}
        <AnalysisHistory
          history={history}
          onSelect={handleSelectHistory}
          onDelete={deleteFromHistory}
          onClear={clearHistory}
          onUseAsReference={handleUseAsReference}
        />
      </div>

      {/* ── 입력 폼 ── */}
      <AnalysisInputForm
        onSubmit={handleAnalyze}
        isLoading={isLoading}
        defaultValues={initialInput ?? (currentInput ?? undefined)}
        previousReportLabel={prevReportLabel}
      />

      {/* ── 분석 리포트 ── */}
      <AnalysisReport
        status={status}
        streamingText={streamingText}
        result={result}
        onDownload={handleDownload}
        onSaveToHistory={handleSaveToHistory}
      />

      {/* ── Q&A 패널 — 완료 후에만 ── */}
      {status === "complete" && result && (
        <QAPanel reportMarkdown={result.reportMarkdown} ticker={result.ticker} />
      )}

      {/* ── 현재 결과 없음 안내 (복원 결과도 없는 경우) ── */}
      {status === "idle" && (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <FileText className="h-8 w-8 opacity-30" />
          <p className="text-sm">Ticker를 입력하고 분석을 시작하세요.</p>
          {history.length > 0 && (
            <p className="text-xs">
              또는 이력에서 이전 분석을 불러올 수 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
