// POST /api/company-analysis
// 기업 분석 보고서 스트리밍 생성 (P5-02)
// Claude API + web_search tool → SSE 방식으로 점진적 전달

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildAnalysisPrompt } from "@/lib/company-analysis/prompts";
import type { CompanyAnalysisInput } from "@/types/company-analysis";

// 스트리밍 Route는 정적 캐시 불가 — 매 요청마다 새로 처리
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  // 요청 본문 파싱
  let input: CompanyAnalysisInput;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  // 필수 필드 검증
  if (!input.ticker?.trim()) {
    return Response.json({ error: "ticker는 필수입니다." }, { status: 400 });
  }
  if (!input.exchange) {
    return Response.json({ error: "exchange는 필수입니다." }, { status: 400 });
  }

  // ANTHROPIC_API_KEY 확인
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요." },
      { status: 503 }
    );
  }

  // SSE 스트리밍 응답 생성
  // ReadableStream의 start()에서 Claude API를 비동기 순회하며 청크 전송
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // SSE 이벤트 인코딩 헬퍼
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // claude-sonnet-4-6 + web_search 도구로 실시간 정보 수집 및 보고서 생성
        // stream() 메서드: AsyncIterable<MessageStreamEvent> 반환
        const msgStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          // web_search_20250305: 실시간 웹 검색으로 최신 실적/주가 정보 수집
          tools: [
            {
              type: "web_search_20250305" as "web_search_20250305",
              name: "web_search",
            },
          ],
          system: buildSystemPrompt(),
          messages: [{ role: "user", content: buildAnalysisPrompt(input) }],
        });

        // 이벤트 순회: text_delta만 클라이언트로 전달
        // tool_use/tool_result 이벤트는 서버 내부에서 자동 처리 (SDK가 관리)
        for await (const event of msgStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            enqueue({ text: event.delta.text });
          }
        }

        // 완료 신호
        enqueue({ done: true });
      } catch (err) {
        // 에러 발생 시 클라이언트에 에러 이벤트 전달
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
      // 브라우저/프록시 버퍼링 방지 — 청크가 즉시 전달되도록
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // Nginx 리버스 프록시 버퍼링 비활성화
      "Connection": "keep-alive",
    },
  });
}
