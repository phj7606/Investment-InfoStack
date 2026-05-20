"use client";

// 매수 추가 다이얼로그
// 새 포지션 또는 기존 종목 추가 매수 입력 폼

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddPositionDialogProps {
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

export function AddPositionDialog({ open, onOpenChange, onSaved }: AddPositionDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.stockCode.trim() || !form.stockName.trim()) {
      setError("종목코드와 종목명은 필수입니다.");
      return;
    }
    const avgPrice   = Number(form.avgPrice.replace(/,/g, ""));
    const quantity   = Number(form.quantity);
    const commission = Number(form.commission.replace(/,/g, "")) || undefined;
    const tax        = Number(form.tax.replace(/,/g, "")) || undefined;
    if (!avgPrice || !quantity) {
      setError("매수가와 수량을 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/education/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: form.stockCode.trim(),
          stockName: form.stockName.trim(),
          buyDate: form.buyDate,
          avgPrice,
          quantity,
          commission,
          tax,
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
              <Input
                className="h-8 text-xs"
                placeholder="009150"
                value={form.stockCode}
                onChange={(e) => update("stockCode", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">종목명 *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="삼성전기"
                value={form.stockName}
                onChange={(e) => update("stockName", e.target.value)}
              />
            </div>
          </div>

          {/* 매수일 */}
          <div className="space-y-1">
            <Label className="text-xs">매수일 *</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.buyDate}
              onChange={(e) => update("buyDate", e.target.value)}
            />
          </div>

          {/* 매수가 + 수량 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">매수가 (원) *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="497000"
                value={form.avgPrice}
                onChange={(e) => update("avgPrice", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">수량 *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="8"
                value={form.quantity}
                onChange={(e) => update("quantity", e.target.value)}
              />
            </div>
          </div>

          {/* 수수료 + 세금 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">수수료 (원)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="0"
                value={form.commission}
                onChange={(e) => update("commission", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">세금 (원)</Label>
              <Input
                className="h-8 text-xs"
                placeholder="0"
                value={form.tax}
                onChange={(e) => update("tax", e.target.value)}
              />
            </div>
          </div>

          {/* 섹터 + Unit */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">섹터</Label>
              <Input
                className="h-8 text-xs"
                placeholder="IT"
                value={form.sector}
                onChange={(e) => update("sector", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit</Label>
              <Input
                className="h-8 text-xs"
                placeholder="2/3"
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
              />
            </div>
          </div>

          {/* 총 매수금액 미리보기 */}
          {form.avgPrice && form.quantity && (
            <div className="rounded-lg border px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">총 매수금액</span>
                <span className="font-semibold tabular-nums">
                  {(Number(form.avgPrice.replace(/,/g, "")) * Number(form.quantity)).toLocaleString()}원
                </span>
              </div>
              {(Number(form.commission.replace(/,/g, "")) > 0 || Number(form.tax.replace(/,/g, "")) > 0) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>수수료+세금</span>
                  <span className="tabular-nums text-orange-500">
                    +{(Number(form.commission.replace(/,/g, "")) + Number(form.tax.replace(/,/g, ""))).toLocaleString()}원
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            size="sm"
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
