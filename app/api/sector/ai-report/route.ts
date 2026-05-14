// POST /api/sector/ai-report
// AI 섹터 보고서 스트리밍 생성
// 1. SKILL.md 우선순위로 데이터 사전 수집 (DART → Alpha Vantage → yfinance)
// 2. 수집 데이터 + 이전 리포트를 프롬프트에 주입
// 3. 멀티 LLM 스트리밍 (Claude/OpenAI/Gemini 모두 웹검색 활성화)

import { NextRequest } from "next/server";
import { buildSectorSystemPrompt, buildSectorPrompt } from "@/lib/sector-report/prompts";
import { streamLLM, type LLMProvider } from "@/lib/sector-report/llm-client";
import { collectSectorData } from "@/lib/sector-report/data-collector";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  let body: { sectorName?: string; provider?: string; previousReport?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const sectorName = body.sectorName?.trim();
  if (!sectorName) {
    return Response.json({ error: "sectorName은 필수입니다." }, { status: 400 });
  }

  const provider = (body.provider ?? "claude") as LLMProvider;
  const validProviders: LLMProvider[] = ["claude", "openai", "gemini"];
  if (!validProviders.includes(provider)) {
    return Response.json(
      { error: "provider는 claude | openai | gemini 중 하나여야 합니다." },
      { status: 400 }
    );
  }

  const previousReport = body.previousReport?.trim() ?? "";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // SKILL.md 우선순위로 데이터 사전 수집
        // 실패해도 계속 진행 — LLM 웹검색으로 보완
        enqueue({ status: "collecting" });
        const collectedData = await collectSectorData(sectorName);

        if (collectedData.sources.length > 0) {
          enqueue({ status: "collected", sources: collectedData.sources });
        }

        // 수집 데이터 + 이전 리포트를 프롬프트에 주입
        const userMessage = buildSectorPrompt(sectorName, collectedData, previousReport);

        // 모든 provider에서 웹검색 활성화
        // collectSectorData에서 감지한 sectorType을 system prompt에 전달해
        // 데이터 우선순위 규칙이 KR/US에 맞게 정확히 적용되도록 함
        const gen = streamLLM({
          provider,
          system: buildSectorSystemPrompt(collectedData.type),
          userMessage,
          enableWebSearch: true,
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
      Connection: "keep-alive",
    },
  });
}
