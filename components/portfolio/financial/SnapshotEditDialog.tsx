"use client";

import { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import type { FinancialSnapshot, UpdateSnapshotRequest } from "@/types/financial";

interface SnapshotEditDialogProps {
  open: boolean;
  snapshot: FinancialSnapshot;
  onClose: () => void;
  onSave: (req: UpdateSnapshotRequest) => Promise<void>;
}

/**
 * 재무 스냅샷 수동 입력 다이얼로그
 *
 * 엑셀 구조에 맞게 6개 섹션으로 구성:
 * 1. 환율 (Exchange Rates)
 * 2. 현금·예금 (Cash & Deposits)
 * 3. 부채 (Liabilities)
 * 4. 비유동 자산 (Non-current Assets)
 * 5. 가상자산 (Crypto)
 * 6. 연금·기타 (Pension & Others)
 */
export function SnapshotEditDialog({ open, snapshot, onClose, onSave }: SnapshotEditDialogProps) {
  // ── 1. 환율 ─────────────────────────────────────────────
  const [usdKrw, setUsdKrw] = useState(snapshot.exchangeRates.usdKrw);
  const [cadKrw, setCadKrw] = useState(snapshot.exchangeRates.cadKrw);

  // ── 2. 현금·예금 ─────────────────────────────────────────
  const [fixedDepositKrw, setFixedDepositKrw] = useState(snapshot.fixedDepositKrw);
  const [fixedDepositUsd, setFixedDepositUsd] = useState(snapshot.fixedDepositUsd);
  const [cashForeignUsd, setCashForeignUsd] = useState(snapshot.cashForeignUsd ?? 0);
  const [cashForeignCad, setCashForeignCad] = useState(snapshot.cashForeignCad ?? 0);
  // 주식예수금 직접입력 — byAccount 합산 또는 스냅샷 저장값으로 초기값 설정
  // 이유: 프로덕션 환경에서 Edit 후 저장 시 0으로 덮어쓰지 않기 위해 기존 값을 로드
  const byAccountKrwInit = Object.values(snapshot.stockDepositByAccount ?? {})
    .reduce((s, v) => s + (v.krw ?? 0), 0);
  const byAccountUsdInit = Object.values(snapshot.stockDepositByAccount ?? {})
    .reduce((s, v) => s + (v.usd ?? 0), 0);
  const [stockDepositKrw, setStockDepositKrw] = useState(
    byAccountKrwInit || snapshot.stockDepositKrw || 0
  );
  const [stockDepositUsd, setStockDepositUsd] = useState(
    byAccountUsdInit || snapshot.stockDepositUsd || 0
  );

  // ── 3. 부채 ──────────────────────────────────────────────
  const [leaseDeposit, setLeaseDeposit] = useState(snapshot.leaseDeposit);
  const [privateLoan, setPrivateLoan] = useState(snapshot.privateLoan);
  const [mortgageLoan, setMortgageLoan] = useState(snapshot.mortgageLoan);

  // ── 4. 비유동 자산 ────────────────────────────────────────
  const [realEstate, setRealEstate] = useState(snapshot.realEstate);
  const [otherAssets, setOtherAssets] = useState(snapshot.otherAssets);

  // ── 5. 가상자산 ───────────────────────────────────────────
  const [upbitBalance, setUpbitBalance] = useState(snapshot.crypto.upbit.balance);
  const [upbitPrincipal, setUpbitPrincipal] = useState(snapshot.crypto.upbit.principal);
  const [korbitBalance, setKorbitBalance] = useState(snapshot.crypto.korbit.balance);
  const [korbitPrincipal, setKorbitPrincipal] = useState(snapshot.crypto.korbit.principal);
  const [binanceBalance, setBinanceBalance] = useState(snapshot.crypto.binance.balance);
  const [binancePrincipal, setBinancePrincipal] = useState(snapshot.crypto.binance.principal);

  // ── 6. 연금·기타 ─────────────────────────────────────────
  const [cadBalance, setCadBalance] = useState(snapshot.canadianPension.balanceCad);
  const [cadFee, setCadFee] = useState(snapshot.canadianPension.monthlyFeeCad);
  const [cadNote, setCadNote] = useState(snapshot.canadianPension.note ?? "");
  const [midtermCumInstallment, setMidtermCumInstallment] = useState(snapshot.midterm2805.cumInstallment);
  const [midtermCumSpent, setMidtermCumSpent] = useState(snapshot.midterm2805.cumSpent);
  const [midtermBalance, setMidtermBalance] = useState(snapshot.midterm2805.balance);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 스냅샷이 변경되면 폼 전체 재초기화
  useEffect(() => {
    setUsdKrw(snapshot.exchangeRates.usdKrw);
    setCadKrw(snapshot.exchangeRates.cadKrw);
    setFixedDepositKrw(snapshot.fixedDepositKrw);
    setFixedDepositUsd(snapshot.fixedDepositUsd);
    setCashForeignUsd(snapshot.cashForeignUsd ?? 0);
    setCashForeignCad(snapshot.cashForeignCad ?? 0);
    // useEffect 재초기화 시에도 byAccount 합산 또는 스냅샷 저장값으로 복원
    // 이유: 스냅샷이 변경될 때 0으로 리셋하면 기존 저장값이 소실됨
    const newByAccKrw = Object.values(snapshot.stockDepositByAccount ?? {})
      .reduce((s, v) => s + (v.krw ?? 0), 0);
    const newByAccUsd = Object.values(snapshot.stockDepositByAccount ?? {})
      .reduce((s, v) => s + (v.usd ?? 0), 0);
    setStockDepositKrw(newByAccKrw || snapshot.stockDepositKrw || 0);
    setStockDepositUsd(newByAccUsd || snapshot.stockDepositUsd || 0);
    setLeaseDeposit(snapshot.leaseDeposit);
    setPrivateLoan(snapshot.privateLoan);
    setMortgageLoan(snapshot.mortgageLoan);
    setRealEstate(snapshot.realEstate);
    setOtherAssets(snapshot.otherAssets);
    setUpbitBalance(snapshot.crypto.upbit.balance);
    setUpbitPrincipal(snapshot.crypto.upbit.principal);
    setKorbitBalance(snapshot.crypto.korbit.balance);
    setKorbitPrincipal(snapshot.crypto.korbit.principal);
    setBinanceBalance(snapshot.crypto.binance.balance);
    setBinancePrincipal(snapshot.crypto.binance.principal);
    setCadBalance(snapshot.canadianPension.balanceCad);
    setCadFee(snapshot.canadianPension.monthlyFeeCad);
    setCadNote(snapshot.canadianPension.note ?? "");
    setMidtermCumInstallment(snapshot.midterm2805.cumInstallment);
    setMidtermCumSpent(snapshot.midterm2805.cumSpent);
    setMidtermBalance(snapshot.midterm2805.balance);
  }, [snapshot]);

  async function handleSave() {
    setError("");
    if (usdKrw <= 0 || cadKrw <= 0) {
      setError("환율은 0보다 커야 합니다.");
      return;
    }
    if (leaseDeposit < 0 || privateLoan < 0) {
      setError("부채 금액은 0 이상이어야 합니다.");
      return;
    }

    setLoading(true);
    try {
      await onSave({
        exchangeRates: { usdKrw, cadKrw },
        fixedDepositKrw,
        fixedDepositUsd,
        cashForeignUsd,
        cashForeignCad,
        ...(stockDepositKrw > 0 ? { stockDepositKrw } : {}),
        ...(stockDepositUsd > 0 ? { stockDepositUsd } : {}),
        leaseDeposit,
        privateLoan,
        mortgageLoan,
        realEstate,
        crypto: {
          upbit: { balance: upbitBalance, principal: upbitPrincipal },
          korbit: { balance: korbitBalance, principal: korbitPrincipal },
          binance: { balance: binanceBalance, principal: binancePrincipal },
        },
        canadianPension: {
          balanceCad: cadBalance,
          monthlyFeeCad: cadFee,
          note: cadNote || undefined,
        },
        midterm2805: {
          cumInstallment: midtermCumInstallment,
          cumSpent: midtermCumSpent,
          balance: midtermBalance,
        },
        otherAssets,
      });
      onClose();
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 기타자산 CRUD 헬퍼
  function updateOtherAsset(idx: number, field: "name" | "amount", value: string | number) {
    const next = [...otherAssets];
    if (field === "name") next[idx] = { ...next[idx], name: value as string };
    else next[idx] = { ...next[idx], amount: Number(value) };
    setOtherAssets(next);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>재무 정보 수정 — {snapshot.month}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── 1. 환율 ──────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">1. 환율 (Exchange Rates)</p>
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

          {/* ── 2. 현금·예금 ─────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">2. 현금·예금 (Cash & Deposits)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>정기예금 KRW</Label>
                <Input type="number" min="0" value={fixedDepositKrw}
                  onChange={(e) => setFixedDepositKrw(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">{fixedDepositKrw.toLocaleString()}원</p>
              </div>
              <div className="space-y-1.5">
                <Label>외화 정기예금 USD</Label>
                <Input type="number" min="0" step="0.01" value={fixedDepositUsd}
                  onChange={(e) => setFixedDepositUsd(Number(e.target.value))} />
                {fixedDepositUsd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {Math.round(fixedDepositUsd * usdKrw).toLocaleString()}원
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>외화 예금 USD</Label>
                <Input type="number" min="0" step="0.01" value={cashForeignUsd}
                  onChange={(e) => setCashForeignUsd(Number(e.target.value))} />
                {cashForeignUsd > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {Math.round(cashForeignUsd * usdKrw).toLocaleString()}원
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>외화 예금 CAD</Label>
                <Input type="number" min="0" step="0.01" value={cashForeignCad}
                  onChange={(e) => setCashForeignCad(Number(e.target.value))} />
                {cashForeignCad > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {Math.round(cashForeignCad * cadKrw).toLocaleString()}원
                  </p>
                )}
              </div>
            </div>
            {/* 주식예수금 직접입력 (자산관리 Stock Deposit 섹션) */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Stock Deposit (주식예수금 — 직접입력 시에만)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>예수금 KRW</Label>
                  <Input type="number" min="0" value={stockDepositKrw}
                    onChange={(e) => setStockDepositKrw(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>예수금 USD</Label>
                  <Input type="number" min="0" step="0.01" value={stockDepositUsd}
                    onChange={(e) => setStockDepositUsd(Number(e.target.value))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">비어있으면 포트폴리오 자동 계산값 사용</p>
            </div>
          </section>

          <Separator />

          {/* ── 3. 부채 ──────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">3. 부채 (Liabilities)</p>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label className="text-red-700 dark:text-red-400">임차보증금 (Lease Deposit)</Label>
                <Input type="number" min="0" value={leaseDeposit}
                  onChange={(e) => setLeaseDeposit(Number(e.target.value))}
                  className="border-red-300 focus-visible:ring-red-400" />
                <p className="text-xs text-red-600">{leaseDeposit.toLocaleString()}원 — 주요 부채 항목</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>개인차입금 (Private Loan)</Label>
                  <Input type="number" min="0" value={privateLoan}
                    onChange={(e) => setPrivateLoan(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">{privateLoan.toLocaleString()}원</p>
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

          {/* ── 4. 비유동 자산 ───────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">4. 비유동 자산 (Non-current Assets)</p>
            <div className="space-y-1.5">
              <Label>부동산 (Real Estate)</Label>
              <Input type="number" min="0" value={realEstate}
                onChange={(e) => setRealEstate(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">{realEstate.toLocaleString()}원</p>
            </div>
            {/* 기타자산 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>기타 자산</Label>
                <Button variant="outline" size="sm"
                  onClick={() => setOtherAssets([...otherAssets, { name: "", amount: 0 }])}>
                  + 추가
                </Button>
              </div>
              {otherAssets.map((a, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input className="flex-1" placeholder="자산명" value={a.name}
                    onChange={(e) => updateOtherAsset(i, "name", e.target.value)} />
                  <Input className="w-36" type="number" min="0" placeholder="금액" value={a.amount}
                    onChange={(e) => updateOtherAsset(i, "amount", e.target.value)} />
                  <Button variant="ghost" size="sm"
                    onClick={() => setOtherAssets(otherAssets.filter((_, j) => j !== i))}
                    className="text-destructive px-2">✕</Button>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* ── 5. 가상자산 ──────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground">5. 가상자산 (Crypto)</p>
            {/* Upbit */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Upbit (KRW)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>잔액 KRW</Label>
                  <Input type="number" min="0" value={upbitBalance}
                    onChange={(e) => setUpbitBalance(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>원금 KRW</Label>
                  <Input type="number" min="0" value={upbitPrincipal}
                    onChange={(e) => setUpbitPrincipal(Number(e.target.value))} />
                </div>
              </div>
            </div>
            {/* Korbit */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Korbit (KRW)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>잔액 KRW</Label>
                  <Input type="number" min="0" value={korbitBalance}
                    onChange={(e) => setKorbitBalance(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>원금 KRW</Label>
                  <Input type="number" min="0" value={korbitPrincipal}
                    onChange={(e) => setKorbitPrincipal(Number(e.target.value))} />
                </div>
              </div>
            </div>
            {/* Binance */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Binance (USD — 원화 환산 시 × {usdKrw})
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>잔액 USD</Label>
                  <Input type="number" min="0" step="0.01" value={binanceBalance}
                    onChange={(e) => setBinanceBalance(Number(e.target.value))} />
                  {binanceBalance > 0 && (
                    <p className="text-xs text-muted-foreground">≈ {Math.round(binanceBalance * usdKrw).toLocaleString()}원</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>원금 USD</Label>
                  <Input type="number" min="0" step="0.01" value={binancePrincipal}
                    onChange={(e) => setBinancePrincipal(Number(e.target.value))} />
                </div>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── 6. 연금·기타 ─────────────────────────────────── */}
          <section className="space-y-4">
            <p className="text-sm font-semibold text-muted-foreground">6. 연금·기타 (Pension & Others)</p>

            {/* 캐나다 연금 */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">RESP/RRSP Canada (CAD)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>월말 잔액 CAD</Label>
                  <Input type="number" min="0" step="0.01" value={cadBalance}
                    onChange={(e) => setCadBalance(Number(e.target.value))} />
                  {cadBalance > 0 && cadKrw > 0 && (
                    <p className="text-xs text-muted-foreground">≈ {Math.round(cadBalance * cadKrw).toLocaleString()}원</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>이번 달 수수료 CAD</Label>
                  <Input type="number" min="0" step="0.01" value={cadFee}
                    onChange={(e) => setCadFee(Number(e.target.value))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>메모 (선택)</Label>
                <Input value={cadNote} onChange={(e) => setCadNote(e.target.value)}
                  placeholder="예) Plan G 월 수수료" />
              </div>
            </div>

            {/* 2805 중기 계좌 */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">2805 중기 계좌</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>누적 납입액</Label>
                  <Input type="number" min="0" value={midtermCumInstallment}
                    onChange={(e) => setMidtermCumInstallment(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>누적 사용액</Label>
                  <Input type="number" min="0" value={midtermCumSpent}
                    onChange={(e) => setMidtermCumSpent(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>현재 잔액</Label>
                  <Input type="number" min="0" value={midtermBalance}
                    onChange={(e) => setMidtermBalance(Number(e.target.value))} />
                </div>
              </div>
              {midtermBalance > 0 && (
                <p className="text-xs text-muted-foreground">
                  순 납입: {(midtermCumInstallment - midtermCumSpent).toLocaleString()}원 /
                  추정손익: {(midtermBalance - (midtermCumInstallment - midtermCumSpent)).toLocaleString()}원
                </p>
              )}
            </div>
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
