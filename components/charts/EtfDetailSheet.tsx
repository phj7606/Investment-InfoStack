"use client";

// ETF 상세 Sheet 컴포넌트
// 종목 이름 클릭 시 우측에서 슬라이드 오픈
//
// 상단: 가격 차트 (종가 Area + 20일/60일 MA Line)
// 하단: RS Raw 시계열 차트 (Line — 0선 기준으로 색상 분기)
//
// 가격 데이터: /api/etf/history 에서 클라이언트 fetch (open 시 1회)
// RS Raw 시계열: EtfRsResult.rsRawHistory (서버에서 계산하여 전달)

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ComposedChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "lucide-react";
import type { EtfRsResult } from "@/types";
import { CATEGORY_LABELS } from "@/lib/constants/categories";

/**
 * 종목 페이지 URL 생성
 * - KR: stock.naver.com 신규 UI — domestic/stock/{6자리코드}/price
 * - US: Yahoo Finance — 거래소 접미사(.O/.A 등) 없이 심볼만으로 동작,
 *       Naver worldstock URL은 거래소별 접미사가 필요하여 티커 설정에 정보 없으면 구성 불가
 */
function getStockUrl(symbol: string, market: "kr" | "us"): string {
  if (market === "kr") {
    return `https://stock.naver.com/domestic/stock/${symbol}/price`;
  }
  // 미국 ETF: Yahoo Finance (심볼만으로 항상 유효)
  return `https://finance.yahoo.com/quote/${symbol}`;
}


interface PriceBar {
  date: string;
  close: number;
  volume: number;
}

interface EtfDetailSheetProps {
  row: EtfRsResult | null;
  market: "kr" | "us";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// tooltip 공통 스타일 (다크/라이트 모드 대응)
const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: "11px",
  color: "hsl(var(--foreground))",
};

/** X축 날짜 축약 표시 — "2025-03-31" → "03/31" */
function fmtDate(dateStr: string): string {
  return dateStr.slice(5).replace("-", "/");
}

/** 가격 숫자 포맷 — 한국(정수) / 미국(소수점 2자리) */
function fmtPrice(value: number, market: "kr" | "us"): string {
  return market === "kr"
    ? value.toLocaleString("ko-KR")
    : value.toFixed(2);
}

export function EtfDetailSheet({ row, market, open, onOpenChange }: EtfDetailSheetProps) {
  const [priceBars, setPriceBars] = useState<PriceBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sheet가 열릴 때 가격 데이터 fetch (row 변경 시에도 재fetch)
  useEffect(() => {
    if (!open || !row) return;

    setLoading(true);
    setError(null);
    setPriceBars([]);

    fetch(`/api/etf/history?symbol=${row.symbol}&market=${market}&days=252`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setPriceBars(data.bars ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, row?.symbol, market]);

  // 20일/60일 SMA 계산 — 가격 차트 오버레이용
  const priceChartData = priceBars.map((bar, i) => {
    const slice20 = priceBars.slice(Math.max(0, i - 19), i + 1);
    const slice60 = priceBars.slice(Math.max(0, i - 59), i + 1);
    const ma20 = slice20.length >= 20
      ? parseFloat((slice20.reduce((s, b) => s + b.close, 0) / slice20.length).toFixed(2))
      : null;
    const ma60 = slice60.length >= 60
      ? parseFloat((slice60.reduce((s, b) => s + b.close, 0) / slice60.length).toFixed(2))
      : null;
    return { ...bar, ma20, ma60 };
  });

  // X축 눈금 개수 줄이기 — 데이터 포인트가 많으면 1/5만 표시
  function xAxisTick(dateStr: string, index: number, total: number): string {
    const interval = Math.ceil(total / 6);
    return index % interval === 0 ? fmtDate(dateStr) : "";
  }

  if (!row) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* sheet.tsx 기본값 sm:max-w-sm을 !important로 덮어써서 화면 50% 너비 적용 */}
      <SheetContent className="!w-[50vw] !max-w-[50vw] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <span className="text-base">{row.symbol}</span>
            <span className="text-lg font-bold">{row.name}</span>
            {/* 종목 링크 — KR: stock.naver.com, US: Yahoo Finance */}
            <a
              href={getStockUrl(row.symbol, market)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-muted-foreground hover:text-primary transition-colors"
              title={market === "kr" ? "네이버 증권에서 보기" : "Yahoo Finance에서 보기"}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              {CATEGORY_LABELS[row.category] ?? row.category}
            </Badge>
            {row.rsRaw !== null && (
              <span className="text-xs text-muted-foreground">
                RS Raw: <span className="font-semibold text-foreground">{row.rsRaw.toFixed(2)}</span>
              </span>
            )}
            {row.rsPercentile !== null && (
              <span className="text-xs text-muted-foreground">
                RS 퍼센타일: <span className="font-semibold text-foreground">{row.rsPercentile.toFixed(1)}%</span>
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* ── 가격 차트 ───────────────────────────────────────── */}
        <section className="mb-6">
          {/* 타이틀 좌측 패딩 = 차트 left margin(10) + YAxis 너비(kr:60, us:50) */}
          <h3
            className="text-sm font-semibold mb-2"
            style={{ paddingLeft: market === "kr" ? 70 : 60, paddingRight: 20 }}
          >
            가격 (종가 · MA20 · MA60)
          </h3>

          {loading && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">가격 데이터 로딩 중...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-40 text-sm text-red-500">
              데이터 수집 실패: {error}
            </div>
          )}

          {!loading && !error && priceChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={priceChartData} margin={{ top: 4, right: 20, bottom: 0, left: 10 }}>
                <defs>
                  {/* 종가 Area 그라데이션 */}
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v, i) => xAxisTick(v, i, priceChartData.length)}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => fmtPrice(v, market)}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={market === "kr" ? 60 : 50}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number, name: string) => [
                    fmtPrice(v, market),
                    name === "close" ? "종가" : name === "ma20" ? "MA20" : "MA60",
                  ]}
                  labelFormatter={(label) => label}
                />
                {/* 종가 Area */}
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="#1e3a8a"
                  strokeWidth={1.5}
                  fill="url(#priceGradient)"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
                {/* MA20 라인 */}
                <Line
                  type="monotone"
                  dataKey="ma20"
                  stroke="#0891b2"
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                />
                {/* MA60 라인 */}
                <Line
                  type="monotone"
                  dataKey="ma60"
                  stroke="#f97316"
                  strokeWidth={1}
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* 범례 — 우측 패딩을 차트 right margin(20)과 맞춤 */}
          {!loading && !error && priceChartData.length > 0 && (
            <div className="flex gap-4 mt-1 justify-end" style={{ paddingRight: 20 }}>
              {[
                { color: "#1e3a8a", label: "종가" },
                { color: "#0891b2", label: "MA20" },
                { color: "#f97316", label: "MA60" },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block w-4 h-0.5" style={{ backgroundColor: color }} />
                  {label}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── RS Raw 시계열 차트 ───────────────────────────────── */}
        <section>
          {/* 타이틀 좌측 패딩 = 차트 left margin(10) + YAxis 너비(40) */}
          <h3
            className="text-sm font-semibold mb-2"
            style={{ paddingLeft: 50, paddingRight: 20 }}
          >
            Mansfield RS Raw 시계열
            <span className="text-xs font-normal text-muted-foreground ml-1">
              (벤치마크 대비 상대강도 · 0선 위 = 강세 · 점선 = RS63 21일 변화)
            </span>
          </h3>

          {row.rsRawHistory && row.rsRawHistory.length > 0 ? (() => {
            // 두 시리즈를 날짜 기준으로 병합
            const map63 = new Map((row.rsRawHistory63 ?? []).map((p) => [p.date, p.value]));
            const merged = row.rsRawHistory.map((p) => ({
              date:  p.date,
              rs252: p.value,
              rs63:  map63.get(p.date) ?? null,
            }));
            return (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={merged} margin={{ top: 4, right: 20, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v, i) => xAxisTick(v, i, merged.length)}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => v.toFixed(0)}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => [
                      v.toFixed(2),
                      name === "rs252"  ? "RS Raw(252)" :
                      name === "rs63"   ? "RS Raw(63)"  :
                      "RS63 모멘텀(21일)",
                    ]}
                    labelFormatter={(label) => label}
                  />
                  {/* 0선 기준선 — 0 위(강세) / 아래(약세) 구분 */}
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 2" />
                  {/* RS Raw(252) — 장기 구조, 짙은 파랑 */}
                  <Line
                    type="monotone"
                    dataKey="rs252"
                    stroke="#1e3a8a"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                  {/* RS Raw(63) — 단기 모멘텀, 주황 */}
                  <Line
                    type="monotone"
                    dataKey="rs63"
                    stroke="#f97316"
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                  {/* RS63 모멘텀(21일 변화) — RS63[i]-RS63[i-21], 에메랄드 점선
                      양수=단기 상대강도 개선 중, 음수=단기 상대강도 약화 중 */}
                  <Line
                    type="monotone"
                    dataKey="delta"
                    stroke="#10b981"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            );
          })() : (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              RS Raw 시계열 데이터가 없습니다 (데이터 기간 부족).
            </div>
          )}

          {/* 범례 — 우측 패딩을 차트 right margin(20)과 맞춤 */}
          {row.rsRawHistory && row.rsRawHistory.length > 0 && (
            <div className="flex gap-4 mt-1 justify-end" style={{ paddingRight: 20 }}>
              {[
                { color: "#1e3a8a", label: "RS Raw(252)",    dashed: false },
                { color: "#f97316", label: "RS Raw(63)",     dashed: false },
                { color: "#10b981", label: "RS63 모멘텀(21일)", dashed: true },
              ].map(({ color, label, dashed }) => (
                <div key={label} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className="inline-block w-5 h-0.5"
                    style={{
                      // 점선 효과를 범례에도 동일하게 적용
                      backgroundImage: dashed
                        ? `repeating-linear-gradient(to right, ${color} 0, ${color} 4px, transparent 4px, transparent 7px)`
                        : "none",
                      backgroundColor: dashed ? "transparent" : color,
                    }}
                  />
                  {label}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ADX(14) 레짐 필터 차트 ───────────────────────────── */}
        {/* ADX < 25: 횡보장(초록 기준선 아래) — Raw63 복합신호 유효
            ADX >= 25: 추세장(초록 기준선 위) — Raw63 신호 필터 아웃 */}
        <section className="mt-6 pb-4">
          <h3
            className="text-sm font-semibold mb-2"
            style={{ paddingLeft: 50, paddingRight: 20 }}
          >
            ADX(14) 레짐 필터
            <span className="text-xs font-normal text-muted-foreground ml-1">
              (25 미만 = 횡보장 · 복합신호 유효 구간)
            </span>
          </h3>

          {row.adxHistory && row.adxHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart
                data={row.adxHistory}
                margin={{ top: 4, right: 20, bottom: 0, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v, i) => xAxisTick(v, i, row.adxHistory!.length)}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, "auto"]}
                  tickFormatter={(v) => v.toFixed(0)}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v: number) => [v.toFixed(2), "ADX(14)"]}
                  labelFormatter={(label) => label}
                />
                {/* y=25 기준선 — 횡보(아래)/추세(위) 경계 */}
                <ReferenceLine
                  y={25}
                  stroke="#10b981"
                  strokeDasharray="4 2"
                  label={{ value: "25", position: "right", fontSize: 10, fill: "#10b981" }}
                />
                {/* ADX 라인 — connectNulls=false: warm-up null 구간 선 끊음 */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8b5cf6"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
              ADX 시계열 데이터가 없습니다 (데이터 기간 부족).
            </div>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}
