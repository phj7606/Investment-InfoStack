/**
 * Transaction Summary API — 월별 거래 집계
 *
 * GET /api/portfolio/financial/tx-summary
 *
 * 자산관리 연간 테이블의 CONFIRMED 월 Bid / Ask(BV) / Fixed P/L 산출용.
 * 전체 longterm 거래 내역을 월별로 집계하여 반환.
 */

import { NextResponse } from "next/server";
import { readTransactions as readLongtermTxs } from "@/lib/portfolio/longterm-store";

export interface TxMonthlySummary {
  bid: number;
  askBv: number;
  fixedPnl: number;
}

export interface TxSummaryByMonth {
  [month: string]: {
    fund:      TxMonthlySummary;
    korStocks: TxMonthlySummary;
    usStocks:  TxMonthlySummary;  // USD
  };
}

export async function GET() {
  try {
    const txs = await readLongtermTxs();
    const summary: TxSummaryByMonth = {};

    for (const tx of txs) {
      const month = tx.date.slice(0, 7); // "YYYY-MM"
      if (!summary[month]) {
        summary[month] = {
          fund:      { bid: 0, askBv: 0, fixedPnl: 0 },
          korStocks: { bid: 0, askBv: 0, fixedPnl: 0 },
          usStocks:  { bid: 0, askBv: 0, fixedPnl: 0 },
        };
      }

      // 섹션 분류: FUND / KOR Stocks / US Stocks
      let section: "fund" | "korStocks" | "usStocks" | null = null;
      if (tx.assetType === "FUND" && tx.currency === "KRW") {
        section = "fund";
      } else if (tx.market === "KR" && tx.currency === "KRW" && tx.assetType !== "FUND") {
        section = "korStocks";
      } else if (tx.market === "US" && tx.currency === "USD") {
        section = "usStocks";
      }

      if (!section) continue;

      if (tx.tradeType === "BUY") {
        summary[month][section].bid += tx.amount;
      } else if (tx.tradeType === "SELL") {
        // Ask(BV) = 매도 장부가 (avgCostAtSell × quantity)
        summary[month][section].askBv += (tx.avgCostAtSell ?? 0) * tx.quantity;
        // Fixed P/L = 실현손익
        summary[month][section].fixedPnl += tx.realizedPL ?? 0;
      }
    }

    // 소수점 정리
    for (const month of Object.keys(summary)) {
      for (const sec of ["fund", "korStocks", "usStocks"] as const) {
        summary[month][sec].bid      = Math.round(summary[month][sec].bid);
        summary[month][sec].askBv    = Math.round(summary[month][sec].askBv * 100) / 100;
        summary[month][sec].fixedPnl = Math.round(summary[month][sec].fixedPnl * 100) / 100;
      }
    }

    return NextResponse.json(summary);
  } catch (e) {
    console.error("[tx-summary] 오류:", e);
    return NextResponse.json({ error: "거래 집계 오류" }, { status: 500 });
  }
}
