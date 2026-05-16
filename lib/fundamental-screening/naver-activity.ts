// Naver 활동성 지표 Fetcher
//
// navercomp.wisereport.co.kr cF4002.aspx (rpt=4: 활동성) API를 활용해
// 매출채권/재고자산/매입채무 회전율을 수집한다.
//
// Naver가 이미 올바른 공식으로 계산한 값을 제공:
//   - 분모: 매출액(Revenue)
//   - 분자: (전기말 + 당기말) / 2 평균
//
// encparam은 세션마다 달라지는 값이므로 c1010001.aspx 페이지 소스에서 동적으로 추출한다.
// KR 종목 전용 — US 종목은 rawItems에서 직접 계산

import { readCache, writeCache } from "@/lib/cache";
import type { NaverActivityResult, NaverActivityRow } from "@/types/fundamental-screening";

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

// 공통 브라우저 헤더 — Naver 서버가 브라우저 요청만 허용
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * c1010001.aspx(기업 개요 페이지)에서 ASP.NET_SessionId + encparam 추출
 *
 * cF4002.aspx는 세션 쿠키 + encparam 모두 필요:
 *   - encparam은 세션마다 달라지므로 하드코딩 불가
 *   - 페이지 JS에 encparam: 'XXXX' 형태로 삽입되어 있음
 */
async function fetchSessionAndEncparam(
  ticker: string
): Promise<{ cookie: string; encparam: string }> {
  const url =
    `https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx` +
    `?cmp_cd=${encodeURIComponent(ticker)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept": "text/html,application/xhtml+xml",
      "Referer": "https://navercomp.wisereport.co.kr/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`wisereport 메인 페이지 오류: HTTP ${res.status}`);

  // Set-Cookie에서 ASP.NET_SessionId 추출
  const setCookie = res.headers.get("set-cookie") ?? "";
  const sessionMatch = setCookie.match(/ASP\.NET_SessionId=([^;]+)/);
  const cookie = sessionMatch ? `ASP.NET_SessionId=${sessionMatch[1]}` : "";

  // HTML에서 encparam 추출 — 페이지 JS에 encparam: 'BASE64VALUE' 형태로 삽입
  const html = await res.text();
  const epMatch = html.match(/encparam[^'"]{0,5}['"]([A-Za-z0-9+/=]{20,})['"]/);
  const encparam = epMatch?.[1] ?? "";

  return { cookie, encparam };
}

/**
 * KR 종목의 Naver 활동성 지표(회전율) 수집
 * @param ticker KRX 종목코드 (예: "005930")
 *
 * 2단계 요청:
 *   1) c1010001.aspx → ASP.NET_SessionId + encparam 동적 획득
 *   2) cF4002.aspx   → 세션 쿠키 + encparam으로 활동성 JSON 수집
 */
export async function fetchNaverActivity(ticker: string): Promise<NaverActivityResult> {
  const cacheKey = `naver-activity-${ticker}`;

  // 캐시 확인 (7일 TTL)
  const cached = await readCache<NaverActivityResult>(cacheKey);
  if (cached) return cached;

  // Step 1: 세션 쿠키 + encparam 동적 획득
  const { cookie, encparam } = await fetchSessionAndEncparam(ticker);

  if (!encparam) throw new Error(`encparam 추출 실패 — ticker: ${ticker}`);

  // Step 2: 활동성 API 호출 (세션 쿠키 + encparam 모두 포함)
  const url =
    `https://navercomp.wisereport.co.kr/v3/company/cF4002.aspx` +
    `?cmp_cd=${encodeURIComponent(ticker)}&frq=0&rpt=4&finGubun=MAIN&frqTyp=0&cn=` +
    `&encparam=${encodeURIComponent(encparam)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept": "application/json, text/plain, */*",
      "Referer": `https://navercomp.wisereport.co.kr/v3/company/c1010001.aspx?cmp_cd=${ticker}`,
      ...(cookie ? { "Cookie": cookie } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Naver 활동성 API 오류: HTTP ${res.status}`);

  const text = await res.text();
  if (!text.trim()) throw new Error(`Naver 활동성 API 빈 응답 — ticker: ${ticker}`);

  const raw: NaverActivityRaw = JSON.parse(text);

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
