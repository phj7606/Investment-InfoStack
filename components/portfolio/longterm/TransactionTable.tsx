"use client";

// 중장기 투자 거래 내역 테이블
// - 종목코드/종목명 검색 + 계좌·시장·종류·유형 필터
// - 종목명 클릭 시 해당 종목만 드릴다운 필터링
// - BUY=파랑 뱃지, SELL=빨강 뱃지, DIVIDEND=초록 뱃지
// - SELL 건의 realizedPL 색상 표시 (한국 컨벤션: 양수=red-500, 음수=blue-500)
// - 날짜 내림차순 기본 정렬

import { useState, useMemo } from "react";
import { Trash2, Pencil, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LongtermTransaction } from "@/types/portfolio";

interface TransactionTableProps {
  transactions: LongtermTransaction[];
  isLoading: boolean;
  onDelete: (id: string) => void;
  onEdit: (tx: LongtermTransaction) => void;
}

// 필터 상태 타입
type AccountFilter = "all" | "4802" | "1635" | "1402" | "8654";
type MarketFilter = "all" | "KR" | "US";
type AssetTypeFilter = "all" | "STOCK" | "FUND" | "ETF";
type TradeTypeFilter = "all" | "BUY" | "SELL" | "DIVIDEND";

// 수익률 색상 헬퍼 (한국 컨벤션)
function plColor(value: number): string {
  if (value > 0) return "text-red-500";
  if (value < 0) return "text-blue-500";
  return "text-muted-foreground";
}

// 거래유형 뱃지 색상 정의
function tradeTypeBadgeClass(type: LongtermTransaction["tradeType"]): string {
  switch (type) {
    case "BUY":
      return "border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-950/30";
    case "SELL":
      return "border-red-400 text-red-500 bg-red-50 dark:bg-red-950/30";
    case "DIVIDEND":
      return "border-emerald-400 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30";
  }
}

// 금액 포맷 (통화 단위 표시)
function formatAmount(amount: number, currency: "KRW" | "USD"): string {
  if (currency === "USD") {
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${amount.toLocaleString()}원`;
}

export function TransactionTable({
  transactions,
  isLoading,
  onDelete,
  onEdit,
}: TransactionTableProps) {
  // ── 검색어 상태 ──
  const [search, setSearch] = useState("");

  // ── 필터 상태 ──
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetTypeFilter>("all");
  const [tradeTypeFilter, setTradeTypeFilter] = useState<TradeTypeFilter>("all");

  // ── 드릴다운: 클릭된 종목코드 ──
  const [drilldownCode, setDrilldownCode] = useState<string | null>(null);

  // ── 필터링 + 정렬 처리 ──
  const filtered = useMemo(() => {
    let result = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

    // 드릴다운 필터 (종목명 클릭 시)
    if (drilldownCode) {
      result = result.filter((t) => t.stockCode === drilldownCode);
    }

    // 검색 필터 (종목코드 또는 종목명)
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.stockCode.toLowerCase().includes(q) ||
          t.stockName.toLowerCase().includes(q)
      );
    }

    // 개별 필터 적용
    if (accountFilter !== "all") result = result.filter((t) => t.accountNo === accountFilter);
    if (marketFilter !== "all") result = result.filter((t) => t.market === marketFilter);
    if (assetTypeFilter !== "all") result = result.filter((t) => t.assetType === assetTypeFilter);
    if (tradeTypeFilter !== "all") result = result.filter((t) => t.tradeType === tradeTypeFilter);

    return result;
  }, [transactions, search, drilldownCode, accountFilter, marketFilter, assetTypeFilter, tradeTypeFilter]);

  // 드릴다운 종목명 (상태 표시용)
  const drilldownName = drilldownCode
    ? transactions.find((t) => t.stockCode === drilldownCode)?.stockName
    : null;

  // 필터 버튼 공통 스타일 헬퍼
  function filterBtnClass(active: boolean): string {
    return cn(
      "h-6 px-2 text-[10px]",
      active && "bg-emerald-600 hover:bg-emerald-700 text-white"
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        {/* ── 헤더: 타이틀 + 드릴다운 표시 ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">거래 내역</CardTitle>
            {/* 드릴다운 모드 배지 */}
            {drilldownCode && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/30 cursor-pointer"
                onClick={() => setDrilldownCode(null)}
              >
                {drilldownName ?? drilldownCode}
                <X className="ml-1 h-2.5 w-2.5" />
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{filtered.length}건</span>
        </div>

        {/* ── 검색 인풋 ── */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="종목코드 또는 종목명 검색..."
            className="w-full rounded border border-input bg-background pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {/* 검색어 지우기 */}
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* ── 필터 버튼 그룹 ── */}
        <div className="flex flex-wrap gap-2 mt-2">
          {/* 계좌 필터 */}
          <div className="flex gap-1">
            {(["all", "4802", "1635", "1402", "8654"] as AccountFilter[]).map((f) => (
              <Button
                key={f}
                variant={accountFilter === f ? "default" : "outline"}
                size="sm"
                className={filterBtnClass(accountFilter === f)}
                onClick={() => setAccountFilter(f)}
              >
                {f === "all" ? "전체계좌" : f}
              </Button>
            ))}
          </div>

          {/* 시장 필터 */}
          <div className="flex gap-1">
            {(["all", "KR", "US"] as MarketFilter[]).map((f) => (
              <Button
                key={f}
                variant={marketFilter === f ? "default" : "outline"}
                size="sm"
                className={filterBtnClass(marketFilter === f)}
                onClick={() => setMarketFilter(f)}
              >
                {f === "all" ? "전체시장" : f}
              </Button>
            ))}
          </div>

          {/* 종류 필터 */}
          <div className="flex gap-1">
            {(["all", "STOCK", "FUND", "ETF"] as AssetTypeFilter[]).map((f) => (
              <Button
                key={f}
                variant={assetTypeFilter === f ? "default" : "outline"}
                size="sm"
                className={filterBtnClass(assetTypeFilter === f)}
                onClick={() => setAssetTypeFilter(f)}
              >
                {f === "all" ? "전체종류" : f}
              </Button>
            ))}
          </div>

          {/* 유형 필터 */}
          <div className="flex gap-1">
            {(["all", "BUY", "SELL", "DIVIDEND"] as TradeTypeFilter[]).map((f) => (
              <Button
                key={f}
                variant={tradeTypeFilter === f ? "default" : "outline"}
                size="sm"
                className={filterBtnClass(tradeTypeFilter === f)}
                onClick={() => setTradeTypeFilter(f)}
              >
                {f === "all" ? "전체유형" : f}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          // 로딩 스켈레톤
          <div className="px-4 pb-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 pb-4 py-8 text-center text-xs text-muted-foreground">
            {transactions.length === 0
              ? "거래 내역이 없습니다."
              : "해당 조건의 거래 내역이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">날짜</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">계좌</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">종목</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground">유형</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">수량</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">단가</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">금액</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">매도손익</th>
                  <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                    {/* 날짜 */}
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">
                      {tx.date}
                    </td>

                    {/* 계좌번호 */}
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {tx.accountNo}
                    </td>

                    {/* 종목명+코드: 클릭 시 드릴다운 */}
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() =>
                          setDrilldownCode(
                            drilldownCode === tx.stockCode ? null : tx.stockCode
                          )
                        }
                        className="text-left hover:underline focus:outline-none"
                      >
                        <p className="font-medium">{tx.stockName}</p>
                        <p className="text-[10px] text-muted-foreground">{tx.stockCode}</p>
                      </button>
                    </td>

                    {/* 거래유형 뱃지 */}
                    <td className="px-3 py-2.5 text-center">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] font-bold px-1.5 py-0", tradeTypeBadgeClass(tx.tradeType))}
                      >
                        {tx.tradeType}
                      </Badge>
                    </td>

                    {/* 수량 */}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {tx.quantity.toLocaleString()}
                    </td>

                    {/* 단가 */}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {tx.currency === "USD"
                        ? `$${tx.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : tx.price.toLocaleString()}
                    </td>

                    {/* 거래금액 */}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatAmount(tx.amount, tx.currency)}
                    </td>

                    {/* 매도손익 (SELL 건만 표시) */}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {tx.tradeType === "SELL" && tx.realizedPL !== undefined ? (
                        <span className={cn("font-medium", plColor(tx.realizedPL))}>
                          {tx.realizedPL >= 0 ? "+" : ""}
                          {formatAmount(tx.realizedPL, tx.currency)}
                          {tx.realizedPLPct !== undefined && (
                            <span className="ml-1 text-[10px]">
                              ({tx.realizedPLPct >= 0 ? "+" : ""}
                              {tx.realizedPLPct.toFixed(2)}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>

                    {/* 편집 / 삭제 버튼 */}
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => onEdit(tx)}
                          className="text-muted-foreground hover:text-blue-500 transition-colors"
                          title="편집"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(tx.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
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
