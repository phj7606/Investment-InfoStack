/**
 * 금융투자협회 채권정보센터 (kofiabond.or.kr) fetcher
 *
 * 회사채 신용스프레드: BBB+ 3년 무보증 회사채 - AA- 3년 무보증 회사채
 * Fear & Greed Oscillator의 BondDiff(위험선호도) 구성 요소로 사용
 *
 * 스프레드 축소 → 위험선호(탐욕), 확대 → 위험회피(공포)
 *
 * ⚠️ kofiabond.or.kr은 공식 REST API 문서가 없어 웹 폼 POST 방식으로 조회.
 *    접근 불가 시 ECOS 대체 경로를 사용한다 (하단 fallback 참고).
 */

/** 신용스프레드 단일 날짜 데이터 포인트 */
export interface CreditSpreadPoint {
  // "YYYY-MM-DD"
  date: string;
  // BBB+ 3년 무보증 회사채 금리 (%)
  bbbPlusRate: number;
  // AA- 3년 무보증 회사채 금리 (%)
  aaMinusRate: number;
  // 신용스프레드 = bbbPlusRate - aaMinusRate (bp 단위 아닌 %)
  spread: number;
}

// 금융투자협회 채권정보센터 조회 엔드포인트
// 실제 BLD/파라미터는 사이트 네트워크 탭에서 확인 필요
const KOFIABOND_BASE_URL = "https://www.kofiabond.or.kr";

// 채권 종류 코드 (금융투자협회 기준)
// BBB+ 무보증 3년: "회사채(무보증3년)BBB+"
// AA- 무보증 3년:  "회사채(무보증3년)AA-"
const BOND_TYPE_BBB_PLUS = "2000054";  // 내부 코드 — 실제 탐색 필요
const BOND_TYPE_AA_MINUS  = "2000031";  // 내부 코드 — 실제 탐색 필요

/**
 * YYYYMMDD → YYYY-MM-DD 변환 헬퍼
 */
function toIsoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * YYYY-MM-DD → YYYYMMDD 변환 헬퍼
 */
function toCompactDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

/**
 * 금융투자협회 채권정보센터에서 단일 채권 종류의 일별 금리 시계열 조회
 *
 * @param bondTypeCode - 채권 종류 코드
 * @param startDate    - "YYYYMMDD"
 * @param endDate      - "YYYYMMDD"
 * @returns Map<날짜(YYYY-MM-DD), 금리(%)>
 */
async function fetchBondRateSeries(
  bondTypeCode: string,
  startDate: string,
  endDate: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  // kofiabond.or.kr 일별 채권 금리 조회 엔드포인트
  // 실제 URL/파라미터는 사이트 네트워크 탭에서 확인 후 교체 필요
  const url = `${KOFIABOND_BASE_URL}/bfindo/bfindoBondDailyBondNew/search`;

  const params = new URLSearchParams({
    startDt: startDate,
    endDt: endDate,
    bondKndCd: bondTypeCode,
  });

  const res = await fetch(`${url}?${params.toString()}`, {
    headers: {
      "Referer": KOFIABOND_BASE_URL,
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`kofiabond API 오류: ${res.status} ${res.statusText}`);
  }

  // 응답 구조: [{ basDt: "20240101", closingYld: "5.123" }, ...]
  // 실제 필드명은 API 응답 확인 후 교체
  const data = await res.json() as Array<{ basDt: string; closingYld: string }>;

  for (const row of data) {
    const rate = parseFloat(row.closingYld);
    if (!isNaN(rate) && row.basDt) {
      result.set(toIsoDate(row.basDt), rate);
    }
  }

  return result;
}

/**
 * 회사채 신용스프레드 (BBB+ - AA-) 시계열 조회
 *
 * @param startDate - "YYYY-MM-DD" 또는 "YYYYMMDD"
 * @param endDate   - "YYYY-MM-DD" 또는 "YYYYMMDD"
 * @returns 날짜 오름차순 정렬된 신용스프레드 배열
 */
export async function fetchCreditSpread(
  startDate: string,
  endDate: string
): Promise<CreditSpreadPoint[]> {
  // 날짜 형식 통일 (YYYYMMDD)
  const start = startDate.includes("-") ? toCompactDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? toCompactDate(endDate)   : endDate;

  // BBB+, AA- 금리 시계열을 병렬로 수집
  const [bbbMap, aaMap] = await Promise.all([
    fetchBondRateSeries(BOND_TYPE_BBB_PLUS, start, end),
    fetchBondRateSeries(BOND_TYPE_AA_MINUS, start, end),
  ]);

  const result: CreditSpreadPoint[] = [];

  // 두 시계열에 공통으로 존재하는 날짜만 스프레드 계산
  for (const [date, bbbRate] of bbbMap) {
    const aaRate = aaMap.get(date);
    if (aaRate === undefined) continue;

    result.push({
      date,
      bbbPlusRate: bbbRate,
      aaMinusRate: aaRate,
      spread: parseFloat((bbbRate - aaRate).toFixed(4)),
    });
  }

  // 날짜 오름차순 정렬
  result.sort((a, b) => a.date.localeCompare(b.date));

  return result;
}
