"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Lock, Edit } from "lucide-react";
import { NetWorthTrendChart } from "../charts/NetWorthTrendChart";
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

function fmtKrw(v: number, abbr = false): string {
  const neg = v < 0;
  const abs = Math.abs(v);
  let str: string;
  if (abbr && abs >= 1_0000_0000) str = `${(abs / 1_0000_0000).toFixed(2)}억`;
  else if (abbr && abs >= 10_000) str = `${(abs / 10_000).toFixed(0)}만`;
  else str = abs.toLocaleString() + "원";
  return neg ? `−${str}` : str;
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
  sub?: string;  // 보조 표시 (환산 전 원본)
}) {
  return (
    <div className={`flex items-start justify-between py-1 text-sm ${indent ? "pl-4" : ""} ${bold ? "font-bold" : ""}`}>
      <span className={indent && !bold ? "text-muted-foreground" : ""}>{label}</span>
      <div className="text-right">
        <span className={`font-mono tabular-nums ${colorClass}`}>
          {amount.toLocaleString()}
        </span>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

/** 소계/합계 구분선 행 */
function TotalRow({ label, amount, colorClass = "" }: { label: string; amount: number; colorClass?: string }) {
  return (
    <div className={`flex justify-between py-1.5 font-semibold text-sm border-t border-border/50 mt-1 ${colorClass}`}>
      <span>{label}</span>
      <span className="font-mono tabular-nums">{amount.toLocaleString()}</span>
    </div>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function FinancialStatementView({ data, snapshot, trendData, onRefresh }: FinancialStatementViewProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const isConfirmed = data.status === "CONFIRMED";
  const { assets, liabilities, netWorth, exchangeRates } = data;
  const { usdKrw, cadKrw } = exchangeRates;

  // MoM 변동 (추세 데이터에서 이전 월과 비교)
  const currentIdx = trendData.findIndex((d) => d.month === data.month);
  const prevNetWorth = currentIdx > 0 ? trendData[currentIdx - 1]?.netWorth : undefined;
  const momChange = prevNetWorth !== undefined ? netWorth - prevNetWorth : undefined;
  const momPct = prevNetWorth && prevNetWorth !== 0 ? (momChange! / Math.abs(prevNetWorth)) * 100 : undefined;

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

  // 대차대조표 섹션별 금액
  const ca = assets.currentAsset;
  const nca = assets.nonCurrentAsset;
  const ia = assets.investmentAsset;
  const lbt = liabilities;

  // CAPITAL 계산
  const prevMonthData = currentIdx > 0 ? trendData[currentIdx - 1] : null;
  const capitalPrevNetWorth = prevMonthData?.netWorth ?? 0;
  const capitalNetChange = netWorth - capitalPrevNetWorth;

  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">총자산</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{fmtKrw(assets.totalAssets, true)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">총부채</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-red-600">
              {liabilities.totalDebt > 0 ? `−${fmtKrw(liabilities.totalDebt, true)}` : "없음"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">순자산</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className={`text-xl font-bold ${netWorth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {fmtKrw(netWorth, true)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">MoM 변동</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {momChange !== undefined ? (
              <>
                <p className={`text-xl font-bold ${momChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {momChange >= 0 ? "+" : ""}{fmtKrw(momChange, true)}
                </p>
                {momPct !== undefined && (
                  <p className={`text-xs ${momChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {momChange >= 0 ? "+" : ""}{momPct.toFixed(1)}%
                  </p>
                )}
              </>
            ) : (
              <p className="text-xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 헤더: 상태 배지 + 월말 확정 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{data.month} 재무상태표</span>
          {isConfirmed ? (
            <Badge variant="outline" className="text-emerald-600 border-emerald-400 text-xs">
              <Lock className="w-3 h-3 mr-1" />확정됨
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">DRAFT</Badge>
          )}
          <span className="text-xs text-muted-foreground ml-1">
            USD {usdKrw} / CAD {cadKrw}
          </span>
        </div>
        <div className="flex gap-2">
          {!isConfirmed && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                <Edit className="w-3.5 h-3.5 mr-1" />수정
              </Button>
              <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                이번 달 마감
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 순자산 추세선 차트 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">순자산 추세 (최근 12개월)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <NetWorthTrendChart data={trendData} />
        </CardContent>
      </Card>

      {/* 재무상태표 2단 레이아웃 — 엑셀 FS-May 2026 구조 */}
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
              {ca.cashEquivalent > 0 && (
                <BSRow label="현금 및 현금성 자산" amount={ca.cashEquivalent} indent />
              )}
              {ca.foreignDepositUsd > 0 && (
                <BSRow
                  label="외화예금 (USD)"
                  amount={ca.foreignDepositUsd}
                  indent
                  sub={`${Math.round(ca.foreignDepositUsd / usdKrw).toLocaleString()} USD × ${usdKrw}`}
                />
              )}
              {ca.foreignDepositCad > 0 && (
                <BSRow
                  label="외화예금 (CAD)"
                  amount={ca.foreignDepositCad}
                  indent
                  sub={`${Math.round(ca.foreignDepositCad / cadKrw).toLocaleString()} CAD × ${cadKrw}`}
                />
              )}
              {ca.fixedDepositUsd > 0 && (
                <BSRow
                  label="외화 정기예금 (USD)"
                  amount={ca.fixedDepositUsd}
                  indent
                  sub={`${snapshot.fixedDepositUsd.toLocaleString()} USD × ${usdKrw}`}
                />
              )}
              <BSRow label="정기예금 (KRW)" amount={ca.fixedDepositKrw} indent />
              <TotalRow label="CURRENT ASSET TOTAL" amount={ca.total} />
            </div>

            <Separator />

            {/* NON-CURRENT ASSET */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Non-Current Asset</p>
              <BSRow label="부동산" amount={nca.realEstate} indent />
              {snapshot.otherAssets.map((a, i) => (
                <BSRow key={i} label={a.name} amount={a.amount} indent />
              ))}
              <TotalRow label="NON-CURRENT ASSET TOTAL" amount={nca.total} />
            </div>

            <Separator />

            {/* INVESTMENT ASSET */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Investment Asset</p>
              <BSRow label="유가증권 — 국내 (KRW)" amount={ia.korStocks} indent />
              <BSRow label="펀드/파생상품" amount={ia.fund} indent />
              <BSRow label="주식예수금 (KRW)" amount={ia.stockDepositKrw} indent />
              <BSRow
                label="미국주식/ETF (USD)"
                amount={ia.usStocksKrw}
                indent
                sub={`${(ia.usStocksKrw / usdKrw).toLocaleString(undefined, { maximumFractionDigits: 0 })} USD × ${usdKrw}`}
              />
              {ia.usStocksDepositKrw > 0 && (
                <BSRow label="미국주식 예수금 (USD)" amount={ia.usStocksDepositKrw} indent />
              )}
              <TotalRow label="INVESTMENT TOTAL (KRW)" amount={ia.total} />
            </div>

            <Separator />

            {/* 연금·교육 */}
            <div>
              <BSRow label="연금 (Pension)" amount={assets.pensionKrw} />
              <BSRow label="교육저축 (Education)" amount={assets.educationKrw} />
            </div>

            <Separator />

            {/* 총자산 */}
            <div className="flex justify-between py-2 font-bold text-base border-t-2 border-border">
              <span>TOTAL ASSETS</span>
              <span className="font-mono">{assets.totalAssets.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* ── 우측: LIABILITIES + CAPITAL ──────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">LIABILITIES + CAPITAL</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">

            {/* CURRENT LIABILITY */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Current Liability</p>
              <BSRow label="신용한도 (개인신용)" amount={lbt.currentLiability} indent />
              <TotalRow label="CURRENT LIABILITY TOTAL" amount={lbt.currentLiability} />
            </div>

            <Separator />

            {/* NON-CURRENT LIABILITY */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Non-Current Liability</p>
              <BSRow
                label="개인차입금 (Private Loan)"
                amount={lbt.privateLoan}
                indent
                colorClass="text-red-600"
              />
              <BSRow
                label="임차보증금 (Lease Deposit)"
                amount={lbt.leaseDeposit}
                indent
                colorClass="text-red-700 dark:text-red-400"
              />
              {snapshot.mortgageLoan > 0 && (
                <BSRow label="주택담보대출" amount={snapshot.mortgageLoan} indent colorClass="text-red-600" />
              )}
              <TotalRow
                label="NON-CURRENT LIABILITY TOTAL"
                amount={lbt.nonCurrentLiabilityTotal}
                colorClass="text-red-600"
              />
            </div>

            <Separator />

            {/* LIABILITY TOTAL */}
            <div className="flex justify-between py-1.5 font-bold text-sm text-red-600">
              <span>LIABILITY TOTAL</span>
              <span className="font-mono">{lbt.totalDebt.toLocaleString()}</span>
            </div>

            <Separator />

            {/* CAPITAL */}
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wide">Capital</p>
              {prevMonthData ? (
                <>
                  <BSRow
                    label={`전월 순자산 (${prevMonthData.month})`}
                    amount={capitalPrevNetWorth}
                    indent
                  />
                  <BSRow
                    label="Net Changes (MoM)"
                    amount={capitalNetChange}
                    indent
                    colorClass={capitalNetChange >= 0 ? "text-emerald-600" : "text-red-600"}
                  />
                </>
              ) : (
                <p className="text-xs text-muted-foreground pl-4 py-1">전월 데이터 없음</p>
              )}
              <TotalRow
                label="CAPITAL TOTAL (순자산)"
                amount={netWorth}
                colorClass={netWorth >= 0 ? "text-emerald-600" : "text-red-600"}
              />
            </div>

            <Separator />

            {/* LIABILITY + CAPITAL TOTAL */}
            <div className="flex justify-between py-2 font-bold text-base border-t-2 border-border">
              <span>TOTAL LIAB + CAPITAL</span>
              <span className="font-mono">{(lbt.totalDebt + netWorth).toLocaleString()}</span>
            </div>

            {/* MoM 비교 박스 */}
            {momChange !== undefined && (
              <div className="mt-3 p-3 rounded-lg bg-muted/40 space-y-1 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">전월 대비 순자산 변동</p>
                <div className="flex justify-between">
                  <span>변동액</span>
                  <span className={`font-mono font-semibold ${momChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {momChange >= 0 ? "+" : ""}{momChange.toLocaleString()}원
                  </span>
                </div>
                {momPct !== undefined && (
                  <div className="flex justify-between">
                    <span>변동률</span>
                    <span className={`font-semibold ${momChange >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {momChange >= 0 ? "+" : ""}{momPct.toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}
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
