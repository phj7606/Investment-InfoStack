"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit } from "lucide-react";
import { SnapshotEditDialog } from "../SnapshotEditDialog";
import type {
  FinancialSnapshot,
  UpdateSnapshotRequest,
  LivePortfolioData,
} from "@/types/financial";

interface EduPensionViewProps {
  snapshot: FinancialSnapshot;
  liveData: LivePortfolioData | null;
  liveLoading: boolean;
  isConfirmed: boolean;
  onRefresh: () => void;
}

// ─────────────────────────────────────────
// 포맷 유틸
// ─────────────────────────────────────────

function fmtKrw(v: number): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  let str: string;
  if (abs >= 1_0000_0000) str = `${(abs / 1_0000_0000).toFixed(2)}억`;
  else if (abs >= 10_000) str = `${(abs / 10_000).toFixed(0)}만`;
  else str = abs.toLocaleString() + "원";
  return neg ? `−${str}` : str;
}

function fmtKrwFull(v: number): string {
  return v.toLocaleString() + "원";
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
}

function plColor(v: number): string {
  return v >= 0 ? "text-emerald-600" : "text-red-600";
}

function PLCell({ value, pct }: { value: number; pct?: number }) {
  const color = plColor(value);
  return (
    <div className={`text-right font-mono text-sm ${color}`}>
      <div>{value >= 0 ? "+" : ""}{fmtKrw(value)}</div>
      {pct !== undefined && <div className="text-xs opacity-80">{fmtPct(pct)}</div>}
    </div>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function EduPensionView({
  snapshot,
  liveData,
  liveLoading,
  isConfirmed,
  onRefresh,
}: EduPensionViewProps) {
  const [showEdit, setShowEdit] = useState(false);

  const handleSaveSnapshot = useCallback(async (req: UpdateSnapshotRequest) => {
    const res = await fetch(`/api/portfolio/financial/snapshot/${snapshot.month}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(await res.text());
    onRefresh();
  }, [snapshot.month, onRefresh]);

  const cp = snapshot.confirmedPortfolio;
  const { exchangeRates } = snapshot;
  const usdKrw = exchangeRates.usdKrw;
  const cadKrw = exchangeRates.cadKrw;

  // ── 가상자산 (Crypto) ─────────────────────────────────
  const upbitBalance = snapshot.crypto.upbit.balance;
  const upbitPrincipal = snapshot.crypto.upbit.principal;
  const upbitPnl = upbitBalance - upbitPrincipal;
  const upbitPnlPct = upbitPrincipal > 0 ? upbitPnl / upbitPrincipal : 0;

  const korbitBalance = snapshot.crypto.korbit.balance;
  const korbitPrincipal = snapshot.crypto.korbit.principal;
  const korbitPnl = korbitBalance - korbitPrincipal;
  const korbitPnlPct = korbitPrincipal > 0 ? korbitPnl / korbitPrincipal : 0;

  const binanceBalanceUsd = snapshot.crypto.binance.balance;
  const binancePrincipalUsd = snapshot.crypto.binance.principal;
  const binanceBalanceKrw = Math.round(binanceBalanceUsd * usdKrw);
  const binancePrincipalKrw = Math.round(binancePrincipalUsd * usdKrw);
  const binancePnlKrw = binanceBalanceKrw - binancePrincipalKrw;
  const binancePnlPct = binancePrincipalUsd > 0 ? (binanceBalanceUsd - binancePrincipalUsd) / binancePrincipalUsd : 0;

  const cryptoTotalBalance = upbitBalance + korbitBalance + binanceBalanceKrw;
  const cryptoTotalPrincipal = upbitPrincipal + korbitPrincipal + binancePrincipalKrw;
  const cryptoTotalPnl = cryptoTotalBalance - cryptoTotalPrincipal;
  const cryptoTotalPnlPct = cryptoTotalPrincipal > 0 ? cryptoTotalPnl / cryptoTotalPrincipal : 0;

  // ── Education 1470 ────────────────────────────────────
  const edu1470Deposit = isConfirmed ? (cp?.education1470Deposit ?? 0) : (liveData?.education1470.deposit ?? 0);
  const edu1470Stock = isConfirmed ? (cp?.education1470Stock ?? 0) : (liveData?.education1470.stock ?? 0);
  const edu1470Total = edu1470Deposit + edu1470Stock;
  const edu1470Principal = isConfirmed ? (cp?.education1470Principal ?? 0) : (liveData?.education1470.principal ?? 0);
  const edu1470Pnl = edu1470Total - edu1470Principal;
  const edu1470PnlPct = edu1470Principal > 0 ? edu1470Pnl / edu1470Principal : 0;

  // ── Pension (국내) ────────────────────────────────────
  const pensionFundBalance = isConfirmed ? (cp?.pensionFundBalance ?? 0) : (liveData?.pensionFund.balance ?? 0);
  const pensionFundPrincipal = isConfirmed ? (cp?.pensionFundPrincipal ?? 0) : (liveData?.pensionFund.principal ?? 0);
  const pensionFundPnl = pensionFundBalance - pensionFundPrincipal;
  const pensionFundPnlPct = pensionFundPrincipal > 0 ? pensionFundPnl / pensionFundPrincipal : 0;

  const pensionDepositBalance = isConfirmed ? (cp?.pensionDepositBalance ?? 0) : (liveData?.pensionDeposit.balance ?? 0);
  const pensionDepositPrincipal = isConfirmed ? (cp?.pensionDepositPrincipal ?? 0) : (liveData?.pensionDeposit.principal ?? 0);
  const pensionDepositPnl = pensionDepositBalance - pensionDepositPrincipal;
  const pensionDepositPnlPct = pensionDepositPrincipal > 0 ? pensionDepositPnl / pensionDepositPrincipal : 0;

  const irpBalance = isConfirmed ? (cp?.irpBalance ?? 0) : (liveData?.irp.balance ?? 0);
  const irpPrincipal = isConfirmed ? (cp?.irpPrincipal ?? 0) : (liveData?.irp.principal ?? 0);
  const irpPnl = irpBalance - irpPrincipal;
  const irpPnlPct = irpPrincipal > 0 ? irpPnl / irpPrincipal : 0;

  const pensionTotalBalance = pensionFundBalance + pensionDepositBalance + irpBalance;
  const pensionTotalPrincipal = pensionFundPrincipal + pensionDepositPrincipal + irpPrincipal;
  const pensionTotalPnl = pensionTotalBalance - pensionTotalPrincipal;
  const pensionTotalPnlPct = pensionTotalPrincipal > 0 ? pensionTotalPnl / pensionTotalPrincipal : 0;

  // ── 캐나다 연금 RESP/RRSP ─────────────────────────────
  const canadianBalanceCad = snapshot.canadianPension.balanceCad;
  const canadianBalanceKrw = Math.round(canadianBalanceCad * cadKrw);

  // ── 2805 중기 계좌 ────────────────────────────────────
  const { midterm2805 } = snapshot;
  const netInstallment = midterm2805.cumInstallment - midterm2805.cumSpent;
  const estimatedPnl = midterm2805.balance - netInstallment;

  return (
    <div className="space-y-6">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{snapshot.month} 연금·교육 현황</span>
          {isConfirmed ? (
            <Badge variant="outline" className="text-emerald-600 border-emerald-400 text-xs">🔒 확정</Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">DRAFT</Badge>
          )}
        </div>
        {!isConfirmed && (
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Edit className="w-3.5 h-3.5 mr-1" />수정
          </Button>
        )}
      </div>

      {/* ── Section 1: 가상자산 (Education Cryptocurrency) ─────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">교육자금 가상자산</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="pl-4">거래소</TableHead>
                <TableHead className="text-right">잔액 (KRW)</TableHead>
                <TableHead className="text-right">원금</TableHead>
                <TableHead className="text-right">손익</TableHead>
                <TableHead className="text-right pr-4">수익률</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="pl-4 text-sm font-medium">Upbit (KRW)</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtKrwFull(upbitBalance)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrwFull(upbitPrincipal)}</TableCell>
                <TableCell><PLCell value={upbitPnl} /></TableCell>
                <TableCell className={`text-right text-sm pr-4 ${plColor(upbitPnlPct)}`}>{fmtPct(upbitPnlPct)}</TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="pl-4 text-sm font-medium">Korbit (KRW)</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtKrwFull(korbitBalance)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrwFull(korbitPrincipal)}</TableCell>
                <TableCell><PLCell value={korbitPnl} /></TableCell>
                <TableCell className={`text-right text-sm pr-4 ${plColor(korbitPnlPct)}`}>{fmtPct(korbitPnlPct)}</TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="pl-4 text-sm font-medium">
                  <div>Binance (USD)</div>
                  <div className="text-xs text-muted-foreground">
                    ${binanceBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} × {usdKrw}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtKrwFull(binanceBalanceKrw)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrwFull(binancePrincipalKrw)}</TableCell>
                <TableCell><PLCell value={binancePnlKrw} /></TableCell>
                <TableCell className={`text-right text-sm pr-4 ${plColor(binancePnlPct)}`}>{fmtPct(binancePnlPct)}</TableCell>
              </TableRow>

              <TableRow className="bg-muted/40 font-semibold">
                <TableCell className="pl-4 text-sm">합계</TableCell>
                <TableCell className="text-right font-mono text-sm">{fmtKrwFull(cryptoTotalBalance)}</TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrwFull(cryptoTotalPrincipal)}</TableCell>
                <TableCell><PLCell value={cryptoTotalPnl} /></TableCell>
                <TableCell className={`text-right text-sm pr-4 ${plColor(cryptoTotalPnlPct)}`}>{fmtPct(cryptoTotalPnlPct)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Section 2: 1470 Education Account ──────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">1470 교육 계좌</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {liveLoading && !isConfirmed ? (
            <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">예금</TableHead>
                  <TableHead className="text-right">주식</TableHead>
                  <TableHead className="text-right">총잔액</TableHead>
                  <TableHead className="text-right">원금</TableHead>
                  <TableHead className="text-right">손익</TableHead>
                  <TableHead className="text-right pr-4">수익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="pl-4 font-mono text-sm">{fmtKrwFull(edu1470Deposit)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtKrwFull(edu1470Stock)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{fmtKrwFull(edu1470Total)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrwFull(edu1470Principal)}</TableCell>
                  <TableCell><PLCell value={edu1470Pnl} /></TableCell>
                  <TableCell className={`text-right text-sm pr-4 ${plColor(edu1470PnlPct)}`}>{fmtPct(edu1470PnlPct)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: 연금 (국내) ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">연금 (국내)</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {liveLoading && !isConfirmed ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="pl-4">계좌</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                  <TableHead className="text-right">원금</TableHead>
                  <TableHead className="text-right">손익</TableHead>
                  <TableHead className="text-right pr-4">수익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Pension Fund (퇴직연금) */}
                <TableRow>
                  <TableCell className="pl-4 text-sm font-medium">Pension Fund (퇴직연금)</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtKrw(pensionFundBalance)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrw(pensionFundPrincipal)}</TableCell>
                  <TableCell><PLCell value={pensionFundPnl} /></TableCell>
                  <TableCell className={`text-right text-sm pr-4 ${plColor(pensionFundPnlPct)}`}>{fmtPct(pensionFundPnlPct)}</TableCell>
                </TableRow>

                {/* Pension Deposit (연금저축) */}
                <TableRow>
                  <TableCell className="pl-4 text-sm font-medium">Pension Deposit (연금저축)</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtKrw(pensionDepositBalance)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrw(pensionDepositPrincipal)}</TableCell>
                  <TableCell><PLCell value={pensionDepositPnl} /></TableCell>
                  <TableCell className={`text-right text-sm pr-4 ${plColor(pensionDepositPnlPct)}`}>{fmtPct(pensionDepositPnlPct)}</TableCell>
                </TableRow>

                {/* IRP */}
                <TableRow>
                  <TableCell className="pl-4 text-sm font-medium">IRP</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtKrw(irpBalance)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrw(irpPrincipal)}</TableCell>
                  <TableCell><PLCell value={irpPnl} /></TableCell>
                  <TableCell className={`text-right text-sm pr-4 ${plColor(irpPnlPct)}`}>{fmtPct(irpPnlPct)}</TableCell>
                </TableRow>

                {/* 합계 */}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="pl-4 text-sm">합계</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtKrw(pensionTotalBalance)}</TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtKrw(pensionTotalPrincipal)}</TableCell>
                  <TableCell><PLCell value={pensionTotalPnl} /></TableCell>
                  <TableCell className={`text-right text-sm pr-4 ${plColor(pensionTotalPnlPct)}`}>{fmtPct(pensionTotalPnlPct)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4 & 5: 캐나다 연금 + 2805 중기 계좌 나란히 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* RESP/RRSP Canada */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">RESP/RRSP Canada</CardTitle>
              {!isConfirmed && (
                <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
                  <Edit className="w-3 h-3" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">월말 잔액 (CAD)</p>
              <p className="text-2xl font-bold">
                {canadianBalanceCad.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CAD
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>≈</span>
              <span className="font-mono font-semibold text-foreground">{fmtKrw(canadianBalanceKrw)}</span>
              <span className="text-xs">× {cadKrw.toLocaleString()}</span>
            </div>
            {snapshot.canadianPension.monthlyFeeCad > 0 && (
              <p className="text-xs text-muted-foreground">
                이번 달 수수료: {snapshot.canadianPension.monthlyFeeCad} CAD
              </p>
            )}
            {snapshot.canadianPension.note && (
              <p className="text-xs text-muted-foreground">{snapshot.canadianPension.note}</p>
            )}
          </CardContent>
        </Card>

        {/* 2805 Mid-term Account */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">2805 중기 계좌</CardTitle>
              {!isConfirmed && (
                <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
                  <Edit className="w-3 h-3" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">누적 납입액</p>
                <p className="font-mono font-semibold">{fmtKrw(midterm2805.cumInstallment)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">누적 사용액</p>
                <p className="font-mono font-semibold text-red-600">−{fmtKrw(midterm2805.cumSpent)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">순 납입액</p>
                <p className="font-mono font-semibold">{fmtKrw(netInstallment)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">현재 잔액</p>
                <p className="font-mono font-semibold">{fmtKrw(midterm2805.balance)}</p>
              </div>
            </div>
            <div className={`flex items-center justify-between pt-2 border-t border-border/40 font-semibold text-sm ${plColor(estimatedPnl)}`}>
              <span>추정 손익</span>
              <span className="font-mono">{estimatedPnl >= 0 ? "+" : ""}{fmtKrw(estimatedPnl)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 스냅샷 수정 다이얼로그 */}
      {!isConfirmed && (
        <SnapshotEditDialog
          open={showEdit}
          snapshot={snapshot}
          onClose={() => setShowEdit(false)}
          onSave={handleSaveSnapshot}
        />
      )}
    </div>
  );
}
