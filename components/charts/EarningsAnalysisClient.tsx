"use client";

// P8-08~P8-10 실적 채점 클라이언트 컴포넌트
// 종목 입력 → Claude API 스트리밍 Beat/Miss 분석 + KPI 트렌드 Recharts 차트
// recharts는 "use client" 분리 필수 (React 19 RSC 호환성 이슈 — CLAUDE.md 참고)

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Loader2, RotateCcw } from "lucide-react";
import type { Exchange } from "@/lib/earnings-analysis/prompts";
import type { KPIDataPoint } from "@/app/api/earnings-analysis/kpi-data/route";

// 스트리밍 상태
type Status = "idle" | "streaming" | "done" | "error";

// 간이 Markdown 렌더러 (StockScreenerClient와 동일 패턴)
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("# ")) return <h1 key={i} className="text-base font-bold mt-4 mb-2">{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={i} className="text-sm font-semibold mt-3 mb-1 text-indigo-700 dark:text-indigo-300">{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} className="text-xs font-semibold mt-2 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith("---")) return <Separator key={i} className="my-2" />;
        if (line.startsWith("```")) return null; // 코드블록 마커 숨김
        if (line.startsWith("|")) {
          if (/^\|[-| :]+\|$/.test(line)) return null;
          const cells = line.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1);
          const isHeader = i > 0 && lines[i + 1]?.startsWith("|---");
          return (
            <div key={i} className={`flex gap-2 text-[10px] py-0.5 border-b border-border/50 ${isHeader ? "font-semibold bg-muted/50 rounded" : ""}`}>
              {cells.map((cell, j) => (
                <span key={j} className="flex-1 px-1">{cell.trim()}</span>
              ))}
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <li key={i} className="ml-4 list-disc text-xs">{line.slice(2)}</li>;
        }
        if (line.trim() === "") return <br key={i} />;
        return <p key={i} className="text-xs">{line}</p>;
      })}
    </div>
  );
}

// KPI 트렌드 라인 차트 — Recharts 기반
// 매출 성장률, 영업이익률, EPS 3개 시리즈를 분기별로 표시
function KPIChart({ data }: { data: KPIDataPoint[] }) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-indigo-500" />
          KPI 트렌드 (최근 4분기)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 매출 성장률 + 영업이익률 차트 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">매출 성장률 / 영업이익률 (%)</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip
                  formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
                  contentStyle={{ fontSize: "11px" }}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Line
                  type="monotone"
                  dataKey="revenueGrowth"
                  name="매출 성장률"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="operatingMargin"
                  name="영업이익률"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* EPS 추이 차트 */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">EPS 추이</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: number) => [value.toFixed(2), "EPS"]}
                  contentStyle={{ fontSize: "11px" }}
                />
                <Legend wrapperStyle={{ fontSize: "10px" }} />
                <Line
                  type="monotone"
                  dataKey="eps"
                  name="EPS"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={(props) => {
                    // Beat 여부에 따라 점 색상 구분
                    const { cx, cy, payload } = props;
                    const fill = payload.epsBeat ? "#10b981" : "#ef4444";
                    return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={fill} stroke="white" strokeWidth={1} />;
                  }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Beat/Miss 요약 배지 */}
        <div className="flex flex-wrap gap-2 mt-3">
          {data.map((d) => (
            <div key={d.quarter} className="flex items-center gap-1 text-[10px]">
              <span className="text-muted-foreground">{d.quarter}:</span>
              <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${d.epsBeat ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50" : "bg-red-50 text-red-600 dark:bg-red-950/50"}`}>
                EPS {d.epsBeat ? "Beat" : "Miss"}
              </Badge>
              <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${d.revenueBeat ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50" : "bg-red-50 text-red-600 dark:bg-red-950/50"}`}>
                매출 {d.revenueBeat ? "Beat" : "Miss"}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function EarningsAnalysisClient() {
  // 입력 상태
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NYSE");

  // 스트리밍 상태
  const [status, setStatus] = useState<Status>("idle");
  const [reportText, setReportText] = useState("");
  const [kpiData, setKpiData] = useState<KPIDataPoint[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingChart, setLoadingChart] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  // 분석 실행: 스트리밍 + KPI 차트 데이터 병렬 요청
  async function runAnalysis() {
    if (!ticker.trim()) return;
    setStatus("streaming");
    setReportText("");
    setKpiData([]);
    setErrorMsg("");

    // KPI 차트 데이터 비동기 요청 (분석 스트리밍과 병렬)
    setLoadingChart(true);
    fetch(`/api/earnings-analysis/kpi-data?ticker=${encodeURIComponent(ticker.trim())}&exchange=${exchange}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.quarters) setKpiData(json.quarters);
      })
      .catch(() => {}) // 차트 데이터 실패는 분석 결과에 영향 없음
      .finally(() => setLoadingChart(false));

    // 실적 채점 스트리밍
    try {
      const response = await fetch("/api/earnings-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim(), exchange }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "요청 실패" }));
        throw new Error(err.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error("응답 스트림이 없습니다.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.done) {
              setStatus("done");
              return;
            }
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setReportText((prev) => prev + parsed.text);
              setTimeout(() => {
                resultRef.current?.scrollTo({ top: resultRef.current.scrollHeight, behavior: "smooth" });
              }, 0);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      setStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setReportText("");
    setKpiData([]);
    setErrorMsg("");
    setTicker("");
  }

  const isRunning = status === "streaming";

  return (
    <div className="space-y-4">
      {/* ── 입력 폼 ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            {/* 티커 입력 */}
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-medium">티커 / 기업명</Label>
              <Input
                placeholder="예: AAPL, 005930 (삼성전자)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isRunning && runAnalysis()}
                className="h-8 text-sm"
              />
            </div>

            {/* 거래소 선택 */}
            <div className="w-full sm:w-36 space-y-1">
              <Label className="text-xs font-medium">거래소</Label>
              <Select value={exchange} onValueChange={(v) => setExchange(v as Exchange)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NYSE">NYSE</SelectItem>
                  <SelectItem value="NASDAQ">NASDAQ</SelectItem>
                  <SelectItem value="KRX">KRX (한국)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 실행 버튼 */}
            <Button
              onClick={runAnalysis}
              disabled={isRunning || !ticker.trim()}
              className="h-8 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 shrink-0"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                  실적 채점
                </>
              )}
            </Button>

            {(status === "done" || status === "error") && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs shrink-0" onClick={reset}>
                <RotateCcw className="h-3 w-3 mr-1" />
                초기화
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI 트렌드 차트 ── */}
      {loadingChart && (
        <Card>
          <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            KPI 데이터 로딩 중...
          </CardContent>
        </Card>
      )}
      {!loadingChart && kpiData.length > 0 && <KPIChart data={kpiData} />}

      {/* ── 분석 보고서 ── */}
      {(status === "streaming" || status === "done") && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between">
            <CardTitle className="text-sm">실적 채점 보고서</CardTitle>
            <div className="flex items-center gap-2">
              {status === "streaming" && (
                <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  분석 중
                </Badge>
              )}
              {status === "done" && (
                <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50">
                  완료
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div ref={resultRef} className="overflow-y-auto max-h-[600px] pr-1">
              <MarkdownContent text={reportText} />
              {status === "streaming" && (
                <span className="inline-block w-1.5 h-3.5 bg-indigo-500 animate-pulse ml-0.5 align-middle rounded-sm" />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 에러 */}
      {status === "error" && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          오류: {errorMsg}
        </div>
      )}

      {/* Idle 안내 */}
      {status === "idle" && (
        <Card className="border-dashed">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <TrendingUp className="h-10 w-10 text-indigo-300 dark:text-indigo-700" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">티커를 입력하고 실적 채점을 실행하세요</p>
            </div>
            <div className="flex flex-col gap-1 text-xs text-left max-w-xs mt-1">
              {[
                "최근 4분기 EPS/매출 Beat/Miss 판정",
                "분기별 KPI 트렌드 차트 (매출성장률·영업이익률·EPS)",
                "실적 모멘텀 + Investment Implication 분석",
                "출처 명시 기관 수준 리포트",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span className="text-indigo-500 mt-0.5">›</span>
                  <span className="text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
