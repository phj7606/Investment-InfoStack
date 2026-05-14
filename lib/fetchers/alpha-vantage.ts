// Alpha Vantage 경제지표 API 클라이언트
// 서버 전용 모듈 — Next.js Route Handler / RSC에서만 import
// API 키: ALPHA_VANTAGE_KEY 환경변수 필수 (https://www.alphavantage.co 무료 발급)

const AV_BASE_URL = "https://www.alphavantage.co/query";

/** Alpha Vantage 경제지표 응답의 단일 데이터 포인트 */
interface AvDataPoint {
  date: string;   // "YYYY-MM-DD"
  value: string;  // 숫자 문자열, 결측 시 "."
}

/** Alpha Vantage 경제지표 API 응답 구조 */
interface AvEconomicResponse {
  name?: string;
  interval?: string;
  unit?: string;
  data?: AvDataPoint[];
  "Error Message"?: string;
  Information?: string;
}

/** 파싱된 데이터 포인트 */
export interface AvIndicatorPoint {
  date: string;   // "YYYY-MM-DD"
  value: number;
}

/**
 * Alpha Vantage 경제지표 시계열 조회
 * @param fn Alpha Vantage function 명 (예: "MANUFACTURING_PMI")
 * @param startDate 필터 시작일 "YYYY-MM-DD" (클라이언트 필터, API는 전체 반환)
 * @param endDate 필터 종료일 "YYYY-MM-DD"
 */
export async function fetchAvEconomicIndicator(
  fn: string,
  startDate: string,
  endDate: string
): Promise<AvIndicatorPoint[]> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) {
    console.warn(`[AlphaVantage] ALPHA_VANTAGE_KEY 미설정 — ${fn} 데이터 스킵`);
    return [];
  }

  const url = `${AV_BASE_URL}?function=${fn}&apikey=${apiKey}`;

  const res = await fetch(url, {
    // 1시간 캐시 — 경제지표는 월 1회 갱신
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`[AlphaVantage] ${fn} 요청 실패: HTTP ${res.status}`);
  }

  const json = (await res.json()) as AvEconomicResponse;

  if (json["Error Message"]) {
    throw new Error(`[AlphaVantage] ${fn}: ${json["Error Message"]}`);
  }
  if (json.Information) {
    // rate limit 또는 premium 전용 — 빈 배열 반환 (차트 미표시)
    console.warn(`[AlphaVantage] ${fn} 접근 제한: ${json.Information.slice(0, 80)}`);
    return [];
  }

  const data = json.data ?? [];

  return data
    .filter((d) => d.value !== "." && d.value !== "" && !isNaN(parseFloat(d.value)))
    .map((d) => ({ date: d.date, value: parseFloat(d.value) }))
    // startDate ~ endDate 범위 필터
    .filter((d) => d.date >= startDate && d.date <= endDate);
}
