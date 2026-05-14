// POST /api/earnings-analysis
// 실적 채점 보고서 스트리밍 생성 (P8-09)
// Claude API + web_search → 최근 4분기 Beat/Miss 분석 + 실적 모멘텀 평가
// 응답 앞부분에 KPI 차트용 JSON 블록 포함 (P8-10 차트 데이터)

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildEarningsSystemPrompt, buildEarningsPrompt, type Exchange } from "@/lib/earnings-analysis/prompts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  let body: { ticker: string; exchange: Exchange };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  if (!body.ticker?.trim()) {
    return Response.json({ error: "ticker는 필수입니다." }, { status: 400 });
  }
  if (!["KRX", "NYSE", "NASDAQ"].includes(body.exchange)) {
    return Response.json({ error: "exchange는 KRX/NYSE/NASDAQ 중 하나여야 합니다." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요." },
      { status: 503 }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // claude-sonnet-4-6 + web_search — 실적 데이터 수집 및 분석
        // max_tokens 16000: JSON 블록 + 보고서 전체 포함
        const msgStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          tools: [
            {
              type: "web_search_20250305" as "web_search_20250305",
              name: "web_search",
            },
          ],
          system: buildEarningsSystemPrompt(),
          messages: [{ role: "user", content: buildEarningsPrompt(body.ticker, body.exchange) }],
        });

        for await (const event of msgStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            enqueue({ text: event.delta.text });
          }
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
