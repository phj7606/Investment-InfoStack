"use client";

// 재무 체크포인트 — 데이터 수집 쉘
// 종목 입력 → 재무제표 수집/캐시 → FinancialRawDataTable 표시 → 4개 체크포인트 탭
//
// Claude SSE 분석은 제거됨 (각 체크포인트 탭에서 rawData 직접 계산)
//
// 상태 흐름:
//   idle → collecting → complete
//   *    → error

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  FileText, DatabaseZap, Save, FolderOpen, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalysisInputForm } from "@/components/company-analysis/AnalysisInputForm";
import { FinancialRawDataTable } from "@/components/charts/FinancialRawDataTable";
import { Checkpoint1Client } from "@/components/charts/Checkpoint1Client";
import { Checkpoint2Client } from "@/components/charts/Checkpoint2Client";
import { Checkpoint3Client } from "@/components/charts/Checkpoint3Client";
import { Checkpoint4Client } from "@/components/charts/Checkpoint4Client";
import type { CompanyAnalysisInput } from "@/types/company-analysis";
import type { FinancialStatements } from "@/types/fundamental-screening";

// ── 스토리지 키 ────────────────────────────────────────────────────────────
const STORAGE_KEY = "fundamental-screening-current-result";
const RAW_DATA_KEY = "fundamental-screening-rawdata";
const SAVED_INDEX_KEY = "fs-saved-index";

const savedDataKey = (ticker: string, exchange: string) =>
  `fs-save-${ticker.toUpperCase()}-${exchange}`;

// ── 타입 ───────────────────────────────────────────────────────────────────
interface ScreeningResult {
  ticker: string;
  companyName: string;
  exchange: string;
  generatedAt: string;
}

interface SavedEntry {
  ticker: string;
  exchange: string;
  companyName: string;
  savedAt: string;
}

type ScreeningStatus = "idle" | "collecting" | "complete" | "error";

export function FundamentalScreeningClient() {
  const [status, setStatus] = useState<ScreeningStatus>("idle");
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [currentInput, setCurrentInput] = useState<CompanyAnalysisInput | null>(null);
  const [rawData, setRawData] = useState<FinancialStatements | null>(null);
  const [savedList, setSavedList] = useState<SavedEntry[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // ── 마운트 시 복원 ────────────────────────────────────────────────
  useEffect(() => {
    // 저장 인덱스
    try {
      const idx = localStorage.getItem(SAVED_INDEX_KEY);
      if (idx) setSavedList(JSON.parse(idx));
    } catch { /* 파싱 실패 무시 */ }

    // 마지막 결과 (localStorage)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const restored: ScreeningResult = JSON.parse(saved);
      setResult(restored);
      setStatus("complete");
      setCurrentInput({
        ticker: restored.ticker,
        exchange: restored.exchange as CompanyAnalysisInput["exchange"],
        companyName: restored.companyName,
      });

      // rawData 복원 (sessionStorage — 동일 ticker만)
      const savedRaw = sessionStorage.getItem(RAW_DATA_KEY);
      if (savedRaw) {
        const { ticker: savedTicker, rawData: savedRawData } = JSON.parse(savedRaw);
        if (savedTicker === restored.ticker) setRawData(savedRawData);
      }
    } catch { /* 역직렬화 실패 무시 */ }
  }, []);

  // ── result → localStorage 저장 ───────────────────────────────────
  useEffect(() => {
    if (!result) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch { /* 저장 실패 무시 */ }
  }, [result]);

  // ── rawData → sessionStorage 저장 ────────────────────────────────
  useEffect(() => {
    if (!rawData || !currentInput) return;
    try {
      sessionStorage.setItem(RAW_DATA_KEY, JSON.stringify({
        ticker: currentInput.ticker,
        rawData,
      }));
    } catch { /* 저장 실패 무시 */ }
  }, [rawData, currentInput]);

  // ── 재무제표 수집 (SSE, dataOnly: true) ──────────────────────────
  const runCollect = useCallback(async (
    input: CompanyAnalysisInput,
    opts?: { forceRefresh?: boolean }
  ) => {
    setStatus("collecting");

    try {
      const response = await fetch("/api/fundamental-screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: input.ticker,
          exchange: input.exchange,
          companyName: input.companyName,
          forceRefresh: opts?.forceRefresh ?? false,
          dataOnly: true, // Claude 분석 생략 — 체크포인트 탭에서 직접 계산
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "요청 실패" }));
        throw new Error(err.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error("응답 스트림이 없습니다.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      outer: while (true) {
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

            if (parsed.error) throw new Error(parsed.error);
            if (parsed.rawData) setRawData(parsed.rawData);
            if (parsed.done) break outer;
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      // 수집 완료
      setResult({
        ticker: input.ticker,
        companyName: input.companyName ?? input.ticker,
        exchange: input.exchange,
        generatedAt: new Date().toISOString(),
      });
      setStatus("complete");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "수집 중 오류 발생";
      toast.error(`수집 실패: ${msg}`);
      setStatus("error");
    }
  }, []);

  // ── 분석 시작 ─────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async (input: CompanyAnalysisInput) => {
    setRawData(null);
    setResult(null);
    setCurrentInput(input);
    await runCollect(input);
  }, [runCollect]);

  // ── 현재 분석 저장 ───────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!rawData || !result || !currentInput) return;
    try {
      const key = savedDataKey(currentInput.ticker, currentInput.exchange);
      localStorage.setItem(key, JSON.stringify({ rawData }));
      const entry: SavedEntry = {
        ticker: currentInput.ticker,
        exchange: currentInput.exchange,
        companyName: currentInput.companyName ?? currentInput.ticker,
        savedAt: new Date().toISOString(),
      };
      const newList = [
        entry,
        ...savedList.filter(
          (s) => !(s.ticker === entry.ticker && s.exchange === entry.exchange)
        ),
      ];
      setSavedList(newList);
      localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(newList));
      setSavedOpen(true);
      toast.success(`${currentInput.ticker} 저장 완료`);
    } catch {
      toast.error("저장에 실패했습니다. 저장 공간을 확인하세요.");
    }
  }, [rawData, result, currentInput, savedList]);

  // ── 저장된 분석 불러오기 ─────────────────────────────────────────
  const handleLoad = useCallback((entry: SavedEntry) => {
    try {
      const key = savedDataKey(entry.ticker, entry.exchange);
      const saved = localStorage.getItem(key);
      if (!saved) { toast.error("저장된 데이터를 찾을 수 없습니다."); return; }
      const { rawData: loadedRaw } = JSON.parse(saved) as { rawData: FinancialStatements };
      const input: CompanyAnalysisInput = {
        ticker: entry.ticker,
        exchange: entry.exchange as CompanyAnalysisInput["exchange"],
        companyName: entry.companyName,
      };
      setRawData(loadedRaw);
      setCurrentInput(input);
      setResult({
        ticker: entry.ticker,
        exchange: entry.exchange,
        companyName: entry.companyName,
        generatedAt: entry.savedAt,
      });
      setStatus("complete");
      toast.success(`${entry.ticker} 불러오기 완료`);
    } catch {
      toast.error("불러오기에 실패했습니다.");
    }
  }, []);

  // ── 저장된 분석 삭제 ─────────────────────────────────────────────
  const handleDelete = useCallback((entry: SavedEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.removeItem(savedDataKey(entry.ticker, entry.exchange));
    const newList = savedList.filter(
      (s) => !(s.ticker === entry.ticker && s.exchange === entry.exchange)
    );
    setSavedList(newList);
    localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(newList));
    toast.success(`${entry.ticker} 삭제 완료`);
  }, [savedList]);

  const isLoading = status === "collecting";

  return (
    <div className="space-y-4">
      {/* ── 저장된 분석 목록 ── */}
      {savedList.length > 0 && (
        <Card>
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
            onClick={() => setSavedOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span>저장된 분석</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {savedList.length}
              </Badge>
            </div>
            {savedOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>

          {savedOpen && (
            <div className="border-t divide-y divide-border/50">
              {savedList.map((entry) => (
                <button
                  key={`${entry.ticker}-${entry.exchange}`}
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors text-left group"
                  onClick={() => handleLoad(entry)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {entry.ticker}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                      {entry.exchange}
                    </Badge>
                    {entry.companyName && entry.companyName !== entry.ticker && (
                      <span className="text-xs text-muted-foreground truncate">
                        {entry.companyName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(entry.savedAt).toLocaleDateString("ko-KR")}
                    </span>
                    <span
                      role="button"
                      onClick={(e) => handleDelete(entry, e)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ── 입력 폼 ── */}
      <AnalysisInputForm
        onSubmit={handleAnalyze}
        isLoading={isLoading}
        defaultValues={currentInput ?? undefined}
      />

      {/* ── 수집 중 진행 표시 ── */}
      {status === "collecting" && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <DatabaseZap className="h-7 w-7 animate-pulse text-indigo-500" />
              <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">
                재무 데이터 수집 중...
              </p>
              <p className="text-xs">
                FnGuide(KR) / Alpha Vantage(US)에서 원시 재무제표를 가져오는 중입니다.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 수집된 재무제표 테이블 ── */}
      {rawData && status === "complete" && (
        <>
          {/* 기업 헤더 + 저장 버튼 */}
          <div className="flex items-center justify-between gap-3">
            {/* 기업명 / Ticker / 거래소 */}
            <div className="flex items-center gap-2 min-w-0">
              {/* 기업명 우선순위:
                  1) 사용자 입력 companyName (폼에서 직접 입력)
                  2) rawData.companyName (FnGuide <title> 자동 추출)
                  3) 없으면 기업명 span 생략, ticker만 굵게 표시 */}
              {/* 기업명 — 없으면 ticker로 대체 */}
              <span className="font-bold text-base leading-tight truncate">
                {currentInput?.companyName || rawData.companyName || currentInput?.ticker || rawData.ticker}
              </span>
              {/* ticker는 거래소 Badge에 통합 — "KRX · 066970" 형태 */}
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                {rawData.exchange} · {currentInput?.ticker ?? rawData.ticker}
              </Badge>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                {rawData.dataSource}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs shrink-0"
              onClick={handleSave}
            >
              <Save className="h-3.5 w-3.5" />
              저장
            </Button>
          </div>

          <FinancialRawDataTable statements={rawData} />

          {/* ── 재무 체크포인트 탭 ── */}
          <Tabs defaultValue="cp1">
            <TabsList className="h-9">
              <TabsTrigger value="cp1" className="text-xs">
                돈이 많은 기업인가
              </TabsTrigger>
              <TabsTrigger value="cp2" className="text-xs">
                이익을 내는가
              </TabsTrigger>
              <TabsTrigger value="cp3" className="text-xs">
                극대화 가능한가
              </TabsTrigger>
              <TabsTrigger value="cp4" className="text-xs">
                현금을 버는가
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cp1" className="mt-4">
              <Checkpoint1Client rawData={rawData} />
            </TabsContent>
            <TabsContent value="cp2" className="mt-4">
              <Checkpoint2Client rawData={rawData} />
            </TabsContent>
            <TabsContent value="cp3" className="mt-4">
              <Checkpoint3Client rawData={rawData} />
            </TabsContent>
            <TabsContent value="cp4" className="mt-4">
              <Checkpoint4Client rawData={rawData} />
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* ── Idle 안내 ── */}
      {status === "idle" && (
        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
          <FileText className="h-8 w-8 opacity-30" />
          <p className="text-sm">Ticker를 입력하고 재무제표 수집을 시작하세요.</p>
          <p className="text-xs opacity-70">
            FnGuide(KR) / Alpha Vantage(US)로 원시 재무제표를 수집합니다.
          </p>
        </div>
      )}

      {/* ── 오류 안내 ── */}
      {status === "error" && (
        <div className="flex flex-col items-center gap-2 py-6 text-destructive">
          <p className="text-sm">
            수집에 실패했습니다. 티커와 거래소를 확인하고 다시 시도하세요.
          </p>
        </div>
      )}
    </div>
  );
}
