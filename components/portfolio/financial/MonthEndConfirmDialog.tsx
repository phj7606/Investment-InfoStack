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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import type { FinancialSnapshot, ConfirmSnapshotRequest } from "@/types/financial";

interface MonthEndConfirmDialogProps {
  open: boolean;
  snapshot: FinancialSnapshot;
  onClose: () => void;
  onConfirm: (req: ConfirmSnapshotRequest) => Promise<void>;
}

/**
 * 월말 확정 다이얼로그
 *
 * 확정 시 포트폴리오 포지션(FUND/KOR/US Stocks, Pension, Education)을 캡처하고
 * 수동 입력 필드(환율, 정기예금, 부채, 연금, 가상자산 등)를 최종 확인한다.
 *
 * 확정 후에는 수정 불가 → 재무제표 과거 기록 보존
 */
export function MonthEndConfirmDialog({ open, snapshot, onClose, onConfirm }: MonthEndConfirmDialogProps) {
  const [usdKrw, setUsdKrw] = useState(snapshot.exchangeRates.usdKrw);
  const [cadKrw, setCadKrw] = useState(snapshot.exchangeRates.cadKrw);
  const [fixedDepositKrw, setFixedDepositKrw] = useState(snapshot.fixedDepositKrw);
  const [fixedDepositUsd, setFixedDepositUsd] = useState(snapshot.fixedDepositUsd);
  const [leaseDeposit, setLeaseDeposit] = useState(snapshot.leaseDeposit);
  const [privateLoan, setPrivateLoan] = useState(snapshot.privateLoan);
  const [mortgageLoan, setMortgageLoan] = useState(snapshot.mortgageLoan);
  const [realEstate, setRealEstate] = useState(snapshot.realEstate);
  const [cadBalance, setCadBalance] = useState(snapshot.canadianPension.balanceCad);
  const [cadFee, setCadFee] = useState(snapshot.canadianPension.monthlyFeeCad);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setError("");
    if (usdKrw <= 0 || cadKrw <= 0) {
      setError("환율을 올바르게 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      await onConfirm({
        usdKrw,
        cadKrw,
        fixedDepositKrw,
        fixedDepositUsd,
        leaseDeposit,
        privateLoan,
        mortgageLoan,
        realEstate,
        crypto: snapshot.crypto,
        canadianPension: {
          balanceCad: cadBalance,
          monthlyFeeCad: cadFee,
          note: snapshot.canadianPension.note,
        },
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {snapshot.month} 월말 마감
            <Badge variant="outline" className="text-amber-600 border-amber-400">DRAFT</Badge>
          </DialogTitle>
          <DialogDescription>
            확정 후에는 수정할 수 없습니다. 포트폴리오 포지션(FUND/KOR/US Stocks, Pension, Education)을
            현재 기준으로 캡처합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 환율 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">월말 기준 환율</p>
              <Badge variant="secondary" className="text-xs">필수</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>USD / KRW</Label>
                <Input type="number" min="0" step="0.01" value={usdKrw}
                  onChange={(e) => setUsdKrw(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>CAD / KRW</Label>
                <Input type="number" min="0" step="0.01" value={cadKrw}
                  onChange={(e) => setCadKrw(Number(e.target.value))} />
              </div>
            </div>
          </section>

          <Separator />

          {/* 정기예금 */}
          <section className="space-y-3">
            <p className="text-sm font-semibold">정기예금 (Cash & Equivalent)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>정기예금 KRW</Label>
                <Input type="number" min="0" value={fixedDepositKrw}
                  onChange={(e) => setFixedDepositKrw(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">{fixedDepositKrw.toLocaleString()}원</p>
              </div>
              <div className="space-y-1.5">
                <Label>외화정기예금 USD</Label>
                <Input type="number" min="0" step="0.01" value={fixedDepositUsd}
                  onChange={(e) => setFixedDepositUsd(Number(e.target.value))} />
              </div>
            </div>
          </section>

          <Separator />

          {/* 부채 */}
          <section className="space-y-3">
            <p className="text-sm font-semibold">부채 (Liabilities)</p>
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-red-700 dark:text-red-400">임차보증금 (Lease Deposit)</Label>
                <Input type="number" min="0" value={leaseDeposit}
                  onChange={(e) => setLeaseDeposit(Number(e.target.value))}
                  className="border-red-300" />
                <p className="text-xs text-red-600">{leaseDeposit.toLocaleString()}원</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>개인차입금</Label>
                  <Input type="number" min="0" value={privateLoan}
                    onChange={(e) => setPrivateLoan(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>주택담보대출</Label>
                  <Input type="number" min="0" value={mortgageLoan}
                    onChange={(e) => setMortgageLoan(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* 부동산 */}
          <section className="space-y-3">
            <p className="text-sm font-semibold">부동산 (Real Estate)</p>
            <Input type="number" min="0" value={realEstate}
              onChange={(e) => setRealEstate(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground">{realEstate.toLocaleString()}원</p>
          </section>

          <Separator />

          {/* 캐나다 연금 */}
          <section className="space-y-3">
            <p className="text-sm font-semibold">캐나다 연금 (CAD)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>월말 잔액 CAD</Label>
                <Input type="number" min="0" step="0.01" value={cadBalance}
                  onChange={(e) => setCadBalance(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label>이번 달 수수료</Label>
                <Input type="number" min="0" step="0.01" value={cadFee}
                  onChange={(e) => setCadFee(Number(e.target.value))} />
              </div>
            </div>
            {cadBalance > 0 && cadKrw > 0 && (
              <p className="text-xs text-muted-foreground">
                KRW 환산: ≈ {Math.round(cadBalance * cadKrw).toLocaleString()}원
              </p>
            )}
          </section>

          {/* 확정 안내 */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold mb-1">확정 후 처리 내용</p>
            <ul className="space-y-1 text-xs list-disc list-inside">
              <li>FUND / KOR Stocks / US Stocks 포지션 현재 기준으로 캡처</li>
              <li>Pension (퇴직연금/연금저축/IRP) 포지션 캡처</li>
              <li>Education 1470 포지션 캡처</li>
              <li>위에서 입력한 환율로 KRW 환산값 고정</li>
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
