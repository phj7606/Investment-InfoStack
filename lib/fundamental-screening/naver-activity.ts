// Naver 활동성 지표 Fetcher
//
// navercomp.wisereport.co.kr cF4002.aspx (rpt=4: 활동성) API를 활용해
// 매출채권/재고자산/매입채무 회전율을 수집한다.
//
// Naver가 이미 올바른 공식으로 계산한 값을 제공:
//   - 분모: 매출액(Revenue)
//   - 분자: (전기말 + 당기말) / 2 평균
//
// encparam은 모든 KR 종목에 고정값으로 사용 가능 (세션 무관 확인)
// KR 종목 전용 — US 종목은 rawItems에서 직접 계산

import { readCache, writeCache } from "@/lib/cache";
import type { NaverActivityResult, NaverActivityRow } from "@/types/fundamental-screening";

// 고정 encparam (검증됨 — 모든 종목에서 동일하게 동작)
const ENCPARAM = "RWpFUVN5TXBLZHhtSGM5OEtYWDZaZz09";

// 7일 캐시 — 연간 데이터이므로 빈번한 재수집 불필요
const CACHE_TTL = 7 * 24 * 60 * 60;

/** Naver 활동성 API 원시 응답 타입 */
interface NaverActivityRaw {
  YYMM: string[];
  DATA: {
    ACCODE: string;
    LVL: number;
    DATA1: number | null;
    DATA2: number | null;
    DATA3: number | null;
    DATA4: number | null;
    DATA5: number | null;
  }[];
}

/**
 * YYMM 레이블에서 연도 추출
 * 예: "2024/12<br /><span ...>" → "2024"
 */
function parseYear(yymm: string): string {
  return yymm.split("/")[0];
}

/**
 * KR 종목의 Naver 활동성 지표(회전율) 수집
 * @param ticker KRX 종목코드 (예: "005930")
 */
export async function fetchNaverActivity(ticker: string): Promise<NaverActivityResult> {
  const cacheKey = `naver-activity-${ticker}`;

  // 캐시 확인 (7일 TTL)
  const cached = await readCache<NaverActivityResult>(cacheKey);
  if (cached) return cached;

  const url =
    `https://navercomp.wisereport.co.kr/v3/company/cF4002.aspx` +
    `?cmp_cd=${encodeURIComponent(ticker)}&frq=0&rpt=4&finGubun=MAIN&frqTyp=0&cn=&encparam=${ENCPARAM}`;

  const res = await fetch(url, {
    headers: {
      // Naver 서버가 브라우저 요청만 허용하므로 User-Agent 필요
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": "https://stock.naver.com/",
      "Accept": "application/json, text/plain, */*",
    },
    // 타임아웃: 10초
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Naver 활동성 API 오류: HTTP ${res.status}`);
  }

  const raw: NaverActivityRaw = await res.json();

  // DATA1~5 = 최근 5개년, DATA6 = 예상치 (사용 안 함)
  const years = raw.YYMM.slice(0, 5).map(parseYear);

  /**
   * ACCODE 기준으로 회전율 배열 추출
   * LVL=1인 항목만 사용 (대분류 회전율 지표)
   */
  const extractRates = (accode: string): (number | null)[] => {
    const item = raw.DATA.find((d) => d.ACCODE === accode && d.LVL === 1);
    if (!item) return years.map(() => null);
    return [item.DATA1, item.DATA2, item.DATA3, item.DATA4, item.DATA5].map(
      (v) => (typeof v === "number" ? v : null)
    );
  };

  const receivableRates = extractRates("300200"); // 매출채권회전율
  const inventoryRates  = extractRates("300300"); // 재고자산회전율
  const payableRates    = extractRates("300400"); // 매입채무회전율

  const rows: NaverActivityRow[] = years.map((year, i) => ({
    year,
    receivableTurnover: receivableRates[i],
    inventoryTurnover:  inventoryRates[i],
    payableTurnover:    payableRates[i],
  }));

  const result: NaverActivityResult = { ticker, rows };

  // 캐시 저장 (7일)
  await writeCache(cacheKey, result, CACHE_TTL);

  return result;
}
