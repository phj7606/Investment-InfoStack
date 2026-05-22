"use client";

/**
 * 매수 추가 다이얼로그 (공용)
 *
 * Education/Short-term 계좌 모두에서 사용.
 * API 엔드포인트만 다르고 로직이 동일하므로 apiBase prop 하나로 분기.
 *
 * Education:  apiBase="/api/portfolio/education"
 * Short-term: apiBase="/api/portfolio/shortterm"
 */

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddPositionDialogProps {
  /** 계좌별 API 기본 경로 (예: "/api/portfolio/education") */
  apiBase: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FormState {
  stockCode: string;
  stockName: string;
  buyDate: string;
  avgPrice: string;
  quantity: string;
  commission: string;
  tax: string;
  sector: string;
  unit: string;
}

const DEFAULT_FORM: FormState = {
  stockCode: "", stockName: "",
  buyDate: new Date().toISOString().slice(0, 10),
  avgPrice: "", quantity: "",
  commission: "", tax: "",
  sector: "", unit: "",
};

export function AddPositionDialog({ apiBase, open, onOpenChange, onSaved }: AddPositionDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const price   = Number(form.avgPrice.replace(/,/g, ""));
  const qty     = Number(form.quantity);
  const commNum = Number(form.commission.replace(/,/g, "")) || 0;
  const taxNum  = Number(form.tax.replace(/,/g, "")) || 0;
  const totalBuy = price && qty ? price * qty : null;

  async function handleSave() {
    if (!form.stockCode.trim() || !form.stockName.trim()) {
      setError("종목코드와 종목명은 필수입니다.");
      return;
    }
    if (!price || !qty) {
      setError("매수가와 수량을 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/positions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: form.stockCode.trim(),
          stockName: form.stockName.trim(),
          buyDate: form.buyDate,
          avgPrice: price,
          quantity: qty,
          commission: commNum || undefined,
          tax: taxNum || undefined,
          sector: form.sector.trim(),
          unit: form.unit.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "저장 실패");
      }
      setForm(DEFAULT_FORM);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">매수 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 종목코드 + 종목명 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">종목코드 *</Label>
              <Input className="h-8 text-xs" placeholder="009150" value={form.stockCode}
                onChange={(e) => update("stockCode", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">종목명 *</Label>
              <Input className="h-8 text-xs" placeholder="삼성전기" value={form.stockName}
                onChange={(e) => update("stockName", e.target.value)} />
            </div>
          </div>

          {/* 매수일 + 매수가 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">매수일</Label>
              <Input type="date" className="h-8 text-xs" value={form.buyDate}
                onChange={(e) => update("buyDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">매수가 (원) *</Label>
              <Input className="h-8 text-xs" placeholder="497000" value={form.avgPrice}
                onChange={(e) => update("avgPrice", e.target.value)} />
            </div>
          </div>

          {/* 수량 + 섹터 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">수량 *</Label>
              <Input className="h-8 text-xs" placeholder="10" value={form.quantity}
                onChange={(e) => update("quantity", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">섹터</Label>
              <Input className="h-8 text-xs" placeholder="IT" value={form.sector}
                onChange={(e) => update("sector", e.target.value)} />
            </div>
          </div>

          {/* 수수료 + 세금 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">수수료 (원)</Label>
              <Input className="h-8 text-xs" placeholder="0" value={form.commission}
                onChange={(e) => update("commission", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">세금 (원)</Label>
              <Input className="h-8 text-xs" placeholder="0" value={form.tax}
                onChange={(e) => update("tax", e.target.value)} />
            </div>
          </div>

          {/* Unit */}
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Input className="h-8 text-xs" placeholder="3/1" value={form.unit}
              onChange={(e) => update("unit", e.target.value)} />
          </div>

          {/* 총 매수금액 미리보기 */}
          {totalBuy !== null && (
            <div className="rounded-lg border px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 매수금액</span>
                <span className="font-semibold tabular-nums">{totalBuy.toLocaleString()}원</span>
              </div>
              {(commNum > 0 || taxNum > 0) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>수수료+세금</span>
                  <span className="tabular-nums text-orange-500">+{(commNum + taxNum).toLocaleString()}원</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button size="sm"
            className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
