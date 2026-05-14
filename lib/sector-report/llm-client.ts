// 서버 전용 — API Route에서만 import
// 멀티 LLM 추상화 레이어: Claude(기본) | OpenAI | Gemini
// 모든 provider에서 웹검색 활성화 지원 (보고서 생성 + Q&A 모두)
//
// Claude:  web_search_20250305 도구 (Anthropic 네이티브)
// OpenAI:  Responses API + web_search_preview 툴
// Gemini:  googleSearch 그라운딩

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
  // 웹검색 활성화 여부 — 보고서 생성·Q&A 모두 true
  enableWebSearch?: boolean;
  maxTokens?: number;
}

/**
 * 공통 텍스트 스트림 생성기
 * 각 provider의 SDK를 호출하고 텍스트 청크를 yield
 * 호출자는 for-await으로 순회 후 SSE 전송
 */
export async function* streamLLM(opts: LLMStreamOptions): AsyncGenerator<string> {
  const {
    provider,
    system,
    userMessage,
    history = [],
    enableWebSearch = false,
    maxTokens = 16000,
  } = opts;

  if (provider === "claude") {
    yield* streamClaude({ system, userMessage, history, enableWebSearch, maxTokens });
  } else if (provider === "openai") {
    yield* streamOpenAI({ system, userMessage, history, enableWebSearch, maxTokens });
  } else if (provider === "gemini") {
    yield* streamGemini({ system, userMessage, history, enableWebSearch, maxTokens });
  } else {
    throw new Error(`지원하지 않는 provider: ${provider}`);
  }
}

// ── Claude (Anthropic) ──────────────────────────────────────────────
// web_search_20250305 도구로 실시간 정보 수집
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
      ...opts.history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: opts.userMessage },
    ],
  });

  for await (const event of msgStream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}

// ── OpenAI (GPT-5.4 / GPT-5.4-mini) ────────────────────────────────
// Responses API + web_search_preview 툴로 웹검색 지원
// maxTokens 기준으로 모델 자동 선택:
//   > 4096 → gpt-5.4 (보고서 생성)
//  <= 4096 → gpt-5.4-mini (Q&A — 빠른 응답)
async function* streamOpenAI(opts: {
  system: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  enableWebSearch: boolean;
  maxTokens: number;
}): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error(
      "OPENAI_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요."
    );

  const client = new OpenAI({ apiKey });
  const model = opts.maxTokens > 4096 ? "gpt-5.4" : "gpt-5.4-mini";

  // Responses API: web_search_preview 툴 지원
  // input 배열: system → history → user 순서로 구성
  const input: OpenAI.Responses.ResponseInput = [
    { role: "system", content: opts.system },
    ...opts.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: opts.userMessage },
  ];

  const stream = await client.responses.create({
    model,
    max_output_tokens: opts.maxTokens,
    stream: true,
    tools: opts.enableWebSearch
      ? [{ type: "web_search_preview" as const }]
      : [],
    input,
  });

  for await (const event of stream) {
    // Responses API 스트리밍 이벤트: response.output_text.delta
    if (
      event.type === "response.output_text.delta" &&
      event.delta
    ) {
      yield event.delta;
    }
  }
}

// ── Google Gemini ────────────────────────────────────────────────────
// googleSearch 그라운딩으로 웹검색 지원
// gemini-3.1-pro-preview: 1M 토큰 컨텍스트 — 보고서 전체 주입 Q&A에 적합
//
// [주의] 429 Too Many Requests "free_tier_requests limit: 0" 오류 발생 시:
//   → gemini-3.1-pro-preview는 free tier 할당량이 없는 모델입니다.
//   → 해결 방법 1: Google AI Studio(aistudio.google.com/apikey) → API 키 관련 프로젝트 →
//                  Google Cloud Console에서 결제 계정(Billing Account) 연결
//   → 해결 방법 2: 해당 모델이 Vertex AI 전용인 경우, Google Cloud 서비스 계정 키 필요
async function* streamGemini(opts: {
  system: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  enableWebSearch: boolean;
  maxTokens: number;
}): AsyncGenerator<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey)
    throw new Error(
      "GOOGLE_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요."
    );

  const client = new GoogleGenerativeAI(apiKey);

  const model = client.getGenerativeModel({
    model: "gemini-3.1-pro-preview",
    systemInstruction: opts.system,
    // googleSearch 그라운딩: 활성화 시 실시간 웹 정보 수집
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: opts.enableWebSearch ? [{ googleSearch: {} } as any] : [],
    generationConfig: { maxOutputTokens: opts.maxTokens },
  });

  // Gemini는 role을 "user" | "model"로 구분
  const chat = model.startChat({
    history: opts.history.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  try {
    const result = await chat.sendMessageStream(opts.userMessage);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (err) {
    // 429 오류에 구체적인 해결 방법 안내
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("429") || message.includes("Too Many Requests")) {
      throw new Error(
        `Gemini API 할당량 초과 (429).\n` +
        `gemini-3.1-pro-preview는 유료 티어 전용 모델입니다.\n\n` +
        `해결 방법:\n` +
        `1. Google AI Studio(aistudio.google.com) → API 키 → 연결된 Google Cloud 프로젝트에서 결제 계정(Billing Account)이 연결되어 있는지 확인\n` +
        `2. 결제가 이미 활성화된 경우, 해당 모델은 Vertex AI를 통해서만 접근 가능할 수 있습니다. Google Cloud 콘솔에서 Generative Language API 할당량을 확인하세요.`
      );
    }
    throw err;
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
