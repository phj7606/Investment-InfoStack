"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Lock, Edit } from "lucide-react";
import { MonthEndConfirmDialog } from "../MonthEndConfirmDialog";
import { SnapshotEditDialog } from "../SnapshotEditDialog";
import type {
  FinancialStatementData,
  FinancialSnapshot,
  ConfirmSnapshotRequest,
  UpdateSnapshotRequest,
} from "@/types/financial";

interface NetWorthPoint {
  month: string;
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  status: "DRAFT" | "CONFIRMED";
}

interface FinancialStatementViewProps {
  data: FinancialStatementData;
  snapshot: FinancialSnapshot;
  trendData: NetWorthPoint[];
  onRefresh: () => void;
}

// ─────────────────────────────────────────
// 포맷 유틸
// ─────────────────────────────────────────

/** USD 금액 표시 (소수점 2자리) */
function fmtUsd(v: number): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────
// 대차대조표 행 컴포넌트
// ─────────────────────────────────────────

/** 자산/부채 항목 행 — 들여쓰기·굵기 옵션 */
function BSRow({
  label,
  amount,
  indent = false,
  bold = false,
  colorClass = "",
  sub,
}: {
  label: string;
  amount: number;
  indent?: boolean;
  bold?: boolean;
  colorClass?: string;
  sub?: string;
}) {
  return (
    <div className={`flex items-start justify-between py-0.5 text-sm ${indent ? "pl-4" : ""} ${bold ? "font-bold" : ""}`}>
      <span className={indent && !bold ? "text-muted-foreground" : ""}>{label}</span>
      <div className="text-right">
        <span className={`tabular-nums ${colorClass}`}>
          {amount.toLocaleString()}
        </span>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

/** USD 원본 표시용 행 */
function BSRowUsd({
  label,
  amountUsd,
  indent = false,
}: {
  label: string;
  amountUsd: number;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between py-0.5 text-sm ${indent ? "pl-4" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{fmtUsd(amountUsd)}</span>
    </div>
  );
}

/** 소계/합계 구분선 행 */
function TotalRow({ label, amount, colorClass = "" }: { label: string; amount: number; colorClass?: string }) {
  return (
    <div className={`flex justify-between py-1.5 font-semibold text-sm border-t border-border/50 mt-1 ${colorClass}`}>
      <span>{label}</span>
      <span className="tabular-nums">{amount.toLocaleString()}</span>
    </div>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function FinancialStatementView({ data, snapshot, onRefresh }: FinancialStatementViewProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const isConfirmed = data.status === "CONFIRMED";
  const { assets, liabilities, netWorth, exchangeRates, capital } = data;
  const { usdKrw, cadKrw } = exchangeRates;

  // 월말 확정 API 호출
  const handleConfirm = useCallback(async (req: ConfirmSnapshotRequest) => {
    const res = await fetch(`/api/portfolio/financial/snapshot/${snapshot.month}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "확정 실패");
    }
    onRefresh();
  }, [snapshot.month, onRefresh]);

  // 스냅샷 수정 API 호출 (DRAFT 상태)
  const handleSaveSnapshot = useCallback(async (req: UpdateSnapshotRequest) => {
    const res = await fetch(`/api/portfolio/financial/snapshot/${snapshot.month}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(await res.text());
    onRefresh();
  }, [snapshot.month, onRefresh]);

  // 대차대조표 섹션별 참조
  const ca = assets.currentAsset;
  const nca = assets.nonCurrentAsset;
  const ia = assets.investmentAsset;
  const lbt = liabilities;

  // 월 라벨 추출 (예: "May")
  const monthLabel = new Date(data.month + "-01").toLocaleString("en", { month: "short" });

  return (
    <div className="space-y-6">
      {/* 헤더: BALANCE SHEETS + 상태 배지 + 월말 확정 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">BALANCE SHEETS — {monthLabel}</span>
          {isConfirmed ? (
            <Badge variant="outline" className="text-emerald-600 border-emerald-400 text-xs">
              <Lock className="w-3 h-3 mr-1" />CONFIRMED
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">DRAFT</Badge>
          )}
          <span className="text-xs text-muted-foreground ml-1">
            KRW/KRW Equivalent · USD {usdKrw.toLocaleString()} / CAD {cadKrw.toLocaleString()}
          </span>
        </div>
        <div className="flex gap-2">
          {!isConfirmed && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                <Edit className="w-3.5 h-3.5 mr-1" />Edit
              </Button>
              <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Confirm Month-End
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          재무상태표 2단 레이아웃 — 엑셀 FS-May 2026 구조
         ══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── 좌측: ASSETS ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">ASSETS</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">

            {/* CURRENT ASSET */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Current Asset</p>
              <BSRow label="Cash and cash equivalent" amount={ca.cashEquivalent} indent />
              {ca.foreignDepositUsd > 0 && (
                <BSRow
                  label="Foreign currency deposit (USD)"
                  amount={ca.foreignDepositUsd}
                  indent
                  sub={`${Math.round(ca.foreignDepositUsd / usdKrw).toLocaleString()} USD × ${usdKrw}`}
                />
              )}
              {ca.foreignDepositCad > 0 && (
                <BSRow
                  label="Foreign currency deposit (CAD)"
                  amount={ca.foreignDepositCad}
                  indent
                  sub={`${Math.round(ca.foreignDepositCad / cadKrw).toLocaleString()} CAD × ${cadKrw}`}
                />
              )}
              {ca.fixedDepositUsd > 0 && (
                <BSRow
                  label="Fixed(time) deposit (USD)"
                  amount={ca.fixedDepositUsd}
                  indent
                  sub={`${snapshot.fixedDepositUsd.toLocaleString()} USD × ${usdKrw}`}
                />
              )}
              <BSRow label="Fixed(time) deposit (KRW)" amount={ca.fixedDepositKrw} indent />
              <TotalRow label="CURRENT ASSET TOTAL" amount={ca.total} />
            </div>

            <Separator />

            {/* NON-CURRENT ASSET */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Non-Current Asset</p>
              <BSRow label="Real estate" amount={nca.realEstate} indent />
              {/* Long-term investment loan / deposit / investment — otherAssets로 매핑 */}
              {snapshot.otherAssets.map((a, i) => (
                <BSRow key={i} label={a.name} amount={a.amount} indent />
              ))}
              <TotalRow label="NON-CURRENT ASSET TOTAL" amount={nca.total} />
            </div>

            <Separator />

            {/* INVESTMENT ASSET */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Investment Asset</p>
              <BSRow label="Marketable securities (KR)" amount={ia.korStocks} indent />
              <BSRow label="Fund/Derivatives" amount={ia.fund} indent />
              <BSRow label="Stock deposit (KRW)" amount={ia.stockDepositKrw} indent />
              {/* 엑셀은 US Stocks를 USD 원본으로 표시 */}
              <BSRowUsd label="US Stocks/ETF (USD)" amountUsd={ia.usStocksUsd} indent />
              <BSRowUsd label="US Stocks/ETF Deposit (USD)" amountUsd={ia.usStocksDepositUsd} indent />
              <TotalRow label="INVESTMENT TOTAL (KRW)" amount={ia.total} />
            </div>

            <Separator />

            {/* 연금·교육 (Investment 아래 배치 — 엑셀 Row 33~34) */}
            <div>
              <BSRow label="Pension fund" amount={assets.pensionKrw} indent />
              <BSRow label="Education Savings" amount={assets.educationKrw} indent />
              <TotalRow label="INVESTMENT & PENSION TOTAL" amount={assets.investmentPensionTotal} />
            </div>

            <Separator />

            {/* TOTAL ASSETS */}
            <div className="flex justify-between py-2 font-bold text-base border-t-2 border-border">
              <span>TOTAL ASSETS</span>
              <span className="tabular-nums">{assets.totalAssets.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── 우측: LIABILITIES + CAPITAL ──────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">LIABILITY + CAPITAL</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">

            {/* CURRENT LIABILITY */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Current Liability</p>
              <BSRow label="Personal credit liability" amount={lbt.currentLiability} indent />
              <TotalRow label="CURRENT LIABILITY TOTAL" amount={lbt.currentLiability} />
            </div>

            <Separator />

            {/* NON-CURRENT LIABILITY */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Non-Current Liability</p>
              {snapshot.mortgageLoan > 0 && (
                <BSRow label="Mortgage loan on the house" amount={snapshot.mortgageLoan} indent colorClass="text-red-600" />
              )}
              <BSRow label="Private loan" amount={lbt.privateLoan} indent colorClass="text-red-600" />
              <BSRow label="Lease deposit" amount={lbt.leaseDeposit} indent colorClass="text-red-600" />
              <TotalRow label="NON-CURRENT LIABILITY TOTAL" amount={lbt.nonCurrentLiabilityTotal} colorClass="text-red-600" />
            </div>

            <Separator />

            {/* LIABILITY TOTAL */}
            <div className="flex justify-between py-1.5 font-bold text-sm text-red-600">
              <span>LIABILITY TOTAL</span>
              <span className="tabular-nums">{lbt.totalDebt.toLocaleString()}</span>
            </div>

            <Separator />

            {/* CAPITAL — 엑셀 Row 22~36 구조 */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Capital</p>
              {capital.prevNetWorth > 0 ? (
                <>
                  <BSRow label="Balance (last month)" amount={capital.prevNetWorth} indent />
                  <BSRow
                    label="Net changes"
                    amount={capital.netChanges}
                    indent
                    colorClass={capital.netChanges >= 0 ? "text-emerald-600" : "text-red-600"}
                  />
                  {/* 변동 내역 세분화 — 엑셀 Row 26~30 */}
                  <div className="pl-8 space-y-0">
                    <BSRow
                      label="Change in Current Asset"
                      amount={capital.changeInCurrentAsset}
                      colorClass={capital.changeInCurrentAsset >= 0 ? "text-emerald-600" : "text-red-600"}
                    />
                    <BSRow
                      label="Change in Non-Current Asset"
                      amount={capital.changeInNonCurrentAsset}
                      colorClass={capital.changeInNonCurrentAsset !== 0 ? (capital.changeInNonCurrentAsset >= 0 ? "text-emerald-600" : "text-red-600") : ""}
                    />
                    <BSRow
                      label="Change in Investment Asset"
                      amount={capital.changeInInvestmentAsset}
                      colorClass={capital.changeInInvestmentAsset >= 0 ? "text-emerald-600" : "text-red-600"}
                    />
                    <BSRow
                      label="Change in Pension/Education"
                      amount={capital.changeInPensionEducation}
                      colorClass={capital.changeInPensionEducation >= 0 ? "text-emerald-600" : "text-red-600"}
                    />
                    <BSRow
                      label="Change in Liability"
                      amount={capital.changeInLiability}
                      colorClass={capital.changeInLiability >= 0 ? "text-emerald-600" : "text-red-600"}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground pl-4 py-1">No previous month data</p>
              )}
              <TotalRow
                label="CAPITAL TOTAL"
                amount={netWorth}
                colorClass={netWorth >= 0 ? "text-emerald-600" : "text-red-600"}
              />
            </div>

            <Separator />

            {/* TOTAL LIABILITY & CAPITAL */}
            <div className="flex justify-between py-2 font-bold text-base border-t-2 border-border">
              <span>TOTAL LIABILITY & CAPITAL</span>
              <span className="tabular-nums">{(lbt.totalDebt + netWorth).toLocaleString()}</span>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* 다이얼로그 */}
      <MonthEndConfirmDialog
        open={showConfirm}
        snapshot={snapshot}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
      />
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
