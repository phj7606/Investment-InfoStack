"use client";

// 거래실적 테이블
// 매도 완료 거래를 기준으로 WIN/LOSS 성과를 표시
// 필터: 기간(전체/올해/최근3개월) + 결과(전체/WIN/LOSS)
// 수동 추가: "매도 입력" 버튼으로 새 거래 append

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StockPerformance } from "@/types/portfolio";

interface TradeHistoryTableProps {
  performances: StockPerformance[];
  isLoading: boolean;
  /** 수동 매도 추가 콜백 — 거래실적에 append */
  onAppend?: (perf: StockPerformance) => void;
}

type PeriodFilter = "all" | "ytd" | "3m";
type ResultFilter = "all" | "WIN" | "LOSS";

export function TradeHistoryTable({
  performances,
  isLoading,
  onAppend,
}: TradeHistoryTableProps) {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  // ── 수동 매도 입력 폼 상태 ──
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [form, setForm] = useState({
    exitDate: new Date().toISOString().slice(0, 10),
    stockCode: "",
    stockName: "",
    holdingDays: "",
    profitLoss: "",
    profitLossPct: "",
  });

  const now = new Date();
  const ytdStart = `${now.getFullYear()}-01-01`;
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  // 필터링된 목록 (날짜 내림차순)
  const filtered = useMemo(() => {
    let result = [...performances].sort((a, b) =>
      b.exitDate.localeCompare(a.exitDate)
    );
    if (periodFilter === "ytd") result = result.filter((p) => p.exitDate >= ytdStart);
    else if (periodFilter === "3m") result = result.filter((p) => p.exitDate >= threeMonthsAgo);
    if (resultFilter !== "all") result = result.filter((p) => p.result === resultFilter);
    return result;
  }, [performances, periodFilter, resultFilter, ytdStart, threeMonthsAgo]);

  const filteredWins = filtered.filter((p) => p.result === "WIN").length;
  const filteredTotal = filtered.length;
  const filteredPL = filtered.reduce((sum, p) => sum + p.profitLoss, 0);

  const plColor = (v: number) =>
    v > 0 ? "text-red-500" : v < 0 ? "text-blue-500" : "text-muted-foreground";

  // 수동 매도 저장
  function handleAddSubmit() {
    if (!form.stockCode.trim() || !form.exitDate) return;
    const profitLossPct = parseFloat(form.profitLossPct) || 0;
    const newPerf: StockPerformance = {
      stockCode: form.stockCode.trim(),
      stockName: form.stockName.trim(),
      exitDate: form.exitDate,
      holdingDays: parseInt(form.holdingDays, 10) || 0,
      profitLoss: Math.round(parseFloat(form.profitLoss.replace(/,/g, "")) || 0),
      profitLossPct,
      result: profitLossPct > 0 ? "WIN" : "LOSS",
    };
    onAppend?.(newPerf);
    // 폼 초기화
    setForm({
      exitDate: new Date().toISOString().slice(0, 10),
      stockCode: "",
      stockName: "",
      holdingDays: "",
      profitLoss: "",
      profitLossPct: "",
    });
    setAddDialogOpen(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">거래실적</CardTitle>
          {/* 수동 매도 추가 버튼 */}
          {onAppend && (
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1">
                  <PlusCircle className="h-3.5 w-3.5" />
                  매도 입력
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle className="text-sm">매도 거래 추가</DialogTitle>
                </DialogHeader>
                <div className="space-y-2.5 pt-1 text-xs">
                  {/* 매도일 */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">매도일</label>
                    <input
                      type="date"
                      value={form.exitDate}
                      onChange={(e) => setForm({ ...form, exitDate: e.target.value })}
                      className="mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  {/* 종목코드 + 종목명 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">종목코드</label>
                      <input
                        type="text"
                        value={form.stockCode}
                        onChange={(e) => setForm({ ...form, stockCode: e.target.value })}
                        placeholder="예: 005930"
                        className="mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">종목명</label>
                      <input
                        type="text"
                        value={form.stockName}
                        onChange={(e) => setForm({ ...form, stockName: e.target.value })}
                        placeholder="예: 삼성전자"
                        className="mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  {/* 보유일수 */}
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground">보유일수</label>
                    <input
                      type="number"
                      value={form.holdingDays}
                      onChange={(e) => setForm({ ...form, holdingDays: e.target.value })}
                      placeholder="예: 14"
                      min="0"
                      className="mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  {/* 손익 + 수익률 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">손익 (원)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.profitLoss}
                        onChange={(e) => setForm({ ...form, profitLoss: e.target.value })}
                        placeholder="예: 150000"
                        className="mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">수익률 (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form.profitLossPct}
                        onChange={(e) => setForm({ ...form, profitLossPct: e.target.value })}
                        placeholder="예: 8.5"
                        className="mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleAddSubmit}
                    disabled={!form.stockCode.trim()}
                    className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    추가
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* 필터 컨트롤 */}
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="flex gap-1">
            {(["all", "ytd", "3m"] as PeriodFilter[]).map((f) => (
              <Button
                key={f}
                variant={periodFilter === f ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px]",
                  periodFilter === f && "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
                onClick={() => setPeriodFilter(f)}
              >
                {f === "all" ? "전체" : f === "ytd" ? "올해" : "최근3개월"}
              </Button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["all", "WIN", "LOSS"] as ResultFilter[]).map((f) => (
              <Button
                key={f}
                variant={resultFilter === f ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-6 px-2 text-[10px]",
                  resultFilter === f && f === "WIN" && "bg-red-500 hover:bg-red-600 text-white",
                  resultFilter === f && f === "LOSS" && "bg-blue-500 hover:bg-blue-600 text-white",
                  resultFilter === f && f === "all" && "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
                onClick={() => setResultFilter(f)}
              >
                {f === "all" ? "전체" : f}
              </Button>
            ))}
          </div>
        </div>

        {/* 필터 구간 집계 요약 */}
        {filteredTotal > 0 && (
          <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>{filteredTotal}건</span>
            <span>WIN {filteredWins} / LOSS {filteredTotal - filteredWins}</span>
            <span className={cn("font-medium", plColor(filteredPL))}>
              {filteredPL >= 0 ? "+" : ""}{filteredPL.toLocaleString()}원
            </span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 pb-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 pb-4 py-8 text-center text-xs text-muted-foreground">
            {performances.length === 0
              ? "거래실적이 없습니다."
              : "해당 필터 조건의 거래 내역이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">매도일</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">종목</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">보유일</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">손익</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">수익률</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">결과</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((perf, idx) => (
                  <tr
                    key={`${perf.stockCode}-${perf.exitDate}-${idx}`}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                      {perf.exitDate}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{perf.stockName || perf.stockCode}</p>
                      {perf.stockName && (
                        <p className="text-[10px] text-muted-foreground">{perf.stockCode}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {perf.holdingDays > 0 ? `${perf.holdingDays}일` : "-"}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums font-medium", plColor(perf.profitLoss))}>
                      {perf.profitLoss >= 0 ? "+" : ""}{perf.profitLoss.toLocaleString()}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right tabular-nums font-semibold", plColor(perf.profitLossPct))}>
                      {perf.profitLossPct >= 0 ? "+" : ""}{perf.profitLossPct.toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0",
                          perf.result === "WIN"
                            ? "border-red-400 text-red-500 bg-red-50 dark:bg-red-950/30"
                            : "border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-950/30"
                        )}
                      >
                        {perf.result}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
