// POST /api/fundamental-screening
// 재무제표 수집(Alpha Vantage / FnGuide) → rawItems → SSE 스트리밍
//
// 처리 흐름:
//   ① FnGuide / Alpha Vantage에서 최신 재무제표 수집 (항상 fresh fetch)
//   ② SSE: { rawData } — 원시 계정 항목 (화면 표시용)
//   ③ Claude 분석 스트리밍 (dataOnly=true 시 생략)
//
// 연도 병합(과거 데이터 보존)은 클라이언트(FundamentalScreeningClient)에서 처리.
// 서버는 FnGuide/Alpha Vantage의 최신 응답만 반환하며, 파일 캐시를 사용하지 않음.

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchUsFinancials, fetchKrFinancials } from "@/lib/fundamental-screening/data-fetcher";
import { buildSystemPrompt, buildAnalysisPrompt } from "@/lib/fundamental-screening/prompts";
import type { FinancialStatements } from "@/types/fundamental-screening";

export const dynamic = "force-dynamic";

interface RequestBody {
  ticker: string;
  exchange: string;
  companyName?: string;
  forceRefresh?: boolean;  // 현재 미사용 — 항상 fresh fetch
  // true 시 rawData 전송 후 Claude 분석 생략 — 재무 체크포인트 탭 전용
  dataOnly?: boolean;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const { ticker, exchange, companyName, dataOnly } = body;

  if (!ticker?.trim()) return Response.json({ error: "ticker는 필수입니다." }, { status: 400 });
  if (!exchange) return Response.json({ error: "exchange는 필수입니다." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const isKrx = exchange === "KRX";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // ── Step 1: FnGuide / Alpha Vantage에서 최신 재무제표 수집 ────────
        // 과거 연도 보존(병합)은 클라이언트에서 처리 — 서버는 항상 fresh fetch
        enqueue({ status: "collecting", message: "재무 데이터 수집 중..." });

        const statements: FinancialStatements = isKrx
          ? await fetchKrFinancials(ticker.trim())
          : await fetchUsFinancials(ticker.trim().toUpperCase());

        enqueue({
          status: "analyzing",
          message: `${statements.rawItems.length}개 계정 수집 완료.`,
        });

        // ── Step 2: rawItems 전달 (화면 표시용) ──────────────────────────
        // rawData에 rawItems 포함 — FinancialRawDataTable이 직접 렌더링
        enqueue({ rawData: statements, cachedAt: statements.cachedAt });

        // ── Step 3: Claude 분석 스트리밍 (dataOnly 시 생략) ──────────────
        // 재무 체크포인트 탭은 rawData를 직접 계산하므로 Claude 호출 불필요
        if (dataOnly) {
          enqueue({ done: true });
          return;
        }

        enqueue({ status: "analyzing", message: "4대 질문 분석 중..." });

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msgStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          system: buildSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildAnalysisPrompt(
                ticker.trim(),
                exchange,
                companyName,
                statements.rawItems,
                statements.unit,
                statements.dataSource
              ),
            },
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
        console.error("[fundamental-screening] 오류:", err);
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
