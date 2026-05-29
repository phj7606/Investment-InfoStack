/**
 * GET /api/portfolio/performance
 *
 * 포트폴리오 성과 분석 API
 *
 * 데이터 구조:
 * - Jan~Apr 2026: data/performance-bootstrap.json (엑셀에서 1회 추출한 고정 스냅샷)
 * - May 2026+:    longterm-transactions.json 기반 동적 계산 (positions + Yahoo/Naver 월말종가)
 * - 연도 자동 확장: getMonthsFrom("2026-05")가 현재 날짜까지 자동으로 월 목록 생성
 *
 * 벤치마크:
 * - KR: KOSPI (^KS11)
 * - US: S&P500 (^GSPC), NASDAQ (^IXIC)
 *
 * 쿼리 파라미터:
 *   refresh=1 → 24h 캐시 무시, 강제 재조회
 *
 * 캐시: 24h JSON 파일 캐시 (data/cache/portfolio-performance.json)
 */

import { NextRequest, NextResponse } from "next/server";
import { readCache, writeCache, readStaleCache } from "@/lib/cache";
import { readKey } from "@/lib/db";
import { fetchAllBenchmarks } from "@/lib/portfolio/performance-benchmark";
import { readTransactions } from "@/lib/portfolio/longterm-store";
import { calcPositions, enrichTransactionsFromHistory } from "@/lib/portfolio/longterm-calc";
import { fetchYahooHistory } from "@/lib/fetchers/yahoo";
import { getLockedPrices } from "@/lib/portfolio/locked-price-store";
import { getLongtermCurrentPrices } from "@/lib/portfolio/current-price-service";
import type {
  PortfolioPerformanceResponse,
  PerformanceMonthPoint,
  StockMonthPerformance,
  LongtermTransaction,
} from "@/types/portfolio";
import type { ExcelPerformanceData } from "@/lib/portfolio/performance-excel";

const CACHE_KEY = "portfolio-performance";

// ─────────────────────────────────────────
// Bootstrap 데이터 (Jan~Apr 2026 고정 스냅샷)
// ─────────────────────────────────────────

/**
 * Jan~Apr 2026 성과 데이터를 Supabase DB에서 읽는다.
 *
 * 배경:
 * - Jan~Apr 2026에 매도 완료된 종목들은 거래내역에 없으므로 동적 계산이 불가능하다.
 * - 엑셀에서 1회 추출한 고정 스냅샷을 사용하여 런타임 엑셀 의존성을 완전히 제거한다.
 * - bootstrap 데이터는 잘 변경되지 않음 — May 2026 이후는 거래내역으로 계산한다.
 *
 * DB에 데이터 없으면 빈 구조 반환 (May+ 계산은 영향 없음).
 */
async function readBootstrap(): Promise<ExcelPerformanceData> {
  const empty: ExcelPerformanceData = {
    krMonths: [], krByAccount: {}, usMonths: [], usByAccount: {},
    krStocks: [], usStocks: [],
    krDecBalance: 0, usDecBalance: 0,
    krDecByAccount: {}, usDecByAccount: {},
  };
  const data = await readKey<ExcelPerformanceData | null>("performance_bootstrap", null);
  if (!data) {
    console.warn("[performance] bootstrap 데이터 없음 — Jan~Apr 2026 데이터 미포함");
    return empty;
  }
  return data;
}

/**
 * 캐시 TTL 전략:
 * - 과거 완료 월(Jan~Apr 엑셀 + 이전 월 Historical)만 있으면 24h 캐시
 * - 현재 진행 중인 월이 포함된 경우 → 포지션 탭과 동일한 5분 캐시
 *   (현재 월 balance는 Naver 현재가 기반이므로 오래 캐시하면 포지션 탭과 괴리 발생)
 */
const CACHE_TTL_HISTORICAL = 24 * 60 * 60; // 24h — 과거 확정 월만 있을 때
const CACHE_TTL_LIVE = 30 * 60;            // 30min — 현재 월 진행 중 (5min → 30min: 잦은 외부 API 실패 방지)

// ─────────────────────────────────────────
// May+ 동적 계산 헬퍼
// ─────────────────────────────────────────

/** KR 6자리 코드 → Yahoo Finance ".KS" 심볼 */
function toYahooKR(stockCode: string): string {
  return `${stockCode}.KS`;
}

/** 특정 월의 마지막 영업일 종가 조회 */
async function fetchMonthEndPrice(
  yahooSymbol: string,
  period: string
): Promise<number | null> {
  const startDate = `${period}-01`;
  const [year, month] = period.split("-").map(Number);
  const nextMonth = month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, "0")}`;
  const endDate = `${nextMonth}-05`;

  try {
    const bars = await fetchYahooHistory(yahooSymbol, startDate, endDate);
    const monthBars = bars.filter((b) => b.date.startsWith(period));
    return monthBars.length > 0 ? monthBars[monthBars.length - 1].close : null;
  } catch {
    return null;
  }
}

/** 처리할 월 목록 생성 (2026-05 ~ 현재 월) */
function getMonthsFrom(startPeriod: string): string[] {
  const today = new Date();
  const currentPeriod = today.toISOString().slice(0, 7);
  const months: string[] = [];
  let cursor = startPeriod;

  while (cursor <= currentPeriod) {
    months.push(cursor);
    const [y, m] = cursor.split("-").map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    cursor = `${nextY}-${String(nextM).padStart(2, "0")}`;
  }

  return months;
}

/**
 * 특정 통화 + 계좌 기준 May+ 월별 성과 동적 계산
 *
 * @param currency      - "KRW" | "USD"
 * @param accountNo     - 계좌번호 필터 (undefined = 전체)
 * @param prevBalance   - 이전 월말 잔고 (May 계산 기준 = Apr 엑셀 잔고)
 * @param allTxs        - 전체 거래 내역
 * @param currentPrices - 현재 월 현재가 맵 (longterm/prices와 공유 캐시에서 사전 조회)
 */
async function calcMayOnwards(
  currency: "KRW" | "USD",
  accountNo: string | undefined,
  prevBalance: number,
  allTxs: LongtermTransaction[],
  currentPrices: Record<string, number> = {}
): Promise<PerformanceMonthPoint[]> {
  const months = getMonthsFrom("2026-05");

  // 통화 + 계좌 필터
  const filteredTxs = allTxs.filter(
    (t) =>
      t.currency === currency &&
      (accountNo === undefined || t.accountNo === accountNo)
  );

  const result: PerformanceMonthPoint[] = [];
  let runningPrevBalance = prevBalance;

  for (const period of months) {
    const monthTxs = filteredTxs.filter((t) => t.date.startsWith(period));
    const buyTxs   = monthTxs.filter((t) => t.tradeType === "BUY");
    const sellTxs  = monthTxs.filter((t) => t.tradeType === "SELL");

    const newBid = buyTxs.reduce((sum, t) => sum + t.amount, 0);
    const askBV  = sellTxs.reduce((sum, t) => {
      const avgCost = t.avgCostAtSell ?? t.price;
      return sum + avgCost * t.quantity;
    }, 0);
    const fixedPL = sellTxs.reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);

    // 해당 월 말 기준 보유 포지션
    const txsUpToMonth = filteredTxs.filter((t) => t.date <= `${period}-31`);
    const positions = calcPositions(txsUpToMonth);

    // ── 보유 종목 가격 조회 ──
    // 우선순위:
    //   1. 현재 진행 중인 달(KRW) → Naver Finance 현재가
    //   2. 완료된 과거 달 → FS 확정 종가(lock-balances 저장값) 우선
    //   3. FS 확정 없는 완료 달 → Yahoo Finance 월말 종가 (fallback)
    // FS 확정값 사용 이유: FS 수치와 Performance 수치의 일관성 보장
    //   (Yahoo Historical은 수정주가 반영 등으로 재조회 시 값이 달라질 수 있음)
    const currentPeriod = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    let priceMap: Record<string, number> = {};

    if (period === currentPeriod) {
      // 현재 월: GET 핸들러에서 사전 조회한 currentPrices 사용 (longterm/prices와 동일 캐시)
      priceMap = currentPrices;
    } else {
      // 완료된 과거 달: FS 확정 종가 우선, 없으면 Yahoo Historical fallback
      const lockedPrices = await getLockedPrices(period, currency);
      if (lockedPrices) {
        priceMap = lockedPrices;
      } else {
        const priceEntries = await Promise.all(
          positions.map(async (pos) => {
            const symbol = currency === "KRW"
              ? toYahooKR(pos.stockCode)
              : pos.stockCode;
            const price = await fetchMonthEndPrice(symbol, period);
            return [pos.stockCode, price] as [string, number | null];
          })
        );
        for (const [code, price] of priceEntries) {
          if (price != null) priceMap[code] = price;
        }
      }
    }

    // 당월잔고: 현재가 × 수량 (현재가 조회 실패 시 avgCost 폴백 — 경고 로그)
    const balance = positions.reduce((sum, pos) => {
      const price = priceMap[pos.stockCode];
      if (price == null) {
        // 가격 조회 실패 → avgCost 대체: avgCost가 크게 낮은 종목은 balance가 과소계산됨
        console.warn(
          `[performance] 가격 조회 실패 → avgCost 폴백: ${pos.stockCode}(${pos.stockName}) ` +
          `avgCost=${pos.avgCost.toLocaleString()} qty=${pos.quantity} ` +
          `(period=${period} currency=${currency} account=${accountNo ?? "all"})`
        );
        return sum + pos.avgCost * pos.quantity;
      }
      return sum + price * pos.quantity;
    }, 0);

    // 잔여원금
    const principal = positions.reduce(
      (sum, pos) => sum + pos.avgCost * pos.quantity,
      0
    );

    const tax = 0;

    // 데이터 없는 달 건너뜀
    if (balance === 0 && fixedPL === 0 && newBid === 0) continue;

    // MoM% 계산
    const denomMoM = runningPrevBalance + newBid;
    const momPct = denomMoM > 0
      ? ((balance - tax - (runningPrevBalance + newBid - askBV) + fixedPL) / denomMoM) * 100
      : 0;

    // 누적 계산 (May 이후 모든 실현손익·매도장부가 합산)
    const totalFixedPL = filteredTxs
      .filter((t) => t.tradeType === "SELL" && t.date <= `${period}-31`)
      .reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);
    const totalAskBV = filteredTxs
      .filter((t) => t.tradeType === "SELL" && t.date <= `${period}-31`)
      .reduce((sum, t) => {
        const avgCost = t.avgCostAtSell ?? t.price;
        return sum + avgCost * t.quantity;
      }, 0);

    const cumPL = balance - principal + totalFixedPL - tax;
    const denomCum = principal + totalAskBV;
    const cumPct = denomCum > 0 ? (cumPL / denomCum) * 100 : 0;

    result.push({
      period,
      balance:  Math.round(balance),
      momPct:   Math.round(momPct * 100) / 100,
      cumPL:    Math.round(cumPL),
      cumPct:   Math.round(cumPct * 100) / 100,
      source:   "api",
    });

    runningPrevBalance = balance > 0 ? balance : runningPrevBalance;
  }

  return result;
}

// ─────────────────────────────────────────
// 종목별 May+ 성과 동적 계산
// ─────────────────────────────────────────

/**
 * May 2026 이후 종목별 MoM% 동적 계산 후 엑셀 데이터에 병합
 *
 * 가격 조회 전략:
 *   - 현재 진행 중인 월 → GET 핸들러 사전 조회 currentPrices 사용 (longterm/prices와 동일 캐시)
 *   - 완료된 과거 월   → FS 확정 종가 우선, 없으면 Yahoo Historical fallback
 *
 * 결과 병합:
 *   - excelStocks에 있는 종목: Jan~Apr(엑셀) + May+(API) 이어 붙이기
 *   - excelStocks에 없는 종목: May+ 데이터만으로 신규 항목 생성 (May 신규 매수)
 *
 * @param currency      - "KRW" | "USD"
 * @param allTxs        - 전체 거래 내역
 * @param excelStocks   - 엑셀에서 파싱된 Jan~Apr 종목별 성과
 * @param currentPrices - 현재 월 현재가 맵 (longterm/prices와 공유 캐시에서 사전 조회)
 */
async function calcStocksMayOnwards(
  currency: "KRW" | "USD",
  allTxs: LongtermTransaction[],
  excelStocks: StockMonthPerformance[],
  currentPrices: Record<string, number> = {}
): Promise<StockMonthPerformance[]> {
  const months = getMonthsFrom("2026-05");
  const currentPeriod = new Date().toISOString().slice(0, 7);

  // 통화 필터 (모든 계좌 포함)
  const filteredTxs = allTxs.filter((t) => t.currency === currency);

  // ── 1. 월별 가격 맵 사전 구축 ──
  // 각 월의 전체 포지션 현재가를 배치 조회하여 월→종목코드→가격 맵 생성
  // 배치 방식으로 Naver/Yahoo API를 종목별이 아닌 전체 1회 호출
  const monthPriceMaps = new Map<string, Record<string, number>>();

  for (const period of months) {
    const txsUpToMonth = filteredTxs.filter((t) => t.date <= `${period}-31`);
    const positions = calcPositions(txsUpToMonth);

    // FUND 타입은 가격 조회 불가 → 제외
    const priceablePositions = positions.filter((p) => p.assetType !== "FUND");
    let priceMap: Record<string, number> = {};

    if (period === currentPeriod) {
      // 현재 월: GET 핸들러에서 사전 조회한 currentPrices 사용 (longterm/prices와 동일 캐시)
      priceMap = currentPrices;
    } else {
      // 완료된 과거 달: FS 확정 종가 우선, 없으면 Yahoo Historical fallback
      // FS 확정값 = 사용자가 월말 직접 검토·확정한 유일한 기준 → FS와 성과 수치 일관성 보장
      const lockedPrices = await getLockedPrices(period, currency);
      if (lockedPrices) {
        priceMap = lockedPrices;
      } else {
        const entries = await Promise.all(
          priceablePositions.map(async (pos) => {
            const symbol = currency === "KRW"
              ? toYahooKR(pos.stockCode)
              : pos.stockCode;
            const price = await fetchMonthEndPrice(symbol, period);
            return [pos.stockCode, price] as [string, number | null];
          })
        );
        for (const [code, price] of entries) {
          if (price != null) priceMap[code] = price;
        }
      }
    }

    monthPriceMaps.set(period, priceMap);
  }

  // ── 2. 고유 (stockCode, accountNo) 조합 수집 ──
  const stockKeys = new Map<
    string,
    { stockCode: string; stockName: string; accountNo: string }
  >();
  for (const tx of filteredTxs) {
    const key = `${tx.stockCode}::${tx.accountNo}`;
    if (!stockKeys.has(key)) {
      stockKeys.set(key, {
        stockCode: tx.stockCode,
        stockName: tx.stockName,
        accountNo: tx.accountNo,
      });
    }
  }

  // ── 3. 종목별 월별 성과 계산 ──
  const stockResultsMap = new Map<string, PerformanceMonthPoint[]>();

  for (const [key, { stockCode, accountNo }] of stockKeys) {
    // 이 종목+계좌의 거래만 필터 (날짜 무관, 전체 이력)
    const stockTxs = filteredTxs.filter(
      (t) => t.stockCode === stockCode && t.accountNo === accountNo
    );

    // Excel Apr 잔고 → May MoM% 계산의 전월잔고 기준
    // 1차: ticker+accountNo 정확 매칭
    // 2차 폴백: stockName+accountNo 매칭 (엑셀 ticker 오타 시 대응)
    const stockInfo = stockKeys.get(key);
    const excelStock =
      excelStocks.find((s) => s.ticker === stockCode && s.accountNo === accountNo) ??
      excelStocks.find(
        (s) => s.stockName === stockInfo?.stockName && s.accountNo === accountNo
      );
    let prevBalance = excelStock?.months.at(-1)?.balance ?? 0;

    const monthPoints: PerformanceMonthPoint[] = [];

    for (const period of months) {
      const priceMap = monthPriceMaps.get(period) ?? {};

      const monthTxs = stockTxs.filter((t) => t.date.startsWith(period));
      const buyTxs   = monthTxs.filter((t) => t.tradeType === "BUY");
      const sellTxs  = monthTxs.filter((t) => t.tradeType === "SELL");

      const newBid  = buyTxs.reduce((sum, t) => sum + t.amount, 0);
      const askBV   = sellTxs.reduce((sum, t) => {
        const avgCost = t.avgCostAtSell ?? t.price;
        return sum + avgCost * t.quantity;
      }, 0);
      const fixedPL = sellTxs.reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);

      // 해당 월 말 포지션 — 이 종목+계좌 거래만 사용하므로 결과는 단일 항목
      const txsUpToMonth = stockTxs.filter((t) => t.date <= `${period}-31`);
      const position = calcPositions(txsUpToMonth).find(
        (p) => p.stockCode === stockCode && p.accountNo === accountNo
      );

      const qty   = position?.quantity ?? 0;
      // 가격: 배치 조회된 priceMap 우선, 없으면 avgCost 폴백 (경고 로그)
      const rawPrice = priceMap[stockCode];
      if (rawPrice == null && qty > 0) {
        console.warn(
          `[performance/stocks] 가격 조회 실패 → avgCost 폴백: ` +
          `${stockCode}(${accountNo}) qty=${qty} avgCost=${position?.avgCost} period=${period}`
        );
      }
      const price = rawPrice ?? position?.avgCost ?? 0;
      const balance = qty * price;

      // 포지션 없고 거래도 없는 월 → 건너뜀 (전량 매도 이후 빈 월)
      if (balance === 0 && fixedPL === 0 && newBid === 0 && prevBalance === 0) continue;

      // MoM% = (당월잔고 - (전월잔고 + 신규매수 - 매도장부가) + 실현손익) / (전월잔고 + 신규매수)
      const denomMoM = prevBalance + newBid;
      const momPct = denomMoM > 0
        ? ((balance - (prevBalance + newBid - askBV) + fixedPL) / denomMoM) * 100
        : 0;

      // 누적 성과 — avgCost는 전체 이력(pre-May BUY 포함) 기반 정확값
      // totalFixedPL, totalAskBV는 May+ 거래 기반 (Jan-Apr SELL이 JSON에서 제거됨)
      const principal = qty * (position?.avgCost ?? 0);
      const totalFixedPL = stockTxs
        .filter((t) => t.tradeType === "SELL" && t.date <= `${period}-31`)
        .reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);
      const totalAskBV = stockTxs
        .filter((t) => t.tradeType === "SELL" && t.date <= `${period}-31`)
        .reduce((sum, t) => {
          const avgCost = t.avgCostAtSell ?? t.price;
          return sum + avgCost * t.quantity;
        }, 0);

      const cumPL    = balance - principal + totalFixedPL;
      const denomCum = principal + totalAskBV;
      const cumPct   = denomCum > 0 ? (cumPL / denomCum) * 100 : 0;

      monthPoints.push({
        period,
        balance: Math.round(balance),
        momPct:  Math.round(momPct * 100) / 100,
        cumPL:   Math.round(cumPL),
        cumPct:  Math.round(cumPct * 100) / 100,
        source:  "api",
      });

      prevBalance = balance > 0 ? balance : prevBalance;
    }

    if (monthPoints.length > 0) {
      stockResultsMap.set(key, monthPoints);
    }
  }

  // ── 4. Excel 종목에 May+ 데이터 병합 ──
  // Excel ticker와 JSON stockCode가 다를 수 있으므로 (예: 005939 vs 005930 오타)
  // stockName+accountNo 폴백 매칭도 함께 시도
  const result: StockMonthPerformance[] = excelStocks.map((stock) => {
    // 1차: ticker+accountNo 정확 매칭
    let mayMonths = stockResultsMap.get(`${stock.ticker}::${stock.accountNo}`) ?? [];

    // 2차 폴백: stockName+accountNo 매칭 (Excel ticker 오타 방어)
    if (mayMonths.length === 0) {
      for (const [k, months] of stockResultsMap) {
        const [, acct] = k.split("::");
        const info = stockKeys.get(k);
        if (info?.stockName === stock.stockName && acct === stock.accountNo) {
          mayMonths = months;
          break;
        }
      }
    }

    if (mayMonths.length === 0) {
      // May+ 거래 없음 → Excel 데이터만 (전량 매도 완료 종목)
      return stock;
    }

    // May+ 마지막 달 잔고가 0이면 전량 매도 완료
    const lastMonth = mayMonths[mayMonths.length - 1];
    return {
      ...stock,
      months:      [...stock.months, ...mayMonths],
      fullyExited: lastMonth.balance === 0,
    };
  });

  // ── 5. Excel에 없는 신규 종목 추가 (May 이후 신규 매수) ──
  // ticker 오타로 이미 폴백 매칭된 종목은 중복 추가 방지를 위해 stockName으로도 체크
  for (const [key, { stockCode, stockName, accountNo }] of stockKeys) {
    const inExcel = excelStocks.some(
      (s) =>
        (s.ticker === stockCode || s.stockName === stockName) &&
        s.accountNo === accountNo
    );
    if (!inExcel) {
      const mayMonths = stockResultsMap.get(key) ?? [];
      if (mayMonths.length > 0) {
        const lastMonth = mayMonths[mayMonths.length - 1];
        result.push({
          stockName,
          ticker:      stockCode,
          market:      currency === "KRW" ? "KR" : "US",
          accountNo,
          months:      mayMonths,
          fullyExited: lastMonth.balance === 0,
        });
      }
    }
  }

  console.log(
    `[performance/stocks] ${currency} May+ 종목 성과 계산 완료: ` +
    `${stockResultsMap.size}개 종목 / ${months.length}개 월`
  );

  return result;
}

// ─────────────────────────────────────────
// TWR 체인링크 유틸
// ─────────────────────────────────────────

/**
 * 월별 momPct를 체인링크하여 TWR 기반 cumPct 재계산
 *
 * 기존 cumPct(단순 ROI: cumPL / denomCum)를 Time-Weighted Return으로 교체.
 * 신규 매수·매도 타이밍에 의한 왜곡을 제거하여 벤치마크와 공정 비교 가능.
 *
 * 공식: cumTWR_t = (1 + r1/100)(1 + r2/100)...(1 + rt/100) - 1
 *   - Dec 2025 = 기준점 0%
 *   - 각 momPct는 이미 Modified Dietz로 계산된 올바른 단기 TWR 근사값
 */
function rechainCumPct(months: PerformanceMonthPoint[]): PerformanceMonthPoint[] {
  let product = 1.0;
  return months.map((m) => {
    product *= (1 + m.momPct / 100);
    return {
      ...m,
      cumPct: Math.round((product - 1) * 10000) / 100,
    };
  });
}

// ─────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get("refresh") === "1";

    if (!forceRefresh) {
      const cached = await readCache<PortfolioPerformanceResponse>(CACHE_KEY);
      if (cached) return NextResponse.json(cached);
    }

    // ── 1. Bootstrap 데이터 읽기 (Jan~Apr 2026 고정 스냅샷) ──
    const excelData = await readBootstrap();

    // stored realizedPL/avgCostAtSell가 stale해도 월별 성과 지표 정확성 보장
    const allTxs = enrichTransactionsFromHistory(await readTransactions());

    // ── 2. Apr 잔고 → May+ 전월잔고 기준 결정 ──
    const krAprBalance = excelData.krMonths.at(-1)?.balance ?? excelData.krDecBalance;
    const usAprBalance = excelData.usMonths.at(-1)?.balance ?? excelData.usDecBalance;

    // 계좌별 Apr 잔고 (May+ 계좌별 계산 기준)
    const krAccountNos = Object.keys(excelData.krByAccount);
    const usAccountNos = Object.keys(excelData.usByAccount);

    // ── 2.5. 현재 월 현재가 사전 조회 (longterm/prices 탭과 동일 캐시 공유) ──
    // calcMayOnwards / calcStocksMayOnwards 안에서 각자 조회하면 병렬 실행 시
    // 캐시 미스가 여러 번 겹쳐 Naver/Yahoo API가 중복 호출됨 → 여기서 1회 선점
    const currentPeriodForFetch = new Date().toISOString().slice(0, 7);
    const allCurrentPositions = calcPositions(
      allTxs.filter((t) => t.date <= `${currentPeriodForFetch}-31`)
    );
    const krStocksForPrices = allCurrentPositions
      .filter((p) => p.market === "KR" && p.assetType !== "FUND")
      .map((p) => ({ code: p.stockCode, name: p.stockName }));
    const usSymbolsForPrices = allCurrentPositions
      .filter((p) => p.market === "US")
      .map((p) => p.stockCode);
    const currentPrices = await getLongtermCurrentPrices(krStocksForPrices, usSymbolsForPrices);

    // ── 3. 벤치마크 + May+ 전체/계좌별/종목별 병렬 계산 ──
    const [
      benchmarks,
      krMayMonths,
      usMayMonths,
      krMayStocks,
      usMayStocks,
      ...accountMayResults
    ] = await Promise.all([
      fetchAllBenchmarks("2026-01"),
      calcMayOnwards("KRW", undefined, krAprBalance, allTxs, currentPrices),
      calcMayOnwards("USD", undefined, usAprBalance, allTxs, currentPrices),
      // 종목별 May+ 성과 (Jan~Apr 엑셀 데이터에 이어 붙임)
      calcStocksMayOnwards("KRW", allTxs, excelData.krStocks, currentPrices),
      calcStocksMayOnwards("USD", allTxs, excelData.usStocks, currentPrices),
      // KR 계좌별
      ...krAccountNos.map((acct) => {
        const aprBal = excelData.krByAccount[acct]?.at(-1)?.balance
          ?? excelData.krDecByAccount[acct]
          ?? 0;
        return calcMayOnwards("KRW", acct, aprBal, allTxs, currentPrices)
          .then((months) => ({ type: "kr" as const, acct, months }));
      }),
      // US 계좌별
      ...usAccountNos.map((acct) => {
        const aprBal = excelData.usByAccount[acct]?.at(-1)?.balance
          ?? excelData.usDecByAccount[acct]
          ?? 0;
        return calcMayOnwards("USD", acct, aprBal, allTxs, currentPrices)
          .then((months) => ({ type: "us" as const, acct, months }));
      }),
    ]);

    // ── 4. 계좌별 데이터 병합 ──
    const krByAccount: Record<string, PerformanceMonthPoint[]> = {};
    const usByAccount: Record<string, PerformanceMonthPoint[]> = {};

    for (const item of accountMayResults as Array<{ type: "kr" | "us"; acct: string; months: PerformanceMonthPoint[] }>) {
      if (item.type === "kr") {
        krByAccount[item.acct] = [
          ...(excelData.krByAccount[item.acct] ?? []),
          ...item.months,
        ];
      } else {
        usByAccount[item.acct] = [
          ...(excelData.usByAccount[item.acct] ?? []),
          ...item.months,
        ];
      }
    }

    // May+가 없는 계좌도 엑셀 데이터만으로 포함
    for (const acct of krAccountNos) {
      if (!krByAccount[acct]) {
        krByAccount[acct] = excelData.krByAccount[acct] ?? [];
      }
    }
    for (const acct of usAccountNos) {
      if (!usByAccount[acct]) {
        usByAccount[acct] = excelData.usByAccount[acct] ?? [];
      }
    }

    // ── 5. 최종 응답 조립 ──
    // 모든 months 배열에 rechainCumPct 적용:
    //   - 단순 ROI(cumPL/denomCum) → Time-Weighted Return 체인링크로 교체
    //   - 포트폴리오 전체 / 계좌별 / 종목별 모두 동일 기준 적용
    const krMonthsChained   = rechainCumPct([...excelData.krMonths, ...krMayMonths]);
    const usMonthsChained   = rechainCumPct([...excelData.usMonths, ...usMayMonths]);
    const krByAccountChained = Object.fromEntries(
      Object.entries(krByAccount).map(([k, v]) => [k, rechainCumPct(v)])
    );
    const usByAccountChained = Object.fromEntries(
      Object.entries(usByAccount).map(([k, v]) => [k, rechainCumPct(v)])
    );
    const krStocksChained = (krMayStocks as StockMonthPerformance[]).map((s) => ({
      ...s,
      months: rechainCumPct(s.months),
    }));
    const usStocksChained = (usMayStocks as StockMonthPerformance[]).map((s) => ({
      ...s,
      months: rechainCumPct(s.months),
    }));

    const response: PortfolioPerformanceResponse = {
      kr: {
        months:    krMonthsChained,
        byAccount: krByAccountChained,
        benchmark: benchmarks.kospi,
        stocks:    krStocksChained,
      },
      us: {
        months:    usMonthsChained,
        byAccount: usByAccountChained,
        benchmarks: {
          sp500:  benchmarks.sp500,
          nasdaq: benchmarks.nasdaq,
        },
        stocks: usStocksChained,
      },
      fetchedAt: new Date().toISOString(),
    };

    // 현재 진행 중인 월이 응답에 포함된 경우 → 5분 캐시 (포지션 탭과 주가 괴리 방지)
    // 과거 완료 월만 있으면(현재 월이 없으면) → 24h 캐시
    const currentPeriodStr = new Date().toISOString().slice(0, 7);
    const hasLiveMonth =
      response.kr.months.some((m) => m.period === currentPeriodStr && m.source === "api") ||
      response.us.months.some((m) => m.period === currentPeriodStr && m.source === "api");
    const cacheTTL = hasLiveMonth ? CACHE_TTL_LIVE : CACHE_TTL_HISTORICAL;

    await writeCache(CACHE_KEY, response, cacheTTL);
    console.log(`[portfolio/performance] 캐시 TTL: ${cacheTTL}s (${hasLiveMonth ? "현재 월 진행 중 → 5분" : "확정 월만 → 24h"})`);
    return NextResponse.json(response);
  } catch (err) {
    console.error("[portfolio/performance GET]", err);

    // stale-while-revalidate: 외부 API 실패 시 만료된 캐시라도 반환하여 500 에러 방지
    // 캐시가 전혀 없을 때만 실제 500 에러를 반환
    const stale = await readStaleCache<PortfolioPerformanceResponse>(CACHE_KEY);
    if (stale) {
      console.warn("[portfolio/performance] 오류 발생 — 만료 캐시 반환 (stale-while-revalidate)");
      return NextResponse.json(stale);
    }

    return NextResponse.json(
      { error: "성과 분석 데이터 조회 실패" },
      { status: 500 }
    );
  }
}
