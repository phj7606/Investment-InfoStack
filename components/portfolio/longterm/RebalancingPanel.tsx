"use client";

// 리밸런싱 목표 비중 설정 + 제안 테이블
// - 현재 포지션 목록에서 종목별 목표% 입력 (합계 100% 체크)
// - localStorage에 저장 (LONGTERM_REBALANCING_KEY)
// - 현재 vs 목표 비중 비교 바: 초과=red, 미달=blue, 적정=green
// - 리밸런싱 제안 테이블: 매수/매도 금액 표시

import { useState, useEffect, useMemo } from "react";
import { Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LongtermPosition, RebalancingTarget } from "@/types/portfolio";
import { LONGTERM_REBALANCING_KEY } from "@/types/portfolio";
import {
  calcRebalancingSuggestions,
  type RebalancingSuggestion,
} from "@/lib/portfolio/longterm-calc";

interface RebalancingPanelProps {
  positions: LongtermPosition[];
}

// 비중 차이에 따른 색상 결정
// - |diffPct| < 1%p → green (적정)
// - 초과 (현재 > 목표) → red
// - 미달 (현재 < 목표) → blue
function weightBarColor(diffPct: number): string {
  if (Math.abs(diffPct) < 1) return "bg-emerald-500";
  if (diffPct > 0) return "bg-blue-500";  // 현재 < 목표 → 매수 필요 → 파랑
  return "bg-red-500";                     // 현재 > 목표 → 매도 필요 → 빨강
}

// action 배지 색상
function actionClass(action: RebalancingSuggestion["action"]): string {
  switch (action) {
    case "BUY":
      return "text-blue-500";
    case "SELL":
      return "text-red-500";
    case "HOLD":
      return "text-emerald-600";
  }
}

// 금액 포맷 (절대값, 통화 자동 결정 없이 원화 기준 — 리밸런싱은 동일 통화 내에서만)
function formatSuggestionAmount(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100_000_000) return `${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${(abs / 10_000).toFixed(0)}만`;
  return abs.toLocaleString();
}

export function RebalancingPanel({ positions }: RebalancingPanelProps) {
  // 목표 비중 입력값 (종목코드 → 퍼센트 문자열)
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  // localStorage에서 저장된 목표 비중 초기화
  const [saved, setSaved] = useState(false);

  // 컴포넌트 마운트 시 localStorage에서 목표 비중 불러오기
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LONGTERM_REBALANCING_KEY);
      if (stored) {
        const targets: RebalancingTarget[] = JSON.parse(stored);
        const inputs: Record<string, string> = {};
        for (const t of targets) {
          inputs[t.stockCode] = String(Math.round(t.targetWeight * 1000) / 10); // 0.15 → "15"
        }
        setTargetInputs(inputs);
      }
    } catch {
      // localStorage 읽기 실패 시 초기값 유지
    }
  }, []);

  // 합계 % 계산
  const totalPct = useMemo(() => {
    return Object.values(targetInputs).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }, [targetInputs]);

  const isValid = Math.abs(totalPct - 100) < 0.01;

  // 목표 비중 저장
  function handleSave() {
    const targets: RebalancingTarget[] = positions.map((p) => ({
      stockCode: p.stockCode,
      stockName: p.stockName,
      targetWeight: (parseFloat(targetInputs[p.stockCode] || "0") || 0) / 100,
    }));

    try {
      localStorage.setItem(LONGTERM_REBALANCING_KEY, JSON.stringify(targets));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // localStorage 쓰기 실패 무시
    }
  }

  // 비중 초기화 (균등 분배)
  function handleEqualDistribute() {
    if (positions.length === 0) return;
    const each = (100 / positions.length).toFixed(2);
    const inputs: Record<string, string> = {};
    positions.forEach((p) => { inputs[p.stockCode] = each; });
    setTargetInputs(inputs);
  }

  // 리밸런싱 제안 계산
  const suggestions = useMemo(() => {
    const targets: RebalancingTarget[] = positions.map((p) => ({
      stockCode: p.stockCode,
      stockName: p.stockName,
      targetWeight: (parseFloat(targetInputs[p.stockCode] || "0") || 0) / 100,
    }));
    return calcRebalancingSuggestions(positions, targets);
  }, [positions, targetInputs]);

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">리밸런싱</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">보유 포지션이 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── 목표 비중 설정 카드 ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">목표 비중 설정</CardTitle>
              <CardDescription className="text-[11px] mt-0.5">
                합계: {totalPct.toFixed(2)}%
                {!isValid && totalPct > 0 && (
                  <span className="ml-2 text-red-500">
                    ({totalPct > 100 ? "+" : ""}{(totalPct - 100).toFixed(2)}%p 초과)
                  </span>
                )}
                {isValid && <span className="ml-2 text-emerald-600">✓ 합계 100%</span>}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {/* 균등 분배 버튼 */}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={handleEqualDistribute}
              >
                <RefreshCw className="h-3 w-3" />
                균등분배
              </Button>
              {/* 저장 버튼 */}
              <Button
                size="sm"
                className={cn(
                  "h-7 text-[11px] gap-1",
                  saved
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
                onClick={handleSave}
              >
                <Save className="h-3 w-3" />
                {saved ? "저장됨" : "저장"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="space-y-3">
            {positions.map((pos) => {
              const targetPct = parseFloat(targetInputs[pos.stockCode] || "0") || 0;
              const currentPct = pos.currentWeight * 100;

              return (
                <div key={pos.stockCode} className="space-y-1">
                  {/* 종목명 + 입력 */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium truncate">{pos.stockName}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        현재 {currentPct.toFixed(1)}%
                      </span>
                    </div>
                    {/* 목표% 입력 */}
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={targetInputs[pos.stockCode] ?? ""}
                        onChange={(e) =>
                          setTargetInputs({ ...targetInputs, [pos.stockCode]: e.target.value })
                        }
                        placeholder="0"
                        className="w-16 rounded border border-input bg-background px-2 py-0.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <span className="text-[11px] text-muted-foreground">%</span>
                    </div>
                  </div>

                  {/* 현재 vs 목표 비중 비교 바 */}
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    {/* 현재 비중 바 */}
                    <div
                      className={cn(
                        "absolute left-0 top-0 h-full rounded-full transition-all duration-300",
                        // 현재가 없으면 회색
                        pos.currentPrice !== undefined
                          ? weightBarColor(targetPct - currentPct)
                          : "bg-muted-foreground/30"
                      )}
                      style={{ width: `${Math.min(currentPct, 100)}%` }}
                    />
                    {/* 목표 비중 마커 (점선) */}
                    {targetPct > 0 && (
                      <div
                        className="absolute top-0 h-full w-0.5 bg-foreground/40"
                        style={{ left: `${Math.min(targetPct, 100)}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 리밸런싱 제안 테이블 ── */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">리밸런싱 제안</CardTitle>
            <CardDescription className="text-[11px]">
              ±1%p 이내는 HOLD (조정 불필요)
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-2 text-left font-medium text-muted-foreground">종목</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">현재비중</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">목표비중</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">차이</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">금액</th>
                    <th className="px-3 py-2 text-center font-medium text-muted-foreground">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {suggestions.map((s) => (
                    <tr key={s.stockCode} className="hover:bg-muted/20 transition-colors">
                      {/* 종목명 */}
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{s.stockName}</p>
                        <p className="text-[10px] text-muted-foreground">{s.stockCode}</p>
                      </td>

                      {/* 현재 비중 */}
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {(s.currentWeight * 100).toFixed(1)}%
                      </td>

                      {/* 목표 비중 */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {(s.targetWeight * 100).toFixed(1)}%
                      </td>

                      {/* 차이 %p */}
                      <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium",
                        Math.abs(s.diffPct) < 1 ? "text-muted-foreground"
                        : s.diffPct > 0 ? "text-blue-500"
                        : "text-red-500"
                      )}>
                        {s.diffPct >= 0 ? "+" : ""}{s.diffPct.toFixed(2)}%p
                      </td>

                      {/* 매수/매도 금액 */}
                      <td className={cn("px-3 py-2.5 text-right tabular-nums",
                        s.action === "HOLD" ? "text-muted-foreground" : actionClass(s.action)
                      )}>
                        {s.action === "HOLD"
                          ? "-"
                          : `${s.diffAmount > 0 ? "+" : "-"}${formatSuggestionAmount(s.diffAmount)}`}
                      </td>

                      {/* 액션 */}
                      <td className={cn("px-3 py-2.5 text-center font-bold", actionClass(s.action))}>
                        {s.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
