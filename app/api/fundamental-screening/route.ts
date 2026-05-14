// POST /api/fundamental-screening
// 재무제표 수집(Alpha Vantage / DART) → rawItems → Claude 4대 질문 분석 → SSE 스트리밍
//
// 처리 흐름:
//   ① 캐시 조회 (data/cache/fs3-{ticker}-{exchange}.json, TTL 30일)
//   ② 캐시 미스 시 API 수집 후 캐시 저장
//   ③ SSE: { rawData } — 원시 계정 항목 (화면 표시용)
//   ④ Claude 분석 스트리밍 (rawItems 마크다운 테이블 직접 전달)
//
// 서버 매핑 없음 — Claude가 계정명 직접 판독

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchUsFinancials, fetchKrFinancials } from "@/lib/fundamental-screening/data-fetcher";
import { buildSystemPrompt, buildAnalysisPrompt } from "@/lib/fundamental-screening/prompts";
import { readCache, writeCache, deleteCache } from "@/lib/cache";
import type { FinancialStatements, RawDartItem } from "@/types/fundamental-screening";

export const dynamic = "force-dynamic";

// 30일 TTL (캐시 키 prefix fs4-로 변경: 구 DART 5개년 캐시 무효화)
const FS_CACHE_TTL = 30 * 24 * 60 * 60;

interface RequestBody {
  ticker: string;
  exchange: string;
  companyName?: string;
  forceRefresh?: boolean;
  // true 시 rawData 전송 후 Claude 분석 생략 — 재무 체크포인트 탭 전용
  dataOnly?: boolean;
}

/**
 * 두 RawDartItem[] 배열을 연도 기준으로 병합
 * account_nm + sj_div 기준 매칭 — fresh에 없는 연도만 cached에서 보완
 */
function mergeItemArrays(
  cachedItems: RawDartItem[],
  freshItems: RawDartItem[]
): RawDartItem[] {
  const freshYears = new Set(freshItems.flatMap((i) => i.amounts.map((a) => a.year)));
  const extraYearSet = new Set(
    cachedItems
      .flatMap((i) => i.amounts.map((a) => a.year))
      .filter((y) => !freshYears.has(y))
  );

  if (extraYearSet.size === 0) return freshItems;

  return freshItems.map((freshItem) => {
    const cachedItem = cachedItems.find(
      (c) => c.account_nm === freshItem.account_nm && c.sj_div === freshItem.sj_div
    );
    const extraAmounts = cachedItem?.amounts.filter((a) => extraYearSet.has(a.year)) ?? [];
    if (extraAmounts.length === 0) return freshItem;
    return {
      ...freshItem,
      amounts: [...freshItem.amounts, ...extraAmounts].sort((a, b) =>
        a.year.localeCompare(b.year)
      ),
    };
  });
}

/**
 * 기존 캐시와 새로 수집한 데이터를 연도 기준으로 병합
 *
 * 왜: FnGuide/Alpha Vantage는 최근 4~5개년만 반환하므로,
 * 새 연도(예: 2026년) 데이터를 추가할 때 이전 연도(2021년 등)를 잃지 않도록 병합
 *
 * 전략: fresh에 없는 연도를 cached에서 찾아 amounts에 추가
 * rawItems, quarterlyItems, ratioItems, quarterlyRatioItems 모두 동일 로직 적용
 */
function mergeStatements(
  cached: FinancialStatements,
  fresh: FinancialStatements
): FinancialStatements {
  const mergedRaw = mergeItemArrays(cached.rawItems, fresh.rawItems);

  // quarterlyItems 병합 (KR 전용 — 둘 다 존재할 때만)
  const mergedQuarterly =
    cached.quarterlyItems && fresh.quarterlyItems
      ? mergeItemArrays(cached.quarterlyItems, fresh.quarterlyItems)
      : fresh.quarterlyItems;

  // ratioItems 병합 (KR 전용 — 둘 다 존재할 때만)
  const mergedRatio =
    cached.ratioItems && fresh.ratioItems
      ? mergeItemArrays(cached.ratioItems, fresh.ratioItems)
      : fresh.ratioItems;

  // quarterlyRatioItems 병합 (KR 전용 — 둘 다 존재할 때만)
  const mergedQuarterlyRatio =
    cached.quarterlyRatioItems && fresh.quarterlyRatioItems
      ? mergeItemArrays(cached.quarterlyRatioItems, fresh.quarterlyRatioItems)
      : fresh.quarterlyRatioItems;

  return {
    ...fresh,
    rawItems:               mergedRaw,
    quarterlyItems:         mergedQuarterly,
    ratioItems:             mergedRatio,
    quarterlyRatioItems:    mergedQuarterlyRatio,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 유효하지 않습니다." }, { status: 400 });
  }

  const { ticker, exchange, companyName, forceRefresh, dataOnly } = body;

  if (!ticker?.trim()) return Response.json({ error: "ticker는 필수입니다." }, { status: 400 });
  if (!exchange) return Response.json({ error: "exchange는 필수입니다." }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const isKrx = exchange === "KRX";
  // fs5- prefix: ratioItems 추가(P8-18)로 구 캐시 자동 무효화
  const cacheKey = `fs5-${ticker.trim().toUpperCase()}-${exchange}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // ── Step 1: 재무 데이터 수집 / 캐시 로드 ────────────────────────
        enqueue({ status: "collecting", message: "재무 데이터 수집 중..." });

        // forceRefresh 시 캐시 삭제
        if (forceRefresh) await deleteCache(cacheKey);

        let statements: FinancialStatements;
        const cached = await readCache<FinancialStatements>(cacheKey);
        // 현재 연도 — 캐시에 최신 연도 데이터가 있는지 판단 기준
        const currentYear = new Date().getFullYear().toString();

        if (cached) {
          const cachedYears = new Set(cached.rawItems.flatMap((i) => i.amounts.map((a) => a.year)));
          const hasCurrentYear = cachedYears.has(currentYear);

          if (hasCurrentYear) {
            // 현재 연도 포함 → 캐시 그대로 사용
            statements = { ...cached, dataFrom: "cache" };
            enqueue({ status: "cached", message: "저장된 데이터를 로드했습니다." });
          } else {
            // 캐시에 현재 연도 없음 → 재수집 후 이전 연도 데이터와 병합
            // (예: 캐시=2021~2024, 현재연도=2025 → 재수집 후 2021년 데이터 보존)
            enqueue({ status: "collecting", message: `${currentYear}년 데이터 추가 수집 중...` });
            const fresh = isKrx
              ? await fetchKrFinancials(ticker.trim())
              : await fetchUsFinancials(ticker.trim().toUpperCase());
            statements = mergeStatements(cached, fresh);
            await writeCache(cacheKey, statements, FS_CACHE_TTL);
            enqueue({
              status: "analyzing",
              message: `${currentYear}년 데이터 추가 완료. 분석 중...`,
            });
          }
        } else {
          // 캐시 미스: 전체 수집
          if (isKrx) {
            statements = await fetchKrFinancials(ticker.trim());
          } else {
            statements = await fetchUsFinancials(ticker.trim().toUpperCase());
          }

          // rawItems 기반 캐시 저장
          await writeCache(cacheKey, statements, FS_CACHE_TTL);
          enqueue({
            status: "analyzing",
            message: `${statements.rawItems.length}개 계정 수집 완료. 분석 중...`,
          });
        }

        // ── Step 2: rawItems 전달 (화면 표시용) ──────────────────────────
        // rawData에 rawItems 포함 — FinancialRawDataTable이 직접 렌더링
        enqueue({ rawData: statements, cachedAt: statements.cachedAt });

        // ── Step 3: Claude 분석 스트리밍 (dataOnly 시 생략) ──────────────
        // 재무 체크포인트 탭은 rawData를 직접 계산하므로 Claude 호출 불필요
        if (dataOnly) {
          enqueue({ done: true });
          return;
        }

        enqueue({ status: "analyzing", message: "4대 질문 분석 중..." });

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msgStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          system: buildSystemPrompt(),
          messages: [
            {
              role: "user",
              content: buildAnalysisPrompt(
                ticker.trim(),
                exchange,
                companyName,
                statements.rawItems,
                statements.unit,
                statements.dataSource
              ),
            },
          ],
        });

        for await (const event of msgStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            enqueue({ text: event.delta.text });
          }
        }

        enqueue({ done: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[fundamental-screening] 오류:", err);
        enqueue({ error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive",
    },
  });
}
