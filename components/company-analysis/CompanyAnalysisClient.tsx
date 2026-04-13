"use client";

// 기업 분석 모듈 최상위 Client Component (P5-01 ~ P5-07 조율)
// 스트리밍 상태 기계 관리: idle → streaming → complete / error
// 구성: 이력 버튼 | 입력 폼 | 리포트 렌더링 | Q&A 패널

import { useState, useCallback } from "react";
import { toast } from "sonner";
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

// Markdown 파일 다운로드 — 기존 CSV export 패턴 재활용
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
// fetch POST → ReadableStream reader → "\n\n" 기준 파싱 → 콜백 호출
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
    // SSE는 "\n\n"으로 이벤트 구분
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
        // done/error가 아닌 파싱 오류는 무시
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}

export function CompanyAnalysisClient() {
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [streamingText, setStreamingText] = useState("");
  const [result, setResult] = useState<CompanyAnalysisResult | null>(null);
  const [currentInput, setCurrentInput] = useState<CompanyAnalysisInput | null>(null);

  const { history, saveToHistory, deleteFromHistory, clearHistory } = useAnalysisHistory();

  const handleAnalyze = useCallback(async (input: CompanyAnalysisInput) => {
    setStatus("streaming");
    setStreamingText("");
    setResult(null);
    setCurrentInput(input);

    let accumulated = "";

    try {
      await fetchAnalysisStream(input, (chunk) => {
        accumulated += chunk;
        setStreamingText(accumulated);
      });

      // 스트리밍 완료 — result 객체 생성
      const newResult: CompanyAnalysisResult = {
        ticker: input.ticker,
        // companyName: 리포트 첫 줄 제목에서 추출하거나 ticker 사용
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
  }, []);

  // 이력에 수동 저장 (버튼 클릭)
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

  // 이력에서 복원
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

  // MD 다운로드
  const handleDownload = useCallback(() => {
    if (!result) return;
    downloadMarkdown(result.reportMarkdown, result.ticker, result.generatedAt);
    toast.success("Markdown 파일이 다운로드되었습니다.");
  }, [result]);

  const isLoading = status === "streaming";

  return (
    <div className="space-y-4">
      {/* 상단 우측: 이력 버튼 */}
      <div className="flex justify-end">
        <AnalysisHistory
          history={history}
          onSelect={handleSelectHistory}
          onDelete={deleteFromHistory}
          onClear={clearHistory}
        />
      </div>

      {/* 입력 폼 */}
      <AnalysisInputForm onSubmit={handleAnalyze} isLoading={isLoading} />

      {/* 분석 리포트 */}
      <AnalysisReport
        status={status}
        streamingText={streamingText}
        result={result}
        onDownload={handleDownload}
        onSaveToHistory={handleSaveToHistory}
      />

      {/* Q&A 패널 — 분석 완료 후에만 표시 */}
      {status === "complete" && result && (
        <QAPanel
          reportMarkdown={result.reportMarkdown}
          ticker={result.ticker}
        />
      )}
    </div>
  );
}
