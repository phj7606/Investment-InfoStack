// KRX 업종별 수급 데이터 fetcher
// data.krx.co.kr에서 KOSPI 업종별 시가총액 및 기관/외국인 순매수 일별 시계열을 수집
// 서버 전용 모듈 — Next.js Route Handler에서만 import
//
// ⚠️ BLD 코드 및 응답 필드명은 data.krx.co.kr 네트워크 탭에서 검증 필요.
//   실제 응답과 필드명이 다를 경우 해당 파싱 로직만 수정한다.

import type { SectorFlowDataPoint } from "@/types";

const KRX_BASE_URL =
  "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";

// ─────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────

/**
 * KRX 공개 데이터 API에 POST 요청을 보내는 내부 헬퍼
 * lib/fetchers/krx.ts의 fetchKrxData 패턴과 동일하게 구현
 * (별도 파일에 두는 이유: sector-flow 도메인의 의존성을 격리하기 위함)
 *
 * @param bld    - BLD 코드 (요청할 데이터셋 식별자)
 * @param fields - 추가 요청 파라미터
 */
async function fetchKrxPost<T>(
  bld: string,
  fields: Record<string, string>
): Promise<T> {
  const body = new URLSearchParams({ bld, ...fields });

  const response = await fetch(KRX_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      // KRX 서버가 Referer를 검증하므로 반드시 포함
      Referer: "https://data.krx.co.kr/",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: body.toString(),
    // 네트워크 지연을 고려하여 15초 타임아웃 설정
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`KRX API 오류: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * KRX 날짜 형식 "YYYYMMDD" → "YYYY-MM-DD" ISO 형식으로 변환
 */
function krxDateToIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * "YYYY-MM-DD" 또는 "YYYYMMDD" → "YYYYMMDD" KRX 형식으로 정규화
 */
function toKrxDate(date: string): string {
  return date.includes("-") ? date.replace(/-/g, "") : date;
}

// ─────────────────────────────────────────────
// 업종 시가총액 조회
// ─────────────────────────────────────────────

// ⚠️ MDCSTAT00601 응답 원시 타입 — 실제 필드명은 API 호출로 검증 필요
interface KrxSectorMktCapRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;     // 거래일자 "YYYYMMDD"
    MKTCAP: string;     // 시가총액 (억원, 쉼표 포함 가능)
  }>;
}

/**
 * KOSPI 업종별 시가총액 일별 시계열 조회
 * 시가총액은 수급의 분모로 사용 — 절대 금액이 아닌 상대 변화율을 보기 위함
 *
 * ⚠️ BLD: dbms/MDC/STAT/standard/MDCSTAT00601 (업종별 시세)
 *    실제 파라미터(idxIndMidclssCd 등)는 data.krx.co.kr 네트워크 탭에서 확인 필요
 *
 * @param sectorCode - KRX 업종 코드 (예: "1028")
 * @param startDate  - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate    - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @returns 날짜 오름차순 시가총액 배열 (단위: 억원), 실패 시 빈 배열
 */
export async function fetchSectorMarketCap(
  sectorCode: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; mktcap: number }[]> {
  const start = toKrxDate(startDate);
  const end = toKrxDate(endDate);

  try {
    const data = await fetchKrxPost<KrxSectorMktCapRaw>(
      "dbms/MDC/STAT/standard/MDCSTAT00601",
      {
        mktId: "STK",
        // ⚠️ 업종 코드 파라미터 키는 실제 API에서 확인 필요 (idxIndMidclssCd / sctpCd 중 하나)
        idxIndMidclssCd: sectorCode,
        strtDd: start,
        endDd: end,
      }
    );

    if (!data.OutBlock_1?.length) {
      console.error(
        `[sector-flow] 업종 시가총액 응답 없음: sectorCode=${sectorCode}`
      );
      return [];
    }

    return data.OutBlock_1
      .map((row) => ({
        date: krxDateToIso(row.TRD_DD),
        // KRX 응답의 쉼표 제거 후 파싱 (단위: 억원)
        mktcap: parseFloat(row.MKTCAP.replace(/,/g, "")) || 0,
      }))
      .filter((bar) => bar.mktcap > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(
      `[sector-flow] 업종 시가총액 조회 실패: sectorCode=${sectorCode}`,
      error
    );
    return [];
  }
}

// ─────────────────────────────────────────────
// 업종 투자자별 순매수 조회
// ─────────────────────────────────────────────

// ⚠️ MDCSTAT02403 응답 원시 타입 — 실제 필드명은 API 호출로 검증 필요
interface KrxSectorInvestorRaw {
  OutBlock_1?: Array<{
    TRD_DD: string;          // 거래일자 "YYYYMMDD"
    INST_NET_AMT: string;    // 기관합계 순매수 금액 (억원)
    FORGN_NET_AMT: string;   // 외국인합계 순매수 금액 (억원)
  }>;
}

/**
 * KOSPI 업종별 기관/외국인 순매수 일별 시계열 조회
 * 기관과 외국인 수급 합산이 업종 매기에너지의 핵심 입력값
 *
 * ⚠️ BLD: dbms/MDC/STAT/standard/MDCSTAT02403 (업종별 투자자 거래 실적)
 *    실제 응답 필드명(INST_NET_AMT, FORGN_NET_AMT)은 API 호출로 검증 필요
 *
 * @param sectorCode - KRX 업종 코드 (예: "1028")
 * @param startDate  - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate    - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @returns 날짜 오름차순 순매수 배열 (단위: 억원), 실패 시 빈 배열
 */
export async function fetchSectorInvestorFlow(
  sectorCode: string,
  startDate: string,
  endDate: string
): Promise<{ date: string; instNet: number; foreignNet: number }[]> {
  const start = toKrxDate(startDate);
  const end = toKrxDate(endDate);

  try {
    const data = await fetchKrxPost<KrxSectorInvestorRaw>(
      "dbms/MDC/STAT/standard/MDCSTAT02403",
      {
        mktId: "STK",
        // ⚠️ 업종 코드 파라미터 키는 실제 API에서 확인 필요
        idxIndMidclssCd: sectorCode,
        strtDd: start,
        endDd: end,
      }
    );

    if (!data.OutBlock_1?.length) {
      console.error(
        `[sector-flow] 업종 투자자 수급 응답 없음: sectorCode=${sectorCode}`
      );
      return [];
    }

    return data.OutBlock_1
      .map((row) => ({
        date: krxDateToIso(row.TRD_DD),
        // 양수: 순매수, 음수: 순매도 (단위: 억원)
        instNet: parseFloat(row.INST_NET_AMT.replace(/,/g, "")) || 0,
        foreignNet: parseFloat(row.FORGN_NET_AMT.replace(/,/g, "")) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(
      `[sector-flow] 업종 투자자 수급 조회 실패: sectorCode=${sectorCode}`,
      error
    );
    return [];
  }
}

// ─────────────────────────────────────────────
// 통합 조회 (시가총액 + 수급 조인)
// ─────────────────────────────────────────────

/**
 * 업종 시가총액과 기관/외국인 순매수를 날짜 기준으로 조인하여 반환
 * 두 데이터셋 모두 존재하는 날짜만 포함 (inner join)
 *
 * 시가총액 시계열과 투자자 수급 시계열을 병렬로 조회하여 응답 속도를 최적화.
 * 어느 한쪽이 실패하면 빈 배열 반환 (에러 로그는 각 하위 함수에서 출력)
 *
 * @param sectorCode - KRX 업종 코드 (예: "1028")
 * @param startDate  - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @param endDate    - "YYYYMMDD" 또는 "YYYY-MM-DD"
 * @returns SectorFlowDataPoint 배열 (날짜 오름차순), 실패 시 빈 배열
 */
export async function fetchSectorFlowData(
  sectorCode: string,
  startDate: string,
  endDate: string
): Promise<SectorFlowDataPoint[]> {
  // 두 API를 병렬 호출하여 지연 시간 최소화
  const [mktcapData, flowData] = await Promise.all([
    fetchSectorMarketCap(sectorCode, startDate, endDate),
    fetchSectorInvestorFlow(sectorCode, startDate, endDate),
  ]);

  if (mktcapData.length === 0 || flowData.length === 0) {
    return [];
  }

  // 날짜 → 시가총액 맵 구성 (O(n) 조인을 위해 Map 사용)
  const mktcapByDate = new Map(mktcapData.map((row) => [row.date, row.mktcap]));

  // 수급 데이터를 기준으로 inner join
  const joined: SectorFlowDataPoint[] = [];

  for (const flow of flowData) {
    const mktcap = mktcapByDate.get(flow.date);
    // 시가총액이 없는 날짜는 제외 (휴장일 또는 응답 불일치)
    if (mktcap === undefined) continue;

    joined.push({
      date: flow.date,
      instNet: flow.instNet,
      foreignNet: flow.foreignNet,
      mktcap,
    });
  }

  return joined;
}
