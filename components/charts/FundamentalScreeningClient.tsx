"use client";

// 재무 체크포인트 — 데이터 수집 쉘
// 종목 입력 → 재무제표 수집/캐시 → FinancialRawDataTable 표시 → 4개 체크포인트 탭
//
// Claude SSE 분석은 제거됨 (각 체크포인트 탭에서 rawData 직접 계산)
//
// 상태 흐름:
//   idle → collecting → complete
//   *    → error

import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  FileText, DatabaseZap, FolderOpen, Trash2, ChevronDown, ChevronUp,
  Download, Upload,
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
import { mergeStatements } from "@/lib/fundamental-screening/merge";
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

// JSON 내보내기/가져오기 포맷
interface ExportData {
  version: "1.0";
  exportedAt: string;
  entries: Array<SavedEntry & { rawData: FinancialStatements }>;
}

export function FundamentalScreeningClient() {
  const [status, setStatus] = useState<ScreeningStatus>("idle");
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [currentInput, setCurrentInput] = useState<CompanyAnalysisInput | null>(null);
  const [rawData, setRawData] = useState<FinancialStatements | null>(null);
  const [savedList, setSavedList] = useState<SavedEntry[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // 파일 가져오기용 hidden input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

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

            if (parsed.rawData) {
              const fresh = parsed.rawData as FinancialStatements;

              // ── localStorage 기존 저장 데이터와 병합 ──────────────────
              // FnGuide는 최근 4~5개년만 반환하므로, 로컬에 저장된 과거 연도를 보존
              const saveKey = savedDataKey(input.ticker, input.exchange);
              const savedStr = localStorage.getItem(saveKey);

              let merged: FinancialStatements;
              if (savedStr) {
                try {
                  const { rawData: saved } = JSON.parse(savedStr) as { rawData: FinancialStatements };
                  // saved(과거 포함) + fresh(최신) → 전 연도 보존
                  merged = mergeStatements(saved, fresh);
                } catch {
                  // 저장 데이터 파싱 실패 시 fresh 그대로 사용
                  merged = fresh;
                }
              } else {
                merged = fresh;
              }

              // 병합 결과를 화면에 반영 + localStorage에 자동 저장
              setRawData(merged);
              try {
                localStorage.setItem(saveKey, JSON.stringify({ rawData: merged }));
              } catch { /* 저장 실패 시 무시 (용량 초과 등) */ }
            }

            if (parsed.done) break outer;
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      // 수집 완료 — savedList 인덱스에 자동 등록 (처음 수집 시 / 기존 항목 갱신)
      const newEntry: SavedEntry = {
        ticker:      input.ticker,
        exchange:    input.exchange,
        companyName: input.companyName ?? input.ticker,
        savedAt:     new Date().toISOString(),
      };
      setSavedList((prev) => {
        const filtered = prev.filter(
          (s) => !(s.ticker === newEntry.ticker && s.exchange === newEntry.exchange)
        );
        const updated = [newEntry, ...filtered];
        localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(updated));
        return updated;
      });

      setResult({
        ticker:      input.ticker,
        companyName: input.companyName ?? input.ticker,
        exchange:    input.exchange,
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

  // ── 가져오기 공통 처리 ────────────────────────────────────────────
  // JSON 텍스트를 파싱해 localStorage에 병합 — 파일 획득 경로(FSAPI/input)와 분리
  const processImportText = useCallback((text: string) => {
    try {
      const parsed = JSON.parse(text) as ExportData;
      if (!Array.isArray(parsed.entries)) throw new Error("올바른 형식이 아닙니다.");

      let added = 0;
      let merged = 0;
      const newIndex = [...savedList];

      for (const entry of parsed.entries) {
        const saveKey = savedDataKey(entry.ticker, entry.exchange);
        const existingStr = localStorage.getItem(saveKey);

        let finalRawData: FinancialStatements;
        if (existingStr) {
          const { rawData: existing } = JSON.parse(existingStr) as { rawData: FinancialStatements };
          // 양쪽에서 빠진 연도를 서로 보완 — 기존을 fresh(우선), 가져온 것을 saved로
          finalRawData = mergeStatements(entry.rawData, existing);
          merged++;
        } else {
          finalRawData = entry.rawData;
          added++;
        }

        localStorage.setItem(saveKey, JSON.stringify({ rawData: finalRawData }));

        const existingIdx = newIndex.findIndex(
          (s) => s.ticker === entry.ticker && s.exchange === entry.exchange
        );
        const newEntry: SavedEntry = {
          ticker:      entry.ticker,
          exchange:    entry.exchange,
          companyName: entry.companyName,
          savedAt:     entry.savedAt,
        };
        if (existingIdx >= 0) newIndex[existingIdx] = newEntry;
        else newIndex.unshift(newEntry);
      }

      setSavedList(newIndex);
      localStorage.setItem(SAVED_INDEX_KEY, JSON.stringify(newIndex));
      setSavedOpen(true);

      const msg = [
        added  > 0 ? `신규 ${added}개` : "",
        merged > 0 ? `병합 ${merged}개` : "",
      ].filter(Boolean).join(", ");
      toast.success(`가져오기 완료 — ${msg}`);
    } catch (err) {
      toast.error(`가져오기 실패: ${err instanceof Error ? err.message : "파일 형식 오류"}`);
    }
  }, [savedList]);

  // ── JSON 내보내기 ─────────────────────────────────────────────────
  // File System Access API 지원 시 → 네이티브 "다른 이름으로 저장" 다이얼로그
  // 미지원 브라우저(Firefox 등) → blob URL 다운로드로 폴백
  const handleExport = useCallback(async () => {
    if (savedList.length === 0) {
      toast.error("내보낼 저장 데이터가 없습니다.");
      return;
    }

    const entries: ExportData["entries"] = [];
    for (const entry of savedList) {
      const str = localStorage.getItem(savedDataKey(entry.ticker, entry.exchange));
      if (!str) continue;
      try {
        const { rawData: rd } = JSON.parse(str) as { rawData: FinancialStatements };
        entries.push({ ...entry, rawData: rd });
      } catch { /* 파싱 실패 항목 건너뜀 */ }
    }

    const json = JSON.stringify(
      { version: "1.0", exportedAt: new Date().toISOString(), entries } satisfies ExportData,
      null, 2
    );
    const suggestedName = `fs-analysis-${new Date().toISOString().slice(0, 10)}.json`;

    // File System Access API — 크롬/엣지에서 저장 경로 선택 가능
    if ("showSaveFilePicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{ description: "JSON 파일", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        toast.success(`${entries.length}개 종목 내보내기 완료`);
        return;
      } catch (err) {
        // 사용자가 취소한 경우 — 에러 없이 종료
        if ((err as Error).name === "AbortError") return;
        // 그 외 오류 → 폴백으로 진행
      }
    }

    // 폴백: blob URL 다운로드 (저장 위치는 브라우저 기본 설정 따름)
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${entries.length}개 종목 내보내기 완료`);
  }, [savedList]);

  // ── JSON 가져오기 ─────────────────────────────────────────────────
  // File System Access API 지원 시 → 네이티브 파일 열기 다이얼로그
  // 미지원 시 → hidden <input type="file"> 폴백
  const handleImportClick = useCallback(async () => {
    if ("showOpenFilePicker" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: "JSON 파일", accept: { "application/json": [".json"] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        processImportText(await file.text());
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    // 폴백: hidden input
    fileInputRef.current?.click();
  }, [processImportText]);

  // hidden input onChange — showOpenFilePicker 미지원 브라우저 폴백
  const handleImportChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => processImportText(ev.target?.result as string);
    reader.readAsText(file);
  }, [processImportText]);

  const isLoading = status === "collecting";

  return (
    <div className="space-y-4">
      {/* ── 저장된 분석 목록 ── */}
      <Card>
        {/* 파일 가져오기용 hidden input — 버튼 클릭으로 트리거 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportChange}
        />

        <div className="flex items-center justify-between px-4 py-2.5">
          {/* 왼쪽: 토글 버튼 */}
          <button
            className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 transition-colors"
            onClick={() => setSavedOpen((v) => !v)}
          >
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span>저장된 분석</span>
            {savedList.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {savedList.length}
              </Badge>
            )}
            {savedOpen
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>

          {/* 오른쪽: 내보내기 / 가져오기 */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleExport}
              disabled={savedList.length === 0}
              title="저장된 분석 전체를 JSON 파일로 내보내기"
            >
              <Download className="h-3.5 w-3.5" />
              내보내기
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleImportClick}
              title="JSON 파일에서 분석 데이터 가져오기"
            >
              <Upload className="h-3.5 w-3.5" />
              가져오기
            </Button>
          </div>
        </div>

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
                    {/* KRX 종목 기업명 — 클릭 시 네이버 증권으로 이동 */}
                    {entry.companyName && entry.companyName !== entry.ticker && (
                      entry.exchange === "KRX" ? (
                        <a
                          href={`https://stock.naver.com/domestic/stock/${entry.ticker}/price`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-muted-foreground truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors"
                        >
                          {entry.companyName}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground truncate">
                          {entry.companyName}
                        </span>
                      )
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

          {/* 저장 항목 없을 때 안내 */}
          {savedList.length === 0 && savedOpen && (
            <div className="border-t px-4 py-3 text-xs text-muted-foreground">
              분석하기를 실행하면 자동 저장됩니다.
            </div>
          )}
        </Card>

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
          {/* 기업 헤더 */}
          <div className="flex items-center gap-2 min-w-0">
            {/* 기업명 우선순위:
                1) 사용자 입력 companyName (폼에서 직접 입력)
                2) rawData.companyName (FnGuide <title> 자동 추출)
                3) 없으면 ticker로 대체
                KRX 종목은 클릭 시 네이버 증권 페이지로 이동 */}
            {rawData.exchange === "KRX" ? (
              <a
                href={`https://stock.naver.com/domestic/stock/${currentInput?.ticker ?? rawData.ticker}/price`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-base leading-tight truncate hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors"
              >
                {currentInput?.companyName || rawData.companyName || currentInput?.ticker || rawData.ticker}
              </a>
            ) : (
              <span className="font-bold text-base leading-tight truncate">
                {currentInput?.companyName || rawData.companyName || currentInput?.ticker || rawData.ticker}
              </span>
            )}
            {/* ticker는 거래소 Badge에 통합 — "KRX · 066970" 형태 */}
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
              {rawData.exchange} · {currentInput?.ticker ?? rawData.ticker}
            </Badge>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
              {rawData.dataSource}
            </Badge>
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
