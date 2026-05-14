"use client";

// 분석 이력 관리 (P5-07)
// localStorage 기반 최대 20건 저장 + Sheet UI로 목록 표시

import { useState, useEffect, useCallback } from "react";
import { History, Trash2, ChevronRight, BookMarked } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { AnalysisHistoryItem } from "@/types/company-analysis";

const STORAGE_KEY = "company-analysis-history";
const MAX_HISTORY = 20;

// -------------------------------------------------------
// 순수 함수 (단위 테스트 가능 — export)
// -------------------------------------------------------

/** 이력 목록에서 최대 N건 유지, 동일 id는 덮어씀 */
export function mergeHistory(
  prev: AnalysisHistoryItem[],
  item: AnalysisHistoryItem
): AnalysisHistoryItem[] {
  const filtered = prev.filter((h) => h.id !== item.id);
  return [item, ...filtered].slice(0, MAX_HISTORY);
}

/** id로 항목 제거 */
export function removeFromHistory(
  prev: AnalysisHistoryItem[],
  id: string
): AnalysisHistoryItem[] {
  return prev.filter((h) => h.id !== id);
}

// -------------------------------------------------------
// 커스텀 훅
// -------------------------------------------------------

export function useAnalysisHistory() {
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);

  // localStorage 읽기는 useEffect 내에서만 — SSR hydration mismatch 방지
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // localStorage 접근 불가 환경 (사설 모드 등) 무시
    }
  }, []);

  const saveToHistory = useCallback((item: AnalysisHistoryItem) => {
    setHistory((prev) => {
      const updated = mergeHistory(prev, item);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // 용량 초과 시 reportMarkdown 제외하고 재시도
        try {
          const slim = updated.map(({ reportMarkdown: _rm, ...rest }) => ({
            ...rest,
            reportMarkdown: "",
          }));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        } catch {
          // 완전 실패 시 조용히 무시
        }
      }
      return updated;
    });
  }, []);

  const deleteFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = removeFromHistory(prev, id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        /* 무시 */
      }
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* 무시 */
    }
  }, []);

  return { history, saveToHistory, deleteFromHistory, clearHistory };
}

// -------------------------------------------------------
// UI 컴포넌트
// -------------------------------------------------------

interface AnalysisHistoryProps {
  history: AnalysisHistoryItem[];
  onSelect: (item: AnalysisHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  // 이전 분석을 새 분석의 참고 컨텍스트로 사용할 때 호출
  onUseAsReference?: (item: AnalysisHistoryItem) => void;
}

export function AnalysisHistory({
  history,
  onSelect,
  onDelete,
  onClear,
  onUseAsReference,
}: AnalysisHistoryProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
          <History className="h-3.5 w-3.5" />
          분석 이력 {history.length > 0 && `(${history.length})`}
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[380px] sm:w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between pr-8">
            <span>분석 이력</span>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                전체 삭제
              </Button>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              저장된 분석 이력이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-lg border border-border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onSelect(item)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* 기업명 + Ticker + 거래소 */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-sm truncate">
                          {item.companyName}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {item.ticker}
                        </Badge>
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {item.exchange}
                        </Badge>
                      </div>
                      {/* 요약 */}
                      {item.summary && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                          {item.summary}
                        </p>
                      )}
                      {/* 분석일 */}
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(item.generatedAt).toLocaleString("ko-KR", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* 이전 분석으로 참고 버튼 — hover 시 표시 */}
                      {onUseAsReference && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="새 분석의 참고 보고서로 사용"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-indigo-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUseAsReference(item);
                          }}
                        >
                          <BookMarked className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* 삭제 버튼 — hover 시 표시 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
