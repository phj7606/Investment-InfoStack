"use client";

// 중장기 보유 포지션 테이블
// - KR/US 시장 필터 (전체 없음 — 통화 혼산 방지)
// - 현재가: 자동 조회 (Yahoo Finance) + 수동 오버라이드 (연필 아이콘)
// - 평가손익/수익률 색상: 양수=red-500, 음수=blue-500 (한국 주식 컨벤션)
// - 현재가 없을 때 평가손익/수익률 "-" 표시

import { useState } from "react";
import { Pencil, Check, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LongtermPosition } from "@/types/portfolio";

interface LongtermPositionsTableProps {
  positions: LongtermPosition[];
  isLoading: boolean;
  /** 현재가 자동 조회 중 여부 */
  pricesLoading?: boolean;
  /** 마지막 현재가 조회 시각 (ISO string) */
  pricesFetchedAt?: string | null;
  /** 현재가 수동 오버라이드 콜백 */
  onPriceUpdate: (stockCode: string, price: number) => void;
  /** 현재가 새로고침 콜백 */
  onPricesRefresh?: () => void;
}

// KR / US 만 허용 — 전체(all) 제거 (통화 혼산 방지)
type MarketFilter = "KR" | "US";

// 수익률 색상 헬퍼 (한국 컨벤션)
function plColor(value: number): string {
  if (value > 0) return "text-red-500";
  if (value < 0) return "text-blue-500";
  return "text-muted-foreground";
}

// 금액 포맷 — KRW는 소수점 없이, USD는 소수점 2자리
function formatAmount(amount: number, currency: "KRW" | "USD"): string {
  if (currency === "USD") {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${Math.round(amount).toLocaleString()}원`;
}

// 가격 포맷 — KRW는 소수점 없이, USD는 소수점 2자리
function formatPrice(price: number, currency: "KRW" | "USD"): string {
  if (currency === "USD") {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return Math.round(price).toLocaleString();
}

// 현재가 인라인 편집 셀 — 자동 조회된 현재가 위에 수동으로 오버라이드할 때 사용
function PriceEditCell({
  position,
  onPriceUpdate,
}: {
  position: LongtermPosition;
  onPriceUpdate: (stockCode: string, price: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState(
    position.currentPrice !== undefined ? String(position.currentPrice) : ""
  );

  function handleConfirm() {
    const parsed = parseFloat(inputVal);
    if (!isNaN(parsed) && parsed > 0) {
      onPriceUpdate(position.stockCode, parsed);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <input
          autoFocus
          type="number"
          min="0"
          step="any"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-20 rounded border border-emerald-400 bg-background px-1.5 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        {/* 확인 버튼 */}
        <button
          onClick={handleConfirm}
          className="text-emerald-600 hover:text-emerald-700"
          title="확인"
        >
          <Check className="h-3 w-3" />
        </button>
        {/* 취소 버튼 */}
        <button
          onClick={() => setEditing(false)}
          className="text-muted-foreground hover:text-foreground"
          title="취소"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end group">
      <span className="tabular-nums">
        {position.currentPrice !== undefined
          ? formatPrice(position.currentPrice, position.currency)
          : "-"}
      </span>
      {/* 수동 오버라이드 편집 버튼 — hover 시 표시 */}
      <button
        onClick={() => {
          setInputVal(position.currentPrice !== undefined ? String(position.currentPrice) : "");
          setEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-emerald-600 transition-opacity"
        title="현재가 수동 입력"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

export function LongtermPositionsTable({
  positions,
  isLoading,
  pricesLoading = false,
  pricesFetchedAt,
  onPriceUpdate,
  onPricesRefresh,
}: LongtermPositionsTableProps) {
  // 기본값 KR — 전체(all) 제거
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("KR");

  // 시장 필터 + 평가금액 내림차순 정렬
  const filtered = positions
    .filter((p) => p.market === marketFilter)
    .sort((a, b) => b.evalAmount - a.evalAmount);

  // KR/US 전체 평가금액 합계 (비중 계산용)
  const totalKRW = positions
    .filter((p) => p.currency === "KRW")
    .reduce((sum, p) => sum + p.evalAmount, 0);
  const totalUSD = positions
    .filter((p) => p.currency === "USD")
    .reduce((sum, p) => sum + p.evalAmount, 0);

  function getWeight(p: LongtermPosition): string {
    const total = p.currency === "KRW" ? totalKRW : totalUSD;
    if (total <= 0) return "0.0%";
    return `${((p.evalAmount / total) * 100).toFixed(1)}%`;
  }

  // 필터 버튼 공통 스타일
  function filterBtnClass(active: boolean): string {
    return cn("h-6 px-2 text-[10px]", active && "bg-emerald-600 hover:bg-emerald-700 text-white");
  }

  // 마지막 조회 시각 포맷 (HH:MM)
  const fetchedTimeLabel = pricesFetchedAt
    ? new Date(pricesFetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const currency = marketFilter === "KR" ? "KRW" : "USD";

  // 현재 필터의 합계 — 평가금액
  const filteredTotal = filtered.reduce((s, p) => s + p.evalAmount, 0);
  const totalLabel = currency === "KRW"
    ? `${Math.round(filteredTotal).toLocaleString()}원`
    : `$${filteredTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // 현재가 있는 종목만 평가손익·수익률 합산
  // 현재가 없는 종목은 evalPL=0으로 저장되므로 명시적으로 걸러낸다
  const posWithPrice = filtered.filter((p) => p.currentPrice !== undefined);
  const totalEvalPL = posWithPrice.reduce((s, p) => s + p.evalPL, 0);
  // 수익률 합계: 총 평가손익 / 총 매입원가 × 100
  // 매입원가 = evalAmount - evalPL (= avgCost × quantity)
  const totalCostBasis = posWithPrice.reduce((s, p) => s + (p.evalAmount - p.evalPL), 0);
  const totalEvalPLPct = totalCostBasis > 0 ? (totalEvalPL / totalCostBasis) * 100 : null;

  // 누적 실현손익 합계 (전체 filtered, 현재가 무관)
  const totalRealizedPL = filtered.reduce((s, p) => s + p.totalRealizedPL, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">보유 포지션</CardTitle>
          {/* 현재가 조회 상태 + 새로고침 버튼 */}
          <div className="flex items-center gap-2">
            {fetchedTimeLabel && !pricesLoading && (
              <span className="text-[10px] text-muted-foreground">{fetchedTimeLabel} 기준</span>
            )}
            {onPricesRefresh && (
              <button
                onClick={onPricesRefresh}
                disabled={pricesLoading}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-emerald-600 disabled:opacity-40 transition-colors"
                title="현재가 새로고침"
              >
                <RefreshCw className={cn("h-3 w-3", pricesLoading && "animate-spin")} />
                {pricesLoading ? "조회 중..." : "현재가 새로고침"}
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">{filtered.length}종목</span>
          </div>
        </div>

        {/* KR / US 필터 (전체 없음) */}
        <div className="flex gap-1 mt-2">
          {(["KR", "US"] as MarketFilter[]).map((f) => (
            <Button
              key={f}
              variant={marketFilter === f ? "default" : "outline"}
              size="sm"
              className={filterBtnClass(marketFilter === f)}
              onClick={() => setMarketFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 pb-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            보유 포지션이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">종목</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">시장</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">계좌</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">수량</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">평균단가</th>
                  {/* 현재가 컬럼 헤더: 로딩 중 스핀 표시 */}
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      현재가
                      {pricesLoading && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
                    </span>
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">평가금액</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">평가손익</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">수익률</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">누적실현</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((pos) => {
                  const hasCurrent = pos.currentPrice !== undefined;

                  return (
                    <tr key={`${pos.stockCode}-${pos.accountNo}`} className="hover:bg-muted/20 transition-colors">
                      {/* 종목명 + 코드 */}
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{pos.stockName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {pos.stockCode}
                          <span className="ml-1 opacity-60">{pos.assetType}</span>
                        </p>
                      </td>

                      {/* 시장 */}
                      <td className="px-3 py-2.5 text-center text-muted-foreground">
                        {pos.market}
                      </td>

                      {/* 계좌 */}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {pos.accountNo}
                      </td>

                      {/* 수량 */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {pos.quantity.toLocaleString()}
                      </td>

                      {/* 평균단가 */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatPrice(pos.avgCost, pos.currency)}
                      </td>

                      {/* 현재가 (자동 조회 + 수동 오버라이드) */}
                      <td className="px-3 py-2.5">
                        <PriceEditCell position={pos} onPriceUpdate={onPriceUpdate} />
                      </td>

                      {/* 평가금액 */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatAmount(pos.evalAmount, pos.currency)}
                      </td>

                      {/* 평가손익 (현재가 있을 때만) */}
                      <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium",
                        hasCurrent ? plColor(pos.evalPL) : "text-muted-foreground"
                      )}>
                        {hasCurrent
                          ? `${pos.evalPL >= 0 ? "+" : ""}${formatAmount(pos.evalPL, pos.currency)}`
                          : "-"}
                      </td>

                      {/* 수익률 (현재가 있을 때만) */}
                      <td className={cn("px-3 py-2.5 text-right tabular-nums font-semibold",
                        hasCurrent ? plColor(pos.evalPLPct) : "text-muted-foreground"
                      )}>
                        {hasCurrent
                          ? `${pos.evalPLPct >= 0 ? "+" : ""}${pos.evalPLPct.toFixed(2)}%`
                          : "-"}
                      </td>

                      {/* 누적 실현손익 */}
                      <td className={cn("px-3 py-2.5 text-right tabular-nums",
                        plColor(pos.totalRealizedPL)
                      )}>
                        {pos.totalRealizedPL !== 0
                          ? `${pos.totalRealizedPL >= 0 ? "+" : ""}${formatAmount(pos.totalRealizedPL, pos.currency)}`
                          : "-"}
                      </td>

                      {/* 비중 */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {getWeight(pos)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 합계 행 (2종목 이상일 때) */}
              {filtered.length > 1 && (
                <tfoot>
                  <tr className="border-t bg-muted/20 font-medium text-xs">
                    {/* 레이블 */}
                    <td className="px-4 py-2 text-muted-foreground" colSpan={6}>
                      합계
                    </td>

                    {/* 평가금액 합계 */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {totalLabel}
                    </td>

                    {/* 평가손익 합계 — 현재가 있는 종목만 */}
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      posWithPrice.length > 0 ? plColor(totalEvalPL) : "text-muted-foreground"
                    )}>
                      {posWithPrice.length > 0
                        ? `${totalEvalPL >= 0 ? "+" : ""}${formatAmount(totalEvalPL, currency)}`
                        : "-"}
                    </td>

                    {/* 수익률 합계 — 총 평가손익 / 총 매입원가 */}
                    <td className={cn("px-3 py-2 text-right tabular-nums font-semibold",
                      totalEvalPLPct != null ? plColor(totalEvalPLPct) : "text-muted-foreground"
                    )}>
                      {totalEvalPLPct != null
                        ? `${totalEvalPLPct >= 0 ? "+" : ""}${totalEvalPLPct.toFixed(2)}%`
                        : "-"}
                    </td>

                    {/* 누적실현 합계 */}
                    <td className={cn("px-3 py-2 text-right tabular-nums",
                      totalRealizedPL !== 0 ? plColor(totalRealizedPL) : "text-muted-foreground"
                    )}>
                      {totalRealizedPL !== 0
                        ? `${totalRealizedPL >= 0 ? "+" : ""}${formatAmount(totalRealizedPL, currency)}`
                        : "-"}
                    </td>

                    {/* 비중 합계 (항상 100%) */}
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      100%
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
