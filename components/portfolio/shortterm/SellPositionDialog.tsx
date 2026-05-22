"use client";

// Short-term 계좌 매도 처리 다이얼로그 래퍼
// 공용 SellPositionDialog에 Short-term API 경로를 전달한다.
// 실제 로직은 components/portfolio/shared/SellPositionDialog.tsx 참조.

import { SellPositionDialog as SharedSellPositionDialog } from "../shared/SellPositionDialog";
import type { EducationPosition } from "@/types/portfolio";

interface SellPositionDialogProps {
  open: boolean;
  position: EducationPosition;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SellPositionDialog({ open, position, onOpenChange, onSaved }: SellPositionDialogProps) {
  return (
    <SharedSellPositionDialog
      apiBase="/api/portfolio/shortterm"
      open={open}
      position={position}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}
