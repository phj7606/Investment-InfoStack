// GET /api/market/economic-index?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// 경제지표 월별 데이터 집계 API
// FRED: AHETPI(평균시간당임금), CPIAUCSL(CPI, 실질임금 계산용)
// Alpha Vantage: MANUFACTURING_PMI (S&P Global Markit 제조업 PMI, 월별 레벨)
// ECOS: 한국 수출 월별 합계(백만달러)
//
// YoY 계산 구조:
//   - FRED 조회: startDate보다 14개월 앞선 날짜부터 수집 (13개월 이상 lookback 보장)
//   - 출력: 요청된 startDate 이후 데이터만 반환

import { NextRequest, NextResponse } from "next/server";
import { fetchFredSeries } from "@/lib/fetchers/fred";
import { fetchAvEconomicIndicator } from "@/lib/fetchers/alpha-vantage";

export const dynamic = "force-dynamic";

/** 경제지표 월별 데이터 포인트 */
export interface EconomicIndexBar {
  /** 월 기준 "YYYY-MM-DD" (해당 월 1일) */
  date: string;
  /** 실질임금 상승률 (%) — (명목임금YoY - CPI YoY) 근사치 */
  realWageGrowth?: number;
  /** Markit 제조업 PMI 지수 레벨 — Alpha Vantage MANUFACTURING_PMI (50 이상: 확장, 50 이하: 수축) */
  mpmie?: number;
  /** 한국 월간 수출 (백만달러) — ECOS 관세청 기준 */
  koreaExport?: number;
}

/** "YYYY-MM-DD" 날짜 기준으로 N개월 이전 날짜 계산 */
function subtractMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** FRED 월별 데이터 배열 → Map<"YYYY-MM", number> */
function toMonthMap(data: { date: string; value: number }[]): Map<string, number> {
  // FRED 월별 관측값 날짜는 해당 월 1일 기준 "YYYY-MM-DD"
  return new Map(data.map((d) => [d.date.slice(0, 7), d.value]));
}

/** YoY 성장률 계산 — 12개월 전 대비 변화율 (%) */
function computeYoYMap(monthMap: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>();
  for (const [month, value] of monthMap) {
    const [year, mon] = month.split("-").map(Number);
    const prevYear = `${year - 1}-${String(mon).padStart(2, "0")}`;
    const prevValue = monthMap.get(prevYear);
    // prevValue === 0 제외 — 분모 0 방지
    if (prevValue !== undefined && prevValue !== 0) {
      result.set(month, ((value - prevValue) / prevValue) * 100);
    }
  }
  return result;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const endDate = searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);

  // 출력 시작일 — 클라이언트가 요청한 기간의 시작
  const outputStartDate = searchParams.get("startDate") ?? subtractMonths(endDate, 60);

  // FRED 조회 시작일 — YoY 계산을 위해 출력 시작일보다 14개월 앞서서 조회
  // (13개월 선행 데이터 확보 → 출력 시작 월부터 YoY 값 존재 보장)
  const fredStartDate = subtractMonths(outputStartDate, 14);

  // FRED 2개 + Alpha Vantage 1개 병렬 수집 (실패해도 나머지는 정상 반환)
  // AHETPI: 전체 민간 평균 시간당 임금 (달러, 명목, 월별)
  // CPIAUCSL: 소비자 물가 지수 (실질임금 계산용, 월별)
  // MANUFACTURING_PMI: S&P Global Markit 제조업 PMI — Alpha Vantage, 50 기준 확장/수축
  const [wageResult, cpiResult, mpmieResult] = await Promise.allSettled([
    fetchFredSeries("AHETPI", fredStartDate, endDate),
    fetchFredSeries("CPIAUCSL", fredStartDate, endDate),
    fetchAvEconomicIndicator("MANUFACTURING_PMI", outputStartDate, endDate),
  ]);

  if (wageResult.status === "rejected") console.warn("[economic-index] AHETPI 수집 실패:", wageResult.reason);
  if (cpiResult.status === "rejected") console.warn("[economic-index] CPIAUCSL 수집 실패:", cpiResult.reason);
  if (mpmieResult.status === "rejected") console.warn("[economic-index] MANUFACTURING_PMI 수집 실패:", mpmieResult.reason);

  const wageMap = toMonthMap(wageResult.status === "fulfilled" ? wageResult.value : []);
  const cpiMap = toMonthMap(cpiResult.status === "fulfilled" ? cpiResult.value : []);
  // MANUFACTURING_PMI: 레벨 값 그대로 사용 (YoY 계산 불필요, 50 기준 판단)
  // Alpha Vantage는 startDate 필터 적용 후 반환하므로 toMonthMap 그대로 활용
  const mpmieMap = toMonthMap(mpmieResult.status === "fulfilled" ? mpmieResult.value : []);

  // YoY 변화율 — 14개월치 데이터가 있어야 출력 시작 월부터 YoY 계산 가능
  const wageYoY = computeYoYMap(wageMap);
  const cpiYoY = computeYoYMap(cpiMap);

  // 한국 수출 — ECOS API 직접 호출 (ECOS_API_KEY 필수)
  // stat_code=601Y031 (통관수출입실적), item_code=0010000 (수출금액, 백만달러)
  const koreaExportMap = new Map<string, number>();
  const ecosKey = process.env.ECOS_API_KEY;
  if (ecosKey) {
    try {
      const ecosStart = fredStartDate.replace(/-/g, "").slice(0, 6);
      const ecosEnd = endDate.replace(/-/g, "").slice(0, 6);
      const ecosUrl = [
        "https://ecos.bok.or.kr/api/StatisticSearch",
        ecosKey,
        "json",
        "kr",
        "1",
        "1000",
        "601Y031",
        "M",
        ecosStart,
        ecosEnd,
        "0010000",
      ].join("/");

      const res = await fetch(ecosUrl, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = await res.json();
        const rows: Array<{ TIME: string; DATA_VALUE: string }> = json?.StatisticSearch?.row ?? [];
        for (const row of rows) {
          if (row.DATA_VALUE && row.DATA_VALUE !== "") {
            const month = `${row.TIME.slice(0, 4)}-${row.TIME.slice(4, 6)}`;
            koreaExportMap.set(month, parseFloat(row.DATA_VALUE));
          }
        }
      }
    } catch {
      console.warn("[economic-index] ECOS 한국 수출 데이터 수집 실패");
    }
  }

  // 출력 기간 필터링: outputStartDate 이후 + 3가지 소스 중 하나라도 데이터 있는 월
  const outputStart = outputStartDate.slice(0, 7); // "YYYY-MM"

  // 출력 기간 후보 월 집합 — 세 소스 키 합집합
  const candidateMonths = new Set([
    ...wageYoY.keys(),
    ...koreaExportMap.keys(),
    ...mpmieMap.keys(),
  ]);

  const sortedMonths = [...candidateMonths].sort();

  const data: EconomicIndexBar[] = sortedMonths
    .filter((m) => m >= outputStart)
    .map((month) => {
      // 실질임금 = 명목임금YoY - 물가YoY (피셔 방정식 근사)
      const wageGrowth = wageYoY.get(month);
      const inflation = cpiYoY.get(month);
      const realWageGrowth =
        wageGrowth !== undefined && inflation !== undefined
          ? wageGrowth - inflation
          : undefined;

      return {
        date: `${month}-01`,
        realWageGrowth,
        // MPMIE PMI 레벨 — 50 기준 Markit 제조업 경기 확장/수축
        mpmie: mpmieMap.get(month),
        koreaExport: koreaExportMap.get(month),
      };
    })
    .filter(
      (d) =>
        d.realWageGrowth !== undefined ||
        d.mpmie !== undefined ||
        d.koreaExport !== undefined
    );

  return NextResponse.json({
    data,
    meta: {
      startDate: data[0]?.date ?? outputStartDate,
      endDate: data[data.length - 1]?.date ?? endDate,
      count: data.length,
      debug: {
        fredStartDate,
        outputStart,
        mpmieCount: mpmieMap.size,       // Alpha Vantage MANUFACTURING_PMI
        wageYoYCount: wageYoY.size,
      },
    },
  });
}
