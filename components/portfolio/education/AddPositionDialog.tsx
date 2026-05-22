"use client";

// Education 계좌 매수 추가 다이얼로그 래퍼
// 공용 AddPositionDialog에 Education API 경로를 전달한다.
// 실제 로직은 components/portfolio/shared/AddPositionDialog.tsx 참조.

import { AddPositionDialog as SharedAddPositionDialog } from "../shared/AddPositionDialog";

interface AddPositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AddPositionDialog({ open, onOpenChange, onSaved }: AddPositionDialogProps) {
  return (
    <SharedAddPositionDialog
      apiBase="/api/portfolio/education"
      open={open}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  );
}
