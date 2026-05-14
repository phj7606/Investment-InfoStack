// 한국 주식 데이터 수집 — Naver Finance(주가·밸류에이션) + DART(재무제표)
// 두 소스 모두 실패해도 null로 처리하여 카드 렌더링이 깨지지 않도록 설계

import { getCorpCode } from "./dart-corp-map";

export interface KrStockData {
  // 출처 정보 — 카드 UI에서 "데이터 출처" 툴팁에 표시
  source: {
    price: "Naver Finance" | "N/A";
    financials: "DART OpenAPI" | "N/A";
  };
  // Naver Finance 수집 항목
  currentPrice: number | null;       // 현재가 (원)
  priceChange: number | null;        // 전일 대비 등락 (원)
  changeRate: number | null;         // 등락률 (%)
  marketCap: number | null;          // 시가총액 (억원)
  per: number | null;                // PER (배)
  pbr: number | null;                // PBR (배)
  high52w: number | null;            // 52주 최고가
  low52w: number | null;             // 52주 최저가
  // DART OpenAPI 수집 항목 (가장 최근 사업보고서 기준)
  revenue: number | null;            // 매출액 (억원)
  operatingIncome: number | null;    // 영업이익 (억원)
  netIncome: number | null;          // 당기순이익 (억원)
  fiscalYear: string | null;         // 기준 사업연도 (예: "2024")
  // 재무상태표 항목 (ROE·부채비율 계산용) — ACCOUNT_MAP 확장으로 추가 수집
  totalEquity: number | null;        // 자본총계 (억원)
  totalLiabilities: number | null;   // 부채총계 (억원)
  // 파생 계산 지표 — 스크리너 필터 게이트 및 SKILL Step 4 메트릭에 사용
  roe: number | null;                // ROE = 당기순이익 / 자본총계 × 100 (%)
  operatingMargin: number | null;    // 영업이익률 = 영업이익 / 매출액 × 100 (%)
  debtRatio: number | null;          // 부채비율 = 부채총계 / 자본총계 × 100 (%)
}

// ── Naver Finance 비공식 모바일 API ──────────────────────────────────────────
// m.stock.naver.com은 공식 문서가 없는 비공식 엔드포인트
// 응답 구조가 변경될 수 있으므로 모든 필드를 optional로 처리

interface NaverBasicResponse {
  stockName?: string;
  closePrice?: string;               // 문자열 ("75,400")
  compareToPreviousClosePrice?: string;
  fluctuationsRatio?: string;        // 등락률 문자열 ("1.23")
  marketValue?: string;              // 시가총액 문자열 (억원)
  per?: string;
  pbr?: string;
  high52Price?: string;
  low52Price?: string;
}

async function fetchNaverData(ticker: string): Promise<NaverBasicResponse | null> {
  try {
    const url = `https://m.stock.naver.com/api/stock/${ticker}/basic`;
    const res = await fetch(url, {
      headers: {
        // 봇 차단 우회 — 일반 브라우저와 동일한 User-Agent
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://m.stock.naver.com/",
      },
      signal: AbortSignal.timeout(5000), // 5초 타임아웃
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 쉼표 포함 숫자 문자열 → number 변환 ("75,400" → 75400)
function parseNum(val: string | undefined | null): number | null {
  if (!val) return null;
  const n = parseFloat(val.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// ── DART OpenAPI 재무제표 ────────────────────────────────────────────────────

interface DartFinancialItem {
  account_nm: string;    // 계정명 (예: "매출액", "영업이익")
  thstrm_amount: string; // 당기 금액 (문자열)
  fs_div?: string;       // 재무제표 구분 (CFS=연결, OFS=별도)
}

interface DartFinancialResponse {
  status: string;        // "000" = 정상
  list?: DartFinancialItem[];
}

// DART 계정명 → 표준 항목 매핑
// fnlttSinglAcnt는 손익계산서 + 재무상태표 항목을 함께 반환하므로
// 자본총계·부채총계를 추가해 ROE·부채비율 계산에 활용
const ACCOUNT_MAP: Record<string, "revenue" | "operatingIncome" | "netIncome" | "totalEquity" | "totalLiabilities"> = {
  // 손익계산서 항목
  "매출액": "revenue",
  "수익(매출액)": "revenue",
  "영업이익": "operatingIncome",
  "영업이익(손실)": "operatingIncome",
  "당기순이익": "netIncome",
  "당기순이익(손실)": "netIncome",
  "분기순이익": "netIncome",
  // 재무상태표 항목 — ROE·부채비율 계산용
  "자본총계": "totalEquity",
  "자기자본": "totalEquity",
  "부채총계": "totalLiabilities",
};

interface DartResult {
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  fiscalYear: string | null;
}

async function fetchDartFinancials(ticker: string): Promise<DartResult> {
  const fallback: DartResult = {
    revenue: null, operatingIncome: null, netIncome: null,
    totalEquity: null, totalLiabilities: null, fiscalYear: null,
  };

  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return fallback;

  const corpCode = await getCorpCode(ticker);
  if (!corpCode) return fallback;

  // 최근 사업연도 계산 (전년도 사업보고서 기준)
  const year = (new Date().getFullYear() - 1).toString();

  try {
    const url = new URL("https://opendart.fss.or.kr/api/fnlttSinglAcnt.json");
    url.searchParams.set("crtfc_key", apiKey);
    url.searchParams.set("corp_code", corpCode);
    url.searchParams.set("bsns_year", year);
    url.searchParams.set("reprt_code", "11011"); // 사업보고서

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return fallback;

    const data: DartFinancialResponse = await res.json();
    if (data.status !== "000" || !data.list) return fallback;

    // 연결재무제표(CFS) 우선, 없으면 별도재무제표(OFS) 사용
    const cfs = data.list.filter((i) => i.fs_div === "CFS");
    const items = cfs.length > 0 ? cfs : data.list;

    const result: Record<string, number | null> = {
      revenue: null, operatingIncome: null, netIncome: null,
      totalEquity: null, totalLiabilities: null,
    };

    for (const item of items) {
      const key = ACCOUNT_MAP[item.account_nm];
      if (key && result[key] === null) {
        const val = parseFloat(item.thstrm_amount.replace(/,/g, ""));
        // DART 금액 단위: 원 → 억원으로 변환 (1억 = 100,000,000)
        result[key] = isNaN(val) ? null : Math.round(val / 1e8);
      }
    }

    return {
      revenue:          result.revenue,
      operatingIncome:  result.operatingIncome,
      netIncome:        result.netIncome,
      totalEquity:      result.totalEquity,
      totalLiabilities: result.totalLiabilities,
      fiscalYear:       year,
    };
  } catch {
    return fallback;
  }
}

// ── 통합 수집 함수 ────────────────────────────────────────────────────────────

export async function fetchKrStockData(ticker: string): Promise<KrStockData> {
  // Naver Finance + DART를 병렬로 수집 — 한 쪽 실패해도 나머지는 표시
  const [naverResult, dartResult] = await Promise.allSettled([
    fetchNaverData(ticker),
    fetchDartFinancials(ticker),
  ]);

  const naver = naverResult.status === "fulfilled" ? naverResult.value : null;
  const dart = dartResult.status === "fulfilled"
    ? dartResult.value
    : { revenue: null, operatingIncome: null, netIncome: null,
        totalEquity: null, totalLiabilities: null, fiscalYear: null };

  // 파생 지표 계산 — null이 포함된 경우 null 반환 (0 나눗셈 방지)
  const roe = dart.netIncome !== null && dart.totalEquity !== null && dart.totalEquity !== 0
    ? Math.round((dart.netIncome / dart.totalEquity) * 1000) / 10  // 소수점 1자리
    : null;

  const operatingMargin = dart.operatingIncome !== null && dart.revenue !== null && dart.revenue !== 0
    ? Math.round((dart.operatingIncome / dart.revenue) * 1000) / 10
    : null;

  const debtRatio = dart.totalLiabilities !== null && dart.totalEquity !== null && dart.totalEquity !== 0
    ? Math.round((dart.totalLiabilities / dart.totalEquity) * 1000) / 10
    : null;

  return {
    source: {
      price: naver ? "Naver Finance" : "N/A",
      financials: dart.revenue !== null ? "DART OpenAPI" : "N/A",
    },
    currentPrice: parseNum(naver?.closePrice),
    priceChange:  parseNum(naver?.compareToPreviousClosePrice),
    changeRate:   parseNum(naver?.fluctuationsRatio),
    marketCap:    parseNum(naver?.marketValue),
    per:          parseNum(naver?.per),
    pbr:          parseNum(naver?.pbr),
    high52w:      parseNum(naver?.high52Price),
    low52w:       parseNum(naver?.low52Price),
    revenue:          dart.revenue,
    operatingIncome:  dart.operatingIncome,
    netIncome:        dart.netIncome,
    fiscalYear:       dart.fiscalYear,
    totalEquity:      dart.totalEquity,
    totalLiabilities: dart.totalLiabilities,
    roe,
    operatingMargin,
    debtRatio,
  };
}
