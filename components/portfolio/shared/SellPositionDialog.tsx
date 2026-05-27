"use client";

/**
 * 매도 처리 다이얼로그 (공용)
 *
 * Education/Short-term 계좌 모두에서 사용.
 * API 엔드포인트만 다르고 로직이 동일하므로 apiBase prop 하나로 분기.
 *
 * Education:  apiBase="/api/portfolio/education"
 * Short-term: apiBase="/api/portfolio/shortterm"
 */

import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EducationPosition } from "@/types/portfolio";

interface SellPositionDialogProps {
  /** 계좌별 API 기본 경로 (예: "/api/portfolio/education") */
  apiBase: string;
  open: boolean;
  position: EducationPosition;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SellPositionDialog({ apiBase, open, position, onOpenChange, onSaved }: SellPositionDialogProps) {
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10));
  const [sellPrice, setSellPrice] = useState("");
  const [quantity, setQuantity] = useState(String(position.quantity));
  const [commission, setCommission] = useState("");
  const [tax, setTax] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 포지션이 바뀔 때 폼 초기화
  useEffect(() => {
    setQuantity(String(position.quantity));
    setSellPrice("");
    setCommission("");
    setTax("");
    setError(null);
  }, [position]);

  // 손익 미리보기 계산 (수수료·세금 차감 후 순손익)
  const priceNum = Number(sellPrice.replace(/,/g, ""));
  const qtyNum   = Number(quantity);
  const commNum  = Number(commission.replace(/,/g, "")) || 0;
  const taxNum   = Number(tax.replace(/,/g, "")) || 0;
  const grossPL  = priceNum && qtyNum
    ? Math.round((priceNum - position.avgPrice) * qtyNum) : null;
  const previewPL  = grossPL !== null ? grossPL - commNum - taxNum : null;
  const previewPct = previewPL !== null && position.avgPrice && qtyNum
    ? Math.round((previewPL / (position.avgPrice * qtyNum)) * 10000) / 100 : null;

  async function handleSave() {
    if (!sellPrice || !quantity || !sellDate) {
      setError("매도가, 수량, 매도일을 모두 입력하세요.");
      return;
    }
    if (qtyNum > position.quantity) {
      setError(`보유 수량(${position.quantity})을 초과할 수 없습니다.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/positions/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positionId: position.id,
          sellDate,
          sellPrice: priceNum,
          quantity: qtyNum,
          commission: commNum || undefined,
          tax: taxNum || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "처리 실패");
      }
      onSaved();
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
          <DialogTitle className="text-sm">매도 처리</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 종목 정보 (읽기 전용) */}
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">종목</span>
              <span className="font-medium">{position.stockName} ({position.stockCode})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">평균 매수가</span>
              <span className="tabular-nums">{position.avgPrice.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">보유 수량</span>
              <span className="tabular-nums">{position.quantity}주</span>
            </div>
          </div>

          {/* 매도일 */}
          <div className="space-y-1">
            <Label className="text-xs">매도일 *</Label>
            <Input type="date" className="h-8 text-xs" value={sellDate}
              onChange={(e) => setSellDate(e.target.value)} />
          </div>

          {/* 매도가 + 수량 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">매도가 (원) *</Label>
              <Input className="h-8 text-xs" placeholder="500000" value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">수량 * (최대 {position.quantity})</Label>
              <Input className="h-8 text-xs" value={quantity}
                onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>

          {/* 수수료 + 세금 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">수수료 (원)</Label>
              <Input className="h-8 text-xs" placeholder="0" value={commission}
                onChange={(e) => setCommission(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">세금 (원)</Label>
              <Input className="h-8 text-xs" placeholder="0" value={tax}
                onChange={(e) => setTax(e.target.value)} />
            </div>
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
                <span className={`font-semibold tabular-nums ${previewPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                  {previewPL >= 0 ? "+" : ""}{previewPL.toLocaleString()}원
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">수익률</span>
                <span className={`font-semibold tabular-nums ${previewPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                  {previewPct >= 0 ? "+" : ""}{previewPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">결과</span>
                <span className={`font-bold ${previewPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                  {previewPL >= 0 ? "Win" : "Lose"}
                </span>
              </div>
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
            className="h-8 text-xs bg-blue-500 hover:bg-blue-600 text-white"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "처리 중…" : "매도 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
