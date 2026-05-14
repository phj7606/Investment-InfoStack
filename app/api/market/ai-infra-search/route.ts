// POST /api/market/ai-infra-search
// AI 인프라 투자 관련 주제를 LLM 웹검색으로 실시간 스트리밍
// lib/sector-report/llm-client.ts의 streamLLM 재사용 (Claude/OpenAI/Gemini 공통)
//
// Claude:  web_search_20250305 네이티브 도구
// OpenAI:  web_search_preview
// Gemini:  googleSearch 그라운딩

import { NextRequest } from "next/server";
import { streamLLM, type LLMProvider } from "@/lib/sector-report/llm-client";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `당신은 AI 인프라 투자 전문 애널리스트입니다.
사용자 쿼리에 대해 최신 웹 검색 결과를 바탕으로 핵심 동향을 분석하고 마크다운으로 정리하세요.

응답 구조:
1. **핵심 요약** (3~5 bullet)
2. **주요 뉴스 & 이벤트** (날짜, 출처 포함)
3. **투자 시사점** — Neocloud(CoreWeave/Nebius/Iris Energy) 및 하이퍼스케일러(AMZN/MSFT/GOOGL/META) 관점
4. **리스크 요인** (있는 경우)

한국어로 답변하세요. 출처 URL은 가능한 경우 인라인 링크로 포함하세요.`;

export async function POST(request: NextRequest): Promise<Response> {
  let body: { query?: string; provider?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return Response.json({ error: "query는 필수입니다." }, { status: 400 });
  }

  const provider = (body.provider ?? "claude") as LLMProvider;
  const validProviders: LLMProvider[] = ["claude", "openai", "gemini"];
  if (!validProviders.includes(provider)) {
    return Response.json(
      { error: "provider는 claude | openai | gemini 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const gen = streamLLM({
          provider,
          system: SYSTEM_PROMPT,
          userMessage: query,
          enableWebSearch: true,
          maxTokens: 4000,
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
      Connection: "keep-alive",
    },
  });
}
