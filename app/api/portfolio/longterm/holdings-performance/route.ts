/**
 * GET /api/portfolio/longterm/holdings-performance
 *
 * 현재 보유 종목별 TWR 기반 성과 지표 반환.
 *
 * 계산 항목:
 *   - TWR (현재가/최초매입가 - 1)
 *   - 벤치마크 TWR (^KS11 / ^GSPC 동기간)
 *   - Alpha, 연환산 Alpha
 *   - Hit Rate, MDD, Up/Down Capture (종목 Yahoo 가격 시계열 기반)
 *   - 평가손익, 포트폴리오 기여도, 보유기간
 *
 * 쿼리 파라미터:
 *   account?: 계좌 필터 (생략 시 전체)
 *
 * 캐시: 5분 TTL (반복 방문 시 Yahoo 호출 방지)
 *
 * 아키텍처:
 *   1. 거래 내역 → 현재 보유 포지션 계산
 *   2. 현재가: 가격 캐시 → 없으면 Naver(KR) + Yahoo(US) 직접 조회
 *   3. 벤치마크 히스토리: ^KS11(KR 보유 시) + ^GSPC(US 보유 시) 병렬 조회
 *   4. 종목 히스토리: 각 종목 Yahoo 병렬 조회 (FUND 제외)
 *   5. calcHoldingPerformance() → injectContributions() → 캐시 저장
 */

import { NextRequest, NextResponse } from "next/server";
import { readTransactions } from "@/lib/portfolio/longterm-store";
import { calcPositions } from "@/lib/portfolio/longterm-calc";
import {
  fetchYahooHistory,
  fetchYahooCurrentPrices,
  toYahooKrSymbol,
} from "@/lib/fetchers/yahoo";
import { fetchNaverCurrentPrices } from "@/lib/fetchers/naver";
import { readCache, writeCache } from "@/lib/cache";
import {
  calcHoldingPerformance,
  injectContributions,
} from "@/lib/portfolio/holdings-performance";
import type { LongtermTransaction } from "@/types/portfolio";
import type { YahooHistoricalBar } from "@/lib/fetchers/yahoo";

// 5분 캐시 TTL (반복 방문 시 Yahoo 조회 방지)
const CACHE_TTL = 300;

// ─────────────────────────────────────────
// GET 핸들러
// ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const account = searchParams.get("account");

    // ── 거래 내역 조회 ────────────────────────────
    let txs = readTransactions();
    if (account) txs = txs.filter((t: LongtermTransaction) => t.accountNo === account);

    // ── 현재 보유 포지션 계산 (가격 없이) ─────────
    const positions = calcPositions(txs);
    if (positions.length === 0) {
      return NextResponse.json({ holdings: [], fetchedAt: new Date().toISOString() });
    }

    // ── 캐시 키: 계좌 + 종목 목록 기준 ─────────────
    const allCodes = positions.map((p) => p.stockCode).sort();
    // v4: FUND 포지션 제외로 캐시 무효화
    const cacheKey = `holdings-perf-v4-${account ?? "all"}-${allCodes.join("-")}`;
    const cached = await readCache<{ holdings: ReturnType<typeof injectContributions>; fetchedAt: string }>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, source: "cache" });
    }

    // ── 오늘 날짜 ─────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    // ── 현재가 조회 ──────────────────────────────
    // KR(Naver) + US(Yahoo) 병렬 조회
    const krPositions = positions.filter((p) => p.market === "KR" && p.assetType !== "FUND");
    const usPositions = positions.filter((p) => p.market === "US");

    const [krPrices, usPrices] = await Promise.all([
      krPositions.length > 0
        ? fetchNaverCurrentPrices(krPositions.map((p) => ({ code: p.stockCode, name: p.stockName })))
        : Promise.resolve({} as Record<string, number>),
      usPositions.length > 0
        ? fetchYahooCurrentPrices(usPositions.map((p) => p.stockCode))
        : Promise.resolve({} as Record<string, number>),
    ]);
    const currentPrices: Record<string, number> = { ...krPrices, ...usPrices };

    // ── 현재가 적용 후 포지션 재계산 ──────────────
    const positionsWithPrices = calcPositions(txs, currentPrices);

    // ── 벤치마크 히스토리 조회 ────────────────────
    // KR 보유 시 ^KS11, US 보유 시 ^GSPC — 최초 BUY 날짜부터 오늘까지 필요
    // 가장 이른 BUY 날짜를 기준으로 한 번만 조회
    const hasKR = positionsWithPrices.some((p) => p.market === "KR");
    const hasUS = positionsWithPrices.some((p) => p.market === "US");

    // 각 통화별 최초 BUY 날짜 (벤치마크 시작점)
    function findEarliestBuy(market: "KR" | "US"): string {
      const stockCodes = positionsWithPrices
        .filter((p) => p.market === market)
        .map((p) => p.stockCode);
      const buyDates = txs
        .filter((t) => t.tradeType === "BUY" && stockCodes.includes(t.stockCode))
        .map((t) => t.date)
        .sort();
      return buyDates[0] ?? today;
    }

    const krFirstBuy = hasKR ? findEarliestBuy("KR") : today;
    const usFirstBuy = hasUS ? findEarliestBuy("US") : today;

    // 벤치마크 히스토리는 종목별 최초 매입일보다 1일 전부터 시작
    // (findClosestClose가 정확한 날짜 미포함 시 이전 날짜로 fallback하므로 넉넉하게 조회)
    function oneDayBefore(dateStr: string): string {
      const d = new Date(dateStr);
      d.setDate(d.getDate() - 5); // 5 영업일 전 (주말 고려)
      return d.toISOString().slice(0, 10);
    }

    const [krBenchBars, usBenchBars] = await Promise.all([
      hasKR
        ? fetchYahooHistory("^KS11", oneDayBefore(krFirstBuy))
          .catch((e) => { console.warn("[holdings-perf] ^KS11 조회 실패:", e); return [] as YahooHistoricalBar[]; })
        : Promise.resolve([] as YahooHistoricalBar[]),
      hasUS
        ? fetchYahooHistory("^GSPC", oneDayBefore(usFirstBuy))
          .catch((e) => { console.warn("[holdings-perf] ^GSPC 조회 실패:", e); return [] as YahooHistoricalBar[]; })
        : Promise.resolve([] as YahooHistoricalBar[]),
    ]);

    // ── 종목별 히스토리 병렬 조회 ─────────────────
    // FUND 타입은 Yahoo Finance 미지원이므로 건너뜀
    // KR: ${stockCode}.KS, US: stockCode 그대로
    const stockBarsMap = new Map<string, YahooHistoricalBar[]>();

    await Promise.all(
      positionsWithPrices
        .filter((p) => p.assetType !== "FUND")
        .map(async (p) => {
          // 해당 종목의 최초 BUY 날짜 추출
          const firstBuyDate =
            txs
              .filter(
                (t) =>
                  t.stockCode === p.stockCode &&
                  t.accountNo === p.accountNo &&
                  t.tradeType === "BUY"
              )
              .sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? today;

          const yahooSymbol =
            p.market === "KR"
              ? toYahooKrSymbol(p.stockCode)
              : p.stockCode;

          try {
            const bars = await fetchYahooHistory(
              yahooSymbol,
              oneDayBefore(firstBuyDate)
            );
            if (bars.length > 0) {
              stockBarsMap.set(`${p.stockCode}::${p.accountNo}`, bars);
            }
          } catch (e) {
            // 개별 종목 실패는 무시 — 고급 지표만 생략됨
            console.warn(`[holdings-perf] ${yahooSymbol} 히스토리 조회 실패:`, e);
          }
        })
    );

    // ── 종목별 성과 계산 ──────────────────────────
    // FUND 포지션 제외: Yahoo Finance 미지원 → 현재가/시계열 없음 → 의미 있는 지표 산출 불가
    // 전체 계좌 선택 시 8654 펀드 계좌의 펀드 포지션이 섞이면 빈 행이 다수 생겨 레이아웃이 어색해짐
    const rawHoldings = positionsWithPrices
      .filter((p) => p.assetType !== "FUND")
      .map((position) => {
        const benchBars = position.market === "KR" ? krBenchBars : usBenchBars;
        const stockBars = stockBarsMap.get(`${position.stockCode}::${position.accountNo}`);
        return calcHoldingPerformance(position, txs, benchBars, stockBars, today);
      });

    // ── 기여도 주입 ───────────────────────────────
    const holdings = injectContributions(rawHoldings);

    const result = { holdings, fetchedAt: new Date().toISOString() };
    await writeCache(cacheKey, result, CACHE_TTL);

    console.log(`[holdings-perf] ${holdings.length}개 종목 성과 계산 완료`);

    return NextResponse.json({ ...result, source: "api" });
  } catch (err) {
    console.error("[longterm/holdings-performance GET]", err);
    return NextResponse.json({ error: "보유 종목 성과 조회 실패" }, { status: 500 });
  }
}
