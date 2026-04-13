/**
 * GET /api/market/fear-greed-kr
 * GET /api/market/fear-greed-kr?days=252
 *
 * 한국 Fear & Greed Oscillator v2 계산 결과 반환
 *
 * 7개 구성 요소:
 *   Momentum, Volatility(VKOSPI), CreditSpread(BBB+-AA-),
 *   PCRatio(Put/Call), ADLine(상승-하락), ForeignNet(외국인순매수), MarginBalance(신용잔고)
 *
 * 캐시 전략: 86400초 (historicalTTLSeconds) — 일 1회 재계산
 * 데이터 소스 실패 시: Promise.allSettled으로 부분 동작 보장
 */

import { NextRequest } from "next/server";
import params from "@/config/params.json";
import { readCache, writeCache } from "@/lib/cache";
import {
  fetchKospiHistory,
  fetchVKospiHistory,
  fetchOptionPCRatio,
  fetchMarketBreadth,
  fetchForeignNetBuying,
  fetchMarginBalance,
  toKrxDate,
} from "@/lib/fetchers/krx";
import { fetchCreditSpread } from "@/lib/fetchers/kofiabond";
import {
  calcMomentum,
  calcADLine,
  calcForeignNet,
  calcMarginChange,
  calcFearGreedIndex,
  calcFGMomentum,
  valueToRegime,
  normalizeRollingZScore,
  extractComponentsAt,
  type FGInputSeries,
  type FGWeights,
} from "@/lib/indicators/fearGreed";
import type { FearGreedKrResponse, FearGreedHistoryPoint } from "@/types";

// ────────────────────────────────────────────────────────────────
// 날짜 유틸리티
// ────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ────────────────────────────────────────────────────────────────
// 날짜 교집합 병합 + forward fill
// ────────────────────────────────────────────────────────────────

interface MergedRow {
  date: string;
  kospiClose: number;
  vkospi: number;
  creditSpread: number;
  pcRatio: number;       // 원시 P/C 비율 (5일 MA 전)
  advancing: number;
  declining: number;
  foreignNet: number;
  marginBalance: number;
}

/**
 * 7개 시계열을 날짜 기준으로 병합
 * KOSPI와 VKOSPI는 필수 (없으면 해당 날짜 제외)
 * 나머지는 선택적 (forward fill로 결측값 처리)
 */
function mergeTimeSeries(
  kospiMap: Map<string, number>,
  vkospiMap: Map<string, number>,
  creditMap: Map<string, number>,
  pcPutMap: Map<string, number>,
  pcCallMap: Map<string, number>,
  advancingMap: Map<string, number>,
  decliningMap: Map<string, number>,
  foreignMap: Map<string, number>,
  marginMap: Map<string, number>
): MergedRow[] {
  // KOSPI 날짜를 기준으로 교집합 구성 (KOSPI + VKOSPI 모두 있는 날만)
  const baseDates = Array.from(kospiMap.keys())
    .filter((d) => vkospiMap.has(d))
    .sort();

  const result: MergedRow[] = [];
  let lastCredit = NaN;
  let lastPcPut = NaN;
  let lastPcCall = NaN;
  let lastAdv = NaN;
  let lastDecl = NaN;
  let lastForeign = NaN;
  let lastMargin = NaN;

  for (const date of baseDates) {
    // forward fill: 이전 유효값 유지
    if (creditMap.has(date))    lastCredit  = creditMap.get(date)!;
    if (pcPutMap.has(date))     lastPcPut   = pcPutMap.get(date)!;
    if (pcCallMap.has(date))    lastPcCall  = pcCallMap.get(date)!;
    if (advancingMap.has(date)) lastAdv     = advancingMap.get(date)!;
    if (decliningMap.has(date)) lastDecl    = decliningMap.get(date)!;
    if (foreignMap.has(date))   lastForeign = foreignMap.get(date)!;
    if (marginMap.has(date))    lastMargin  = marginMap.get(date)!;

    result.push({
      date,
      kospiClose:    kospiMap.get(date)!,
      vkospi:        vkospiMap.get(date)!,
      creditSpread:  isNaN(lastCredit)  ? NaN : lastCredit,
      pcRatio:       isNaN(lastPcPut) || isNaN(lastPcCall) || lastPcCall === 0
                       ? NaN : lastPcPut / lastPcCall,
      advancing:     isNaN(lastAdv)     ? NaN : lastAdv,
      declining:     isNaN(lastDecl)    ? NaN : lastDecl,
      foreignNet:    isNaN(lastForeign) ? NaN : lastForeign,
      marginBalance: isNaN(lastMargin)  ? NaN : lastMargin,
    });
  }

  return result;
}

// ────────────────────────────────────────────────────────────────
// Route Handler
// ────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(
    parseInt(searchParams.get("days") ?? String(params.fearGreed.historyDays), 10),
    params.fearGreed.historyDays
  );

  const today = new Date();
  const todayStr = toIsoDate(today);

  const cacheKey = `fear-greed-kr-${todayStr}`;

  // 캐시 확인
  const cached = await readCache<FearGreedKrResponse>(cacheKey);
  if (cached) {
    return Response.json({ ...cached, source: "cache" });
  }

  // 수집 기간 계산: 252일 warmup + historyDays
  const fetchDays = params.fearGreed.fetchWindowDays;
  const startDate = toIsoDate(addDays(today, -fetchDays));
  const endDate   = todayStr;
  const startKrx  = toKrxDate(addDays(today, -fetchDays));
  const endKrx    = toKrxDate(today);

  // ──────────────────────────────────────────
  // 7개 데이터 소스 병렬 수집 (일부 실패해도 계속)
  // ──────────────────────────────────────────
  const [
    kospiResult,
    vkospiResult,
    creditResult,
    pcResult,
    breadthResult,
    foreignResult,
    marginResult,
  ] = await Promise.allSettled([
    fetchKospiHistory(startKrx, endKrx),
    fetchVKospiHistory(startKrx, endKrx),
    fetchCreditSpread(startDate, endDate),
    fetchOptionPCRatio(startKrx, endKrx),
    fetchMarketBreadth(startKrx, endKrx),
    fetchForeignNetBuying(startKrx, endKrx),
    fetchMarginBalance(startKrx, endKrx),
  ]);

  // KOSPI는 필수 — 없으면 503 반환
  if (kospiResult.status === "rejected") {
    console.error("KOSPI 히스토리 수집 실패:", kospiResult.reason);
    return Response.json(
      { error: "KOSPI 데이터를 가져오지 못했습니다." },
      { status: 503 }
    );
  }

  // 수집 결과를 Map으로 변환 (날짜 → 값)
  const kospiMap = new Map(
    kospiResult.value.map((b) => [b.date, b.closePrice])
  );
  const vkospiMap = vkospiResult.status === "fulfilled"
    ? new Map(vkospiResult.value.map((b) => [b.date, b.value]))
    : new Map<string, number>();

  const creditMap = creditResult.status === "fulfilled"
    ? new Map(creditResult.value.map((p) => [p.date, p.spread]))
    : new Map<string, number>();

  const pcPutMap = new Map<string, number>();
  const pcCallMap = new Map<string, number>();
  if (pcResult.status === "fulfilled") {
    pcResult.value.forEach((b) => {
      pcPutMap.set(b.date, b.putVolume);
      pcCallMap.set(b.date, b.callVolume);
    });
  }

  const advancingMap = new Map<string, number>();
  const decliningMap = new Map<string, number>();
  if (breadthResult.status === "fulfilled") {
    breadthResult.value.forEach((b) => {
      advancingMap.set(b.date, b.advancingCount);
      decliningMap.set(b.date, b.decliningCount);
    });
  }

  const foreignMap = foreignResult.status === "fulfilled"
    ? new Map(foreignResult.value.map((b) => [b.date, b.netBuyingAmount]))
    : new Map<string, number>();

  const marginMap = marginResult.status === "fulfilled"
    ? new Map(marginResult.value.map((b) => [b.date, b.balanceAmount]))
    : new Map<string, number>();

  // VKOSPI도 없으면 503
  if (vkospiMap.size === 0) {
    return Response.json(
      { error: "VKOSPI 데이터를 가져오지 못했습니다." },
      { status: 503 }
    );
  }

  // ──────────────────────────────────────────
  // 날짜 교집합 병합 + forward fill
  // ──────────────────────────────────────────
  const merged = mergeTimeSeries(
    kospiMap, vkospiMap,
    creditMap, pcPutMap, pcCallMap,
    advancingMap, decliningMap,
    foreignMap, marginMap
  );

  if (merged.length < params.fearGreed.normMinPeriods) {
    return Response.json(
      { error: "지표 계산에 필요한 최소 데이터 수가 부족합니다." },
      { status: 503 }
    );
  }

  // ──────────────────────────────────────────
  // 지표 계산 파이프라인
  // ──────────────────────────────────────────
  const kospiPrices = merged.map((r) => r.kospiClose);

  // 각 구성 요소 원시값 계산
  const momentumRaw    = calcMomentum(kospiPrices, params.fearGreed.momentumSmaPeriod);
  const vkospiRaw      = merged.map((r) => r.vkospi);
  const creditRaw      = merged.map((r) => isNaN(r.creditSpread) ? null : r.creditSpread);
  const pcRawRatios = merged.map((r) => isNaN(r.pcRatio) ? null : r.pcRatio);

  // P/C 5일 MA 직접 계산 (원시 비율에 rolling mean 적용)
  const pcRatio5dMa: (number | null)[] = pcRawRatios.map((_, i) => {
    if (i < params.fearGreed.pcRatioMaPeriod - 1) return null;
    const window = pcRawRatios.slice(
      i - params.fearGreed.pcRatioMaPeriod + 1,
      i + 1
    ).filter((v): v is number => v !== null);
    return window.length > 0
      ? window.reduce((s, v) => s + v, 0) / window.length
      : null;
  });

  const adLineRaw = calcADLine(
    merged.map((r) => isNaN(r.advancing) ? 0 : r.advancing),
    merged.map((r) => isNaN(r.declining) ? 0 : r.declining),
    params.fearGreed.adLinePeriod
  ).map((v, i) => (isNaN(merged[i].advancing) ? null : v));

  const foreignNetRaw = calcForeignNet(
    merged.map((r) => isNaN(r.foreignNet) ? 0 : r.foreignNet),
    params.fearGreed.foreignNetPeriod
  ).map((v, i) => (isNaN(merged[i].foreignNet) ? null : v));

  const marginChangeRaw = calcMarginChange(
    merged.map((r) => isNaN(r.marginBalance) ? 0 : r.marginBalance),
    params.fearGreed.marginBalancePeriod
  ).map((v, i) => (isNaN(merged[i].marginBalance) ? null : v));

  const inputs: FGInputSeries = {
    momentum:      momentumRaw,
    volatility:    vkospiRaw,
    creditSpread:  creditRaw,
    pcRatio:       pcRatio5dMa,
    adLine:        adLineRaw,
    foreignNet:    foreignNetRaw,
    marginBalance: marginChangeRaw,
  };

  const weights: FGWeights = params.fearGreed.weights;
  const normParams = {
    window:     params.fearGreed.rollingNormWindow,
    minPeriods: params.fearGreed.normMinPeriods,
    sigmaClip:  params.fearGreed.normSigmaClip,
  };

  const fgIndex = calcFearGreedIndex(inputs, weights, normParams);
  const fgMacd  = calcFGMomentum(
    fgIndex,
    params.fearGreed.fgMacdFast,
    params.fearGreed.fgMacdSlow,
    params.fearGreed.fgMacdSignal
  );

  // 정규화된 구성요소 시리즈 (components 조립용)
  const normMomentum = normalizeRollingZScore(momentumRaw,     normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normVkospi   = normalizeRollingZScore(vkospiRaw,       normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normCredit   = normalizeRollingZScore(creditRaw,       normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normPc       = normalizeRollingZScore(pcRatio5dMa,     normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normAd       = normalizeRollingZScore(adLineRaw,       normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normForeign  = normalizeRollingZScore(foreignNetRaw,   normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normMargin   = normalizeRollingZScore(marginChangeRaw, normParams.window, normParams.minPeriods, normParams.sigmaClip);

  // ──────────────────────────────────────────
  // FearGreedHistoryPoint[] 조립
  // ──────────────────────────────────────────
  const allHistory: FearGreedHistoryPoint[] = merged
    .map((row, i) => {
      const value = fgIndex[i];
      if (value === null) return null;

      return {
        date: row.date,
        value,
        regime: valueToRegime(value),
        components: extractComponentsAt(
          normMomentum, normVkospi, normCredit, normPc,
          normAd, normForeign, normMargin, i
        ),
        fgMacd:      fgMacd.macd[i],
        fgSignal:    fgMacd.signal[i],
        fgHistogram: fgMacd.histogram[i],
      } satisfies FearGreedHistoryPoint;
    })
    .filter((p): p is FearGreedHistoryPoint => p !== null);

  if (allHistory.length === 0) {
    return Response.json(
      { error: "F&G 지수 계산에 필요한 유효 데이터가 없습니다." },
      { status: 503 }
    );
  }

  // 최근 days개 슬라이스
  const history = allHistory.slice(-days);
  const latest = history[history.length - 1];
  const prevDay = history[history.length - 2];

  // 실제로 계산에 사용된 변수 목록
  const usedVariables: string[] = [];
  if (momentumRaw.some((v) => v !== null))     usedVariables.push("momentum");
  if (vkospiRaw.some((v) => v !== null))       usedVariables.push("volatility");
  if (creditRaw.some((v) => v !== null))       usedVariables.push("creditSpread");
  if (pcRatio5dMa.some((v) => v !== null))     usedVariables.push("pcRatio");
  if (adLineRaw.some((v) => v !== null))       usedVariables.push("adLine");
  if (foreignNetRaw.some((v) => v !== null))   usedVariables.push("foreignNet");
  if (marginChangeRaw.some((v) => v !== null)) usedVariables.push("marginBalance");

  const response: FearGreedKrResponse = {
    latest: {
      value:     latest.value,
      regime:    latest.regime,
      change:    prevDay ? parseFloat((latest.value - prevDay.value).toFixed(1)) : 0,
      updatedAt: new Date().toISOString(),
    },
    history,
    meta: {
      calculatedAt: new Date().toISOString(),
      windowDays:   params.fearGreed.rollingNormWindow,
      dataStartDate: history[0].date,
      dataEndDate:   latest.date,
      variables:     usedVariables,
    },
  };

  await writeCache(cacheKey, response, params.cache.historicalTTLSeconds);

  return Response.json({ ...response, source: "api" });
}
