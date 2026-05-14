// 멀티 LLM 통합 클라이언트
// Claude / OpenAI / Gemini를 단일 인터페이스로 호출
// 서버 전용 (API 키를 직접 사용하므로 "use client" 선언 금지)

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ModelOption } from "./types";
import { getProvider } from "./types";

// 각 클라이언트는 모듈 레벨에서 지연 초기화 — 환경변수 없는 경우 에러 방지
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;
let _google: GoogleGenerativeAI | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY 환경변수가 설정되지 않았습니다.");
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getGoogle(): GoogleGenerativeAI {
  if (!_google) {
    if (!process.env.GOOGLE_AI_API_KEY) throw new Error("GOOGLE_AI_API_KEY 환경변수가 설정되지 않았습니다.");
    _google = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
  }
  return _google;
}

/**
 * 선택한 LLM 모델로 텍스트를 생성한다.
 * 데이터 수집이 아닌 순수 텍스트 생성 전용 — 숫자 창작 방지는 프롬프트에서 담당.
 *
 * @param model    사용할 모델 ID
 * @param system   시스템 프롬프트 (역할·출력 형식 지시)
 * @param user     사용자 프롬프트 (실제 요청)
 * @returns        모델이 생성한 텍스트 (trim 처리됨)
 */
export async function generateText(
  model: ModelOption,
  system: string,
  user: string
): Promise<string> {
  const provider = getProvider(model);

  if (provider === "Anthropic") {
    const res = await getAnthropic().messages.create({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    });
    // content 배열에서 text 블록만 추출
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    return text.trim();
  }

  if (provider === "OpenAI") {
    const res = await getOpenAI().chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 2048,
    });
    return (res.choices[0]?.message?.content ?? "").trim();
  }

  // Google Gemini — 시스템 프롬프트를 systemInstruction으로 전달
  const genModel = getGoogle().getGenerativeModel({
    model,
    systemInstruction: system,
  });
  const res = await genModel.generateContent(user);
  return res.response.text().trim();
}
