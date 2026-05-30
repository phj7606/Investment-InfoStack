"use client";

import { useState } from "react";
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
import { FormattedInput } from "@/components/portfolio/financial/FormattedInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CFCategoryType, CreateMonthlyCFRequest } from "@/types/financial";
import { CF_CATEGORY_LABELS } from "@/types/financial";

interface MonthlyCFFormProps {
  open: boolean;
  month: string;  // "2026-05"
  onClose: () => void;
  onSubmit: (entry: CreateMonthlyCFRequest) => Promise<void>;
}

const CATEGORY_OPTIONS: CFCategoryType[] = [
  "INCOME",
  "FIXED_EXPENSE",
  "CREDIT_CARD",
  "CASH_EXPENSE",
  "TAX",
  "ACCOUNT_TRANSFER",
];

/** 수입/지출 방향 안내 — 음수 자동 적용 카테고리 표시 */
const EXPENSE_CATEGORIES: CFCategoryType[] = [
  "FIXED_EXPENSE",
  "CREDIT_CARD",
  "CASH_EXPENSE",
  "TAX",
  "ACCOUNT_TRANSFER",
];

export function MonthlyCFForm({ open, month, onClose, onSubmit }: MonthlyCFFormProps) {
  const [category, setCategory] = useState<CFCategoryType>("INCOME");
  const [name, setName] = useState("");
  // 사용자는 절대값 입력 → 지출 카테고리면 자동 음수 변환
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isExpense = EXPENSE_CATEGORIES.includes(category);

  function reset() {
    setCategory("INCOME");
    setName("");
    setAmountStr("");
    setNote("");
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setError("");
    const rawAmount = parseFloat(amountStr.replace(/,/g, ""));
    if (!name.trim()) { setError("항목명을 입력해주세요."); return; }
    if (isNaN(rawAmount) || rawAmount <= 0) { setError("금액을 양수로 입력해주세요."); return; }

    // 지출 카테고리는 음수로 저장
    const amount = isExpense ? -rawAmount : rawAmount;

    setLoading(true);
    try {
      await onSubmit({ category, name: name.trim(), month, amount, note: note.trim() || undefined });
      reset();
      onClose();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>현금흐름 항목 추가 — {month}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 카테고리 선택 */}
          <div className="space-y-1.5">
            <Label>카테고리</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CFCategoryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CF_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 항목명 */}
          <div className="space-y-1.5">
            <Label>항목명</Label>
            <Input
              placeholder={isExpense ? "예) 관리비, 식비" : "예) 급여, 배당수입"}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* 금액 (절대값 입력) */}
          <div className="space-y-1.5">
            <Label>
              금액 (원)
              {isExpense && (
                <span className="ml-2 text-xs text-muted-foreground">지출은 자동으로 음수 처리</span>
              )}
            </Label>
            {/* FormattedInput: 금액 실시간 콤마 포맷 — KRW 기준, raw 문자열 관리 */}
            <FormattedInput
              value={amountStr}
              onChange={setAmountStr}
              placeholder="예) 3000000"
              className="h-9"
            />
            {amountStr && !isNaN(parseFloat(amountStr)) && (
              <p className="text-xs text-muted-foreground">
                {isExpense ? "−" : "+"}{parseFloat(amountStr).toLocaleString()}
              </p>
            )}
          </div>

          {/* 메모 */}
          <div className="space-y-1.5">
            <Label>메모 (선택)</Label>
            <Textarea
              rows={2}
              placeholder="추가 설명..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "저장 중..." : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
