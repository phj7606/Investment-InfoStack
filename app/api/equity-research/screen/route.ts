// POST /api/equity-research/screen
// P8-07a 개별주식 스크리너 — 4단계 하이브리드 처리
//
// Phase A: Claude + web_search → 후보 ticker JSON 추출 (SKILL Step 2 기준)
// Phase B: 실제 공식 API 병렬 수집 (Naver+DART / Yahoo+AlphaVantage)
// Phase C: 서버 사이드 필터 게이트 검증 (실제 수치 기반)
// Phase D: Claude + SKILL.md 원문 → Step 3~5 보고서 SSE 스트리밍

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildScreenerSystemPrompt,
  buildScreenerPrompt,
  type ScreenerFilters,
  type CollectedStockData,
} from "@/lib/stock-screener/prompts";
import { fetchKrStockData } from "@/lib/stock-screener/kr-data-fetcher";
import { fetchUsStockData } from "@/lib/stock-screener/us-data-fetcher";

// 스트리밍 Route는 정적 캐시 불가 — 매 요청마다 처리
export const dynamic = "force-dynamic";
// 4단계 처리(API 수집 포함) 시간 고려하여 120초 설정
export const maxDuration = 120;

const VALID_DIRECTIONS = ["Long", "Short", "Both"] as const;
const VALID_STYLES     = ["Value", "Growth", "Quality", "Short", "Special Situation"] as const;

// 후보 ticker 발굴용 간단한 시스템 프롬프트 (Phase A 전용)
// SKILL Step 2의 스타일별 기준으로 후보 종목만 JSON 추출
const TICKER_DISCOVERY_SYSTEM = `You are a stock screening expert.
Return ONLY a valid JSON array of candidate stock tickers that match the given criteria.
Format: [{"ticker":"005930","exchange":"KRX","companyName":"삼성전자"},...]
Rules:
- KR stocks: 6-digit numeric ticker (e.g. "005930"), exchange "KRX"
- US stocks: alphabetic symbol (e.g. "NVDA"), exchange "NYSE" or "NASDAQ"
- Return 10–15 candidates
- No markdown, no explanation, ONLY the JSON array`;

export async function POST(request: NextRequest): Promise<Response> {
  let body: { filters: ScreenerFilters; previousReport?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const { filters, previousReport } = body;

  // 필수 필드 검증
  if (!filters?.market || !["KR", "US", "ALL"].includes(filters.market)) {
    return Response.json({ error: "market이 유효하지 않습니다. (KR/US/ALL)" }, { status: 400 });
  }
  if (!filters?.direction || !(VALID_DIRECTIONS as readonly string[]).includes(filters.direction)) {
    return Response.json({ error: "direction이 유효하지 않습니다. (Long/Short/Both)" }, { status: 400 });
  }
  if (!filters?.style || !(VALID_STYLES as readonly string[]).includes(filters.style)) {
    return Response.json({ error: "style이 유효하지 않습니다." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  // SSE 스트리밍 응답
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        // ── Phase A: 후보 ticker 발굴 (Claude + web_search) ──────────────────
        enqueue({ phase: "discovering", message: "후보 종목 탐색 중 (SKILL Step 2)..." });

        const marketLabel = { KR: "Korean (KOSPI/KOSDAQ)", US: "US (NYSE/NASDAQ)", ALL: "Korean and US" }[filters.market];
        const styleHints: Record<string, string> = {
          "Value":             "undervalued low PER PBR high FCF yield",
          "Growth":            "high revenue growth expanding margins high ROIC",
          "Quality":           "high ROE consistent earnings low debt quality stocks",
          "Short":             "declining revenue margin compression high debt overvalued short candidates",
          "Special Situation": "M&A spin-off restructuring activist involvement turnaround",
        };
        const tickerPrompt = `Find 10–15 candidate stocks for the following screening criteria:
- Market: ${marketLabel}
- Direction: ${filters.direction}
- Style: ${filters.style} — look for: ${styleHints[filters.style]}
- Theme: ${filters.theme ?? "none"}
- Filters: ROE≥${filters.minROE ?? "any"}%, OpMargin≥${filters.minOperatingMargin ?? "any"}%, DebtRatio≤${filters.maxDebtRatio ?? "any"}%, PER≤${filters.maxPER ?? "any"}, PBR≤${filters.maxPBR ?? "any"}, EV/EBITDA≤${filters.maxEVEBITDA ?? "any"}

Use web_search to find stocks matching this profile. Return ONLY the JSON array.`;

        const discoveryRes = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          tools: [{ type: "web_search_20250305" as "web_search_20250305", name: "web_search" }],
          system: TICKER_DISCOVERY_SYSTEM,
          messages: [{ role: "user", content: tickerPrompt }],
        });

        // 응답에서 JSON 배열 추출
        const rawText = discoveryRes.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");

        let candidates: { ticker: string; exchange: string; companyName: string }[] = [];
        try {
          // JSON 배열 부분만 추출 (앞뒤 노이즈 제거)
          const match = rawText.match(/\[[\s\S]*\]/);
          if (match) candidates = JSON.parse(match[0]);
        } catch {
          // 파싱 실패 시 빈 배열 → Phase D에서 web_search만으로 진행
        }

        enqueue({ phase: "discovering", found: candidates.length });

        // ── Phase B: 실제 API 병렬 수집 ──────────────────────────────────────
        enqueue({ phase: "fetching", total: candidates.length, done: 0, message: `${candidates.length}개 종목 데이터 수집 중...` });

        let doneCount = 0;
        const fetchResults = await Promise.allSettled(
          candidates.map(async (c) => {
            const isKr = c.exchange === "KRX";
            const raw = isKr
              ? await fetchKrStockData(c.ticker)
              : await fetchUsStockData(c.ticker);

            doneCount++;
            enqueue({ phase: "fetching", total: candidates.length, done: doneCount });

            // KrStockData / UsStockData를 CollectedStockData 통합 형식으로 변환
            const collected: CollectedStockData = {
              ticker:      c.ticker,
              exchange:    c.exchange,
              companyName: c.companyName,
              marketCap:   raw.marketCap,
              per:         raw.per,
              pbr:         raw.pbr,
              roe:          isKr ? (raw as import("@/lib/stock-screener/kr-data-fetcher").KrStockData).roe
                                 : (raw as import("@/lib/stock-screener/us-data-fetcher").UsStockData).roe,
              operatingMargin: isKr
                ? (raw as import("@/lib/stock-screener/kr-data-fetcher").KrStockData).operatingMargin
                : (raw as import("@/lib/stock-screener/us-data-fetcher").UsStockData).operatingMargin,
              debtRatio: isKr
                ? (raw as import("@/lib/stock-screener/kr-data-fetcher").KrStockData).debtRatio
                : (raw as import("@/lib/stock-screener/us-data-fetcher").UsStockData).debtToEquity,
              evToEbitda: isKr
                ? null
                : (raw as import("@/lib/stock-screener/us-data-fetcher").UsStockData).evToEbitda,
              revenueGrowth: isKr
                ? null
                : (raw as import("@/lib/stock-screener/us-data-fetcher").UsStockData).revenueGrowth,
              freeCashflowYield: isKr
                ? null
                : (raw as import("@/lib/stock-screener/us-data-fetcher").UsStockData).freeCashflowYield,
            };
            return collected;
          })
        );

        const collectedAll: CollectedStockData[] = fetchResults
          .filter((r) => r.status === "fulfilled")
          .map((r) => (r as PromiseFulfilledResult<CollectedStockData>).value);

        // ── Phase C: 필터 게이트 서버 검증 ───────────────────────────────────
        enqueue({ phase: "validating", message: "필터 게이트 검증 중..." });

        function passesGate(s: CollectedStockData, f: ScreenerFilters): boolean {
          if (f.minROE !== undefined            && (s.roe ?? -Infinity) < f.minROE) return false;
          if (f.minOperatingMargin !== undefined && (s.operatingMargin ?? -Infinity) < f.minOperatingMargin) return false;
          if (f.maxDebtRatio !== undefined       && (s.debtRatio ?? Infinity) > f.maxDebtRatio) return false;
          if (f.maxPER !== undefined             && (s.per ?? Infinity) > f.maxPER) return false;
          if (f.maxPBR !== undefined             && (s.pbr ?? Infinity) > f.maxPBR) return false;
          if (f.maxEVEBITDA !== undefined        && (s.evToEbitda ?? Infinity) > f.maxEVEBITDA) return false;
          return true;
        }

        let validated = collectedAll.filter((s) => passesGate(s, filters));

        // 최소 5개 보장 — 부족 시 필터 없이 전체 후보 사용
        if (validated.length < 5) {
          validated = collectedAll.length >= 5 ? collectedAll : [...collectedAll, ...candidates.slice(collectedAll.length).map((c) => ({
            ticker: c.ticker, exchange: c.exchange, companyName: c.companyName,
            marketCap: null, per: null, pbr: null, roe: null,
            operatingMargin: null, debtRatio: null, evToEbitda: null,
            revenueGrowth: null, freeCashflowYield: null,
          }))];
        }

        enqueue({ phase: "validating", passed: validated.length, total: collectedAll.length });

        // ── Phase D: SKILL Step 3~5 보고서 스트리밍 ──────────────────────────
        enqueue({ phase: "reporting", message: "아이디어 보고서 생성 중 (SKILL Step 3~5)..." });

        const reportStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          tools: [{ type: "web_search_20250305" as "web_search_20250305", name: "web_search" }],
          system: buildScreenerSystemPrompt(),
          messages: [{
            role: "user",
            content: buildScreenerPrompt(filters, validated, previousReport),
          }],
        });

        for await (const event of reportStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            enqueue({ text: event.delta.text });
          }
        }

        enqueue({ done: true, passedCount: validated.length });

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enqueue({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":    "text/event-stream",
      "Cache-Control":   "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection":      "keep-alive",
    },
  });
}
