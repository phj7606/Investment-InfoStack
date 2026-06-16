"use client";

// 종목별 거래 이력 + 소계 뷰
// - stockCode 기준으로 그룹화
// - 각 종목을 Collapsible accordion으로 표시
// - lg 이상 화면에서는 2컬럼 그리드 배치
// - 테이블 컬럼은 colgroup 고정 너비 + overflow-x-auto로 정렬 보장

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { LongtermTransaction } from "@/types/portfolio";
import { naverStockUrl } from "@/lib/utils";

// 종목별 탭에서 거래 추가 시 미리 채울 종목 정보
export interface StockPrefill {
  stockCode: string;
  stockName: string;
  market: "KR" | "US";
  assetType: "STOCK" | "ETF";
  accountNo: string;
}

type HoldingFilter = "all" | "holding" | "executed";

// ─────────────────────────────────────────
// 종목별 집계 타입
// ─────────────────────────────────────────
interface StockSummary {
  stockCode: string;
  stockName: string;
  market: "KR" | "US";
  assetType: "STOCK" | "FUND" | "ETF";
  accountNo: string;
  currency: "KRW" | "USD";
  sector?: string;    // 섹터 (Short-term 계좌용)
  transactions: LongtermTransaction[];
  totalBuyQty: number;
  totalBuyAmt: number;   // 매수금액 합계 (수수료 제외)
  totalBuyFee: number;   // 매수수수료 합계 (취득원가에 포함)
  totalSellQty: number;
  totalSellAmt: number;  // 매도금액 합계 (수수료 제외)
  totalSellFee: number;  // 매도수수료 합계 (실현손익에서 차감)
  balance: number;
  avgCost: number;       // 평균단가 (수수료 제외) = 잔량원가 / 잔량수량
  fixedPL: number;       // 행별 실현손익 합계 (수수료 미포함, 저장된 realizedPL 기준)
  fixedPLPct: number;
  footerPL: number;      // 테이블 하단 실현손익 (수수료 포함): 총매도 - 취득원가 - 매수수수료 - 매도수수료
  footerPLPct: number;
  totalDividend: number;
}

// ─────────────────────────────────────────
// 그룹화 + 소계 계산
// ─────────────────────────────────────────
function groupByStock(transactions: LongtermTransaction[]): StockSummary[] {
  // stockCode+stockName+accountNo 복합 키로 분리
  // stockName을 포함하는 이유: Excel에서 ticker 컬럼 오기입으로 다른 종목이 같은
  // stockCode를 가질 수 있음 (예: KODEX200과 KODEX반도체가 모두 069500으로 저장되는 경우)
  const map = new Map<string, LongtermTransaction[]>();
  for (const tx of transactions) {
    const key = `${tx.stockCode}::${tx.stockName}::${tx.accountNo}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }

  const result: StockSummary[] = [];
  for (const [, txs] of map.entries()) {
    // 복합 키(_key)는 그룹핑에만 사용 — stockCode/accountNo는 실제 트랜잭션 데이터에서 읽음
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const first  = sorted[0];
    const buys   = sorted.filter((t) => t.tradeType === "BUY");
    const sells  = sorted.filter((t) => t.tradeType === "SELL");
    const divs   = sorted.filter((t) => t.tradeType === "DIVIDEND");

    const totalBuyQty  = buys.reduce((s, t) => s + t.quantity, 0);
    const totalBuyAmt  = buys.reduce((s, t) => s + t.amount, 0);
    const totalBuyFee  = buys.reduce((s, t) => s + (t.fee ?? 0), 0);
    const totalSellQty = sells.reduce((s, t) => s + t.quantity, 0);
    const totalSellAmt = sells.reduce((s, t) => s + t.amount, 0);
    const totalSellFee = sells.reduce((s, t) => s + (t.fee ?? 0), 0);
    const balance      = totalBuyQty - totalSellQty;

    // ── 잔량 기준 가중평균단가 추적 ──────────────────────────────────────
    // 단순 totalBuyAmt/totalBuyQty는 이미 매도한 수량의 원가까지 포함하여 틀림.
    // 거래를 시간순으로 추적하며 SELL 시 현재 평균단가 기준으로 비례 차감.
    let runQty       = 0;
    let runCost      = 0;  // 잔량 원가 누계 (수수료 제외)
    let sellCostBase = 0;  // 매도수량 취득원가 합계 (fee 미포함, 손익률 분모)

    for (const t of sorted) {
      if (t.tradeType === "BUY") {
        runQty  += t.quantity;
        runCost += t.amount;
      } else if (t.tradeType === "SELL") {
        const avgAtSell = runQty > 0 ? runCost / runQty : 0;
        sellCostBase += avgAtSell * t.quantity;
        runCost = Math.max(0, runCost - avgAtSell * t.quantity);
        runQty  = Math.max(0, runQty  - t.quantity);
      }
    }

    // 잔량 평균단가 = 잔량 원가 / 잔량 수량 (수수료 제외 — 행별 실현손익과 동일 기준)
    const avgCost = balance > 0 ? runCost / balance : 0;

    // 행별 실현손익 합계: enrichSellTransaction이 저장한 realizedPL 우선 사용
    const fixedPL = sells.reduce((s, t) => {
      if (t.realizedPL !== undefined) return s + t.realizedPL;
      // fallback: avgCostAtSell이 없으면 현재 avgCost 근사치 사용
      const refAvg = t.avgCostAtSell ?? avgCost;
      return s + (t.price - refAvg) * t.quantity;
    }, 0);
    const fixedPLPct = sellCostBase > 0 ? (fixedPL / sellCostBase) * 100 : 0;

    // 테이블 하단 실현손익 (수수료 포함):
    //   총매도금액 - 매도수량취득원가(fee제외) - 매수수수료전체 - 매도수수료전체
    const footerPL    = totalSellAmt - sellCostBase - totalBuyFee - totalSellFee;
    // 손익률 분모: 매도수량 취득원가 + 매수수수료 전체
    const footerPLPct = (sellCostBase + totalBuyFee) > 0
      ? (footerPL / (sellCostBase + totalBuyFee)) * 100
      : 0;

    const totalDividend = divs.reduce((s, t) => s + t.amount, 0);

    result.push({
      stockCode: first.stockCode,  // 복합 키가 아닌 실제 종목코드
      stockName: first.stockName, market: first.market,
      assetType: first.assetType, accountNo: first.accountNo, currency: first.currency,
      sector: first.sector,       // 섹터 (Short-term 계좌용, BUY 첫 거래에서 전파)
      transactions: sorted,
      totalBuyQty, totalBuyAmt, totalBuyFee,
      totalSellQty, totalSellAmt, totalSellFee,
      balance, avgCost, fixedPL, fixedPLPct,
      footerPL, footerPLPct,
      totalDividend,
    });
  }
  return result.sort((a, b) => a.stockName.localeCompare(b.stockName, "ko"));
}

// ─────────────────────────────────────────
// 포맷 헬퍼
// ─────────────────────────────────────────
function fmt(n: number, ccy: "KRW" | "USD"): string {
  return ccy === "USD"
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Math.round(n).toLocaleString("ko-KR");
}
function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

// ─────────────────────────────────────────
// 개별 종목 아코디언
// ─────────────────────────────────────────
function StockAccordion({
  stock,
  showSector = false,
  onAddTransaction,
}: {
  stock: StockSummary;
  showSector?: boolean;
  onAddTransaction?: (prefill: StockPrefill) => void;
}) {
  const [open, setOpen] = useState(false);
  const ccy  = stock.currency;
  const unit = ccy === "KRW" ? "" : "$";

  const mktCls  = stock.market === "KR" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700";
  const assCls  = stock.assetType === "ETF" ? "bg-violet-100 text-violet-700"
    : stock.assetType === "FUND" ? "bg-yellow-100 text-yellow-700"
    : "bg-gray-100 text-gray-700";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      {/* ── 헤더: min-h로 고정 최소 높이 — 인접 박스 높이와 무관하게 독립 유지 ── */}
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 hover:bg-muted/40 transition-colors text-left h-[72px]">
          {open
            ? <ChevronDown  className="h-3 w-3 text-muted-foreground shrink-0" />
            : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}

          {/* 종목명 → 네이버 금융 링크, 코드는 아래 텍스트로 표시 */}
          <div className="flex flex-col min-w-0 flex-1">
            <a
              href={naverStockUrl(stock.stockCode)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold truncate hover:underline hover:text-emerald-600 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {stock.stockName}
            </a>
            <span className="text-[10px] text-muted-foreground">{stock.stockCode}</span>
          </div>

          {/* 배지: showSector면 시장 배지 대신 섹터 배지 표시 */}
          <div className="hidden sm:flex items-center gap-1 shrink-0">
            {showSector
              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 max-w-[80px] truncate">{stock.sector ?? "-"}</span>
              : <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${mktCls}`}>{stock.market}</span>
            }
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${assCls}`}>{stock.assetType}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">{stock.accountNo}</span>
          </div>

          {/* 요약 수치 */}
          <div className="flex flex-col items-end text-[10px] shrink-0 ml-1">
            <span className="text-muted-foreground">잔량 <span className="font-medium text-foreground">{stock.balance.toLocaleString()}</span>주</span>
            {stock.totalSellQty > 0 && (
              <span className={stock.footerPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                {stock.footerPL >= 0 ? "+" : ""}{fmt(stock.footerPL, ccy)}{unit}
                <span className="opacity-70 ml-0.5">({fmtPct(stock.footerPLPct)})</span>
              </span>
            )}
            {stock.totalDividend > 0 && (
              <span className="text-blue-600">배당 {fmt(stock.totalDividend, ccy)}{unit}</span>
            )}
          </div>

          {/* 거래 추가 버튼 — accordion 토글과 독립적으로 동작 */}
          {onAddTransaction && (
            <button
              type="button"
              className="shrink-0 ml-1 p-1 rounded hover:bg-emerald-100 hover:text-emerald-700 text-muted-foreground transition-colors"
              title="거래 추가"
              onClick={(e) => {
                e.stopPropagation();
                onAddTransaction({
                  stockCode: stock.stockCode,
                  stockName: stock.stockName,
                  market: stock.market,
                  assetType: stock.assetType === "FUND" ? "STOCK" : stock.assetType as "STOCK" | "ETF",
                  accountNo: stock.accountNo,
                });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </CollapsibleTrigger>

      {/* ── 펼쳐진 내용 ── */}
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-lg">

          {/* 거래 테이블: 고정 너비 컬럼 + 가로 스크롤 */}
          <div className="overflow-x-auto">
            <table className="text-[11px] border-collapse" style={{ width: "680px" }}>
              <colgroup>
                <col style={{ width: "90px" }} />
                <col style={{ width: "46px" }} />
                <col style={{ width: "64px" }} />
                <col style={{ width: "88px" }} />
                <col style={{ width: "68px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "140px" }} />
                <col style={{ width: "84px" }} />
              </colgroup>
              <thead>
                <tr className="bg-muted/50 text-muted-foreground">
                  <th className="px-2 py-1.5 text-left font-medium">날짜</th>
                  <th className="px-1 py-1.5 text-center font-medium">구분</th>
                  <th className="px-2 py-1.5 text-right font-medium">수량</th>
                  <th className="px-2 py-1.5 text-right font-medium">단가</th>
                  <th className="px-2 py-1.5 text-right font-medium">수수료</th>
                  <th className="px-2 py-1.5 text-right font-medium">금액</th>
                  <th className="px-2 py-1.5 text-right font-medium">실현손익</th>
                  <th className="px-2 py-1.5 text-left font-medium">메모</th>
                </tr>
              </thead>
              <tbody>
                {stock.transactions.map((tx, idx) => (
                  <tr
                    key={tx.id}
                    className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                  >
                    <td className="px-2 py-1.5 tabular-nums text-muted-foreground whitespace-nowrap border-t">
                      {tx.date}
                    </td>
                    <td className="px-1 py-1.5 text-center font-medium border-t">
                      {tx.tradeType === "BUY"
                        ? <span className="text-blue-600">매수</span>
                        : tx.tradeType === "SELL"
                        ? <span className="text-red-500">매도</span>
                        : <span className="text-emerald-600">배당</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-t">
                      {tx.tradeType === "DIVIDEND" ? "—" : tx.quantity.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-t">
                      {tx.tradeType === "DIVIDEND" ? "—" : fmt(tx.price, ccy)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground border-t">
                      {tx.fee != null ? fmt(tx.fee, ccy) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium border-t">
                      {fmt(tx.amount, ccy)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-t">
                      {tx.tradeType === "SELL" && tx.realizedPL !== undefined ? (
                        <span className={tx.realizedPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                          {tx.realizedPL >= 0 ? "+" : ""}{fmt(tx.realizedPL, ccy)}
                          {tx.realizedPLPct !== undefined && (
                            <span className="opacity-70 text-[10px] ml-0.5">({fmtPct(tx.realizedPLPct)})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate border-t">
                      {tx.memo ?? ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── 소계 ── */}
          <div className="bg-muted/30 border-t px-3 py-2.5 grid grid-cols-4 gap-x-4 text-[11px]">
            {/* 총 매수: 금액 + 수수료 = 취득원가 합계 */}
            <div>
              <p className="text-muted-foreground text-[10px] mb-0.5">총 매수</p>
              <p className="font-medium tabular-nums">{stock.totalBuyQty.toLocaleString()}주</p>
              <p className="text-blue-600 tabular-nums">{fmt(stock.totalBuyAmt, ccy)}{unit}</p>
              {stock.totalBuyFee > 0 && (
                <p className="text-muted-foreground tabular-nums text-[10px]">
                  수수료 {fmt(stock.totalBuyFee, ccy)}{unit}
                </p>
              )}
            </div>
            {/* 총 매도: 금액 - 수수료 = 순 매도수익 */}
            <div>
              <p className="text-muted-foreground text-[10px] mb-0.5">총 매도</p>
              <p className="font-medium tabular-nums">{stock.totalSellQty.toLocaleString()}주</p>
              <p className="text-red-500 tabular-nums">{fmt(stock.totalSellAmt, ccy)}{unit}</p>
              {stock.totalSellFee > 0 && (
                <p className="text-muted-foreground tabular-nums text-[10px]">
                  수수료 {fmt(stock.totalSellFee, ccy)}{unit}
                </p>
              )}
            </div>
            {/* 잔량: 평균단가 = (매수금액 + 매수수수료) / 매수수량 */}
            <div>
              <p className="text-muted-foreground text-[10px] mb-0.5">잔량 (평균단가)</p>
              <p className="font-medium tabular-nums">{stock.balance.toLocaleString()}주</p>
              <p className="tabular-nums">{fmt(stock.avgCost, ccy)}{unit}</p>
            </div>
            {/* 실현손익 = 총매도 - 취득원가(fee제외) - 배분매수수수료 - 매도수수료 */}
            <div>
              <p className="text-muted-foreground text-[10px] mb-0.5">실현손익 / 배당</p>
              {stock.totalSellQty > 0 ? (
                <p className={`font-medium tabular-nums ${stock.footerPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                  {stock.footerPL >= 0 ? "+" : ""}{fmt(stock.footerPL, ccy)}{unit}
                  <span className="opacity-70 text-[10px] ml-0.5">({fmtPct(stock.footerPLPct)})</span>
                </p>
              ) : (
                <p className="text-muted-foreground tabular-nums">—</p>
              )}
              {stock.totalDividend > 0 && (
                <p className="text-blue-600 tabular-nums">배당 {fmt(stock.totalDividend, ccy)}{unit}</p>
              )}
            </div>
          </div>

        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────
type AccountFilter = "all" | "4802" | "1635" | "1402" | "2805" | "1470";

type AssetTypeFilter = "all" | "STOCK" | "ETF";

interface StockHistoryTableProps {
  transactions: LongtermTransaction[];
  isLoading?: boolean;
  /** true이면 시장(KR/US) 배지 대신 섹터 배지 표시 (Short-term 계좌용) */
  showSector?: boolean;
  /** true이면 국내/해외/전체 시장 필터 버튼 숨김 (단일 시장 계좌용) */
  hideMarketFilter?: boolean;
  /** 외부에서 시장 필터 제어 */
  marketFilter?: "all" | "KR" | "US";
  onMarketFilterChange?: (v: "all" | "KR" | "US") => void;
  /** 외부에서 계좌 필터 제어 */
  accountFilter?: AccountFilter;
  onAccountFilterChange?: (v: AccountFilter) => void;
  /** 외부에서 종류 필터 제어 */
  assetTypeFilter?: AssetTypeFilter;
  onAssetTypeFilterChange?: (v: AssetTypeFilter) => void;
  /** 보유상태 필터: 전체/보유중(잔량>0)/매도완료(잔량=0) */
  holdingFilter?: HoldingFilter;
  onHoldingFilterChange?: (v: HoldingFilter) => void;
  /** 종목별 탭에서 "+" 버튼 클릭 시 거래 추가 다이얼로그를 해당 종목으로 사전 채움 */
  onAddTransaction?: (prefill: StockPrefill) => void;
}

export function StockHistoryTable({
  transactions, isLoading, showSector = false, hideMarketFilter = false,
  marketFilter: externalMarket, onMarketFilterChange,
  accountFilter: externalAccount, onAccountFilterChange,
  assetTypeFilter: externalAssetType, onAssetTypeFilterChange,
  holdingFilter: externalHolding, onHoldingFilterChange,
  onAddTransaction,
}: StockHistoryTableProps) {
  const [internalMarket, setInternalMarket] = useState<"all" | "KR" | "US">("all");
  const [internalAccount, setInternalAccount] = useState<AccountFilter>("all");
  const [internalAssetType, setInternalAssetType] = useState<AssetTypeFilter>("all");
  const [internalHolding, setInternalHolding] = useState<HoldingFilter>("all");

  const marketFilter = externalMarket ?? internalMarket;
  const accountFilter = externalAccount ?? internalAccount;
  const assetTypeFilter = externalAssetType ?? internalAssetType;
  const holdingFilter = externalHolding ?? internalHolding;

  function handleMarketChange(v: "all" | "KR" | "US") {
    if (onMarketFilterChange) onMarketFilterChange(v);
    else setInternalMarket(v);
  }
  function handleAccountChange(v: AccountFilter) {
    if (onAccountFilterChange) onAccountFilterChange(v);
    else setInternalAccount(v);
  }
  function handleAssetTypeChange(v: AssetTypeFilter) {
    if (onAssetTypeFilterChange) onAssetTypeFilterChange(v);
    else setInternalAssetType(v);
  }
  function handleHoldingChange(v: HoldingFilter) {
    if (onHoldingFilterChange) onHoldingFilterChange(v);
    else setInternalHolding(v);
  }

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">로딩 중...</div>;
  }
  if (transactions.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        거래 내역이 없습니다. Excel 가져오기 또는 거래 추가로 데이터를 입력하세요.
      </div>
    );
  }

  const allGroups = groupByStock(transactions);
  // 시장 + 계좌 + 종류 + 보유상태 복합 필터
  const filtered = allGroups
    .filter((g) => marketFilter === "all" || g.market === marketFilter)
    .filter((g) => accountFilter === "all" || g.accountNo === accountFilter)
    .filter((g) => assetTypeFilter === "all" || g.assetType === assetTypeFilter)
    .filter((g) => {
      if (holdingFilter === "holding")  return g.balance > 0;
      if (holdingFilter === "executed") return g.balance === 0 && g.totalSellQty > 0;
      return true;
    });
  const krCount       = allGroups.filter((g) => g.market === "KR").length;
  const usCount       = allGroups.filter((g) => g.market === "US").length;
  const holdingCount  = allGroups.filter((g) => g.balance > 0).length;
  const executedCount = allGroups.filter((g) => g.balance === 0 && g.totalSellQty > 0).length;

  // 외부에서 필터를 제어하는 경우 내부 버튼 숨김 (부모가 직접 렌더링)
  const showInternalFilters = !externalMarket && !externalAccount && !externalAssetType;

  return (
    <div className="space-y-3">
      {/* 내부 필터 — 외부 제어 시 숨김 (부모가 필터 버튼 렌더링) */}
      {showInternalFilters && (
        <div className="flex flex-wrap gap-2">
          {/* 시장 필터 — hideMarketFilter=true 이면 숨김 */}
          {!hideMarketFilter && (
            <div className="flex gap-2 text-xs">
              {(["all", "KR", "US"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleMarketChange(m)}
                  className={`px-3 py-1 rounded-full border transition-colors ${
                    marketFilter === m
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-input hover:bg-muted"
                  }`}
                >
                  {m === "all" ? `전체 (${allGroups.length})` : m === "KR" ? `국내 (${krCount})` : `해외 (${usCount})`}
                </button>
              ))}
            </div>
          )}

          {/* 계좌 필터 */}
          <div className="flex gap-2 text-xs">
            {(["all", "4802", "1635", "1402", "2805", "1470"] as AccountFilter[]).map((a) => (
              <button
                key={a}
                onClick={() => handleAccountChange(a)}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  accountFilter === a
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-input hover:bg-muted"
                }`}
              >
                {a === "all" ? "전체계좌" : a}
              </button>
            ))}
          </div>

          {/* 종류 필터 */}
          <div className="flex gap-2 text-xs">
            {(["all", "STOCK", "ETF"] as AssetTypeFilter[]).map((t) => (
              <button
                key={t}
                onClick={() => handleAssetTypeChange(t)}
                className={`px-3 py-1 rounded-full border transition-colors ${
                  assetTypeFilter === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-input hover:bg-muted"
                }`}
              >
                {t === "all" ? "전체종류" : t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 보유상태 필터 — 항상 표시 (내부/외부 제어 무관) */}
      <div className="flex gap-2 text-xs">
        {([
          { v: "all",      label: `전체 (${allGroups.length})` },
          { v: "holding",  label: `보유중 (${holdingCount})` },
          { v: "executed", label: `매도완료 (${executedCount})` },
        ] as { v: HoldingFilter; label: string }[]).map(({ v, label }) => (
          <button
            key={v}
            onClick={() => handleHoldingChange(v)}
            className={`px-3 py-1 rounded-full border transition-colors ${
              holdingFilter === v
                ? "bg-amber-500 text-white border-amber-500"
                : "border-input hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 종목 목록 — lg 이상에서 2컬럼 그리드, items-start로 각 박스가 독립 높이 유지 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
        {filtered.map((stock) => (
          <StockAccordion
            key={`${stock.stockCode}::${stock.stockName}::${stock.accountNo}`}
            stock={stock}
            showSector={showSector}
            onAddTransaction={onAddTransaction}
          />
        ))}
      </div>
    </div>
  );
}
