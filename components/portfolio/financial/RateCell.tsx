"use client";

// 환율 인라인 편집 셀 컴포넌트
// 클릭하면 입력 필드로 전환, Enter 저장 / Escape 취소
// compact 모드: 자산관리 테이블 셀 내 삽입 (레이블 없음, 우측 정렬)

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Check, X } from "lucide-react";

interface RateCellProps {
  /** 레이블 텍스트 (compact=false 시 표시) */
  label?: string;
  /** 현재 환율 값 */
  value: number;
  /** 저장 콜백 */
  onSave: (v: number) => Promise<void>;
  /**
   * compact 모드 — 테이블 셀 삽입용
   * - 레이블 미표시
   * - 우측 정렬
   * - 입력 필드 너비 축소
   */
  compact?: boolean;
}

export function RateCell({ label, value, onSave, compact = false }: RateCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드 진입 시 포커스 + 전체 선택
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // 부모 value 변경 시 draft 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const handleCommit = async () => {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed) && parsed > 0 && parsed !== value) {
      setSaving(true);
      try {
        await onSave(parsed);
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(String(value));
    setEditing(false);
  };

  const formatted = value.toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (editing) {
    return (
      <div className={`flex items-center gap-1 ${compact ? "justify-end" : ""}`}>
        {!compact && label && (
          <span className="text-xs text-muted-foreground">{label}</span>
        )}
        <Input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCommit();
            if (e.key === "Escape") handleCancel();
          }}
          className={`h-6 text-xs px-1.5 tabular-nums ${compact ? "w-20 text-right" : "w-24"}`}
          disabled={saving}
        />
        <button
          onClick={handleCommit}
          disabled={saving}
          className="text-emerald-600 hover:text-emerald-700 flex-shrink-0"
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (compact) {
    // compact 모드: 테이블 셀 — 우측 정렬, 호버 시 밑줄
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="w-full text-right text-xs tabular-nums text-foreground hover:underline"
        title="클릭하여 환율 수정"
      >
        {formatted}
      </button>
    );
  }

  // 기본 모드: 레이블 + 값 (헤더 바용)
  return (
    <button
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="flex items-center gap-1 group"
      title="클릭하여 환율 수정"
    >
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <span className="text-xs font-medium tabular-nums group-hover:underline">
        {formatted}
      </span>
    </button>
  );
}
