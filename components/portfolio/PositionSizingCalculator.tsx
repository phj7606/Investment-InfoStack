"use client";

// 포지션 사이징 계산기
// 종목 매수 시 적정 수량을 계산한다.
//
// 공식:
//   riskAmount   = totalCapital × multipleR
//   stopRange    = buyPrice - stopLossPrice  (단위: 원/주)
//   maxShares    = floor(riskAmount / stopRange)
//   investAmount = maxShares × buyPrice
//
// 추가 표시:
//   oneTimeInvestment = totalCapital / (unit + 1)  (1회 투자 한도)
//   실제 투자금액 vs 1회 투자 한도 비교

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RiskManagementConfig } from "@/types/portfolio";

interface PositionSizingCalculatorProps {
  config: RiskManagementConfig;
}

export function PositionSizingCalculator({ config }: PositionSizingCalculatorProps) {
  const [buyPrice, setBuyPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");

  // ── 계산 ──────────────────────────────────
  const buy = parseFloat(buyPrice.replace(/,/g, "")) || 0;
  const stop = parseFloat(stopPrice.replace(/,/g, "")) || 0;

  // 종목당 허용 손실액 (Multiple R 기준)
  const riskAmount = Math.round(config.totalCapital * config.multipleR);

  // 주당 손실폭
  const stopRange = buy > stop && stop > 0 ? buy - stop : 0;

  // 최대 매수 수량
  const maxShares = stopRange > 0 ? Math.floor(riskAmount / stopRange) : 0;

  // 실제 투자금액
  const investAmount = maxShares * buy;

  // 1회 투자 한도
  const oneTimeLimit =
    config.totalCapital > 0 && config.unit > 0
      ? Math.round(config.totalCapital / (config.unit + 1))
      : 0;

  // 실제 손절 시 손실액
  const actualLoss = maxShares * stopRange;

  // 투자금액 vs 1회 한도 초과 여부
  const isOverLimit = oneTimeLimit > 0 && investAmount > oneTimeLimit;

  // 손절 비율 (매수가 대비)
  const stopPct = buy > 0 && stop > 0 ? ((stop - buy) / buy) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">포지션 사이징 계산기</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 입력 영역 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-0.5">
            <label className="text-[11px] font-medium text-muted-foreground">매수 예정가 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="예: 50000"
              className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[11px] font-medium text-muted-foreground">손절 기준가 (원)</label>
            <input
              type="text"
              inputMode="numeric"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="예: 46000"
              className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* 결과 영역 */}
        {config.totalCapital > 0 ? (
          <div className="space-y-1.5">
            {/* 구분선 */}
            <div className="border-t border-border/40 pt-1.5 space-y-1">
              {/* 허용 손실액 */}
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  허용 손실액 ({Math.round(config.multipleR * 100)}% R)
                </span>
                <span className="font-medium">{riskAmount.toLocaleString()}</span>
              </div>

              {/* 손절 폭 */}
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">
                  주당 손절폭{stopPct !== 0 ? ` (${stopPct.toFixed(1)}%)` : ""}
                </span>
                <span className="font-medium">
                  {stopRange > 0 ? `${stopRange.toLocaleString()}` : "-"}
                </span>
              </div>
            </div>

            {/* 핵심 결과 — 최대 수량 */}
            <div className={cn(
              "rounded-lg px-3 py-2.5 text-center",
              maxShares > 0
                ? "bg-emerald-500/10 border border-emerald-300 dark:border-emerald-700"
                : "bg-muted/50"
            )}>
              <p className="text-[10px] text-muted-foreground mb-0.5">최대 매수 수량</p>
              <p className={cn(
                "text-xl font-bold tabular-nums",
                maxShares > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              )}>
                {maxShares > 0 ? `${maxShares.toLocaleString()}주` : "-"}
              </p>
            </div>

            {/* 세부 결과 */}
            {maxShares > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">투자 금액</span>
                  <span className={cn("font-semibold", isOverLimit ? "text-red-500" : "")}>
                    {investAmount.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">실제 손실 (손절 시)</span>
                  <span className="font-medium text-red-500 dark:text-red-400">
                    -{actualLoss.toLocaleString()}
                  </span>
                </div>

                {/* 1회 투자 한도 비교 */}
                {oneTimeLimit > 0 && (
                  <div className={cn(
                    "flex justify-between text-xs rounded px-2 py-1 mt-1",
                    isOverLimit
                      ? "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                      : "bg-muted/50 text-muted-foreground"
                  )}>
                    <span>1회 투자 한도</span>
                    <span className="font-semibold">
                      {oneTimeLimit.toLocaleString()}
                      {isOverLimit && " ⚠ 초과"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-[11px] text-muted-foreground py-2">
            계좌관리 설정에서 Account Total을 입력하세요.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
