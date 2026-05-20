"use client";

// Short-term 계좌 — 거래 직접 추가 다이얼로그
// POST /api/portfolio/shortterm/trades

import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

interface FormState {
  stockCode: string;
  stockName: string;
  buyDate: string;
  buyPrice: string;
  sellDate: string;
  sellPrice: string;
  quantity: string;
  commission: string;
  tax: string;
  sector: string;
  unit: string;
}

const DEFAULT_FORM: FormState = {
  stockCode: "", stockName: "",
  buyDate: "", buyPrice: "",
  sellDate: new Date().toISOString().slice(0, 10),
  sellPrice: "",
  quantity: "",
  commission: "", tax: "",
  sector: "", unit: "",
};

export function AddTradeDialog({ open, onOpenChange, onSaved }: AddTradeDialogProps) {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const bp      = Number(form.buyPrice.replace(/,/g, ""));
  const sp      = Number(form.sellPrice.replace(/,/g, ""));
  const qty     = Number(form.quantity);
  const commNum = Number(form.commission.replace(/,/g, "")) || 0;
  const taxNum  = Number(form.tax.replace(/,/g, "")) || 0;
  const grossPL = bp && sp && qty ? Math.round((sp - bp) * qty) : null;
  const previewPL  = grossPL !== null ? grossPL - commNum - taxNum : null;
  const previewPct = previewPL !== null && bp && qty
    ? Math.round((previewPL / (bp * qty)) * 10000) / 100 : null;

  let holdingDays = 0;
  if (form.buyDate && form.sellDate) {
    const d1 = new Date(form.buyDate).getTime();
    const d2 = new Date(form.sellDate).getTime();
    holdingDays = Math.max(0, Math.round((d2 - d1) / 86400000));
  }

  async function handleSave() {
    if (!form.stockCode.trim() || !form.stockName.trim()) {
      setError("종목코드와 종목명은 필수입니다.");
      return;
    }
    if (!bp || !sp || !qty || !form.sellDate) {
      setError("매수가, 매도가, 수량, 매도일을 모두 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/shortterm/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: form.stockCode.trim(),
          stockName: form.stockName.trim(),
          buyDate: form.buyDate || form.sellDate,
          buyPrice: bp,
          quantity: qty,
          buyAmount: bp * qty,
          sellDate: form.sellDate,
          sellPrice: sp,
          sellAmount: sp * qty,
          commission: commNum || undefined,
          tax: taxNum || undefined,
          profitLoss: previewPL ?? 0,
          profitLossPct: previewPct ?? 0,
          holdingDays,
          sector: form.sector.trim(),
          unit: form.unit.trim(),
          result: (previewPL ?? 0) > 0 ? "Win" : "Lose",
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
          <DialogTitle className="text-sm">거래 추가</DialogTitle>
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

          {/* 매수 정보 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">매수일</Label>
              <Input type="date" className="h-8 text-xs" value={form.buyDate}
                onChange={(e) => update("buyDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">매수가 (원) *</Label>
              <Input className="h-8 text-xs" placeholder="497000" value={form.buyPrice}
                onChange={(e) => update("buyPrice", e.target.value)} />
            </div>
          </div>

          {/* 매도 정보 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">매도일 *</Label>
              <Input type="date" className="h-8 text-xs" value={form.sellDate}
                onChange={(e) => update("sellDate", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">매도가 (원) *</Label>
              <Input className="h-8 text-xs" placeholder="520000" value={form.sellPrice}
                onChange={(e) => update("sellPrice", e.target.value)} />
            </div>
          </div>

          {/* 수량 + 섹터 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">수량 *</Label>
              <Input className="h-8 text-xs" placeholder="8" value={form.quantity}
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

          {/* 손익 미리보기 (순손익 기준) */}
          {previewPL !== null && previewPct !== null && (
            <div className="rounded-lg border px-3 py-2 text-xs space-y-0.5">
              {grossPL !== null && (commNum > 0 || taxNum > 0) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>총손익 (수수료·세금 전)</span>
                  <span className="tabular-nums">
                    {grossPL >= 0 ? "+" : ""}{grossPL.toLocaleString()}원
                  </span>
                </div>
              )}
              {(commNum > 0 || taxNum > 0) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>수수료+세금</span>
                  <span className="tabular-nums text-orange-500">-{(commNum + taxNum).toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">순손익</span>
                <span className={`font-semibold tabular-nums ${previewPL >= 0 ? "text-red-500" : "text-blue-500"}`}>
                  {previewPL >= 0 ? "+" : ""}{previewPL.toLocaleString()}원
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">수익률</span>
                <span className={`font-semibold tabular-nums ${previewPct >= 0 ? "text-red-500" : "text-blue-500"}`}>
                  {previewPct >= 0 ? "+" : ""}{previewPct.toFixed(2)}%
                </span>
              </div>
              {holdingDays > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">보유 일수</span>
                  <span className="tabular-nums">{holdingDays}일</span>
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
