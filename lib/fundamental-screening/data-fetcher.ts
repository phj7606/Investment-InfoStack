// 재무제표 원시 데이터 수집
// KR: FnGuide HTML 파싱 (연간 + 분기, API 키 불필요)
// US: Alpha Vantage 3개 엔드포인트 → RawDartItem[] 형태로 변환
//
// 서버 전용 모듈 — API Route에서만 import
// Claude가 계정명을 직접 판독하여 분석 수행 (서버 사전 매핑 없음)

import type { FinancialStatements, RawDartItem } from "@/types/fundamental-screening";

export type { FinancialStatements, RawDartItem };

const AV_BASE = "https://www.alphavantage.co/query";
const FNGUIDE_URL = "https://comp.fnguide.com/SVO2/ASP/SVD_Finance.asp";

// ── 유틸 ─────────────────────────────────────────────────────────────────────

/** 숫자 문자열 파싱 ("None" → null) */
function parseVal(v: string | undefined | null): number | null {
  if (!v || v === "None" || v === "-" || v === "") return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

/** USD 절대값 → 백만달러 변환 */
function usdToMillion(v: number | null): number | null {
  return v === null ? null : Math.round(v / 1e6);
}

// ── KR: FnGuide HTML 파싱 ─────────────────────────────────────────────────────
//
// URL: https://comp.fnguide.com/SVO2/ASP/SVD_Finance.asp?pGB=1&gicode=A{종목코드}&...
// - API 키 불필요, User-Agent만으로 서버사이드 fetch 가능
// - 6개 테이블 정적 HTML 포함: IS연간, IS분기, BS연간, BS분기, CF연간, CF분기
// - tr class로 level 판별: rowBold=합계(bold), acd_dep_start_close=그룹헤더, acd_dep2_sub=세목
// ─────────────────────────────────────────────────────────────────────────────

// FnGuide 테이블 순서: IS(0연간, 1분기), BS(2연간, 3분기), CF(4연간, 5분기)
const FNGUIDE_SECTIONS = ["IS", "BS", "CF"] as const;

/**
 * FnGuide 연도 문자열 변환
 * 연간: "2022/12" → "2022"
 * 분기: "2025/03" → "2025Q1"
 */
function toYearKey(yrStr: string, isQuarterly: boolean): string {
  if (!isQuarterly) return yrStr.slice(0, 4); // "2022/12" → "2022"
  const year = yrStr.slice(0, 4);
  const month = yrStr.slice(5);
  const qMap: Record<string, string> = { "03": "Q1", "06": "Q2", "09": "Q3", "12": "Q4" };
  return year + (qMap[month] ?? `/${month}`); // "2025/03" → "2025Q1"
}

/** thead에서 연도 컬럼 추출 (YYYY/MM 패턴만) */
function extractYears(tableHtml: string): string[] {
  const theadMatch = tableHtml.match(/<thead[\s\S]*?<\/thead>/i);
  if (!theadMatch) return [];
  return [...theadMatch[0].matchAll(/(\d{4}\/\d{2})/g)].map(m => m[1]);
}

/** tr class 기반 level 판별 */
function getTrLevel(trClass: string): number {
  // acd_dep2_sub: 세목 (들여쓰기)
  return trClass.includes("acd_dep2_sub") ? 1 : 0;
}

/** HTML 태그·엔티티 제거 후 계정명 정규화 */
function cleanText(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")    // HTML 태그 제거
    .replace(/&nbsp;/g, "")     // non-breaking space 엔티티 제거
    .replace(/\u00a0/g, "")     // non-breaking space 문자 제거
    .replace(/&amp;/g, "&")     // & 엔티티 복원
    .trim();
}

/**
 * 첫 번째 td/th innerHTML에서 계정명 추출
 * - acd_dep2_sub: "&nbsp;&nbsp;&nbsp;인건비" 형태 (세목)
 * - acd_dep_start_close: <span class="txt_acd">&nbsp;&nbsp;&nbsp;유동자산</span> 형태 (그룹헤더)
 * - rowBold/일반: <div class="th_b">매출액</div> 형태
 */
function extractAccountName(cellHtml: string, trClass: string): string {
  if (trClass.includes("acd_dep2_sub")) {
    // 세목: "&nbsp;&nbsp;&nbsp;인건비" — 태그 없이 직접 텍스트
    return cleanText(cellHtml);
  }
  if (trClass.includes("acd_dep_start")) {
    // 그룹 헤더: txt_acd span에서 추출 (span 내부에도 &nbsp; 포함될 수 있음)
    const m = cellHtml.match(/<span[^>]*class="txt_acd"[^>]*>([\s\S]*?)<\/span>/);
    if (m) return cleanText(m[1]);
  }
  // 일반/bold: <div class="th_b">매출액</div> 또는 <div class="">...</div>
  const divM = cellHtml.match(/<div[^>]*>([\s\S]*?)<\/div>/);
  if (divM) return cleanText(divM[1]);
  // fallback
  return cleanText(cellHtml);
}

/** td/th innerHTML에서 숫자값 파싱 */
function parseAmountCell(cellHtml: string): number | null {
  const text = cellHtml
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, "")
    .replace(/,/g, "")
    .trim();
  if (!text || text === "-") return null;
  const n = parseFloat(text);
  return isNaN(n) ? null : n;
}

/**
 * FnGuide 테이블 HTML 파싱 → RawDartItem[]
 * Node.js 서버 환경 (DOMParser 없음) — 정규식 기반
 */
function parseTableHtml(
  tableHtml: string,
  sjDiv: string,
  ordOffset: number,
  isQuarterly: boolean
): { items: RawDartItem[]; years: string[] } {
  const rawYears = extractYears(tableHtml);
  if (rawYears.length === 0) return { items: [], years: [] };

  // 연도 키 변환 (연간: "2022", 분기: "2025Q1")
  const years = rawYears.map(y => toYearKey(y, isQuarterly));

  const tbodyMatch = tableHtml.match(/<tbody[\s\S]*?>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return { items: [], years };

  const items: RawDartItem[] = [];
  let ord = ordOffset;

  for (const trMatch of tbodyMatch[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const trAttrs = trMatch[1];
    const trBody = trMatch[2];
    const trClass = (trAttrs.match(/class="([^"]*)"/) ?? [])[1] ?? "";

    // 모든 td/th 추출
    const cells = [...trBody.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    if (cells.length < 2) { ord++; continue; }

    const nm = extractAccountName(cells[0][1], trClass);
    if (!nm) { ord++; continue; }

    // 연도 수만큼 값 추출 (전년동기/전년동기(%) 컬럼은 rawYears.length로 자동 제외)
    const amounts = years.map((yr, i) => ({
      year: yr,
      value: i + 1 < cells.length ? parseAmountCell(cells[i + 1][1]) : null,
    }));

    // 전체 null이면 제외 (해당 기업에 값 없는 항목)
    if (amounts.every(a => a.value === null)) { ord++; continue; }

    items.push({
      account_nm: nm,
      sj_div:     sjDiv,
      ord:        ord++,
      level:      getTrLevel(trClass),
      amounts,
    });
  }

  return { items, years };
}

/** FnGuide fetch 헬퍼 — 타임아웃 시 1회 재시도 (FnGuide 822KB 페이지는 간헐적으로 지연 발생) */
async function fnguideGet(url: string, timeoutMs = 30000): Promise<Response> {
  const doFetch = () => fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Referer":    "https://comp.fnguide.com/",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  try {
    return await doFetch();
  } catch (e) {
    // 타임아웃·네트워크 에러 시 2초 대기 후 1회 재시도
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
      await new Promise((r) => setTimeout(r, 2000));
      return doFetch();
    }
    throw e;
  }
}

/**
 * FnGuide 재무제표 페이지 fetch + 파싱
 * 6개 테이블: IS연간, IS분기, BS연간, BS분기, CF연간, CF분기
 */
async function fetchFnguideFinancials(stockCode: string): Promise<FinancialStatements> {
  const url = `${FNGUIDE_URL}?pGB=1&gicode=A${stockCode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=103&stkGb=701`;
  const res = await fnguideGet(url);
  if (!res.ok) throw new Error(`[FnGuide] HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  // UTF-8 선언이지만 일부 이미지 alt에 비UTF8 바이트 혼재 → fatal: false로 처리
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  // 기업명 추출 — <title>기업명 - FnGuide</title> 패턴
  // FnGuide 타이틀 형식: "LX세미콘 : 재무제표" 또는 "삼성전자 - FnGuide" 등
  const titleMatch = html.match(/<title>([^<]{1,60}?)(?:\s*[-:|]\s*[^<]*)?\s*<\/title>/i);
  const companyName = titleMatch?.[1]?.replace(/&amp;/g, "&").trim() || undefined;

  // us_table_ty1 클래스 테이블 6개 추출
  const tableBlocks = [...html.matchAll(/<table[^>]*class="us_table_ty1[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];

  if (tableBlocks.length < 2) {
    throw new Error(`[FnGuide] ${stockCode} 테이블을 찾지 못했습니다. 종목코드를 확인하세요.`);
  }

  const annualItems: RawDartItem[] = [];
  const quarterlyItems: RawDartItem[] = [];

  for (let si = 0; si < FNGUIDE_SECTIONS.length; si++) {
    const annualBlock  = tableBlocks[si * 2];
    const quarterBlock = tableBlocks[si * 2 + 1];
    if (!annualBlock) continue;

    const { items: aItems } = parseTableHtml(annualBlock[1], FNGUIDE_SECTIONS[si], si * 2000, false);
    annualItems.push(...aItems);

    if (quarterBlock) {
      const { items: qItems } = parseTableHtml(quarterBlock[1], FNGUIDE_SECTIONS[si], si * 2000, true);
      quarterlyItems.push(...qItems);
    }
  }

  if (annualItems.length === 0) {
    throw new Error(`[FnGuide] ${stockCode} 재무제표 파싱 실패. 종목코드를 확인하세요.`);
  }

  return {
    ticker:         stockCode,
    exchange:       "KRX",
    companyName,                                                           // FnGuide title에서 자동 추출
    currency:       "KRW",
    unit:           "억원",
    dataSource:     "FnGuide",
    rawItems:       annualItems,                                          // 연간 (Claude 분석용)
    quarterlyItems: quarterlyItems.length > 0 ? quarterlyItems : undefined, // 분기 (UI 전환용)
  };
}

// ── KR: FnGuide 재무비율 (SVD_FinanceRatio.asp) ───────────────────────────────
//
// URL: https://comp.fnguide.com/SVO2/ASP/SVD_FinanceRatio.asp?pGB=1&gicode=A{종목코드}&...
// SVD_Finance.asp와 동일한 us_table_ty1 테이블 구조
// 테이블 2개: 연간(누적, tableBlocks[0]) / 분기(3개월, tableBlocks[1])
// 수익성비율 섹션에 ROA, ROE, ROIC 포함
// sj_div = "RATIO" 로 기존 IS/BS/CF와 구분
// ─────────────────────────────────────────────────────────────────────────────

const FNGUIDE_RATIO_URL = "https://comp.fnguide.com/SVO2/ASP/SVD_FinanceRatio.asp";

async function fetchFnguideRatios(stockCode: string): Promise<{
  ratioItems: RawDartItem[];
  quarterlyRatioItems: RawDartItem[];
}> {
  const url = `${FNGUIDE_RATIO_URL}?pGB=1&gicode=A${stockCode}&cID=&MenuYn=Y&ReportGB=&NewMenuID=104&stkGb=701`;
  const res = await fnguideGet(url);
  if (!res.ok) throw new Error(`[FnGuide Ratio] HTTP ${res.status}`);

  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

  const tableBlocks = [...html.matchAll(/<table[^>]*class="us_table_ty1[^"]*"[^>]*>([\s\S]*?)<\/table>/gi)];

  if (tableBlocks.length < 1) {
    // 재무비율 페이지 파싱 실패 시 빈 배열 반환 (전체 수집을 막지 않음)
    return { ratioItems: [], quarterlyRatioItems: [] };
  }

  // parseTableHtml 재사용 — sj_div를 "RATIO"로 지정
  const { items: ratioItems } = parseTableHtml(tableBlocks[0][1], "RATIO", 9000, false);
  const quarterlyRatioItems = tableBlocks[1]
    ? parseTableHtml(tableBlocks[1][1], "RATIO", 9000, true).items
    : [];

  return { ratioItems, quarterlyRatioItems };
}

/** 한국 종목 재무제표 + 재무비율 병렬 수집 (FnGuide) */
export async function fetchKrFinancials(stockCode: string): Promise<FinancialStatements> {
  // 재무제표(SVD_Finance.asp)와 재무비율(SVD_FinanceRatio.asp)을 병렬 fetch
  const [finance, ratios] = await Promise.all([
    fetchFnguideFinancials(stockCode),
    fetchFnguideRatios(stockCode).catch(() => ({ ratioItems: [], quarterlyRatioItems: [] })),
  ]);
  return {
    ...finance,
    ratioItems:          ratios.ratioItems.length > 0 ? ratios.ratioItems : undefined,
    quarterlyRatioItems: ratios.quarterlyRatioItems.length > 0 ? ratios.quarterlyRatioItems : undefined,
  };
}

// ── US: Alpha Vantage ─────────────────────────────────────────────────────────

async function fetchAvStatement(fn: string, ticker: string, apiKey: string) {
  const url = `${AV_BASE}?function=${fn}&symbol=${ticker}&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`[AV] ${fn} HTTP ${res.status}`);
  const data = await res.json();
  if (data["Error Message"]) throw new Error(`[AV] ${fn}: ${data["Error Message"]}`);
  if (data["Information"]) throw new Error(`[AV] 요청 한도 초과: ${data["Information"].slice(0, 80)}`);
  return data;
}

// Alpha Vantage 주요 합계 항목 (level 0 — 헤더/총계)
const AV_LEVEL0 = new Set([
  "Total Revenue", "Gross Profit", "Operating Income", "Net Income",
  "Total Current Assets", "Total Assets", "Total Current Liabilities",
  "Total Liabilities", "Total Stockholders Equity",
  "Operating Cash Flow", "Investing Cash Flow", "Financing Cash Flow",
]);

function avToRawItems(
  reports: Record<string, string>[],
  fields: Record<string, string>,
  sjDiv: "IS" | "BS" | "CF",
  unitConverter: (v: number | null) => number | null = usdToMillion
): RawDartItem[] {
  const items: RawDartItem[] = [];
  let ord = 0;

  for (const [avKey, label] of Object.entries(fields)) {
    const amounts = reports.map((r) => ({
      year: (r.fiscalDateEnding ?? "").slice(0, 4),
      value: unitConverter(parseVal(r[avKey])),
    }));
    if (amounts.some((a) => a.value !== null)) {
      const level = AV_LEVEL0.has(label) ? 0 : 1;
      items.push({ account_nm: label, sj_div: sjDiv, ord: ord++, level, amounts });
    } else {
      ord++;
    }
  }

  return items;
}

/**
 * 미국 종목 5개년 재무제표 수집 → RawDartItem[] 반환
 * Alpha Vantage INCOME_STATEMENT / BALANCE_SHEET / CASH_FLOW
 */
export async function fetchUsFinancials(ticker: string): Promise<FinancialStatements> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) throw new Error("ALPHA_VANTAGE_KEY 환경변수가 설정되지 않았습니다.");

  const [isData, bsData, cfData] = await Promise.all([
    fetchAvStatement("INCOME_STATEMENT", ticker, apiKey),
    fetchAvStatement("BALANCE_SHEET", ticker, apiKey),
    fetchAvStatement("CASH_FLOW", ticker, apiKey),
  ]);

  const isReports: Record<string, string>[] = (isData.annualReports ?? []).slice(0, 5);
  const bsReports: Record<string, string>[] = (bsData.annualReports ?? []).slice(0, 5);
  const cfReports: Record<string, string>[] = (cfData.annualReports ?? []).slice(0, 5);

  if (isReports.length === 0) throw new Error(`[AV] ${ticker} 재무제표 데이터가 없습니다.`);

  const isFields: Record<string, string> = {
    totalRevenue:                       "Total Revenue",
    costOfRevenue:                      "Cost of Revenue",
    grossProfit:                        "Gross Profit",
    sellingGeneralAndAdministrative:    "SG&A Expense",
    researchAndDevelopment:             "R&D Expense",
    operatingIncome:                    "Operating Income",
    ebit:                               "EBIT",
    incomeTaxExpense:                   "Income Tax Expense",
    netIncome:                          "Net Income",
    depreciationAndAmortization:        "Depreciation & Amortization",
  };

  const bsFields: Record<string, string> = {
    cashAndCashEquivalentsAtCarryingValue: "Cash & Cash Equivalents",
    shortTermInvestments:                  "Short Term Investments",
    currentNetReceivables:                 "Accounts Receivable",
    inventory:                             "Inventory",
    totalCurrentAssets:                    "Total Current Assets",
    propertyPlantEquipmentNet:             "Net PPE",
    longTermInvestments:                   "Long Term Investments",
    totalAssets:                           "Total Assets",
    currentAccountsPayable:                "Accounts Payable",
    shortTermDebt:                         "Short Term Debt",
    currentDebt:                           "Current Debt",
    totalCurrentLiabilities:               "Total Current Liabilities",
    longTermDebt:                          "Long Term Debt",
    longTermDebtNoncurrent:                "Long Term Debt (Non-current)",
    totalLiabilities:                      "Total Liabilities",
    totalShareholderEquity:                "Total Stockholders Equity",
    retainedEarnings:                      "Retained Earnings",
  };

  const cfFields: Record<string, string> = {
    operatingCashflow:                         "Operating Cash Flow",
    netIncome:                                 "Net Income (CF)",
    depreciationDepletionAndAmortization:      "D&A (CF)",
    changeInInventory:                         "Change in Inventory",
    changeInReceivables:                       "Change in Receivables",
    investingCashflow:                         "Investing Cash Flow",
    cashflowFromFinancing:                     "Financing Cash Flow",
    changeInCashAndCashEquivalents:            "Change in Cash",
  };

  const capexAmounts = cfReports.map((r) => {
    const v = parseVal(r.capitalExpenditures);
    return {
      year: (r.fiscalDateEnding ?? "").slice(0, 4),
      value: v !== null ? usdToMillion(Math.abs(v)) : null,
    };
  });

  const rawItems: RawDartItem[] = [
    ...avToRawItems(isReports, isFields, "IS"),
    ...avToRawItems(bsReports, bsFields, "BS"),
    ...avToRawItems(cfReports, cfFields, "CF"),
  ];

  if (capexAmounts.some((a) => a.value !== null)) {
    rawItems.push({ account_nm: "Capital Expenditure (CapEx)", sj_div: "CF", ord: 999, level: 1, amounts: capexAmounts });
  }

  return {
    ticker,
    exchange: "US",
    currency: "USD",
    unit:     "백만달러",
    dataSource: "Alpha Vantage",
    rawItems,
  };
}
