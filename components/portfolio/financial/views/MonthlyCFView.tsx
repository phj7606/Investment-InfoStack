"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { CFCategoryBarChart } from "../charts/CFCategoryBarChart";
import { MonthlyCFForm } from "../MonthlyCFForm";
import type {
  MonthlyCFEntry,
  MonthlyCFSummary,
  CFCategoryType,
  CreateMonthlyCFRequest,
} from "@/types/financial";
import { CF_CATEGORY_LABELS } from "@/types/financial";

interface MonthlyCFViewProps {
  month: string;
  entries: MonthlyCFEntry[];
  summary: MonthlyCFSummary;
  historySummaries: MonthlyCFSummary[];   // 최근 6개월 차트용
  onRefresh: () => void;
}

/** 카테고리 표시 색상 — 엑셀 Monthly CF 시트 구조에 맞게 업데이트 */
const CATEGORY_COLORS: Record<CFCategoryType, string> = {
  INCOME: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  FIXED_EXPENSE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  CREDIT_CARD: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  CASH_EXPENSE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  TAX: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  ACCOUNT_TRANSFER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

/** 카테고리 순서 — 엑셀 Monthly CF 시트 순서와 동일 */
const CATEGORY_ORDER: CFCategoryType[] = [
  "INCOME",
  "FIXED_EXPENSE",
  "CREDIT_CARD",
  "CASH_EXPENSE",
  "TAX",
  "ACCOUNT_TRANSFER",
];

function formatKrw(v: number): string {
  return (v >= 0 ? "+" : "") + v.toLocaleString() + "원";
}

function formatPct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

export function MonthlyCFView({ month, entries, summary, historySummaries, onRefresh }: MonthlyCFViewProps) {
  const [showForm, setShowForm] = useState(false);

  // 항목 추가 API 호출
  const handleAddEntry = useCallback(async (req: CreateMonthlyCFRequest) => {
    const res = await fetch("/api/portfolio/financial/monthly-cf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(await res.text());
    onRefresh();
  }, [onRefresh]);

  // 항목 삭제 API 호출
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("이 항목을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/portfolio/financial/monthly-cf?id=${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
    onRefresh();
  }, [onRefresh]);

  // 카테고리별 항목 그룹
  const byCategory = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = entries.filter((e) => e.category === cat);
    return acc;
  }, {} as Record<CFCategoryType, MonthlyCFEntry[]>);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">수입</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-emerald-600">
              {summary.totalIncome.toLocaleString()}원
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">지출</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-red-600">
              {summary.totalExpense.toLocaleString()}원
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">순현금흐름</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-xl font-bold ${summary.netCF >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatKrw(summary.netCF)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">저축률</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-blue-600">
              {formatPct(summary.savingsRate)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 월별 비교 차트 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">월별 수입 · 지출 추이 (최근 6개월)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <CFCategoryBarChart data={historySummaries} />
        </CardContent>
      </Card>

      {/* 항목 목록 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">{month} 항목 목록</CardTitle>
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            추가
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              항목을 추가해주세요.
            </p>
          )}

          {/* 카테고리별 섹션 */}
          {CATEGORY_ORDER.map((cat) => {
            const catEntries = byCategory[cat];
            if (catEntries.length === 0) return null;

            const catTotal = catEntries.reduce((s, e) => s + e.amount, 0);

            return (
              <div key={cat}>
                {/* 카테고리 헤더 */}
                <div className="flex items-center justify-between mb-1.5">
                  <Badge variant="secondary" className={`text-xs ${CATEGORY_COLORS[cat]}`}>
                    {CF_CATEGORY_LABELS[cat]}
                  </Badge>
                  <span className={`text-sm font-semibold tabular-nums ${catTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {catTotal >= 0 ? "+" : ""}{catTotal.toLocaleString()}원
                  </span>
                </div>

                {/* 항목 행 */}
                <div className="space-y-1 pl-1">
                  {catEntries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm truncate">{e.name}</span>
                        {e.note && <span className="ml-2 text-xs text-muted-foreground">{e.note}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-mono tabular-nums ${e.amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {e.amount >= 0 ? "+" : ""}{e.amount.toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 항목 추가 폼 */}
      <MonthlyCFForm
        open={showForm}
        month={month}
        onClose={() => setShowForm(false)}
        onSubmit={handleAddEntry}
      />
    </div>
  );
}
