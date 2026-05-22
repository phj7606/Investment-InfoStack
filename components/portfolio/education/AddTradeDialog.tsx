"use client";

// Education 계좌 거래 추가 다이얼로그 래퍼
// 공용 AddTradeDialog에 Education API 경로를 전달한다.
// 실제 로직은 components/portfolio/shared/AddTradeDialog.tsx 참조.

import { AddTradeDialog as SharedAddTradeDialog } from "../shared/AddTradeDialog";

interface AddTradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddTradeDialog({ open, onOpenChange, onSaved }: AddTradeDialogProps) {
  return (
    <SharedAddTradeDialog
      apiBase="/api/portfolio/education"
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}
