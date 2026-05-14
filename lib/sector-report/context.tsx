"use client";

// AI 섹터 보고서 전역 상태 Context
// 페이지 이동해도 보고서·Q&A 이력이 유지되도록
// 대시보드 레이아웃 수준에서 Provider를 마운트함
//
// 상태를 컴포넌트 밖에서 관리하면:
//   - SectorReportClient 언마운트 → 상태 유지
//   - 스트리밍 fetch는 Context 내 async 함수로 실행 → 페이지 이동해도 계속 수신
//   - 사용자가 "초기화" 명시 전까지 보고서와 Q&A 이력 보존

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { LLMProvider } from "@/lib/sector-report/llm-client";

// ── 메시지 타입 ───────────────────────────────────────────────────
export interface Message {
  role: "user" | "assistant";
  content: string;
}

// ── 보고서 상태 ───────────────────────────────────────────────────
export type ReportStatus = "idle" | "collecting" | "loading" | "done" | "error";

// ── Context 전체 State 타입 ───────────────────────────────────────
interface SectorReportState {
  // 입력값
  sectorName: string;
  provider: LLMProvider;
  previousReport: string;

  // 보고서
  report: string;
  reportStatus: ReportStatus;
  collectedSources: string[];
  errorMessage: string;

  // Q&A
  qaMessages: Message[];
  qaLoading: boolean;
}

// ── Reducer Action ────────────────────────────────────────────────
type Action =
  | { type: "SET_SECTOR_NAME"; payload: string }
  | { type: "SET_PROVIDER"; payload: LLMProvider }
  | { type: "SET_PREVIOUS_REPORT"; payload: string }
  | { type: "REPORT_START" }
  | { type: "REPORT_COLLECTING" }
  | { type: "REPORT_COLLECTED"; payload: string[] }
  | { type: "REPORT_APPEND"; payload: string }
  | { type: "REPORT_DONE" }
  | { type: "REPORT_ERROR"; payload: string }
  | { type: "QA_ADD_USER"; payload: string }
  | { type: "QA_ADD_ASSISTANT_PLACEHOLDER" }
  | { type: "QA_APPEND_LAST"; payload: string }
  | { type: "QA_ERROR_LAST"; payload: string }
  | { type: "QA_DONE" }
  | { type: "RESET" };

const initialState: SectorReportState = {
  sectorName: "",
  provider: "claude",
  previousReport: "",
  report: "",
  reportStatus: "idle",
  collectedSources: [],
  errorMessage: "",
  qaMessages: [],
  qaLoading: false,
};

function reducer(state: SectorReportState, action: Action): SectorReportState {
  switch (action.type) {
    case "SET_SECTOR_NAME":
      return { ...state, sectorName: action.payload };
    case "SET_PROVIDER":
      return { ...state, provider: action.payload };
    case "SET_PREVIOUS_REPORT":
      return { ...state, previousReport: action.payload };

    // 보고서 생성 시작 — 이전 보고서·Q&A 초기화, 상태 collecting으로
    case "REPORT_START":
      return {
        ...state,
        report: "",
        qaMessages: [],
        collectedSources: [],
        errorMessage: "",
        reportStatus: "collecting",
        qaLoading: false,
      };
    case "REPORT_COLLECTING":
      return { ...state, reportStatus: "collecting" };
    case "REPORT_COLLECTED":
      return { ...state, collectedSources: action.payload, reportStatus: "loading" };
    case "REPORT_APPEND":
      return { ...state, report: state.report + action.payload, reportStatus: "loading" };
    case "REPORT_DONE":
      return { ...state, reportStatus: "done" };
    case "REPORT_ERROR":
      return { ...state, reportStatus: "error", errorMessage: action.payload };

    // Q&A
    case "QA_ADD_USER":
      return {
        ...state,
        qaMessages: [...state.qaMessages, { role: "user", content: action.payload }],
        qaLoading: true,
      };
    case "QA_ADD_ASSISTANT_PLACEHOLDER":
      return {
        ...state,
        qaMessages: [...state.qaMessages, { role: "assistant", content: "" }],
      };
    case "QA_APPEND_LAST":
      return {
        ...state,
        qaMessages: [
          ...state.qaMessages.slice(0, -1),
          {
            role: "assistant",
            content: state.qaMessages[state.qaMessages.length - 1]?.content + action.payload,
          },
        ],
      };
    case "QA_ERROR_LAST":
      return {
        ...state,
        qaMessages: [
          ...state.qaMessages.slice(0, -1),
          { role: "assistant", content: `오류: ${action.payload}` },
        ],
        qaLoading: false,
      };
    case "QA_DONE":
      return { ...state, qaLoading: false };

    // 전체 초기화 (사용자가 명시적으로 요청할 때만)
    case "RESET":
      return { ...initialState };

    default:
      return state;
  }
}

// ── Context 인터페이스 ────────────────────────────────────────────
interface SectorReportContextValue {
  state: SectorReportState;
  // 입력 액션
  setSectorName: (v: string) => void;
  setProvider: (v: LLMProvider) => void;
  setPreviousReport: (v: string) => void;
  // 보고서 생성 (스트리밍)
  handleGenerate: () => Promise<void>;
  // Q&A 전송 (스트리밍)
  handleQuestion: (question: string) => Promise<void>;
  // 전체 초기화
  reset: () => void;
}

const SectorReportContext = createContext<SectorReportContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────
export function SectorReportProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setSectorName = useCallback((v: string) => {
    dispatch({ type: "SET_SECTOR_NAME", payload: v });
  }, []);

  const setProvider = useCallback((v: LLMProvider) => {
    dispatch({ type: "SET_PROVIDER", payload: v });
  }, []);

  const setPreviousReport = useCallback((v: string) => {
    dispatch({ type: "SET_PREVIOUS_REPORT", payload: v });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  // ── 보고서 생성 ───────────────────────────────────────────────
  // Context 레벨 async 함수 — 컴포넌트 언마운트와 무관하게 실행 지속
  const handleGenerate = useCallback(async () => {
    const { sectorName, provider, previousReport } = state;
    if (!sectorName.trim()) return;

    dispatch({ type: "REPORT_START" });

    try {
      const res = await fetch("/api/sector/ai-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectorName: sectorName.trim(),
          provider,
          previousReport: previousReport.trim() || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`서버 오류: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));

            if (parsed.status === "collecting") {
              dispatch({ type: "REPORT_COLLECTING" });
            } else if (parsed.status === "collected" && parsed.sources) {
              dispatch({ type: "REPORT_COLLECTED", payload: parsed.sources });
            } else if (parsed.text) {
              dispatch({ type: "REPORT_APPEND", payload: parsed.text });
            } else if (parsed.done) {
              dispatch({ type: "REPORT_DONE" });
            } else if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }

      dispatch({ type: "REPORT_DONE" });
    } catch (err) {
      dispatch({
        type: "REPORT_ERROR",
        payload: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }, [state]);

  // ── Q&A 전송 ──────────────────────────────────────────────────
  const handleQuestion = useCallback(
    async (question: string) => {
      const { report, qaMessages, sectorName, provider } = state;
      if (!question.trim() || !report) return;

      dispatch({ type: "QA_ADD_USER", payload: question.trim() });
      dispatch({ type: "QA_ADD_ASSISTANT_PLACEHOLDER" });

      try {
        const res = await fetch("/api/sector/ai-report-qa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportMarkdown: report,
            // 현재 질문 전까지의 이력 전달 (방금 추가한 user 메시지 제외)
            messages: qaMessages,
            question: question.trim(),
            sectorName: sectorName.trim(),
            provider,
          }),
        });

        if (!res.ok || !res.body) throw new Error(`서버 오류: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data: ")) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.text) {
                dispatch({ type: "QA_APPEND_LAST", payload: parsed.text });
              }
            } catch {
              continue;
            }
          }
        }

        dispatch({ type: "QA_DONE" });
      } catch (err) {
        dispatch({
          type: "QA_ERROR_LAST",
          payload: err instanceof Error ? err.message : "응답 실패",
        });
      }
    },
    [state]
  );

  return (
    <SectorReportContext.Provider
      value={{
        state,
        setSectorName,
        setProvider,
        setPreviousReport,
        handleGenerate,
        handleQuestion,
        reset,
      }}
    >
      {children}
    </SectorReportContext.Provider>
  );
}

// ── 훅 ───────────────────────────────────────────────────────────
export function useSectorReport() {
  const ctx = useContext(SectorReportContext);
  if (!ctx) {
    throw new Error("useSectorReport는 SectorReportProvider 내부에서 사용해야 합니다.");
  }
  return ctx;
}
