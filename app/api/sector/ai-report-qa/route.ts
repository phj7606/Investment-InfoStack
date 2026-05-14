// POST /api/sector/ai-report-qa
// P8-04 AI 섹터 보고서 Q&A 스트리밍
// 생성된 보고서를 system context로 주입 → 멀티 LLM 기반 맥락 있는 답변
// 멀티 LLM 지원: Claude(기본) | OpenAI | Gemini

import { NextRequest } from "next/server";
import { streamLLM, type LLMProvider } from "@/lib/sector-report/llm-client";

export const dynamic = "force-dynamic";

// 다회전 대화 유지 최대 턴 수 (토큰 절감 — 보고서 자체가 이미 대용량)
const MAX_HISTORY_TURNS = 8;

export async function POST(request: NextRequest): Promise<Response> {
  let body: {
    reportMarkdown: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    question: string;
    sectorName?: string;
    provider?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const { reportMarkdown, messages = [], question, sectorName, provider: rawProvider } = body;

  if (!question?.trim()) {
    return Response.json({ error: "question은 필수입니다." }, { status: 400 });
  }
  if (!reportMarkdown?.trim()) {
    return Response.json({ error: "reportMarkdown은 필수입니다." }, { status: 400 });
  }

  const provider = (rawProvider ?? "claude") as LLMProvider;
  const validProviders: LLMProvider[] = ["claude", "openai", "gemini"];
  if (!validProviders.includes(provider)) {
    return Response.json({ error: "provider는 claude | openai | gemini 중 하나여야 합니다." }, { status: 400 });
  }

  // 최근 N턴으로 이력 제한 (각 턴 = user + assistant 2개)
  const recentHistory = messages.slice(-MAX_HISTORY_TURNS * 2);

  // 보고서 컨텍스트를 system에 주입 — Q&A는 web_search 없이 보고서 기반만 사용
  const systemPrompt = `당신은 투자 리서치 전문가입니다. 아래 섹터 분석 보고서를 기반으로 사용자의 질문에 답하세요.

**규칙:**
- 보고서에 있는 내용만 답변하세요. 보고서에 없는 내용이면 "보고서에 해당 정보가 포함되어 있지 않습니다"라고 명확히 안내하세요.
- 수치·출처를 인용할 때는 보고서의 해당 섹션을 명시하세요 (예: "2. Market Overview 기준").
- 필요 시 표, 목록, 강조(**bold**)를 활용해 가독성을 높이세요.
- 한국어로 답변하세요.

${sectorName ? `## 분석 섹터: ${sectorName}\n` : ""}
---

## 섹터 분석 보고서

${reportMarkdown}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Q&A도 웹검색 활성화 — 보고서 컨텍스트 기반 + 보고서에 없는 최신 정보도 답변 가능
        const gen = streamLLM({
          provider,
          system: systemPrompt,
          userMessage: question,
          history: recentHistory,
          enableWebSearch: true,
          maxTokens: 4096,
        });

        for await (const text of gen) {
          enqueue({ text });
        }

        enqueue({ done: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enqueue({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
