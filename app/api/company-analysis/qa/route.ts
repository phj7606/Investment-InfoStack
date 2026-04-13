// POST /api/company-analysis/qa
// 기업 분석 리포트 기반 LLM Q&A 스트리밍 (P5-05)
// 생성된 분석 리포트를 system context로 주입하여 맥락 있는 답변 제공

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { QAMessage } from "@/types/company-analysis";

export const dynamic = "force-dynamic";

// Q&A 대화 이력 최대 유지 턴 수 (토큰 비용 절감 — system에 reportMarkdown이 포함되므로)
const MAX_HISTORY_TURNS = 10;

export async function POST(request: NextRequest): Promise<Response> {
  let body: {
    reportMarkdown: string;
    messages: QAMessage[];
    question: string;
    ticker?: string;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const { reportMarkdown, messages, question, ticker } = body;

  if (!question?.trim()) {
    return Response.json({ error: "question은 필수입니다." }, { status: 400 });
  }
  if (!reportMarkdown?.trim()) {
    return Response.json({ error: "reportMarkdown은 필수입니다." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  // 대화 이력 최근 N턴으로 제한 (각 턴 = user + assistant 2개 메시지)
  const recentMessages = messages.slice(-MAX_HISTORY_TURNS * 2);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // Q&A는 web_search 없이 분석 리포트 컨텍스트만으로 답변
        // — 이미 수집된 정보 기반이므로 추가 검색 불필요, 응답 속도 향상
        const msgStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: `당신은 투자 분석 전문가입니다. 아래 기업 분석 보고서를 기반으로 사용자의 질문에 답하세요.
보고서에 없는 내용을 묻는 경우 "보고서에 해당 정보가 포함되어 있지 않습니다"라고 솔직히 답하세요.
답변은 명확하고 간결하게 작성하며, 필요 시 표나 목록을 활용하세요.

${ticker ? `## 분석 대상: ${ticker}\n` : ""}
## 분석 보고서

${reportMarkdown}`,
          messages: [
            // 이전 대화 이력 (user/assistant 교대)
            ...recentMessages.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            // 현재 질문
            { role: "user" as const, content: question },
          ],
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
