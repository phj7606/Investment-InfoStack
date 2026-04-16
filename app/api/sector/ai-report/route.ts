// POST /api/sector/ai-report
// P8-04 AI 섹터 보고서 스트리밍 생성
// 멀티 LLM 지원: Claude(기본, web_search) | OpenAI | Gemini
// SSE 방식으로 6섹션 보고서 점진적 전달

import { NextRequest } from "next/server";
import { buildSectorSystemPrompt, buildSectorPrompt } from "@/lib/sector-report/prompts";
import { streamLLM, type LLMProvider } from "@/lib/sector-report/llm-client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  let body: { sectorName?: string; provider?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const sectorName = body.sectorName?.trim();
  if (!sectorName) {
    return Response.json({ error: "sectorName은 필수입니다." }, { status: 400 });
  }

  // provider 기본값: claude
  const provider = (body.provider ?? "claude") as LLMProvider;
  const validProviders: LLMProvider[] = ["claude", "openai", "gemini"];
  if (!validProviders.includes(provider)) {
    return Response.json({ error: `provider는 claude | openai | gemini 중 하나여야 합니다.` }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 멀티 LLM 스트리밍 — provider에 따라 다른 SDK 호출
        // Claude는 web_search 활성화, OpenAI·Gemini는 내부 지식 기반
        const gen = streamLLM({
          provider,
          system: buildSectorSystemPrompt(),
          userMessage: buildSectorPrompt(sectorName),
          enableWebSearch: provider === "claude",
          maxTokens: 16000,
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
