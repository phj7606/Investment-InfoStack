// Phase 5 — 기업 분석 모듈 전용 타입 정의
// CompanyAnalysisClient ↔ API Route ↔ UI 컴포넌트 간 데이터 계약

/** 분석 요청 입력 */
export interface CompanyAnalysisInput {
  ticker: string;
  exchange: "KRX" | "NYSE" | "NASDAQ" | "TSE" | "HKEX" | "OTHER";
  companyName?: string; // 미입력 시 Claude가 ticker로 추정
}

/** 생성 완료된 분석 결과 */
export interface CompanyAnalysisResult {
  ticker: string;
  companyName: string;
  exchange: string;
  generatedAt: string; // ISO 8601
  reportMarkdown: string; // 전체 보고서 Markdown
}

/** localStorage에 저장하는 이력 항목 */
export interface AnalysisHistoryItem extends CompanyAnalysisResult {
  id: string; // crypto.randomUUID()
  summary: string; // reportMarkdown 앞 200자 (목록 미리보기용)
}

/** Q&A 채팅 메시지 */
export interface QAMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO 8601
}

/**
 * 스트리밍 상태 기계
 * idle → streaming → complete
 *              └→ error
 */
export type StreamingStatus = "idle" | "streaming" | "complete" | "error";
