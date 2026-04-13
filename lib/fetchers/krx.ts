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
 * KOSPI 지수 일별 종가 시계열 조회
 * KRX 히스토리 API 실패 시 Yahoo Finance `^KS11` fallback 사용
 *
 * @param startDate - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate   - "YYYYMMDD" 또는 "YYYY-MM-DD"
 */
export async function fetchKospiHistory(
  startDate: string,
  endDate: string
): Promise<KospiHistoryBar[]> {
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
    // KRX API 실패 시 Yahoo Finance ^KS11 fallback
    console.warn("KRX KOSPI 히스토리 조회 실패, Yahoo Finance fallback:", err);
    const bars = await fetchYahooHistory("^KS11", startDate, endDate);
    return bars.map((b) => ({ date: b.date, closePrice: b.close }));
  }
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
