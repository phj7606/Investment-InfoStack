"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DepositsView } from "./views/DepositsView";
import { currentMonth } from "@/lib/portfolio/financial-calc";
import type { FinancialSnapshot } from "@/types/financial";

export function DepositsDashboardClient() {
  const [snapshots, setSnapshots] = useState<FinancialSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rateRefreshing, setRateRefreshing] = useState(false);

  // ── 데이터 로딩 ─────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/portfolio/financial/snapshot");
      if (!res.ok) throw new Error("데이터 로드 실패");
      const data = await res.json();
      setSnapshots(data.snapshots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── 환율 수정 ────────────────────────────────────
  const handleRateSave = useCallback(async (field: "usdKrw" | "cadKrw", value: number) => {
    const targetMonth =
      snapshots.find((s) => s.status === "DRAFT")?.month ?? currentMonth();
    await fetch(`/api/portfolio/financial/snapshot/${targetMonth}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchangeRates: { [field]: value } }),
    });
    await loadData();
  }, [snapshots, loadData]);

  // ── 실시간 환율 갱신 ─────────────────────────────
  const autoRateRefreshed = useRef(false);

  const handleRateRefresh = useCallback(async () => {
    const draftSnap = snapshots.find((s) => s.status === "DRAFT");
    if (!draftSnap) return;
    setRateRefreshing(true);
    try {
      const res = await fetch("/api/exchange-rates");
      if (!res.ok) throw new Error("환율 조회 실패");
      const { usdKrw, cadKrw } = await res.json() as { usdKrw: number; cadKrw: number };
      await fetch(`/api/portfolio/financial/snapshot/${draftSnap.month}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeRates: { usdKrw, cadKrw } }),
      });
      await loadData();
    } catch (e) {
      console.error("[DepositsDashboardClient] 환율 갱신 실패:", e);
    } finally {
      setRateRefreshing(false);
    }
  }, [snapshots, loadData]);

  // 최초 진입 시 DRAFT 환율 자동 갱신 (세션당 1회)
  useEffect(() => {
    if (autoRateRefreshed.current || snapshots.length === 0) return;
    const hasDraft = snapshots.some((s) => s.status === "DRAFT");
    if (!hasDraft) return;
    autoRateRefreshed.current = true;
    handleRateRefresh();
  }, [snapshots, handleRateRefresh]);

  // ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <p className="text-destructive">오류: {error}</p>
        <button onClick={loadData} className="mt-2 underline text-sm">다시 시도</button>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <DepositsView
        snapshots={snapshots}
        onRefresh={loadData}
        onRateSave={handleRateSave}
        onRateRefresh={handleRateRefresh}
        rateRefreshing={rateRefreshing}
      />
    </div>
  );
}
