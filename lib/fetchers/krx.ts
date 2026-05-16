// KRX 데이터 수집 클라이언트
// data.krx.co.kr의 공개 JSON 엔드포인트를 POST 방식으로 호출
// 서버 전용 모듈 — Next.js Route Handler에서만 import
// API 키 불필요, Node.js 내장 fetch 사용

import params from "@/config/params.json";
import { fetchYahooHistory } from "@/lib/fetchers/yahoo";

// KRX 공개 데이터 API 기본 URL
const KRX_BASE_URL = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

/** KRX 지수 스냅샷 (KOSPI / KOSDAQ) */
export interface KrxIndexSnapshot {
  // 지수 코드 ("0001": KOSPI, "1001": KOSDAQ)
  indexCode: string;
  indexName: string;
  closePrice: number;
  changeAmount: number;
  // 전일 대비 등락률 (%)
  changePercent: number;
  tradingVolume: number;
  // 조회 기준일 ("YYYYMMDD")
  baseDate: string;
}

/** V-KOSPI (변동성지수) 스냅샷 */
export interface VKospiSnapshot {
  value: number;
  changeAmount: number;
  // 전일 대비 변화율 (%)
  changePercent: number;
  baseDate: string;
}

/**
 * Date 객체를 KRX API 형식("YYYYMMDD")으로 변환
 */
export function toKrxDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * 가장 최근 영업일을 계산하여 KRX 날짜 형식으로 반환
 * 토요일 → 금요일, 일요일 → 금요일로 조정
 * 공휴일은 처리하지 않음 (데이터 없을 경우 KRX가 빈 응답 반환)
 */
export function getLatestBusinessDay(): string {
  const today = new Date();
  const day = today.getDay(); // 0=일, 6=토

  if (day === 0) {
    today.setDate(today.getDate() - 2); // 일요일 → 금요일
  } else if (day === 6) {
    today.setDate(today.getDate() - 1); // 토요일 → 금요일
  }

  return toKrxDate(today);
}

/**
 * KRX API에 POST 요청을 보내는 공통 헬퍼
 * data.krx.co.kr의 모든 엔드포인트가 같은 형식을 사용
 *
 * @param bld    - BLD 코드 (어떤 데이터를 요청할지 결정)
 * @param fields - 추가 요청 파라미터
 */
async function fetchKrxData<T>(
  bld: string,
  fields: Record<string, string>
): Promise<T> {
  const body = new URLSearchParams({ bld, ...fields });

  const response = await fetch(KRX_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      // KRX 서버가 Referer 헤더를 검증하므로 반드시 포함
      Referer: "https://data.krx.co.kr/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: body.toString(),
    // KRX 응답이 느릴 수 있으므로 10초 타임아웃
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`KRX API 오류: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

// KRX API 응답 원시 타입 (지수 목록)
interface KrxIndexRawResponse {
  OutBlock_1?: Array<{
    IDX_IND_NM: string;   // 지수명
    CLSPRC_IDX: string;   // 종가
    CMPPREVDD_IDX: string; // 전일 대비
    FLUC_RT: string;      // 등락률
    ACC_TRDVOL: string;   // 거래량
    TRD_DD: string;       // 거래일자
  }>;
}

/**
 * KOSPI / KOSDAQ 지수 현재가 조회
 * @param date - 조회 기준일 ("YYYYMMDD", 기본값: 가장 최근 영업일)
 */
export async function fetchKrxIndices(date?: string): Promise<KrxIndexSnapshot[]> {
  const trdDd = date ?? getLatestBusinessDay();

  const results: KrxIndexSnapshot[] = [];

  // KOSPI 조회 (mktId: STK = 유가증권시장)
  try {
    const kospiData = await fetchKrxData<KrxIndexRawResponse>(
      "dbms/MDC/STAT/standard/MDCSTAT00301",
      { mktId: "STK", trdDd }
    );

    if (kospiData.OutBlock_1?.length) {
      const row = kospiData.OutBlock_1[0];
      results.push({
        indexCode: params.krx.kospiIndexCode,
        indexName: row.IDX_IND_NM ?? "코스피",
        closePrice: parseFloat(row.CLSPRC_IDX.replace(/,/g, "")) || 0,
        changeAmount: parseFloat(row.CMPPREVDD_IDX.replace(/,/g, "")) || 0,
        changePercent: parseFloat(row.FLUC_RT) || 0,
        tradingVolume: parseInt(row.ACC_TRDVOL.replace(/,/g, ""), 10) || 0,
        baseDate: trdDd,
      });
    }
  } catch (error) {
    console.error("KOSPI 조회 실패:", error);
  }

  // KOSDAQ 조회 (mktId: KSQ = 코스닥시장)
  try {
    const kosdaqData = await fetchKrxData<KrxIndexRawResponse>(
      "dbms/MDC/STAT/standard/MDCSTAT00301",
      { mktId: "KSQ", trdDd }
    );

    if (kosdaqData.OutBlock_1?.length) {
      const row = kosdaqData.OutBlock_1[0];
      results.push({
        indexCode: params.krx.kosdaqIndexCode,
        indexName: row.IDX_IND_NM ?? "코스닥",
        closePrice: parseFloat(row.CLSPRC_IDX.replace(/,/g, "")) || 0,
        changeAmount: parseFloat(row.CMPPREVDD_IDX.replace(/,/g, "")) || 0,
        changePercent: parseFloat(row.FLUC_RT) || 0,
        tradingVolume: parseInt(row.ACC_TRDVOL.replace(/,/g, ""), 10) || 0,
        baseDate: trdDd,
      });
    }
  } catch (error) {
    console.error("KOSDAQ 조회 실패:", error);
  }

  return results;
}

// KRX API 응답 원시 타입 (변동성지수)
interface KrxVkospiRawResponse {
  output?: Array<{
    CLSPRC: string;       // 종가
    CMPPREVDD: string;    // 전일 대비
    FLUC_RT: string;      // 등락률
    TRD_DD: string;       // 거래일자
  }>;
}

/**
 * V-KOSPI (변동성지수) 현재값 조회
 * @param date - 조회 기준일 ("YYYYMMDD", 기본값: 가장 최근 영업일)
 */
export async function fetchVKospi(date?: string): Promise<VKospiSnapshot | null> {
  const trdDd = date ?? getLatestBusinessDay();

  try {
    const data = await fetchKrxData<KrxVkospiRawResponse>(
      "dbms/MDC/STAT/standard/MDCSTAT01501",
      { trdDd }
    );

    if (!data.output?.length) return null;

    const row = data.output[0];
    return {
      value: parseFloat(row.CLSPRC.replace(/,/g, "")) || 0,
      changeAmount: parseFloat(row.CMPPREVDD.replace(/,/g, "")) || 0,
      changePercent: parseFloat(row.FLUC_RT) || 0,
      baseDate: trdDd,
    };
  } catch (error) {
    console.error("V-KOSPI 조회 실패:", error);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// 히스토리 시계열 조회 (F&G Oscillator 계산용)
// ────────────────────────────────────────────────────────────────

/** KOSPI 일별 종가 데이터 포인트 */
export interface KospiHistoryBar {
  // "YYYY-MM-DD"
  date: string;
  closePrice: number;
}

/** VKOSPI 일별 데이터 포인트 */
export interface VKospiBar {
  // "YYYY-MM-DD"
  date: string;
  value: number;
}

/** KOSPI200 옵션 Put/Call 거래량 일별 데이터 포인트 */
export interface PCRatioBar {
  // "YYYY-MM-DD"
  date: string;
  putVolume: number;
  callVolume: number;
  // putVolume / callVolume (5일 이동평균 적용 전 원시값)
  ratio: number;
}

/** 시장 전체 상승/하락 종목수 일별 데이터 포인트 */
export interface BreadthBar {
  // "YYYY-MM-DD"
  date: string;
  advancingCount: number;
  decliningCount: number;
  unchangedCount: number;
}

/** 외국인 KOSPI 순매수금액 일별 데이터 포인트 */
export interface ForeignNetBar {
  // "YYYY-MM-DD"
  date: string;
  // 외국인 순매수금액 (단위: 백만원, 양수: 순매수, 음수: 순매도)
  netBuyingAmount: number;
}

/** 신용잔고 일별 데이터 포인트 */
export interface MarginBar {
  // "YYYY-MM-DD"
  date: string;
  // 신용잔고 금액 (단위: 백만원)
  balanceAmount: number;
}

// KRX 날짜 형식 → ISO 날짜 변환 헬퍼
function krxDateToIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

// YYYY-MM-DD → YYYYMMDD 변환 헬퍼
function isoToKrxDate(iso: string): string {
  return iso.replace(/-/g, "");
}

// KRX 지수 일별 추이 응답 타입
// ⚠️ BLD: "dbms/MDC/STAT/standard/MDCSTAT00101" — 실제 필드명은 API 호출로 검증 필요
interface KrxIndexHistoryRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;        // 거래일자 "YYYYMMDD"
    CLSPRC_IDX: string;    // 종가 (쉼표 포함 가능)
  }>;
}

/**
 * 네이버 금융 차트 API(sise.nhn)로 KOSPI 지수 일별 종가 시계열 조회
 * 개별종목과 동일한 엔드포인트를 symbol=KOSPI로 호출
 * 응답: text/xml;charset=EUC-KR — arrayBuffer + TextDecoder('euc-kr')로 디코딩 필수
 * count=2000으로 최근 약 8년치 데이터를 한 번에 요청하므로 2Y/5Y 기간도 지원
 *
 * @param startDate - "YYYY-MM-DD"
 * @param endDate   - "YYYY-MM-DD"
 */
async function fetchNaverKospiHistory(
  startDate: string,
  endDate: string
): Promise<KospiHistoryBar[]> {
  // symbol=KOSPI: 네이버 금융 KOSPI 지수 차트 데이터 (istock.nhn은 404)
  const url =
    `https://fchart.stock.naver.com/sise.nhn` +
    `?symbol=KOSPI&timeframe=day&count=2000&requestType=0`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Referer": "https://finance.naver.com/",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Naver KOSPI 차트 오류: ${res.status}`);

  // 응답이 EUC-KR로 인코딩되어 있으므로 text() 대신 arrayBuffer + TextDecoder 사용
  const buffer = await res.arrayBuffer();
  const xml = new TextDecoder("euc-kr").decode(buffer);

  const matches = [...xml.matchAll(/<item data="([^"]+)"/g)];
  if (matches.length === 0) throw new Error("Naver KOSPI 응답에 데이터 없음");

  const startCompact = startDate.replace(/-/g, "");
  const endCompact = endDate.replace(/-/g, "");

  return matches
    .map((match): KospiHistoryBar | null => {
      const parts = match[1].split("|");
      if (parts.length < 5) return null;
      const dateRaw = parts[0];
      // 필드 순서: date|open|high|low|close|volume (개별종목과 동일)
      const closePrice = parseFloat(parts[4]) || 0;
      if (closePrice <= 0) return null;

      const dateIso = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`;
      return { date: dateIso, closePrice };
    })
    .filter((bar): bar is KospiHistoryBar => {
      if (!bar) return false;
      const compact = bar.date.replace(/-/g, "");
      return compact >= startCompact && compact <= endCompact;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * KOSPI 지수 일별 종가 시계열 조회
 * 데이터 소스 우선순위:
 *   1. Naver fchart istock.nhn — 긴 기간(2Y, 5Y)도 안정적으로 지원
 *   2. KRX API — 단기간에는 신뢰성 높음, 장기 기간은 응답 없을 수 있음
 *   3. Yahoo Finance `^KS11` — 네트워크 차단 환경에서는 실패
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchKospiHistory(
  startDate: string,
  endDate: string
): Promise<KospiHistoryBar[]> {
  // ISO 형식("YYYY-MM-DD")으로 정규화 (Naver 함수가 ISO를 요구)
  const startIso = startDate.includes("-") ? startDate : krxDateToIso(startDate);
  const endIso   = endDate.includes("-")   ? endDate   : krxDateToIso(endDate);

  // 1. Naver fchart istock.nhn 우선 시도 (긴 기간도 count=2000으로 커버)
  try {
    const naverBars = await fetchNaverKospiHistory(startIso, endIso);
    if (naverBars.length > 0) {
      console.log(`[KOSPI] Naver fchart 성공: ${naverBars.length}개`);
      return naverBars;
    }
  } catch (naverErr) {
    console.warn("Naver KOSPI 히스토리 조회 실패:", naverErr);
  }

  // 2. KRX API fallback
  const start = startDate.includes("-") ? isoToKrxDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? isoToKrxDate(endDate)   : endDate;

  try {
    const data = await fetchKrxData<KrxIndexHistoryRaw>(
      // KOSPI 일별 추이 BLD 코드 — data.krx.co.kr 네트워크 탭에서 확인 필요
      "dbms/MDC/STAT/standard/MDCSTAT00101",
      {
        idxIndMidclssCd: "02",          // KOSPI 계열 코드
        indIdx: params.krx.kospiIndexCode,
        strtDd: start,
        endDd: end,
      }
    );

    if (!data.OutBlock_1?.length) {
      throw new Error("KRX KOSPI 히스토리 응답 없음");
    }

    return data.OutBlock_1
      .map((row) => ({
        date: krxDateToIso(row.TRD_DD),
        closePrice: parseFloat(row.CLSPRC_IDX.replace(/,/g, "")) || 0,
      }))
      .filter((bar) => bar.closePrice > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    console.warn("KRX KOSPI 히스토리 조회 실패:", err);
  }

  // 3. Yahoo Finance fallback — 네트워크 차단 환경에서는 실패할 수 있음
  try {
    const bars = await fetchYahooHistory("^KS11", startDate, endDate);
    if (bars.length > 0) return bars.map((b) => ({ date: b.date, closePrice: b.close }));
  } catch (yahooErr) {
    console.warn("Yahoo ^KS11 fallback도 실패:", yahooErr);
  }

  // 모든 소스 실패 → 빈 배열 반환, 상위(route.ts)에서 에러 처리
  console.error("KOSPI 데이터 수집 실패 — Naver·KRX·Yahoo 모두 불가");
  return [];
}

// KRX VKOSPI 일별 추이 응답 타입
// ⚠️ BLD: "dbms/MDC/STAT/standard/MDCSTAT01501" — 날짜 범위 파라미터 지원 여부 미확인
interface KrxVkospiHistoryRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;     // 거래일자 "YYYYMMDD"
    CLSPRC: string;     // VKOSPI 종가
  }>;
}

/**
 * VKOSPI 일별 시계열 조회
 * KRX API 실패 시 Yahoo Finance `^VKOSPI` fallback 시도
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchVKospiHistory(
  startDate: string,
  endDate: string
): Promise<VKospiBar[]> {
  const start = startDate.includes("-") ? isoToKrxDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? isoToKrxDate(endDate)   : endDate;

  try {
    const data = await fetchKrxData<KrxVkospiHistoryRaw>(
      "dbms/MDC/STAT/standard/MDCSTAT01501",
      { strtDd: start, endDd: end }
    );

    if (!data.OutBlock_1?.length) {
      throw new Error("KRX VKOSPI 히스토리 응답 없음");
    }

    return data.OutBlock_1
      .map((row) => ({
        date: krxDateToIso(row.TRD_DD),
        value: parseFloat(row.CLSPRC.replace(/,/g, "")) || 0,
      }))
      .filter((bar) => bar.value > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    // Yahoo Finance ^VKOSPI fallback (심볼 유효성 미보장)
    console.warn("KRX VKOSPI 히스토리 조회 실패, Yahoo Finance fallback:", err);
    try {
      const bars = await fetchYahooHistory("^VKOSPI", startDate, endDate);
      return bars.map((b) => ({ date: b.date, value: b.close }));
    } catch {
      console.error("VKOSPI Yahoo fallback도 실패");
      return [];
    }
  }
}

// KRX KOSPI200 옵션 P/C 거래량 응답 타입
// ⚠️ BLD: 실제 코드는 data.krx.co.kr > 파생상품 > 옵션 거래동향에서 확인 필요
interface KrxOptionPCRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;       // 거래일자
    PUT_TRDVOL: string;   // Put 거래량
    CALL_TRDVOL: string;  // Call 거래량
  }>;
}

/**
 * KOSPI200 옵션 Put/Call 거래량 일별 시계열 조회
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchOptionPCRatio(
  startDate: string,
  endDate: string
): Promise<PCRatioBar[]> {
  const start = startDate.includes("-") ? isoToKrxDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? isoToKrxDate(endDate)   : endDate;

  // ⚠️ BLD 코드 — data.krx.co.kr 파생상품 섹션에서 확인 필요
  const data = await fetchKrxData<KrxOptionPCRaw>(
    "dbms/MDC/STAT/standard/MDCSTAT12401",
    { strtDd: start, endDd: end, prodId: "KOSPI200" }
  );

  if (!data.OutBlock_1?.length) return [];

  return data.OutBlock_1
    .map((row) => {
      const putVol  = parseInt(row.PUT_TRDVOL.replace(/,/g, ""), 10) || 0;
      const callVol = parseInt(row.CALL_TRDVOL.replace(/,/g, ""), 10) || 0;
      return {
        date: krxDateToIso(row.TRD_DD),
        putVolume: putVol,
        callVolume: callVol,
        // callVol이 0이면 나눗셈 방지 — 해당 row 제거
        ratio: callVol > 0 ? putVol / callVol : 0,
      };
    })
    .filter((bar) => bar.callVolume > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// KRX 시장 상승/하락 종목수 응답 타입
// ⚠️ BLD: data.krx.co.kr > 주식 > 시세 > 등락종목현황에서 확인 필요
interface KrxBreadthRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;       // 거래일자
    ADV_ISU_CNT: string;  // 상승 종목수
    DCL_ISU_CNT: string;  // 하락 종목수
    UNFL_ISU_CNT: string; // 보합 종목수
  }>;
}

/**
 * KOSPI 전체 상승/하락/보합 종목수 일별 시계열 조회
 * A/D Line 계산의 기초 데이터
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchMarketBreadth(
  startDate: string,
  endDate: string
): Promise<BreadthBar[]> {
  const start = startDate.includes("-") ? isoToKrxDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? isoToKrxDate(endDate)   : endDate;

  // ⚠️ BLD 코드 — data.krx.co.kr 시장 현황 섹션에서 확인 필요
  const data = await fetchKrxData<KrxBreadthRaw>(
    "dbms/MDC/STAT/standard/MDCSTAT01401",
    { mktId: "STK", strtDd: start, endDd: end }
  );

  if (!data.OutBlock_1?.length) return [];

  return data.OutBlock_1
    .map((row) => ({
      date: krxDateToIso(row.TRD_DD),
      advancingCount: parseInt(row.ADV_ISU_CNT.replace(/,/g, ""), 10) || 0,
      decliningCount: parseInt(row.DCL_ISU_CNT.replace(/,/g, ""), 10) || 0,
      unchangedCount: parseInt(row.UNFL_ISU_CNT.replace(/,/g, ""), 10) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// KRX 외국인 순매수 응답 타입
// ⚠️ BLD: data.krx.co.kr > 주식 > 투자자별 > 투자자별 거래실적에서 확인 필요
interface KrxForeignNetRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;         // 거래일자
    FRGNR_NETBUY_AMT: string; // 외국인 순매수 금액 (백만원)
  }>;
}

/**
 * 외국인 KOSPI 순매수금액 일별 시계열 조회
 * 외국인 지분율 ~30%, 매매 방향이 KOSPI 방향성을 강하게 견인
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchForeignNetBuying(
  startDate: string,
  endDate: string
): Promise<ForeignNetBar[]> {
  const start = startDate.includes("-") ? isoToKrxDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? isoToKrxDate(endDate)   : endDate;

  // ⚠️ BLD 코드 — data.krx.co.kr 투자자별 거래실적 섹션에서 확인 필요
  const data = await fetchKrxData<KrxForeignNetRaw>(
    "dbms/MDC/STAT/standard/MDCSTAT02303",
    { mktId: "STK", strtDd: start, endDd: end, invstTpCd: "9000" } // 9000: 외국인
  );

  if (!data.OutBlock_1?.length) return [];

  return data.OutBlock_1
    .map((row) => ({
      date: krxDateToIso(row.TRD_DD),
      netBuyingAmount: parseInt(row.FRGNR_NETBUY_AMT.replace(/,/g, ""), 10) || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ────────────────────────────────────────────────────────────────
// 네이버 금융 한국 개별 종목 시세 조회
// 종목 검색(searchNaverFinanceTickers)과 시세 이력을 동일 출처로 통일
// ────────────────────────────────────────────────────────────────

/** 네이버 금융 개별종목 일별 OHLCV 데이터 포인트 */
export interface NaverStockHistoryBar {
  // "YYYY-MM-DD"
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** fetchNaverStockHistory 반환 타입 — 가격 데이터 + XML에서 추출한 기업명 */
export interface NaverStockResult {
  bars: NaverStockHistoryBar[];
  /** <chartdata name="..."> 속성에서 추출한 기업명 (예: "삼성전기") */
  name?: string;
}

/**
 * 네이버 금융 차트 API로 한국 개별 주식의 일별 시세를 조회
 * 엔드포인트: fchart.stock.naver.com/sise.nhn
 * 응답 형식: XML — <item data="YYYYMMDD|시가|고가|저가|종가|거래량"/>
 *
 * count=2000 으로 최근 약 8년치를 한 번에 요청한 뒤 날짜 범위로 필터링
 * 조회 실패 시 Yahoo Finance `.KS`/`.KQ` fallback 사용
 *
 * @param code      - 6자리 종목코드 (예: "005930")
 * @param startDate - 시작일 ("YYYY-MM-DD")
 * @param endDate   - 종료일 ("YYYY-MM-DD")
 */
export async function fetchNaverStockHistory(
  code: string,
  startDate: string,
  endDate: string
): Promise<NaverStockResult> {
  const url =
    `https://fchart.stock.naver.com/sise.nhn` +
    `?symbol=${encodeURIComponent(code)}&timeframe=day&count=2000&requestType=0`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        // 네이버 금융 내부 도메인으로 Referer 지정 필수
        "Referer": "https://finance.naver.com/",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Naver 차트 API 오류: ${res.status}`);

    // 응답이 EUC-KR로 인코딩되어 있으므로 text() 대신 arrayBuffer + TextDecoder 사용
    // text()는 UTF-8로 디코딩해 한글이 깨짐 (Content-Type: text/xml;charset=EUC-KR)
    const buffer = await res.arrayBuffer();
    const xml = new TextDecoder("euc-kr").decode(buffer);

    // <chartdata symbol="009150" name="삼성전기" ...> 태그에서 기업명 추출
    const nameMatch = xml.match(/<chartdata[^>]+name="([^"]+)"/);
    const name = nameMatch?.[1];

    // XML 파싱: <item data="20240101|75000|76000|74000|75500|18000000"/>
    // 정규식으로 item 태그 data 속성 추출 (XML 파서 없이 처리)
    const matches = [...xml.matchAll(/<item data="([^"]+)"/g)];

    if (matches.length === 0) throw new Error("Naver 차트 응답에 데이터 없음");

    // 날짜 범위 필터링을 위한 비교용 YYYYMMDD 문자열
    const startCompact = startDate.replace(/-/g, "");
    const endCompact = endDate.replace(/-/g, "");

    const bars = matches
      .map((match): NaverStockHistoryBar | null => {
        const parts = match[1].split("|");
        if (parts.length < 6) return null;

        const dateRaw = parts[0]; // "YYYYMMDD"
        const close = parseInt(parts[4], 10) || 0;
        if (close <= 0) return null;

        return {
          date: `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`,
          open: parseInt(parts[1], 10) || close,
          high: parseInt(parts[2], 10) || close,
          low: parseInt(parts[3], 10) || close,
          close,
          volume: parseInt(parts[5], 10) || 0,
        };
      })
      .filter((bar): bar is NaverStockHistoryBar => {
        if (!bar) return false;
        const compact = bar.date.replace(/-/g, "");
        // 요청 날짜 범위 내 데이터만 포함
        return compact >= startCompact && compact <= endCompact;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return { bars, name };
  } catch (err) {
    // 네이버 API 실패 시 Yahoo Finance fallback (.KS → .KQ 순서)
    console.warn(`Naver 개별종목 조회 실패 (${code}), Yahoo Finance fallback:`, err);
    try {
      const bars = await fetchYahooHistory(`${code}.KS`, startDate, endDate);
      if (bars.length > 0) return { bars };
      const kqBars = await fetchYahooHistory(`${code}.KQ`, startDate, endDate);
      return { bars: kqBars };
    } catch {
      return { bars: [] };
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 네이버 금융 종목 검색 (한국 주식 기업명 → 종목코드 변환)
// ────────────────────────────────────────────────────────────────

/** 네이버 금융 자동완성 응답 단일 항목 */
interface NaverFinanceItem {
  code: string;     // 6자리 종목코드 (예: "005930")
  name: string;     // 기업명 (예: "삼성전자")
  market: "KS" | "KQ"; // KS = 유가증권(KOSPI), KQ = 코스닥(KOSDAQ)
}

/**
 * 네이버 금융 자동완성 API로 한국 주식 종목 코드 검색
 * Yahoo Finance 검색 API가 한국어 쿼리에서 불안정한 문제의 대안
 *
 * @param query - 검색어 (기업명 또는 종목명 일부, 예: "삼성전자", "삼성")
 * @returns 검색 결과 배열 (빈 배열 = 검색 실패 또는 결과 없음)
 */
export async function searchNaverFinanceTickers(
  query: string
): Promise<NaverFinanceItem[]> {
  const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(query)}&q_enc=UTF-8&st=111&r_format=json&r_enc=UTF-8&r_lt=111&l=0&lt=10`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        // 네이버 금융 도메인을 Referer로 지정해야 CORS 유사 제한을 우회
        "Referer": "https://finance.naver.com/",
        "Accept": "application/json, text/javascript, */*",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const text = await res.text();
    // 네이버 자동완성 응답은 JSON이 아닌 경우가 있어 안전하게 파싱
    let data: { items?: string[][][] };
    try {
      data = JSON.parse(text);
    } catch {
      return [];
    }

    // 응답 구조: { items: [ [["기업명", "코드", "타입", ...], ...], [] ] }
    // items[0]: 국내주식 결과, items[1]: 해외주식 결과 (미사용)
    const items: string[][] = data?.items?.[0] ?? [];
    if (!items.length) return [];

    return items
      .filter((item) => item.length >= 2)
      .map((item) => {
        const name = item[0];
        const code = item[1];
        // 마켓 타입: "1" = 유가증권(KOSPI), "2" = 코스닥(KOSDAQ)
        // 주의: 네이버 API 버전에 따라 다를 수 있음 → 코드 자릿수로 재확인 가능
        const typeFlag = item[2] ?? "1";
        const market: "KS" | "KQ" = typeFlag === "2" ? "KQ" : "KS";
        return { code, name, market };
      })
      .filter((item) => /^\d{6}$/.test(item.code)); // 6자리 숫자 코드만 허용
  } catch {
    return [];
  }
}

// KRX 신용잔고 응답 타입
// ⚠️ BLD: data.krx.co.kr > 주식 > 신용거래 섹션에서 확인 필요
interface KrxMarginRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;           // 거래일자
    CRDTBAL_AMT: string;      // 신용잔고 금액 (백만원)
  }>;
}

/**
 * KOSPI 신용잔고 일별 시계열 조회
 * 신용잔고 급증 → 레버리지 탐욕, 급감 → 강제청산 공포
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchMarginBalance(
  startDate: string,
  endDate: string
): Promise<MarginBar[]> {
  const start = startDate.includes("-") ? isoToKrxDate(startDate) : startDate;
  const end   = endDate.includes("-")   ? isoToKrxDate(endDate)   : endDate;

  // ⚠️ BLD 코드 — data.krx.co.kr 신용거래 섹션에서 확인 필요
  const data = await fetchKrxData<KrxMarginRaw>(
    "dbms/MDC/STAT/standard/MDCSTAT03901",
    { mktId: "STK", strtDd: start, endDd: end }
  );

  if (!data.OutBlock_1?.length) return [];

  return data.OutBlock_1
    .map((row) => ({
      date: krxDateToIso(row.TRD_DD),
      balanceAmount: parseInt(row.CRDTBAL_AMT.replace(/,/g, ""), 10) || 0,
    }))
    .filter((bar) => bar.balanceAmount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
