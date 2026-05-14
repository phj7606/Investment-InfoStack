// 멀티 LLM 지원 타입 정의
// 스크리너·분석 기능에서 사용자가 원하는 모델을 선택할 수 있도록 통합 타입 관리

export type ModelProvider = "Anthropic" | "OpenAI" | "Google";

// 2026년 4월 기준 최신 모델 목록
// Gemini 3.0 Pro Preview는 2026년 3월 9일 종료 → 3.1 Pro Preview로 대체
export type ModelOption =
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gemini-3.1-pro-preview";

export interface ModelConfig {
  value: ModelOption;
  label: string;       // UI 표시명
  provider: ModelProvider;
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  { value: "claude-sonnet-4-6",      label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { value: "claude-opus-4-6",        label: "Claude Opus 4.6",   provider: "Anthropic" },
  { value: "gpt-5.4",                label: "GPT-5.4",           provider: "OpenAI"    },
  { value: "gpt-5.4-mini",           label: "GPT-5.4 mini",      provider: "OpenAI"    },
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro",    provider: "Google"    },
];

// 모델 → provider 역방향 조회
export function getProvider(model: ModelOption): ModelProvider {
  return AVAILABLE_MODELS.find((m) => m.value === model)!.provider;
}
