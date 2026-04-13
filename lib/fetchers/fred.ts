// FRED (Federal Reserve Economic Data) API 클라이언트
// 서버 전용 모듈 — Next.js Route Handler / RSC에서만 import
// API 키: FRED_API_KEY 환경변수 필수 (https://fred.stlouisfed.org 무료 발급)

const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";

/** FRED API 응답의 단일 관측값 */
interface FredObservation {
  date: string;    // "YYYY-MM-DD"
  value: string;   // 숫자 문자열, 결측 시 "."
}

/** FRED API 응답 전체 구조 */
interface FredResponse {
  observations: FredObservation[];
}

/** 파싱된 FRED 데이터 포인트 */
export interface FredDataPoint {
  date: string;   // "YYYY-MM-DD"
  value: number;
}

/**
 * FRED에서 단일 시계열 데이터를 조회한다.
 * @param seriesId FRED 시리즈 ID (예: "SDEX", "BAMLH0A0HYM2")
 * @param startDate 시작일 "YYYY-MM-DD"
 * @param endDate 종료일 "YYYY-MM-DD"
 * @returns 날짜-값 배열. 결측값(".")은 제외된다.
 */
export async function fetchFredSeries(
  seriesId: string,
  startDate: string,
  endDate: string
): Promise<FredDataPoint[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    // API 키 없으면 빈 배열 반환 — 해당 차트 라인만 미표시
    console.warn(`[FRED] FRED_API_KEY 미설정 — ${seriesId} 데이터 스킵`);
    return [];
  }

  const params = new URLSearchParams({
    series_id: seriesId,
    observation_start: startDate,
    observation_end: endDate,
    file_type: "json",
    api_key: apiKey,
  });

  const url = `${FRED_BASE_URL}?${params.toString()}`;

  const res = await fetch(url, {
    // 1시간 캐시 — FRED 데이터는 일 1회 갱신이므로 충분
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`[FRED] ${seriesId} 요청 실패: HTTP ${res.status}`);
  }

  const json = (await res.json()) as FredResponse;

  return json.observations
    .filter((obs) => obs.value !== "." && obs.value !== "")
    .map((obs) => ({
      date: obs.date,
      value: parseFloat(obs.value),
    }));
}
