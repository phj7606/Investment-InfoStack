// 한국은행 ECOS Open API 클라이언트
// 국고채 금리 시계열 데이터 수집
// 서버 전용 모듈 — Next.js Route Handler에서만 import
// API 키 필요: https://ecos.bok.or.kr → 회원가입 → API 서비스 신청
// 환경변수: ECOS_API_KEY

import params from "@/config/params.json";

// ECOS API 기본 URL
const ECOS_BASE_URL = "https://ecos.bok.or.kr/api";

/** ECOS에서 반환하는 금리 데이터 포인트 */
export interface EcosBondRatePoint {
  // "YYYYMMDD" 형식 (일별) 또는 "YYYYMM" 형식 (월별)
  date: string;
  // 금리 (%, 예: 2.756)
  rate: number;
}

/** ECOS API 원시 응답 타입 */
interface EcosRawResponse {
  StatisticSearch?: {
    list_total_count?: number;
    row?: Array<{
      STAT_CODE: string;
      STAT_NAME: string;
      ITEM_CODE1: string;
      ITEM_NAME1: string;
      TIME: string;
      DATA_VALUE: string;
    }>;
  };
  RESULT?: {
    CODE: string;
    MESSAGE: string;
  };
}

/**
 * ECOS API URL을 조립하는 헬퍼
 * URL 구조: /StatisticSearch/{KEY}/json/kr/{start}/{end}/{statCode}/{freq}/{startDate}/{endDate}/{itemCode}
 */
function buildEcosUrl(
  statCode: string,
  itemCode: string,
  startDate: string,
  endDate: string,
  frequency: string,
  startRow: number = 1,
  endRow: number = 1000
): string {
  const apiKey = process.env.ECOS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ECOS_API_KEY 환경변수가 설정되지 않았습니다. " +
      ".env.local 파일에 ECOS_API_KEY를 추가하세요."
    );
  }

  return [
    ECOS_BASE_URL,
    "StatisticSearch",
    apiKey,
    "json",
    "kr",
    String(startRow),
    String(endRow),
    statCode,
    frequency,
    startDate,
    endDate,
    itemCode,
  ].join("/");
}

/**
 * 한국은행 국고채 금리 시계열 조회
 *
 * PRD 2.2 BondDiff 수정 방향:
 *   한국은행 ECOS 5Y/10Y 실제 금리 스프레드로 교체 (가격지수 차이 대신 실제 금리 사용)
 *
 * @param startDate - 시작일 ("YYYYMMDD")
 * @param endDate   - 종료일 ("YYYYMMDD")
 * @param itemCode  - ECOS 항목코드 (기본: 국고채 3년)
 * @param frequency - 주기 "D"(일) | "M"(월) | "Q"(분기) | "A"(연) (기본: "D")
 * @returns EcosBondRatePoint 배열 (날짜 오름차순)
 */
export async function fetchBondRate(
  startDate: string,
  endDate: string,
  itemCode: string = params.ecos.bondRate3YItemCode,
  frequency: "D" | "M" | "Q" | "A" = "D"
): Promise<EcosBondRatePoint[]> {
  const url = buildEcosUrl(
    params.ecos.bondRateStatCode,
    itemCode,
    startDate,
    endDate,
    frequency
  );

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`ECOS API 오류: ${response.status} ${response.statusText}`);
  }

  const data: EcosRawResponse = await response.json();

  // ECOS API 오류 응답 처리
  if (data.RESULT) {
    throw new Error(`ECOS API 오류: ${data.RESULT.CODE} - ${data.RESULT.MESSAGE}`);
  }

  if (!data.StatisticSearch?.row?.length) {
    return [];
  }

  return data.StatisticSearch.row
    .filter((row) => row.DATA_VALUE && row.DATA_VALUE.trim() !== "")
    .map((row) => ({
      date: row.TIME,
      rate: parseFloat(row.DATA_VALUE),
    }))
    .filter((point) => !isNaN(point.rate))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 국고채 5년 및 10년 금리를 동시에 조회하여 스프레드 계산
 * Fear & Greed Oscillator 한국의 BondDiff 구성요소로 사용
 *
 * @param startDate - 시작일 ("YYYYMMDD")
 * @param endDate   - 종료일 ("YYYYMMDD")
 * @returns 날짜별 { date, rate5Y, rate10Y, spread } 배열
 */
export async function fetchBondSpread(
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; rate5Y: number; rate10Y: number; spread: number }>> {
  // 5년, 10년 금리 동시 조회
  const [rates5Y, rates10Y] = await Promise.all([
    fetchBondRate(startDate, endDate, params.ecos.bondRate5YItemCode),
    fetchBondRate(startDate, endDate, params.ecos.bondRate10YItemCode),
  ]);

  // 날짜를 키로 10년물 금리 맵 생성
  const rate10YMap = new Map(rates10Y.map((r) => [r.date, r.rate]));

  // 두 시계열의 교집합 날짜에서 스프레드 계산
  return rates5Y
    .filter((r5) => rate10YMap.has(r5.date))
    .map((r5) => {
      const r10 = rate10YMap.get(r5.date)!;
      return {
        date: r5.date,
        rate5Y: r5.rate,
        rate10Y: r10,
        // 장단기 금리차: 10년 - 5년 (양수 = 정상, 음수 = 역전)
        spread: r10 - r5.rate,
      };
    });
}
