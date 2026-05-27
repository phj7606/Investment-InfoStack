/**
 * 한국 시장 페이지 — KOSPI/KOSDAQ Fear & Greed Oscillator (v2)
 *
 * RSC(React Server Component)로 유지하면서 fetcher/indicator를 직접 import.
 * 절대 URL 없이 서버 함수를 직접 호출하여 API Route 의존성을 제거한다.
 *
 * 데이터 흐름:
 *   page.tsx (RSC) → fetchers + indicators 직접 호출
 *   → FearGreedChart (Client Component) props로 전달
 */

import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FearGreedChart } from "@/components/charts/FearGreedChart";
import { EtfRsTable } from "@/components/charts/EtfRsTable";
import { Badge } from "@/components/ui/badge";
import { calcEtfRs } from "@/lib/etf/rs";

// fetchers
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

// indicators
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

// cache
import { readCache, writeCache } from "@/lib/cache";
import params from "@/config/params.json";
import type { FearGreedKrResponse, FearGreedHistoryPoint, MarketRegime } from "@/types";

// regime 한글 레이블 (서버/클라이언트 공통 사용)
const REGIME_LABELS: Record<MarketRegime, string> = {
  extreme_fear:  "극단적 공포",
  fear:          "공포",
  neutral:       "중립",
  greed:         "탐욕",
  extreme_greed: "극단적 탐욕",
};

const REGIME_VARIANT: Record<MarketRegime, "destructive" | "secondary" | "outline" | "default"> = {
  extreme_fear:  "destructive",
  fear:          "destructive",
  neutral:       "secondary",
  greed:         "default",
  extreme_greed: "default",
};

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
// 서버 사이드 F&G 데이터 로드
// ────────────────────────────────────────────────────────────────

async function loadFearGreedData(): Promise<FearGreedKrResponse | null> {
  const today    = new Date();
  const todayStr = toIsoDate(today);
  const cacheKey = `fear-greed-kr-${todayStr}`;

  // 캐시 먼저 확인
  const cached = await readCache<FearGreedKrResponse>(cacheKey);
  if (cached) return cached;

  const fetchDays = params.fearGreed.fetchWindowDays;
  const startKrx  = toKrxDate(addDays(today, -fetchDays));
  const endKrx    = toKrxDate(today);
  const startDate = toIsoDate(addDays(today, -fetchDays));
  const endDate   = todayStr;

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

  if (kospiResult.status === "rejected" || vkospiResult.status === "rejected") {
    console.error("필수 데이터 수집 실패 (KOSPI 또는 VKOSPI)");
    return null;
  }

  const kospiMap  = new Map(kospiResult.value.map((b) => [b.date, b.closePrice]));
  const vkospiMap = new Map(vkospiResult.value.map((b) => [b.date, b.value]));
  const creditMap = creditResult.status === "fulfilled"
    ? new Map(creditResult.value.map((p) => [p.date, p.spread]))
    : new Map<string, number>();

  const pcPutMap  = new Map<string, number>();
  const pcCallMap = new Map<string, number>();
  if (pcResult.status === "fulfilled") {
    pcResult.value.forEach((b) => { pcPutMap.set(b.date, b.putVolume); pcCallMap.set(b.date, b.callVolume); });
  }

  const advancingMap = new Map<string, number>();
  const decliningMap = new Map<string, number>();
  if (breadthResult.status === "fulfilled") {
    breadthResult.value.forEach((b) => { advancingMap.set(b.date, b.advancingCount); decliningMap.set(b.date, b.decliningCount); });
  }

  const foreignMap = foreignResult.status === "fulfilled"
    ? new Map(foreignResult.value.map((b) => [b.date, b.netBuyingAmount]))
    : new Map<string, number>();

  const marginMap = marginResult.status === "fulfilled"
    ? new Map(marginResult.value.map((b) => [b.date, b.balanceAmount]))
    : new Map<string, number>();

  // 날짜 교집합 병합 (KOSPI + VKOSPI 공통 날짜 기준, forward fill)
  const baseDates = Array.from(kospiMap.keys()).filter((d) => vkospiMap.has(d)).sort();
  if (baseDates.length < params.fearGreed.normMinPeriods) return null;

  type MergedRow = { date: string; kospiClose: number; vkospi: number; creditSpread: number | null; pcPut: number | null; pcCall: number | null; advancing: number | null; declining: number | null; foreignNet: number | null; marginBalance: number | null; };
  const merged: MergedRow[] = [];
  let lastCredit: number | null = null, lastPut: number | null = null, lastCall: number | null = null;
  let lastAdv: number | null = null, lastDecl: number | null = null;
  let lastForeign: number | null = null, lastMargin: number | null = null;

  for (const date of baseDates) {
    if (creditMap.has(date))    lastCredit  = creditMap.get(date)!;
    if (pcPutMap.has(date))     lastPut     = pcPutMap.get(date)!;
    if (pcCallMap.has(date))    lastCall    = pcCallMap.get(date)!;
    if (advancingMap.has(date)) lastAdv     = advancingMap.get(date)!;
    if (decliningMap.has(date)) lastDecl    = decliningMap.get(date)!;
    if (foreignMap.has(date))   lastForeign = foreignMap.get(date)!;
    if (marginMap.has(date))    lastMargin  = marginMap.get(date)!;
    merged.push({
      date,
      kospiClose:    kospiMap.get(date)!,
      vkospi:        vkospiMap.get(date)!,
      creditSpread:  lastCredit,
      pcPut:         lastPut,
      pcCall:        lastCall,
      advancing:     lastAdv,
      declining:     lastDecl,
      foreignNet:    lastForeign,
      marginBalance: lastMargin,
    });
  }

  const kospiPrices = merged.map((r) => r.kospiClose);

  // 원시 지표 계산
  const momentumRaw    = calcMomentum(kospiPrices, params.fearGreed.momentumSmaPeriod);
  const vkospiRaw      = merged.map((r) => r.vkospi);
  const creditRaw      = merged.map((r) => r.creditSpread);
  const pcRawRatios    = merged.map((r) =>
    r.pcPut !== null && r.pcCall !== null && r.pcCall > 0 ? r.pcPut / r.pcCall : null
  );
  // P/C 5일 MA
  const pcRatio5dMa: (number | null)[] = pcRawRatios.map((_, i) => {
    if (i < params.fearGreed.pcRatioMaPeriod - 1) return null;
    const window = pcRawRatios.slice(i - params.fearGreed.pcRatioMaPeriod + 1, i + 1).filter((v): v is number => v !== null);
    return window.length > 0 ? window.reduce((s, v) => s + v, 0) / window.length : null;
  });
  const adLineRaw    = calcADLine(
    merged.map((r) => r.advancing ?? 0),
    merged.map((r) => r.declining ?? 0),
    params.fearGreed.adLinePeriod
  ).map((v, i) => (r => r.advancing === null ? null : v)(merged[i]));
  const foreignNetRaw  = calcForeignNet(merged.map((r) => r.foreignNet ?? 0), params.fearGreed.foreignNetPeriod)
    .map((v, i) => (merged[i].foreignNet === null ? null : v));
  const marginChangeRaw = calcMarginChange(merged.map((r) => r.marginBalance ?? 0), params.fearGreed.marginBalancePeriod)
    .map((v, i) => (merged[i].marginBalance === null ? null : v));

  const inputs: FGInputSeries = {
    momentum: momentumRaw, volatility: vkospiRaw, creditSpread: creditRaw,
    pcRatio: pcRatio5dMa, adLine: adLineRaw, foreignNet: foreignNetRaw, marginBalance: marginChangeRaw,
  };
  const weights: FGWeights = params.fearGreed.weights;
  const normParams = { window: params.fearGreed.rollingNormWindow, minPeriods: params.fearGreed.normMinPeriods, sigmaClip: params.fearGreed.normSigmaClip };

  const fgIndex = calcFearGreedIndex(inputs, weights, normParams);
  const fgMacd  = calcFGMomentum(fgIndex, params.fearGreed.fgMacdFast, params.fearGreed.fgMacdSlow, params.fearGreed.fgMacdSignal);

  const normMomentum = normalizeRollingZScore(momentumRaw, normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normVkospi   = normalizeRollingZScore(vkospiRaw,   normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normCredit   = normalizeRollingZScore(creditRaw,   normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normPc       = normalizeRollingZScore(pcRatio5dMa, normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normAd       = normalizeRollingZScore(adLineRaw,   normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normForeign  = normalizeRollingZScore(foreignNetRaw,   normParams.window, normParams.minPeriods, normParams.sigmaClip);
  const normMargin   = normalizeRollingZScore(marginChangeRaw, normParams.window, normParams.minPeriods, normParams.sigmaClip);

  const allHistory: FearGreedHistoryPoint[] = merged
    .map((row, i) => {
      const value = fgIndex[i];
      if (value === null) return null;
      return {
        date: row.date, value, regime: valueToRegime(value),
        components: extractComponentsAt(normMomentum, normVkospi, normCredit, normPc, normAd, normForeign, normMargin, i),
        fgMacd: fgMacd.macd[i], fgSignal: fgMacd.signal[i], fgHistogram: fgMacd.histogram[i],
      } satisfies FearGreedHistoryPoint;
    })
    .filter((p): p is FearGreedHistoryPoint => p !== null);

  if (!allHistory.length) return null;

  const history = allHistory.slice(-params.fearGreed.historyDays);
  const latest  = history[history.length - 1];
  const prevDay = history[history.length - 2];

  const usedVariables = (
    [["momentum", momentumRaw], ["volatility", vkospiRaw], ["creditSpread", creditRaw],
     ["pcRatio", pcRatio5dMa], ["adLine", adLineRaw], ["foreignNet", foreignNetRaw],
     ["marginBalance", marginChangeRaw]] as [string, (number | null)[]][]
  ).filter(([, s]) => s.some((v) => v !== null)).map(([name]) => name);

  const response: FearGreedKrResponse = {
    latest: { value: latest.value, regime: latest.regime, change: prevDay ? parseFloat((latest.value - prevDay.value).toFixed(1)) : 0, updatedAt: new Date().toISOString() },
    history,
    meta: { calculatedAt: new Date().toISOString(), windowDays: params.fearGreed.rollingNormWindow, dataStartDate: history[0].date, dataEndDate: latest.date, variables: usedVariables },
  };

  await writeCache(cacheKey, response, params.cache.historicalTTLSeconds);
  return response;
}

// ────────────────────────────────────────────────────────────────
// Page Component (RSC)
// ────────────────────────────────────────────────────────────────

export default async function KrMarketPage() {
  // F&G + ETF RS 병렬 수집 — 하나가 실패해도 나머지 표시
  const [fgData, krRsData] = await Promise.all([
    loadFearGreedData().catch((err) => { console.error("F&G 데이터 로드 오류:", err); return null; }),
    calcEtfRs("kr").catch((err) => { console.error("한국 ETF RS 데이터 로드 오류:", err); return null; }),
  ]);

  const latest = fgData?.latest ?? null;

  return (
    <div>
      {/* 페이지 헤더 */}
      <PageHeader
        title="한국 시장"
        description="KOSPI / KOSDAQ Fear & Greed Oscillator v2 · 7변수 합성 심리 지수"
      />

      {/* 상단: 핵심 지표 스냅샷 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* F&G 지수 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>F&amp;G 지수</CardDescription>
            {latest ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{latest.value.toFixed(1)}</span>
                {latest.change !== 0 && (
                  <span className={`text-sm ${latest.change > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {latest.change > 0 ? "+" : ""}{latest.change.toFixed(1)}
                  </span>
                )}
              </div>
            ) : (
              <Skeleton className="h-8 w-24 mt-1" />
            )}
          </CardHeader>
          <CardContent>
            {latest ? (
              <Badge variant={REGIME_VARIANT[latest.regime]}>
                {REGIME_LABELS[latest.regime]}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-20" />
            )}
          </CardContent>
        </Card>

        {/* 사용 변수 수 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>활성 변수</CardDescription>
            {fgData ? (
              <span className="text-2xl font-bold">
                {fgData.meta.variables.length}
                <span className="text-sm font-normal text-muted-foreground"> / 7</span>
              </span>
            ) : (
              <Skeleton className="h-8 w-16 mt-1" />
            )}
          </CardHeader>
          <CardContent>
            {fgData ? (
              <p className="text-xs text-muted-foreground">
                {fgData.meta.variables.join(", ")}
              </p>
            ) : (
              <Skeleton className="h-3 w-32" />
            )}
          </CardContent>
        </Card>

        {/* 데이터 기준일 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>기준일</CardDescription>
            {fgData ? (
              <span className="text-xl font-bold">{fgData.meta.dataEndDate}</span>
            ) : (
              <Skeleton className="h-8 w-28 mt-1" />
            )}
          </CardHeader>
          <CardContent>
            {fgData ? (
              <p className="text-xs text-muted-foreground">
                시작 {fgData.meta.dataStartDate}
              </p>
            ) : (
              <Skeleton className="h-3 w-32" />
            )}
          </CardContent>
        </Card>

        {/* 롤링 윈도우 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>정규화 윈도우</CardDescription>
            {fgData ? (
              <span className="text-2xl font-bold">
                {fgData.meta.windowDays}
                <span className="text-sm font-normal text-muted-foreground">일</span>
              </span>
            ) : (
              <Skeleton className="h-8 w-20 mt-1" />
            )}
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Rolling Z-score (look-ahead 없음)</p>
          </CardContent>
        </Card>
      </div>

      {/* 하단: 차트 + 업종 신호 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fear & Greed Oscillator 차트 (2-Track) — 2/3 너비 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Fear &amp; Greed Oscillator (KR)</CardTitle>
            <CardDescription>
              Track 1: F&amp;G 지수 레벨 (0~100) · Track 2: F&amp;G Momentum (MACD)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fgData?.history.length ? (
              <FearGreedChart data={fgData.history} />
            ) : (
              <EmptyState
                title="데이터 준비 중"
                description={
                  fgData === null
                    ? "데이터 소스 연결이 필요합니다. KRX / kofiabond API 설정을 확인하세요."
                    : "F&G 지수 계산에 충분한 데이터가 없습니다."
                }
                icon={<TrendingUp className="h-8 w-8 text-muted-foreground" />}
              />
            )}
          </CardContent>
        </Card>

        {/* 한국 ETF Mansfield RS 랭킹 */}
        <Card>
          <CardHeader>
            <CardTitle>한국 ETF Mansfield RS 랭킹</CardTitle>
            <CardDescription>
              KOSPI 대비 · Rolling Percentile (252일)
              {krRsData && (
                <span className="ml-2 text-xs">
                  기준일: {krRsData.meta.dataEndDate} · 유효 {krRsData.meta.validSymbols}/{krRsData.meta.totalSymbols}종
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {krRsData ? (
              <EtfRsTable data={krRsData.rankings} market="kr" />
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full shrink-0" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
