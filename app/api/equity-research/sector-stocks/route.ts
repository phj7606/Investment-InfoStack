// 섹터→종목 리스트 API
// POST /api/equity-research/sector-stocks
//
// 흐름:
//   Step 1: LLM → 섹터 대표 ticker 목록 (JSON)
//   Step 2: 시장별 병렬 데이터 수집 (KR: Naver+DART, US: yahoo-finance2)
//   Step 3: LLM → 실제 수치 기반 투자 포인트 1문장
//
// LLM은 ticker 목록 생성과 투자 포인트 해석만 담당
// 주가·PER·PBR·재무 수치는 반드시 공식 API에서만 수집

import { generateText } from "@/lib/llm/client";
import type { ModelOption } from "@/lib/llm/types";
import { fetchKrStockData } from "@/lib/stock-screener/kr-data-fetcher";
import { fetchUsStockData } from "@/lib/stock-screener/us-data-fetcher";
import {
  TICKER_SYSTEM_PROMPT,
  buildTickerPrompt,
  INVESTMENT_POINT_SYSTEM_PROMPT,
  buildInvestmentPointPrompt,
} from "@/lib/stock-screener/sector-prompts";

export const maxDuration = 60; // Vercel 함수 최대 실행 시간 (초)

// 요청 바디 타입
interface SectorStocksRequest {
  sector: string;
  market: "KR" | "US" | "ALL";
  model: ModelOption;
}

// ticker 목록 항목
interface TickerItem {
  ticker: string;
  exchange: string;
  companyName: string;
}

// 데이터 수집 후 종목별 통합 객체 — KR/US 공통 필드로 평탄화
interface CollectedItem extends TickerItem {
  source: { price: string; financials: string };
  currentPrice: number | null;
  priceChange: number | null;
  changeRate: number | null;
  marketCap: number | null;
  per: number | null;
  pbr: number | null;
  high52w: number | null;
  low52w: number | null;
  revenue: number | null;
  operatingIncome: number | null;
  fiscalYear: string | null;
}

// 최종 종목 카드 데이터
export interface SectorStockResult extends TickerItem {
  source: { price: string; financials: string };
  currentPrice: number | null;
  priceChange: number | null;
  changeRate: number | null;
  marketCap: number | null;
  per: number | null;
  pbr: number | null;
  high52w: number | null;
  low52w: number | null;
  revenue: number | null;
  operatingIncome: number | null;
  fiscalYear: string | null;
  investmentPoint: string;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body: SectorStocksRequest = await req.json();
    const { sector, market, model } = body;

    if (!sector?.trim()) {
      return Response.json({ error: "섹터를 입력하세요." }, { status: 400 });
    }

    // ── Step 1: LLM → ticker 목록 ──────────────────────────────────────────
    let tickerList: TickerItem[] = [];
    try {
      const raw = await generateText(
        model,
        TICKER_SYSTEM_PROMPT,
        buildTickerPrompt(sector.trim(), market)
      );

      // LLM이 코드블록을 포함할 경우 제거 후 파싱
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      tickerList = JSON.parse(cleaned);

      if (!Array.isArray(tickerList)) throw new Error("배열이 아닙니다.");
    } catch (e) {
      return Response.json(
        { error: `종목 목록 생성 실패: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 }
      );
    }

    // ── Step 2: 병렬 데이터 수집 ───────────────────────────────────────────
    const dataResults = await Promise.allSettled(
      tickerList.map(async (item): Promise<CollectedItem> => {
        const isKr = item.exchange === "KRX";

        if (isKr) {
          const data = await fetchKrStockData(item.ticker);
          return {
            ticker: item.ticker,
            exchange: item.exchange,
            companyName: item.companyName,
            source: data.source,
            currentPrice: data.currentPrice,
            priceChange: data.priceChange,
            changeRate: data.changeRate,
            marketCap: data.marketCap,
            per: data.per,
            pbr: data.pbr,
            high52w: data.high52w,
            low52w: data.low52w,
            revenue: data.revenue,
            operatingIncome: data.operatingIncome,
            fiscalYear: data.fiscalYear,
          };
        } else {
          const data = await fetchUsStockData(item.ticker);
          return {
            ticker: item.ticker,
            exchange: item.exchange,
            companyName: item.companyName,
            source: data.source,
            currentPrice: data.currentPrice,
            priceChange: data.priceChange,
            changeRate: data.changeRate,
            marketCap: data.marketCap,
            per: data.per,
            pbr: data.pbr,
            high52w: data.high52w,
            low52w: data.low52w,
            revenue: data.revenue,
            operatingIncome: data.operatingIncome,
            fiscalYear: null,
          };
        }
      })
    );

    // 수집 성공 종목만 추출 (실패 종목은 제외)
    const collected: CollectedItem[] = dataResults
      .filter((r): r is PromiseFulfilledResult<CollectedItem> => r.status === "fulfilled")
      .map((r) => r.value);

    if (collected.length === 0) {
      return Response.json(
        { error: "데이터 수집에 실패했습니다. 종목 코드를 확인하세요." },
        { status: 500 }
      );
    }

    // ── Step 3: LLM → 투자 포인트 ─────────────────────────────────────────
    // 실제 수치를 컨텍스트로 제공하여 LLM이 수치를 창작하지 못하도록 구조적으로 방지
    const pointMap = new Map<string, string>();
    try {
      const raw = await generateText(
        model,
        INVESTMENT_POINT_SYSTEM_PROMPT,
        buildInvestmentPointPrompt(collected)
      );

      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const points: Array<{ ticker: string; point: string }> = JSON.parse(cleaned);

      for (const p of points) {
        pointMap.set(p.ticker, p.point);
      }
    } catch {
      // 투자 포인트 생성 실패 시 기본값으로 계속 진행
    }

    // ── 최종 응답 조합 ─────────────────────────────────────────────────────
    const stocks: SectorStockResult[] = collected.map((item) => ({
      ticker: item.ticker,
      exchange: item.exchange,
      companyName: item.companyName,
      source: item.source as { price: string; financials: string },
      currentPrice: item.currentPrice,
      priceChange: item.priceChange,
      changeRate: item.changeRate,
      marketCap: item.marketCap,
      per: item.per,
      pbr: item.pbr,
      high52w: item.high52w,
      low52w: item.low52w,
      revenue: item.revenue,
      operatingIncome: item.operatingIncome,
      fiscalYear: item.fiscalYear,
      investmentPoint: pointMap.get(item.ticker) ?? "데이터 분석 중",
    }));

    return Response.json({
      sector: sector.trim(),
      market,
      model,
      stocks,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
