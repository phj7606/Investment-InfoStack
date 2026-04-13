"use client";

// LLM Q&A 패널 (P5-04)
// 분석 완료 후 생성된 리포트를 컨텍스트로 Claude와 대화형 Q&A
// 스트리밍 응답 + 자동 스크롤 + Enter 전송

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { QAMessage } from "@/types/company-analysis";

interface QAPanelProps {
  reportMarkdown: string;
  ticker: string;
}

// SSE 스트리밍 파싱 (분석 API와 동일 패턴)
async function streamQAResponse(
  reportMarkdown: string,
  messages: QAMessage[],
  question: string,
  ticker: string,
  onChunk: (text: string) => void
): Promise<void> {
  const response = await fetch("/api/company-analysis/qa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reportMarkdown, messages, question, ticker }),
  });

  if (!response.ok || !response.body) {
    const err = await response.json().catch(() => ({ error: "요청 실패" }));
    throw new Error(err.error ?? "Q&A 요청 실패");
  }

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
        if (e instanceof Error && e.message !== "JSON 파싱 실패") throw e;
      }
    }
  }
}

export function QAPanel({ reportMarkdown, ticker }: QAPanelProps) {
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 새 메시지 추가 시 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    setIsStreaming(true);

    // 사용자 메시지 추가
    const userMsg: QAMessage = {
      role: "user",
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // 어시스턴트 메시지 플레이스홀더 추가 (스트리밍 중 업데이트)
    const assistantMsg: QAMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      let accumulated = "";
      await streamQAResponse(
        reportMarkdown,
        // 플레이스홀더 제외한 이전 메시지만 전달
        [...messages, userMsg],
        question,
        ticker,
        (chunk) => {
          accumulated += chunk;
          // 마지막 메시지(어시스턴트)를 누적 텍스트로 업데이트
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...assistantMsg,
              content: accumulated,
            };
            return updated;
          });
        }
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Q&A 오류 발생";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...assistantMsg,
          content: `오류: ${errorMsg}`,
        };
        return updated;
      });
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  }, [input, isStreaming, messages, reportMarkdown, ticker]);

  // Enter 전송 (Shift+Enter는 줄바꿈)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          보고서 Q&amp;A
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 메시지 목록 */}
        <ScrollArea className="h-80 rounded-md border border-border p-3">
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              분석 보고서에 대해 질문해 보세요.
              <br />
              예: &quot;목표주가 산출 근거가 뭔가요?&quot;, &quot;가장 큰 리스크는?&quot;
            </p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col gap-1 ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <span className="text-xs text-muted-foreground">
                    {msg.role === "user" ? "나" : "Claude"}
                  </span>
                  {msg.role === "user" ? (
                    // 사용자 메시지: 단순 텍스트 버블
                    <div className="bg-primary text-primary-foreground rounded-lg rounded-tr-none px-3 py-2 text-sm max-w-[85%]">
                      {msg.content}
                    </div>
                  ) : (
                    // 어시스턴트 메시지: Markdown 렌더링
                    <div className="bg-muted rounded-lg rounded-tl-none px-3 py-2 max-w-[90%] w-full">
                      {msg.content ? (
                        <MarkdownRenderer content={msg.content} />
                      ) : (
                        // 스트리밍 대기 중 커서
                        <span className="inline-block w-2 h-4 bg-muted-foreground animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* 입력 영역 */}
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
            className="min-h-[60px] max-h-32 resize-none text-sm"
            disabled={isStreaming}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="sm"
            className="h-9 w-9 p-0 flex-shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
