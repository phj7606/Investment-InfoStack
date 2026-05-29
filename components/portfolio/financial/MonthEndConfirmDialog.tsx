"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { FinancialSnapshot, ConfirmSnapshotRequest } from "@/types/financial";

interface MonthEndConfirmDialogProps {
  open: boolean;
  snapshot: FinancialSnapshot;
  onClose: () => void;
  onConfirm: (req: ConfirmSnapshotRequest) => Promise<void>;
}

/** 금액 미리보기용 포맷 헬퍼 */
function fmtKrw(v: number): string {
  if (v === 0) return "–";
  const abs = Math.abs(v).toLocaleString("ko-KR");
  return v < 0 ? `(${abs})` : abs;
}

/** 미리보기 행 컴포넌트 */
function PreviewRow({
  label,
  value,
  colorClass = "",
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${colorClass}`}>{value}</span>
    </div>
  );
}

/**
 * 월말 확정 다이얼로그 — 입력 없이 현재 스냅샷 값 확인 후 확정
 *
 * 자산관리·자산관리II 탭에서 이미 모든 수치를 확정(종가·환율·예금·임차보증금)한 뒤,
 * 재무제표에서 현재 값을 최종 검토하고 확정 버튼만 누르는 방식.
 * 확정 후에는 수정 불가 → 재무제표 과거 기록 보존
 */
export function MonthEndConfirmDialog({ open, snapshot, onClose, onConfirm }: MonthEndConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { exchangeRates } = snapshot;

  async function handleConfirm() {
    setError("");
    setLoading(true);
    try {
      // 모든 값은 자산관리 탭에서 이미 확정된 스냅샷 값을 그대로 사용
      await onConfirm({
        usdKrw: exchangeRates.usdKrw,
        cadKrw: exchangeRates.cadKrw,
        fixedDepositKrw: snapshot.fixedDepositKrw,
        fixedDepositUsd: snapshot.fixedDepositUsd,
        leaseDeposit: snapshot.leaseDeposit,
        privateLoan: snapshot.privateLoan,
        mortgageLoan: snapshot.mortgageLoan,
        realEstate: snapshot.realEstate,
        crypto: snapshot.crypto,
        canadianPension: snapshot.canadianPension,
        midterm2805: snapshot.midterm2805,
        otherAssets: snapshot.otherAssets,
      });
      onClose();
    } catch {
      setError("확정 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {snapshot.month} 월말 마감
            <Badge variant="outline" className="text-amber-600 border-amber-400">DRAFT</Badge>
          </DialogTitle>
          <DialogDescription>
            자산관리 탭에서 확정된 값으로 재무제표를 확정합니다.
            확정 후에는 수정할 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* 환율 미리보기 */}
          <section className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">환율</p>
            <PreviewRow label="USD / KRW" value={exchangeRates.usdKrw.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
            <PreviewRow label="CAD / KRW" value={exchangeRates.cadKrw.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          </section>

          <Separator />

          {/* 현금·예금 미리보기 */}
          <section className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">현금·예금</p>
            <PreviewRow label="정기예금 KRW" value={fmtKrw(snapshot.fixedDepositKrw)} />
            {snapshot.fixedDepositUsd > 0 && (
              <PreviewRow
                label="외화 정기예금 USD"
                value={`$${snapshot.fixedDepositUsd.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
              />
            )}
          </section>

          <Separator />

          {/* 부채 미리보기 */}
          <section className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">부채</p>
            <PreviewRow label="임차보증금" value={fmtKrw(snapshot.leaseDeposit)} colorClass="text-red-600" />
            {snapshot.privateLoan > 0 && (
              <PreviewRow label="개인차입금" value={fmtKrw(snapshot.privateLoan)} colorClass="text-red-600" />
            )}
            {snapshot.mortgageLoan > 0 && (
              <PreviewRow label="주택담보대출" value={fmtKrw(snapshot.mortgageLoan)} colorClass="text-red-600" />
            )}
          </section>

          <Separator />

          {/* 부동산·기타 미리보기 */}
          {(snapshot.realEstate > 0 || snapshot.otherAssets.length > 0) && (
            <>
              <section className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">비유동 자산</p>
                {snapshot.realEstate > 0 && (
                  <PreviewRow label="부동산" value={fmtKrw(snapshot.realEstate)} />
                )}
                {snapshot.otherAssets.map((a, i) => (
                  <PreviewRow key={i} label={a.name} value={fmtKrw(a.amount)} />
                ))}
              </section>
              <Separator />
            </>
          )}

          {/* 캐나다 연금 미리보기 */}
          {snapshot.canadianPension.balanceCad > 0 && (
            <>
              <section className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">캐나다 연금 (CAD)</p>
                <PreviewRow
                  label="월말 잔액"
                  value={`${snapshot.canadianPension.balanceCad.toLocaleString("en-US", { minimumFractionDigits: 2 })} CAD`}
                />
                {snapshot.canadianPension.monthlyFeeCad > 0 && (
                  <PreviewRow
                    label="이번 달 수수료"
                    value={`${snapshot.canadianPension.monthlyFeeCad.toLocaleString("en-US", { minimumFractionDigits: 2 })} CAD`}
                  />
                )}
                {exchangeRates.cadKrw > 0 && (
                  <p className="text-xs text-muted-foreground text-right">
                    ≈ {Math.round(snapshot.canadianPension.balanceCad * exchangeRates.cadKrw).toLocaleString()}원
                  </p>
                )}
              </section>
              <Separator />
            </>
          )}

          {/* 확정 안내 */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              확정 후 처리 내용
            </div>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>FUND / KOR Stocks / US Stocks 포지션 현재 기준으로 캡처</li>
              <li>Pension (퇴직연금/연금저축/IRP) 포지션 캡처</li>
              <li>Education 1470 포지션 캡처</li>
              <li>위 미리보기 값으로 재무제표 확정</li>
              <li>이후 수정 불가 (재무제표 과거 기록 보존)</li>
            </ul>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {loading ? "확정 중..." : "이번 달 확정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
