// 한국 섹터 대표 ETF 수익률 + RS Percentile 계산 서버 함수
// sector_rep: true인 ETF만 대상으로 1M/3M/12M 수익률을 계산하고
// calcEtfRs("kr")에서 RS Percentile을 조인하여 섹터 테이블 데이터를 반환한다
//
// 서버 전용 모듈 — Route Handler에서만 import

import { fetchYahooHistory, toYahooKrSymbol, type YahooHistoricalBar } from "@/lib/fetchers/yahoo";
import { fetchNaverStockHistory } from "@/lib/fetchers/krx";
import { calcEtfRs } from "@/lib/etf/rs";
import { readCache, writeCache } from "@/lib/cache";
import krTickers from "@/config/tickers_kr_etf.json";
import type { EtfRsResult } from "@/types";
import params from "@/config/params.json";

/** tickers JSON의 섹터 대표 ETF 항목 타입 */
interface SectorRepEntry {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  sector_group: string;
  sector_layer: "layer1" | "layer2" | "index";
  sector_rep: true;
}

/** 섹터별 수익률 + RS 지표 통합 결과 타입 */
export interface KrSectorReturn {
  sectorGroup: string;
  sectorLayer: "layer1" | "layer2" | "index";
  symbol: string;
  name: string;
  exchange: "KS" | "KQ";
  category: string;
  // 수익률 (%, 소수점 2자리 반올림). null = 데이터 부족
  return1M: number | null;
  return3M: number | null;
  return12M: number | null;
  // RS 지표 (EtfDetailSheet 재활용을 위해 EtfRsResult 필드 포함)
  rsPercentile: number | null;
  rsPercentile63: number | null;
  rsRaw: number | null;
  rsRaw63: number | null;
  rank: number;
  rsRawHistory: EtfRsResult["rsRawHistory"];
  rsRawHistory63: EtfRsResult["rsRawHistory63"];
  rsAccelerationHistory: EtfRsResult["rsAccelerationHistory"];
  // ADX 필드 — calcEtfRs 결과에서 조인 (EtfDetailSheet ADX 차트용)
  adx: EtfRsResult["adx"];
  compositeSignal: EtfRsResult["compositeSignal"];
  adxHistory: EtfRsResult["adxHistory"];
}

/**
 * 종가 배열에서 N일 전 대비 수익률(%) 계산
 * 배열은 날짜 오름차순 (마지막 원소 = 최신)
 */
function calcReturn(closes: number[], lookbackDays: number): number | null {
  if (closes.length < lookbackDays + 1) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - lookbackDays];
  if (!past || past === 0) return null;
  return Math.round(((current / past) - 1) * 10000) / 100; // 소수점 2자리
}

/**
 * 한국 섹터 대표 ETF의 수익률 + RS Percentile 계산
 *
 * - sector_rep: true 인 ETF만 대상 (현재 11종)
 * - 수익률 기간: 1M(21일) / 3M(63일) / 12M(252일)
 * - RS 지표는 calcEtfRs("kr") 결과에서 symbol 기준으로 조인
 * - TTL: 하루 1회 갱신 (historicalTTLSeconds)
 */
/**
 * ETF 가격 히스토리 수집 — Yahoo Finance 우선, 실패 시 Naver Finance fallback
 * Yahoo Finance가 차단되거나 특정 ETF 심볼을 인식하지 못하는 경우를 대비
 * NaverStockHistoryBar와 YahooHistoricalBar는 필드 구조가 동일하므로 호환 가능
 */
async function fetchEtfHistory(
  symbol: string,      // KRX 6자리 종목코드
  exchange: "KS" | "KQ",
  startDate: Date
): Promise<YahooHistoricalBar[]> {
  const startIso = startDate.toISOString().slice(0, 10);
  const endIso = new Date().toISOString().slice(0, 10);

  // 1. Yahoo Finance 우선 시도
  try {
    const bars = await fetchYahooHistory(toYahooKrSymbol(symbol, exchange), startDate);
    if (bars.length > 0) return bars;
  } catch {
    // Yahoo 실패 시 무시하고 Naver로 진행
  }

  // 2. Naver Finance fchart fallback — Yahoo 차단/무응답 시 대체
  // fetchNaverStockHistory 내부에서 EUC-KR 디코딩 + Yahoo 이중 fallback 처리
  try {
    const result = await fetchNaverStockHistory(symbol, startIso, endIso);
    if (result.bars.length > 0) {
      console.log(`[sector-returns] Naver fallback 성공: ${symbol} (${result.bars.length}건)`);
      return result.bars;
    }
  } catch (err) {
    console.warn(`[sector-returns] Naver fallback 실패: ${symbol}`, err);
  }

  return [];
}

/** sector_rep 심볼 목록으로 간단한 djb2 해시를 생성한다 (캐시 자동 무효화용) */
function sectorRepHash(symbols: string[]): string {
  const str = [...symbols].sort().join(",");
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export async function calcKrSectorReturns(): Promise<KrSectorReturn[]> {
  const today = new Date().toISOString().slice(0, 10);

  // sector_rep: true이고 sector_layer가 있는 ETF만 대상
  const repTickers = (krTickers as unknown[]).filter(
    (t): t is SectorRepEntry => {
      if (typeof t !== "object" || t === null) return false;
      const e = t as Record<string, unknown>;
      return (
        e.sector_rep === true &&
        typeof e.sector_group === "string" &&
        (e.sector_layer === "layer1" || e.sector_layer === "layer2" || e.sector_layer === "index")
      );
    }
  );

  // sector_rep 심볼 목록 해시 기반 캐시 키 — tickers_kr_etf.json 변경 시 자동 무효화
  const hash = sectorRepHash(repTickers.map((t) => t.symbol));
  const cacheKey = `kr-sector-returns-${hash}-${today}`;

  // 캐시 히트 시 즉시 반환
  const cached = await readCache<KrSectorReturn[]>(cacheKey);
  if (cached) return cached;

  // 12M(252 거래일) 수익률 계산을 위해 달력 기준 430일 수집
  // 거래일 252일 × 7/5(주말 보정) ≈ 353 달력일
  // + 공휴일 여유(연 15일 × 7/5 ≈ 21) + Yahoo 데이터 결함 여유 = 약 400일
  // → 안전 버퍼 30일 추가하여 430일 (실질 거래일 약 307일 보장, lookback 252일에 55일 여유)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 430);

  // RS 랭킹 계산 (캐시 재사용) + 대표 ETF 가격 히스토리 병렬 수집
  // fetchEtfHistory: Yahoo Finance 우선, 실패 시 Naver Finance fallback
  const [rsResponse, ...histResults] = await Promise.allSettled([
    calcEtfRs("kr"),
    ...repTickers.map((t) =>
      fetchEtfHistory(
        t.symbol,
        (t.exchange ?? "KS") as "KS" | "KQ",
        startDate
      )
    ),
  ]);

  // RS 랭킹 맵 구성 (symbol → EtfRsResult)
  // RS 랭킹 맵 구성 (symbol → EtfRsResult)
  // RS 데이터가 전혀 없으면 sector-returns 캐시를 저장하지 않는다.
  // (RS 계산이 sector-returns보다 늦게 완료되는 타이밍 버그 방지)
  const rsMap = new Map<string, EtfRsResult>();
  const rsAvailable = rsResponse.status === "fulfilled";
  if (rsAvailable) {
    for (const r of rsResponse.value.rankings) {
      rsMap.set(r.symbol, r);
    }
  }

  const results: KrSectorReturn[] = [];

  for (let i = 0; i < repTickers.length; i++) {
    const ticker = repTickers[i];
    const histResult = histResults[i];
    const rs = rsMap.get(ticker.symbol);

    // 수익률 계산 — 히스토리 수집 실패 시 null
    let return1M: number | null = null;
    let return3M: number | null = null;
    let return12M: number | null = null;

    if (histResult.status === "fulfilled" && histResult.value.length > 0) {
      const closes = histResult.value.map((b) => b.close);
      // 21 / 63 / 252 거래일 기준
      return1M = calcReturn(closes, 21);
      return3M = calcReturn(closes, 63);
      return12M = calcReturn(closes, params.indicators.mansfieldPeriodDays);
    }

    results.push({
      sectorGroup: ticker.sector_group,
      sectorLayer: ticker.sector_layer,
      symbol: ticker.symbol,
      name: ticker.name,
      exchange: (ticker.exchange ?? "KS") as "KS" | "KQ",
      category: ticker.category,
      return1M,
      return3M,
      return12M,
      rsPercentile: rs?.rsPercentile ?? null,
      rsPercentile63: rs?.rsPercentile63 ?? null,
      rsRaw: rs?.rsRaw ?? null,
      rsRaw63: rs?.rsRaw63 ?? null,
      rank: rs?.rank ?? 0,
      rsRawHistory: rs?.rsRawHistory ?? null,
      rsRawHistory63: rs?.rsRawHistory63 ?? null,
      rsAccelerationHistory: rs?.rsAccelerationHistory ?? null,
      // ADX 필드 조인 — calcEtfRs 캐시에서 이미 계산된 값을 그대로 전달
      adx: rs?.adx ?? null,
      compositeSignal: rs?.compositeSignal ?? null,
      adxHistory: rs?.adxHistory ?? null,
    });
  }

  // RS강도(rsRaw63) 기준 내림차순 정렬 — 지수 ETF는 최하단 고정
  // index 레이어는 벤치마크 확인용이므로 섹터 정렬에서 분리
  results.sort((a, b) => {
    const aIsIndex = a.sectorLayer === "index";
    const bIsIndex = b.sectorLayer === "index";
    if (aIsIndex !== bIsIndex) return aIsIndex ? 1 : -1; // 지수는 항상 뒤
    const aP = a.rsRaw63 ?? -Infinity;
    const bP = b.rsRaw63 ?? -Infinity;
    return bP - aP;
  });

  // RS 데이터가 하나도 없는 상태로는 캐시 저장 금지
  // — 다음 요청 시 RS 캐시가 완성된 후 재계산하도록 함
  const hasAnyRs = results.some(r => r.rsRaw !== null || r.rsRaw63 !== null);
  if (!rsAvailable || !hasAnyRs) {
    return results; // 캐시 저장 없이 반환 (다음 요청에서 재계산)
  }

  await writeCache(cacheKey, results, params.cache.historicalTTLSeconds);
  return results;
}
