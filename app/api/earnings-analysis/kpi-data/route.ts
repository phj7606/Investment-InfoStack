// GET /api/earnings-analysis/kpi-data?ticker=AAPL&exchange=NYSE
// KPI 트렌드 차트 데이터 생성 (P8-10)
// Claude API 단일 요청 → 분기별 KPI JSON 반환 (스트리밍 없음)
// 클라이언트 Recharts LineChart에서 직접 소비

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { Exchange } from "@/lib/earnings-analysis/prompts";

// KPI 데이터 포인트 타입
export interface KPIDataPoint {
  quarter: string;          // "2024Q1" 형식
  revenueGrowth: number;    // YoY 매출 성장률 (%)
  operatingMargin: number;  // 영업이익률 (%)
  eps: number;              // 주당순이익 (KRW 또는 USD)
  epsBeat: boolean;         // EPS 컨센서스 Beat 여부
  revenueBeat: boolean;     // 매출 컨센서스 Beat 여부
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim();
  const exchange = searchParams.get("exchange") as Exchange | null;

  if (!ticker) {
    return Response.json({ error: "ticker 파라미터가 필요합니다." }, { status: 400 });
  }
  if (!exchange || !["KRX", "NYSE", "NASDAQ"].includes(exchange)) {
    return Response.json({ error: "exchange 파라미터가 유효하지 않습니다." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const isKR = exchange === "KRX";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // 단일 요청으로 KPI JSON만 반환 — 스트리밍 불필요
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      tools: [
        {
          type: "web_search_20250305" as "web_search_20250305",
          name: "web_search",
        },
      ],
      system: `You are a financial data extraction assistant. Your ONLY task is to return a JSON array of quarterly KPI data. Do not write any text outside the JSON. Return ONLY valid JSON.`,
      messages: [
        {
          role: "user",
          content: `Extract the last 4 quarters of financial KPI data for ${ticker} (${exchange}).
Date: ${today}

Search for: "${ticker} quarterly earnings EPS revenue operating margin ${today.slice(0, 4)} ${isKR ? "분기 실적 영업이익률" : ""}"

Return ONLY this JSON (no other text):
[
  {
    "quarter": "2024Q1",
    "revenueGrowth": 12.5,
    "operatingMargin": 18.2,
    "eps": 2.45,
    "epsBeat": true,
    "revenueBeat": false
  }
]

Rules:
- Include exactly 4 quarters (oldest first)
- revenueGrowth: YoY % change (number, can be negative)
- operatingMargin: % (number)
- eps: actual EPS value (number)
- epsBeat/revenueBeat: true if beat consensus, false if miss, false if data unavailable
- If data is unavailable for a field, use 0`,
        },
      ],
    });

    // 텍스트 응답에서 JSON 배열 추출
    const rawText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("");

    // JSON 배열 파싱 — 텍스트 앞뒤 노이즈 제거
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return Response.json({ error: "KPI 데이터를 파싱할 수 없습니다.", raw: rawText }, { status: 500 });
    }

    const quarters: KPIDataPoint[] = JSON.parse(jsonMatch[0]);

    return Response.json({ quarters });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
