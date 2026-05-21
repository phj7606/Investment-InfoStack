"use client";

/**
 * Monthly CF 세부항목 관리 다이얼로그 v2
 *
 * v2 변경사항:
 *   - 항목명은 rowDef에서 고정 (predefined 셀렉트 제거)
 *   - 같은 [category, name, month]에 여러 항목 추가 가능
 *   - 금액 + 메모만 입력
 *   - 지출 카테고리는 사용자가 양수 입력 → 내부에서 음수 변환
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import type { MonthlyCFEntry, CFCategoryType } from "@/types/financial";

export interface MonthlyCFSubItemDialogProps {
  open: boolean;
  onClose: () => void;
  /** 테이블 행 레이블 (표시용) */
  label: string;
  category: CFCategoryType;
  /** MonthlyCFEntry.name — 저장 키로 사용 */
  name: string;
  /** "2026-05" 형식 */
  month: string;
  /** 해당 [category, name, month]의 현재 항목들 */
  entries: MonthlyCFEntry[];
  onAdd: (params: { category: CFCategoryType; name: string; month: string; amount: number; note?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** "2026-05" → "May 2026" */
function monthLabel(month: string): string {
  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [yr, mo] = month.split("-");
  return `${MONTH_LABELS[parseInt(mo) - 1]} ${yr}`;
}

export function MonthlyCFSubItemDialog({
  open,
  onClose,
  label,
  category,
  name,
  month,
  entries,
  onAdd,
  onDelete,
}: MonthlyCFSubItemDialogProps) {
  const [amountStr, setAmountStr] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addError, setAddError] = useState("");

  // INCOME, ACCOUNT_TRANSFER는 양수 저장, 나머지 지출은 음수 저장
  // (Account Transfer가 Income 섹션으로 이동했으므로 수입과 동일 처리)
  const isExpense = category !== "INCOME" && category !== "ACCOUNT_TRANSFER";

  // 합계 (부호 그대로 합산)
  const catTotal = entries.reduce((s, e) => s + e.amount, 0);

  const handleAdd = async () => {
    setAddError("");
    const raw = parseFloat(amountStr.replace(/,/g, ""));
    if (isNaN(raw) || raw <= 0) {
      setAddError("금액을 올바르게 입력해주세요.");
      return;
    }
    // 지출은 음수로 변환
    const signed = isExpense ? -Math.abs(raw) : Math.abs(raw);
    setSaving(true);
    try {
      await onAdd({ category, name, month, amount: signed, note: memo.trim() || undefined });
      setAmountStr("");
      setMemo("");
    } catch {
      setAddError("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClose = () => {
    setAmountStr("");
    setMemo("");
    setAddError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {label} — {monthLabel(month)}
          </DialogTitle>
        </DialogHeader>

        {/* ── 현재 항목 목록 ─────────────────────────────────── */}
        <div className="max-h-52 overflow-y-auto space-y-1">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              항목이 없습니다.
            </p>
          ) : (
            entries.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0"
              >
                {/* 메모 */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-muted-foreground">
                    {e.note || "—"}
                  </span>
                </div>
                {/* 금액 + 삭제 */}
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span
                    className={`text-sm tabular-nums ${
                      e.amount >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {/* 지출은 절대값으로 표시 */}
                    {isExpense
                      ? Math.abs(e.amount).toLocaleString()
                      : `+${e.amount.toLocaleString()}`}
                  </span>
                  <button
                    onClick={() => handleDelete(e.id)}
                    disabled={deletingId === e.id}
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    aria-label="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── 합계 ─────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="flex justify-between text-sm font-semibold pt-1 border-t">
            <span className="text-muted-foreground">합계</span>
            <span
              className={`tabular-nums ${
                isExpense ? "text-red-500" : "text-emerald-600"
              }`}
            >
              {isExpense
                ? Math.abs(catTotal).toLocaleString()
                : `+${catTotal.toLocaleString()}`}
            </span>
          </div>
        )}

        {/* ── 추가 폼 ──────────────────────────────────────────── */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">항목 추가</p>

          <div className="flex gap-2">
            <Input
              placeholder={isExpense ? "금액 (양수)" : "금액"}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="h-8 text-sm"
              type="number"
              min={0}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Input
              placeholder="메모 (선택)"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>

          {addError && (
            <p className="text-xs text-destructive">{addError}</p>
          )}

          <Button
            size="sm"
            onClick={handleAdd}
            disabled={saving}
            className="w-full h-8"
          >
            {saving ? "저장 중..." : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
