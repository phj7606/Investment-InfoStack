"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FinancialSnapshot, UpdateSnapshotRequest } from "@/types/financial";

interface SnapshotEditDialogProps {
  open: boolean;
  snapshot: FinancialSnapshot;
  onClose: () => void;
  onSave: (req: UpdateSnapshotRequest) => Promise<void>;
}

/**
 * 재무 스냅샷 수동 입력 다이얼로그 — 재무제표 전용 항목만 관리
 *
 * 자산관리/자산관리II 탭에서 이미 처리하는 항목은 모두 제외:
 * - 환율, 예금, 주식예수금, 임차보증금 → 자산관리 탭
 * - 가상자산, 캐나다연금, 2805 → 자산관리II 탭
 *
 * 여기서는 재무제표에서만 관리하는 항목만 입력:
 * 1. 부채 (개인차입금, 주택담보대출)
 * 2. 비유동 자산 (부동산, 기타자산)
 */
export function SnapshotEditDialog({ open, snapshot, onClose, onSave }: SnapshotEditDialogProps) {
  // ── 1. 부채 ──────────────────────────────────────────────
  const [privateLoan, setPrivateLoan] = useState(snapshot.privateLoan);
  const [mortgageLoan, setMortgageLoan] = useState(snapshot.mortgageLoan);

  // ── 2. 비유동 자산 ────────────────────────────────────────
  const [realEstate, setRealEstate] = useState(snapshot.realEstate);
  const [otherAssets, setOtherAssets] = useState(snapshot.otherAssets);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPrivateLoan(snapshot.privateLoan);
    setMortgageLoan(snapshot.mortgageLoan);
    setRealEstate(snapshot.realEstate);
    setOtherAssets(snapshot.otherAssets);
  }, [snapshot]);

  async function handleSave() {
    setError("");
    if (privateLoan < 0 || mortgageLoan < 0) {
      setError("부채 금액은 0 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      await onSave({
        privateLoan,
        mortgageLoan,
        realEstate,
        otherAssets,
      });
      onClose();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function updateOtherAsset(idx: number, field: "name" | "amount", value: string | number) {
    const next = [...otherAssets];
    if (field === "name") next[idx] = { ...next[idx], name: value as string };
    else next[idx] = { ...next[idx], amount: Number(value) };
    setOtherAssets(next);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>재무 정보 수정 — {snapshot.month}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            환율·예금·임차보증금·가상자산·연금은 자산관리 탭에서 관리됩니다.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* 부채 */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">부채 (Liabilities)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>개인차입금</Label>
                <Input type="number" min="0" value={privateLoan}
                  onChange={(e) => setPrivateLoan(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">{privateLoan.toLocaleString()}원</p>
              </div>
              <div className="space-y-1.5">
                <Label>주택담보대출</Label>
                <Input type="number" min="0" value={mortgageLoan}
                  onChange={(e) => setMortgageLoan(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">{mortgageLoan.toLocaleString()}원</p>
              </div>
            </div>
          </section>

          {/* 비유동 자산 */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">비유동 자산 (Non-current Assets)</p>
            <div className="space-y-1.5">
              <Label>부동산 (Real Estate)</Label>
              <Input type="number" min="0" value={realEstate}
                onChange={(e) => setRealEstate(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">{realEstate.toLocaleString()}원</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>기타 자산</Label>
                <Button variant="outline" size="sm"
                  onClick={() => setOtherAssets([...otherAssets, { name: "", amount: 0 }])}>
                  + 추가
                </Button>
              </div>
              {otherAssets.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input className="flex-1" placeholder="자산명" value={a.name}
                    onChange={(e) => updateOtherAsset(i, "name", e.target.value)} />
                  <Input className="w-36" type="number" min="0" placeholder="금액" value={a.amount}
                    onChange={(e) => updateOtherAsset(i, "amount", e.target.value)} />
                  <Button variant="ghost" size="sm"
                    onClick={() => setOtherAssets(otherAssets.filter((_, j) => j !== i))}
                    className="text-destructive px-2">✕</Button>
                </div>
              ))}
            </div>
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
