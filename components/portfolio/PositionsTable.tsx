"use client";

// 보유 포지션 테이블
// 키움 API에서 수집한 실시간 보유 종목 현황을 표시
// 수익률·평가손익은 양수=초록, 음수=빨강으로 색상 구분
// 계좌 내 비중은 전체 평가금액 대비 각 종목 비율

import { TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KiwoomPosition } from "@/types/portfolio";

interface PositionsTableProps {
  positions: KiwoomPosition[];
  isLoading: boolean;
  onRefresh: () => void;
  fetchedAt?: string;
}

// 종목코드 → 네이버 금융 URL 생성
// 6자리 숫자: 국내 주식, 그 외: 해외 주식 검색
function naverStockUrl(code: string): string {
  return /^\d{6}$/.test(code)
    ? `https://stock.naver.com/domestic/stock/${code}/price`
    : `https://finance.naver.com/world/sise.nhn?symbol=${code}`;
}

// 수익률에 따른 색상 클래스
function plColor(value: number): string {
  if (value > 0) return "text-red-500";    // 한국 주식: 상승=빨강
  if (value < 0) return "text-blue-500";   // 하락=파랑
  return "text-muted-foreground";
}

// 수익률 방향 아이콘
function PlIcon({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-3 w-3 text-red-500" />;
  if (value < 0) return <TrendingDown className="h-3 w-3 text-blue-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

export function PositionsTable({
  positions,
  isLoading,
  onRefresh,
  fetchedAt,
}: PositionsTableProps) {
  // 전체 평가금액 합계 (비중 계산용)
  const totalEvalAmount = positions.reduce((sum, p) => sum + p.evalAmount, 0);

  const fetchedTime = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">보유 포지션</CardTitle>
            {fetchedTime && (
              <CardDescription className="text-[10px] mt-0.5">
                기준 시각: {fetchedTime}
              </CardDescription>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            새로고침
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          // 로딩 스켈레톤
          <div className="px-4 pb-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="px-4 pb-4 py-8 text-center text-xs text-muted-foreground">
            현재 보유 중인 종목이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">종목</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">수량</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">평균단가</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">현재가</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">평가금액</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">평가손익</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">수익률</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">비중</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positions.map((pos) => {
                  const weight =
                    totalEvalAmount > 0
                      ? ((pos.evalAmount / totalEvalAmount) * 100).toFixed(1)
                      : "0.0";

                  return (
                    <tr
                      key={pos.stockCode}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      {/* 종목명 + 코드 — 종목명 클릭 시 네이버 금융 이동 */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <PlIcon value={pos.profitLossPct} />
                          <div>
                            <a
                              href={naverStockUrl(pos.stockCode)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:underline hover:text-emerald-600 transition-colors"
                            >
                              {pos.stockName}
                            </a>
                            <p className="text-[10px] text-muted-foreground">{pos.stockCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {pos.quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {pos.avgPrice.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {pos.currentPrice.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {pos.evalAmount.toLocaleString()}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium", plColor(pos.profitLoss))}>
                        {pos.profitLoss >= 0 ? "+" : ""}
                        {pos.profitLoss.toLocaleString()}
                      </td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums font-semibold", plColor(pos.profitLossPct))}>
                        {pos.profitLossPct >= 0 ? "+" : ""}
                        {pos.profitLossPct.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {weight}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* 합계 행 */}
              {positions.length > 1 && (
                <tfoot>
                  <tr className="border-t bg-muted/20 font-medium">
                    <td className="px-4 py-2 text-muted-foreground">합계</td>
                    <td colSpan={3} />
                    <td className="px-3 py-2 text-right tabular-nums">
                      {totalEvalAmount.toLocaleString()}
                    </td>
                    <td className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      plColor(positions.reduce((s, p) => s + p.profitLoss, 0))
                    )}>
                      {(() => {
                        const total = positions.reduce((s, p) => s + p.profitLoss, 0);
                        return `${total >= 0 ? "+" : ""}${total.toLocaleString()}`;
                      })()}
                    </td>
                    <td colSpan={2} />
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
