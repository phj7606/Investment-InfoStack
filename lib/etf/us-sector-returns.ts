// 미국 테마 ETF 수익률 + RS 계산 서버 함수
// tickers_us_etf_themes.json 40개 전체 대상으로 1M/3M/12M 수익률을 계산하고
// calcEtfRs("us")에서 RS Raw를 조인하여 미국 섹터 테이블 데이터를 반환한다
//
// 서버 전용 모듈 — Route Handler에서만 import
//
// 한국 섹터(sector-returns.ts)와 동일한 데이터 흐름:
//   티커 JSON → 가격 히스토리 병렬 수집 → 수익률 계산 → RS 조인 → 캐시
//
// 한국 대비 차이점:
//   - sector_rep 필터 없음: 40개 전체 사용
//   - 심볼 변환 없음: Yahoo 심볼 그대로 사용
//   - 레이어 구분 없음: category 필드로 필터링
//   - 벤치마크: SPY (S&P 500)

import { fetchYahooHistory } from "@/lib/fetchers/yahoo";
import { calcEtfRs } from "@/lib/etf/rs";
import { readCache, writeCache } from "@/lib/cache";
import usTickers from "@/config/tickers_us_etf_themes.json";
import type { EtfRsResult } from "@/types";
import params from "@/config/params.json";

/** tickers_us_etf_themes.json 항목 타입 */
interface UsTickerEntry {
  symbol: string;
  name: string;
  category: string;
}

/** 미국 테마 ETF 수익률 + RS 지표 통합 결과 타입 */
export interface UsSectorReturn {
  symbol: string;
  name: string;
  // 카테고리 코드 (CATEGORY_LABELS 키와 매핑) — 필터 탭 기준
  category: string;
  // 수익률 (%, 소수점 2자리 반올림). null = 데이터 부족
  return1M: number | null;
  return3M: number | null;
  return12M: number | null;
  // RS 지표 (EtfDetailSheet 재활용을 위해 EtfRsResult 필드 포함)
  rsRaw: number | null;        // RS(252) 장기 — SPY 대비 추세 방향 판단
  rsRaw63: number | null;      // RS(63) 단기 — 주도 테마 정렬 기준
  rsPercentile: number | null;
  rsPercentile63: number | null;
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
 * 종가 배열에서 N거래일 전 대비 수익률(%) 계산
 * 배열은 날짜 오름차순 (마지막 원소 = 최신)
 */
function calcReturn(closes: number[], lookbackDays: number): number | null {
  if (closes.length < lookbackDays + 1) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - lookbackDays];
  // past가 0이거나 음수이면 수익률 계산 불가
  if (past == null || past <= 0) return null;
  return Math.round(((current / past) - 1) * 10000) / 100; // 소수점 2자리
}

/**
 * 티커 심볼 목록으로 간단한 djb2 해시를 생성한다.
 * tickers_us_etf_themes.json 변경 시 캐시 키가 자동 무효화된다.
 */
function tickerListHash(symbols: string[]): string {
  const str = [...symbols].sort().join(",");
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // djb2: hash * 33 XOR charCode
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // 부호 없는 32비트 정수 → 16진수 8자리
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * 미국 테마 ETF 40개의 수익률 + RS 계산
 *
 * - 수익률 기간: 1M(21거래일) / 3M(63거래일) / 12M(252거래일)
 * - RS 지표는 calcEtfRs("us") 결과에서 symbol 기준으로 조인
 * - RS null 가드: RS 캐시 완성 전에 sector 캐시가 저장되는 타이밍 버그 방지
 * - 수집 기간: 430 달력일 (실질 거래일 약 307일 — lookback 252일에 55일 여유)
 * - TTL: 하루 1회 갱신 (historicalTTLSeconds = 86400초)
 */
export async function calcUsSectorReturns(): Promise<UsSectorReturn[]> {
  const today = new Date().toISOString().slice(0, 10);
  const tickers = usTickers as UsTickerEntry[];

  // 티커 목록 해시 기반 캐시 키 — JSON 파일 변경 시 자동 무효화
  const hash = tickerListHash(tickers.map((t) => t.symbol));
  const cacheKey = `us-sector-returns-${hash}-${today}`;

  // 캐시 히트 시 즉시 반환
  const cached = await readCache<UsSectorReturn[]>(cacheKey);
  if (cached) return cached;

  // 12M(252 거래일) 수익률 계산을 위해 달력 기준 430일 수집
  // 거래일 252일 × 7/5(주말 보정) ≈ 353 달력일
  // + 미국 공휴일 여유(연 10일 × 7/5 ≈ 14) + Yahoo 데이터 결함 여유
  // → 안전 버퍼 포함 430일 (실질 거래일 약 307일 보장)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 430);

  // RS 랭킹 계산(캐시 재사용) + 전체 ETF 가격 히스토리 병렬 수집
  // Promise.allSettled: 개별 실패가 전체를 막지 않도록
  const [rsResponse, ...histResults] = await Promise.allSettled([
    calcEtfRs("us"),
    ...tickers.map((t) => fetchYahooHistory(t.symbol, startDate)),
  ]);

  // RS 랭킹 맵 구성 (symbol → EtfRsResult)
  // RS 데이터가 전혀 없으면 sector 캐시를 저장하지 않는다.
  // — RS 계산이 sector-returns보다 늦게 완료되는 타이밍 버그 방지
  const rsMap = new Map<string, EtfRsResult>();
  const rsAvailable = rsResponse.status === "fulfilled";
  if (rsAvailable) {
    for (const r of rsResponse.value.rankings) {
      rsMap.set(r.symbol, r);
    }
  }

  const results: UsSectorReturn[] = [];

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    const histResult = histResults[i];
    const rs = rsMap.get(ticker.symbol);

    // 수익률 계산 — 히스토리 수집 실패 시 null
    let return1M: number | null = null;
    let return3M: number | null = null;
    let return12M: number | null = null;

    if (histResult.status === "fulfilled" && histResult.value.length > 0) {
      const closes = histResult.value.map((b) => b.close);
      // 21 / 63 / 252 거래일 기준
      return1M  = calcReturn(closes, 21);
      return3M  = calcReturn(closes, 63);
      return12M = calcReturn(closes, params.indicators.mansfieldPeriodDays);
    }

    results.push({
      symbol:   ticker.symbol,
      name:     ticker.name,
      category: ticker.category,
      return1M,
      return3M,
      return12M,
      rsRaw:          rs?.rsRaw          ?? null,
      rsRaw63:        rs?.rsRaw63        ?? null,
      rsPercentile:   rs?.rsPercentile   ?? null,
      rsPercentile63: rs?.rsPercentile63 ?? null,
      rank:           rs?.rank           ?? 0,
      rsRawHistory:         rs?.rsRawHistory         ?? null,
      rsRawHistory63:       rs?.rsRawHistory63       ?? null,
      rsAccelerationHistory: rs?.rsAccelerationHistory ?? null,
      adx:             rs?.adx             ?? null,
      compositeSignal: rs?.compositeSignal ?? null,
      adxHistory:      rs?.adxHistory      ?? null,
    });
  }

  // RS강도(rsRaw63) 내림차순 정렬 — null은 최하위
  results.sort((a, b) => {
    const aP = a.rsRaw63 ?? -Infinity;
    const bP = b.rsRaw63 ?? -Infinity;
    return bP - aP;
  });

  // RS 데이터가 하나도 없으면 캐시 저장 금지
  // — 다음 요청 시 RS 캐시가 완성된 후 재계산하도록 함
  const hasAnyRs = results.some((r) => r.rsRaw !== null || r.rsRaw63 !== null);
  if (!rsAvailable || !hasAnyRs) {
    return results; // 캐시 저장 없이 반환
  }

  await writeCache(cacheKey, results, params.cache.historicalTTLSeconds);
  return results;
}
