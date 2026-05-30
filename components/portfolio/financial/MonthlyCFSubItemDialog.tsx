"use client";

/**
 * Monthly CF 세부항목 관리 다이얼로그 v3
 *
 * 기존 항목 인라인 편집 추가:
 *   - 각 항목 행의 ✏️ 버튼 클릭 → 금액·메모 Input 표시
 *   - Enter / ✓ 확정 → PUT (onUpdate 콜백)
 *   - Esc / ✗ 취소 → 원래 값으로 복원
 *   - 삭제 버튼 (🗑) 유지
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
import { FormattedInput } from "@/components/portfolio/financial/FormattedInput";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { MonthlyCFEntry, CFCategoryType } from "@/types/financial";

export interface MonthlyCFSubItemDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  category: CFCategoryType;
  name: string;
  month: string;
  entries: MonthlyCFEntry[];
  onAdd: (params: {
    category: CFCategoryType;
    name: string;
    month: string;
    amount: number;
    note?: string;
  }) => Promise<void>;
  onUpdate: (id: string, amount: number, note?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** "2026-05" → "May 2026" */
function monthLabel(month: string): string {
  const LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [yr, mo] = month.split("-");
  return `${LABELS[parseInt(mo) - 1]} ${yr}`;
}

// ─────────────────────────────────────────
// 편집 중인 항목 상태
// ─────────────────────────────────────────

interface EditState {
  id: string;
  amountStr: string;
  note: string;
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
  onUpdate,
  onDelete,
}: MonthlyCFSubItemDialogProps) {
  // ── 추가 폼 상태 ──────────────────────────────────────────────
  const [addAmount, setAddAmount] = useState("");
  const [addNote, setAddNote]     = useState("");
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState("");

  // ── 편집 상태 ─────────────────────────────────────────────────
  const [editing, setEditing]     = useState<EditState | null>(null);
  const [updating, setUpdating]   = useState(false);
  const [updateError, setUpdateError] = useState("");

  // ── 삭제 상태 ─────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // INCOME·ACCOUNT_TRANSFER는 양수, 나머지 지출은 음수 저장
  const isExpense = category !== "INCOME" && category !== "ACCOUNT_TRANSFER";

  const catTotal = entries.reduce((s, e) => s + e.amount, 0);

  // ── 표시용 절대값 포맷 ────────────────────────────────────────
  function displayAmt(amount: number): string {
    return Math.abs(Math.round(amount)).toLocaleString("ko-KR");
  }

  // ── 추가 ─────────────────────────────────────────────────────

  const handleAdd = async () => {
    setAddError("");
    const raw = parseFloat(addAmount.replace(/,/g, ""));
    if (isNaN(raw) || raw <= 0) {
      setAddError("금액을 올바르게 입력해주세요.");
      return;
    }
    const signed = isExpense ? -Math.abs(raw) : Math.abs(raw);
    setAdding(true);
    try {
      await onAdd({ category, name, month, amount: signed, note: addNote.trim() || undefined });
      setAddAmount("");
      setAddNote("");
    } catch {
      setAddError("저장에 실패했습니다.");
    } finally {
      setAdding(false);
    }
  };

  // ── 편집 시작 ─────────────────────────────────────────────────

  const startEdit = (e: MonthlyCFEntry) => {
    setUpdateError("");
    setEditing({
      id: e.id,
      // 사용자에게는 절대값으로 표시
      amountStr: String(Math.abs(e.amount)),
      note: e.note ?? "",
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setUpdateError("");
  };

  // ── 편집 확정 ─────────────────────────────────────────────────

  const confirmEdit = async () => {
    if (!editing || updating) return;
    setUpdateError("");
    const raw = parseFloat(editing.amountStr.replace(/,/g, ""));
    if (isNaN(raw) || raw <= 0) {
      setUpdateError("금액을 올바르게 입력해주세요.");
      return;
    }
    const signed = isExpense ? -Math.abs(raw) : Math.abs(raw);
    setUpdating(true);
    try {
      await onUpdate(editing.id, signed, editing.note.trim() || undefined);
      setEditing(null);
    } catch {
      setUpdateError("수정에 실패했습니다.");
    } finally {
      setUpdating(false);
    }
  };

  // ── 삭제 ─────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  // ── 닫기 ─────────────────────────────────────────────────────

  const handleClose = () => {
    setAddAmount(""); setAddNote(""); setAddError("");
    setEditing(null); setUpdateError("");
    onClose();
  };

  // ── 렌더링 ───────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {label} — {monthLabel(month)}
          </DialogTitle>
        </DialogHeader>

        {/* ── 항목 목록 ──────────────────────────────────────────── */}
        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              항목이 없습니다.
            </p>
          ) : (
            entries.map((e) => {
              const isEditingThis = editing?.id === e.id;

              return (
                <div
                  key={e.id}
                  className="border-b border-border/40 last:border-0"
                >
                  {isEditingThis ? (
                    /* ── 편집 모드 ──────────────────────────────── */
                    <div className="py-1.5 space-y-1.5">
                      <div className="flex gap-2">
                        {/* FormattedInput: 편집 중 금액 실시간 콤마 포맷 — KRW 기준 (isUsd 없음) */}
                        <FormattedInput
                          value={editing.amountStr}
                          onChange={(raw) =>
                            setEditing((prev) =>
                              prev ? { ...prev, amountStr: raw } : null
                            )
                          }
                          placeholder={isExpense ? "금액 (양수)" : "금액"}
                          className="h-8 text-sm"
                        />
                        <Input
                          value={editing.note}
                          onChange={(ev) =>
                            setEditing((prev) =>
                              prev ? { ...prev, note: ev.target.value } : null
                            )
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") confirmEdit();
                            if (ev.key === "Escape") cancelEdit();
                          }}
                          placeholder="메모 (선택)"
                          className="h-8 text-sm"
                        />
                        {/* 확정 */}
                        <button
                          onClick={confirmEdit}
                          disabled={updating}
                          className="shrink-0 text-emerald-600 hover:text-emerald-700 disabled:opacity-40"
                          aria-label="확정"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        {/* 취소 */}
                        <button
                          onClick={cancelEdit}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label="취소"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {updateError && (
                        <p className="text-xs text-destructive">{updateError}</p>
                      )}
                    </div>
                  ) : (
                    /* ── 뷰 모드 ────────────────────────────────── */
                    <div className="flex items-center justify-between py-1.5">
                      {/* 메모 */}
                      <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
                        {e.note || "—"}
                      </span>
                      {/* 금액 + 편집 + 삭제 */}
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <span className="text-sm tabular-nums text-foreground">
                          {displayAmt(e.amount)}
                        </span>
                        {/* 편집 버튼 */}
                        <button
                          onClick={() => startEdit(e)}
                          disabled={!!editing}
                          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                          aria-label="편집"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deletingId === e.id || !!editing}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
                          aria-label="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── 합계 ─────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="flex justify-between text-sm font-semibold pt-1 border-t">
            <span className="text-muted-foreground">합계</span>
            <span className="tabular-nums text-foreground">
              {Math.abs(Math.round(catTotal)).toLocaleString("ko-KR")}
            </span>
          </div>
        )}

        {/* ── 추가 폼 ──────────────────────────────────────────── */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs font-medium text-muted-foreground">항목 추가</p>
          <div className="flex gap-2">
            {/* FormattedInput: 추가 폼 금액 실시간 콤마 포맷 — KRW 기준 */}
            <FormattedInput
              value={addAmount}
              onChange={setAddAmount}
              placeholder={isExpense ? "금액 (양수)" : "금액"}
              className="h-8 text-sm"
            />
            <Input
              placeholder="메모 (선택)"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <Button size="sm" onClick={handleAdd} disabled={adding} className="w-full h-8">
            {adding ? "저장 중..." : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
