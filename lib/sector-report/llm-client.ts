// 서버 전용 — API Route에서만 import
// 멀티 LLM 추상화 레이어: Claude(기본) | OpenAI | Gemini
// 각 provider의 스트리밍 API를 공통 AsyncGenerator<string>으로 래핑

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type LLMProvider = "claude" | "openai" | "gemini";

export interface LLMStreamOptions {
  provider: LLMProvider;
  system: string;
  userMessage: string;
  // 이전 대화 이력 (Q&A 다회전 지원)
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  // 보고서 생성 시에만 true — Claude는 web_search 도구 활성화
  enableWebSearch?: boolean;
  maxTokens?: number;
}

/**
 * 공통 텍스트 스트림 생성기
 * 각 provider의 SDK를 호출하고 텍스트 청크를 yield
 * 호출자는 for-await으로 순회 후 SSE 전송
 */
export async function* streamLLM(opts: LLMStreamOptions): AsyncGenerator<string> {
  const { provider, system, userMessage, history = [], enableWebSearch = false, maxTokens = 16000 } = opts;

  if (provider === "claude") {
    yield* streamClaude({ system, userMessage, history, enableWebSearch, maxTokens });
  } else if (provider === "openai") {
    yield* streamOpenAI({ system, userMessage, history, maxTokens });
  } else if (provider === "gemini") {
    yield* streamGemini({ system, userMessage, history, maxTokens });
  } else {
    throw new Error(`지원하지 않는 provider: ${provider}`);
  }
}

// ── Claude (Anthropic) ──────────────────────────────────────────
// web_search_20250305 도구 지원 — 보고서 생성 시 실시간 정보 수집
async function* streamClaude(opts: {
  system: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  enableWebSearch: boolean;
  maxTokens: number;
}): AsyncGenerator<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY가 설정되지 않았습니다.");

  const client = new Anthropic({ apiKey });

  const msgStream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: opts.maxTokens,
    // 보고서 생성 시 web_search 활성화 — Q&A는 비활성화(컨텍스트 기반)
    ...(opts.enableWebSearch
      ? {
          tools: [
            {
              type: "web_search_20250305" as "web_search_20250305",
              name: "web_search",
            },
          ],
        }
      : {}),
    system: opts.system,
    messages: [
      ...opts.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: opts.userMessage },
    ],
  });

  for await (const event of msgStream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

// ── OpenAI (GPT-5.4 / GPT-5.4-mini) ────────────────────────────
// maxTokens 기준으로 모델 자동 선택:
//   > 4096 → gpt-5.4 (보고서 생성 — 복잡한 분석, 긴 출력)
//  <= 4096 → gpt-5.4-mini (Q&A — 빠른 응답, 비용 절감)
async function* streamOpenAI(opts: {
  system: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.");

  const client = new OpenAI({ apiKey });

  // 보고서 생성(16K)은 gpt-5.4, Q&A(4K 이하)는 gpt-5.4-mini로 비용 최적화
  const model = opts.maxTokens > 4096 ? "gpt-5.4" : "gpt-5.4-mini";

  const stream = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens,
    stream: true,
    messages: [
      { role: "system", content: opts.system },
      ...opts.history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: opts.userMessage },
    ],
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

// ── Google Gemini ────────────────────────────────────────────────
// generateContentStream: 청크 단위 스트리밍
async function* streamGemini(opts: {
  system: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}): AsyncGenerator<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.");

  const client = new GoogleGenerativeAI(apiKey);
  // gemini-3.1-pro-preview: 1M 토큰 컨텍스트 — 보고서 전체 주입 Q&A에 적합
  // (gemini-3-pro-preview는 2026.03.09 서비스 종료)
  const model = client.getGenerativeModel({
    model: "gemini-3.1-pro-preview",
    systemInstruction: opts.system,
    generationConfig: { maxOutputTokens: opts.maxTokens },
  });

  // Gemini는 role을 "user" | "model"로 구분
  const chat = model.startChat({
    history: opts.history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  const result = await chat.sendMessageStream(opts.userMessage);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

/**
 * provider별 환경변수 키 이름 — 클라이언트에 "키 없음" 안내용
 */
export const PROVIDER_ENV_KEYS: Record<LLMProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
};

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  claude: "Claude Sonnet 4.6",
  openai: "GPT-5.4",
  gemini: "Gemini 3.1 Pro",
};
