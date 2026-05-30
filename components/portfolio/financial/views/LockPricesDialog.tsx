"use client";

/**
 * 종가·환율 확정 다이얼로그
 *
 * 자산관리(I)와 자산관리II 탭에서 공유.
 * - mode="I":  KR(FUND/KOR Stocks) + US(US Stocks) + 환율(USD/KRW, CAD/KRW)
 * - mode="II": KR 단일 섹션 (Pension / Education / Short-term) + 환율(CAD/KRW, USD/KRW)
 *
 * 흐름:
 *   1. 다이얼로그 열림 → 당월 마지막 영업일 계산 + 확정 가능 여부 판단
 *   2. [종가·환율 조회] → Naver fchart / Yahoo history로 마지막 영업일 종가·환율 미리보기
 *   3. [KR 확정 / US 확정 / 환율 확정] → 각 lock-balances POST (독립 실행 가능)
 *
 * 환율은 자동 조회 후 수동 수정 가능. KR·US·FX 확정 순서는 자유.
 */

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Calendar,
  Lock,
  Clock,
} from "lucide-react";
import { getLastTradingDay, canLockKr, canLockUs } from "@/lib/portfolio/market-hours";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

interface MarketStatusInfo {
  open: boolean;
  warning: string | null;
}

interface KrPreview {
  fund?: number;
  fundPrincipal?: number;
  korStocks?: number;
  korStocksPrincipal?: number;
  stockDepositKrw?: number;
  pensionFundBalance?: number;
  pensionFundPrincipal?: number;
  pensionDepositBalance?: number;
  pensionDepositPrincipal?: number;
  irpBalance?: number;
  irpPrincipal?: number;
  education1470Stock?: number;
  education1470Principal?: number;
  shorttermStockBalance?: number;
  shorttermPrincipal?: number;
}

interface UsPreview {
  usStocksUsd?: number;
  usPrincipalUsd?: number;
}

interface RatesPreview {
  usdKrw: number;
  cadKrw: number;
}

interface MarketData<P> {
  status: MarketStatusInfo;
  preview: P;
  targetDate?: string;
  rates?: RatesPreview;
}

interface PreviewData {
  kr?: MarketData<KrPreview>;
  us?: MarketData<UsPreview>;
  rates?: RatesPreview; // 가장 먼저 도착한 rates (KR/US 어느 쪽이든 동일)
}

interface LockPricesDialogProps {
  open: boolean;
  onClose: () => void;
  month: string;
  /** "I" = 자산관리(USD 종목), "II" = 자산관리II(CAD 연금) */
  mode: "I" | "II";
  onLocked: () => void;
}

// ─────────────────────────────────────────
// 숫자 포맷 헬퍼
// ─────────────────────────────────────────

const fmtKrw = (v?: number) =>
  v == null ? "-" : Math.round(v).toLocaleString("ko-KR");

const fmtUsd = (v?: number) =>
  v == null
    ? "-"
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ─────────────────────────────────────────
// 서브 컴포넌트
// ─────────────────────────────────────────

function PriceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-0.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

function LockStatusBadge({ ok, reason }: { ok: boolean; reason: string | null }) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
        <Lock className="w-2.5 h-2.5" />확정 가능
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 leading-tight">
      <Clock className="w-2.5 h-2.5 shrink-0" />{reason ?? "아직 확정 불가"}
    </span>
  );
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function LockPricesDialog({
  open,
  onClose,
  month,
  mode,
  onLocked,
}: LockPricesDialogProps) {
  const [fetching, setFetching] = useState(false);
  const [locking, setLocking] = useState<"KR" | "US" | "II" | "FX" | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockedMarkets, setLockedMarkets] = useState<Set<string>>(new Set());

  // 환율 입력값 (가격 조회 후 자동 채워짐, 수동 수정 가능)
  const [usdKrw, setUsdKrw] = useState<string>("");
  const [cadKrw, setCadKrw] = useState<string>("");

  const lastTradingDay = useMemo(() => getLastTradingDay(month), [month]);
  const krLockStatus = useMemo(() => canLockKr(lastTradingDay), [lastTradingDay]);
  const usLockStatus = useMemo(() => canLockUs(lastTradingDay), [lastTradingDay]);

  // 종가 + 환율 동시 조회
  const handleFetch = async () => {
    setFetching(true);
    setError(null);
    setPreview(null);

    try {
      const dateParam = `&date=${lastTradingDay}`;
      const fetches: Promise<void>[] = [];
      const result: PreviewData = {};

      if (mode === "I") {
        fetches.push(
          fetch(`/api/portfolio/financial/snapshot/${month}/closing-prices?market=KR${dateParam}`)
            .then((r) => r.json())
            .then((d) => {
              result.kr = { status: d.status, preview: d.preview, targetDate: d.targetDate, rates: d.rates };
              if (d.rates && !result.rates) result.rates = d.rates;
            })
        );
        fetches.push(
          fetch(`/api/portfolio/financial/snapshot/${month}/closing-prices?market=US${dateParam}`)
            .then((r) => r.json())
            .then((d) => {
              result.us = { status: d.status, preview: d.preview, targetDate: d.targetDate, rates: d.rates };
              if (d.rates && !result.rates) result.rates = d.rates;
            })
        );
      } else {
        fetches.push(
          fetch(`/api/portfolio/financial/snapshot/${month}/closing-prices?market=II${dateParam}`)
            .then((r) => r.json())
            .then((d) => {
              result.kr = { status: d.status, preview: d.preview, targetDate: d.targetDate, rates: d.rates };
              if (d.rates) result.rates = d.rates;
            })
        );
      }

      await Promise.all(fetches);
      setPreview(result);

      // 환율 입력값 초기화 (이미 확정한 값 있으면 유지)
      if (result.rates) {
        if (!usdKrw) setUsdKrw(String(result.rates.usdKrw));
        if (!cadKrw) setCadKrw(String(result.rates.cadKrw));
      }
    } catch {
      setError("조회에 실패했습니다. 다시 시도하세요.");
    } finally {
      setFetching(false);
    }
  };

  const handleLock = async (market: "KR" | "US" | "II" | "FX") => {
    setLocking(market);
    setError(null);
    try {
      const bodyData: Record<string, unknown> = {
        market,
        targetDate: lastTradingDay,
      };

      if (market === "FX") {
        const usd = parseFloat(usdKrw);
        const cad = parseFloat(cadKrw);
        if (!usd || !cad || usd <= 0 || cad <= 0) {
          setError("환율 값을 올바르게 입력해주세요.");
          setLocking(null);
          return;
        }
        bodyData.usdKrw = usd;
        bodyData.cadKrw = cad;
      }

      const res = await fetch(
        `/api/portfolio/financial/snapshot/${month}/lock-balances`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "저장 실패");
      }
      setLockedMarkets((prev) => new Set([...prev, market]));
      onLocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setLocking(null);
    }
  };

  const handleClose = () => {
    setPreview(null);
    setError(null);
    setLockedMarkets(new Set());
    setUsdKrw("");
    setCadKrw("");
    onClose();
  };

  // ─── KR 섹션 ────────────────────────────
  const renderKrSection = () => {
    const kr = preview?.kr;
    const status = kr?.status;
    const p = kr?.preview;
    const marketKey = mode === "II" ? "II" : "KR";
    const isLocked = lockedMarkets.has(marketKey);

    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">🇰🇷 한국 종목 (KRX)</span>
            {status && (
              <Badge variant={status.open ? "destructive" : "outline"} className="text-[10px] h-4">
                {status.open ? "장중" : "마감"}
              </Badge>
            )}
          </div>
          {isLocked && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>

        <p className="text-[11px] text-muted-foreground">
          장 마감: <strong>오후 3:30 KST</strong> · 마감 후 실행하면 당일 종가가 사용됩니다.
        </p>
        <LockStatusBadge ok={krLockStatus.ok} reason={krLockStatus.reason} />

        {status?.warning && (
          <div className="flex items-start gap-1.5 rounded bg-yellow-50 border border-yellow-200 p-2">
            <AlertTriangle className="w-3 h-3 text-yellow-600 mt-0.5 shrink-0" />
            <span className="text-[11px] text-yellow-800">{status.warning}</span>
          </div>
        )}

        {p && mode === "I" && (
          <div className="space-y-0.5 pt-1 border-t">
            <PriceRow label="FUND" value={`${fmtKrw(p.fund)}`} />
            <PriceRow label="FUND 원금" value={`${fmtKrw(p.fundPrincipal)}`} />
            <PriceRow label="KOR Stocks" value={`${fmtKrw(p.korStocks)}`} />
            <PriceRow label="KOR Stocks 원금" value={`${fmtKrw(p.korStocksPrincipal)}`} />
          </div>
        )}
        {p && mode === "II" && (
          <div className="space-y-0.5 pt-1 border-t">
            <PriceRow label="퇴직연금 잔액" value={`${fmtKrw(p.pensionFundBalance)}`} />
            <PriceRow label="퇴직연금 원금" value={`${fmtKrw(p.pensionFundPrincipal)}`} />
            <PriceRow label="연금저축 잔액" value={`${fmtKrw(p.pensionDepositBalance)}`} />
            <PriceRow label="IRP 잔액" value={`${fmtKrw(p.irpBalance)}`} />
            <PriceRow label="Education 주식" value={`${fmtKrw(p.education1470Stock)}`} />
            <PriceRow label="Short-term 주식" value={`${fmtKrw(p.shorttermStockBalance)}`} />
          </div>
        )}

        {p && !isLocked && (
          <Button
            size="sm"
            className="w-full h-7 text-xs mt-1"
            onClick={() => handleLock(marketKey)}
            disabled={locking != null}
          >
            {locking === marketKey ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />저장 중...</>
            ) : (
              "이 값으로 KR 종가 확정"
            )}
          </Button>
        )}
        {isLocked && <p className="text-xs text-green-600 text-center">✅ KR 종가 확정 완료</p>}
      </div>
    );
  };

  // ─── US 섹션 ────────────────────────────
  const renderUsSection = () => {
    const us = preview?.us;
    const status = us?.status;
    const p = us?.preview;
    const isLocked = lockedMarkets.has("US");

    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">🇺🇸 미국 종목 (NYSE/NASDAQ)</span>
            {status && (
              <Badge variant={status.open ? "destructive" : "outline"} className="text-[10px] h-4">
                {status.open ? "장중" : "마감"}
              </Badge>
            )}
          </div>
          {isLocked && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>

        <p className="text-[11px] text-muted-foreground">
          장 마감: <strong>익일 오전 6:00 KST</strong> (서머타임: 오전 5:00) · KR과 별도로 확정하세요.
        </p>
        <LockStatusBadge ok={usLockStatus.ok} reason={usLockStatus.reason} />

        {status?.warning && (
          <div className="flex items-start gap-1.5 rounded bg-yellow-50 border border-yellow-200 p-2">
            <AlertTriangle className="w-3 h-3 text-yellow-600 mt-0.5 shrink-0" />
            <span className="text-[11px] text-yellow-800">{status.warning}</span>
          </div>
        )}

        {p && (
          <div className="space-y-0.5 pt-1 border-t">
            <PriceRow label="US Stocks" value={fmtUsd(p.usStocksUsd)} />
            <PriceRow label="US 원금" value={fmtUsd(p.usPrincipalUsd)} />
          </div>
        )}

        {p && !isLocked && (
          <Button
            size="sm"
            className="w-full h-7 text-xs mt-1"
            onClick={() => handleLock("US")}
            disabled={locking != null}
          >
            {locking === "US" ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />저장 중...</>
            ) : (
              "이 값으로 US 종가 확정"
            )}
          </Button>
        )}
        {isLocked && <p className="text-xs text-green-600 text-center">✅ US 종가 확정 완료</p>}
      </div>
    );
  };

  // ─── 환율 섹션 ──────────────────────────
  const renderFxSection = () => {
    const isFxLocked = lockedMarkets.has("FX");
    const usdVal = parseFloat(usdKrw);
    const cadVal = parseFloat(cadKrw);

    return (
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">🌏 월말 기준 환율</span>
          {isFxLocked && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        </div>

        <p className="text-[11px] text-muted-foreground">
          조회 후 자동 입력됩니다. 네이버 금융 등으로 확인 후 수정 가능합니다.
        </p>

        {/* 환율 입력 그리드 */}
        <div className="grid grid-cols-2 gap-3">
          {/* USD/KRW — 자산관리(I) 메인 */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">
              USD / KRW
              {mode === "I" && (
                <span className="ml-1 text-[10px] text-blue-600">(US 종목)</span>
              )}
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={usdKrw}
              onChange={(e) => setUsdKrw(e.target.value)}
              placeholder="예: 1370.50"
              className="h-7 text-xs tabular-nums"
              disabled={!preview || isFxLocked}
            />
            {usdVal > 0 && (
              <p className="text-[10px] text-muted-foreground tabular-nums">
                1 USD = {usdVal.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원
              </p>
            )}
          </div>

          {/* CAD/KRW — 자산관리II(Pension) 메인 */}
          <div className="space-y-1">
            <Label className="text-xs font-medium">
              CAD / KRW
              {mode === "II" && (
                <span className="ml-1 text-[10px] text-blue-600">(연금)</span>
              )}
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={cadKrw}
              onChange={(e) => setCadKrw(e.target.value)}
              placeholder="예: 1020.30"
              className="h-7 text-xs tabular-nums"
              disabled={!preview || isFxLocked}
            />
            {cadVal > 0 && (
              <p className="text-[10px] text-muted-foreground tabular-nums">
                1 CAD = {cadVal.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원
              </p>
            )}
          </div>
        </div>

        {/* 환율 확정 버튼 */}
        {preview && !isFxLocked && (
          <Button
            size="sm"
            className="w-full h-7 text-xs gap-1"
            onClick={() => handleLock("FX")}
            disabled={locking != null || !usdKrw || !cadKrw}
          >
            {locking === "FX" ? (
              <><Loader2 className="w-3 h-3 animate-spin" />저장 중...</>
            ) : (
              <><Lock className="w-3 h-3" />이 환율로 확정</>
            )}
          </Button>
        )}
        {isFxLocked && (
          <p className="text-xs text-green-600 text-center">✅ 환율 확정 완료 (USD {usdVal.toLocaleString("ko-KR", { minimumFractionDigits: 2 })} / CAD {cadVal.toLocaleString("ko-KR", { minimumFractionDigits: 2 })})</p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">종가·환율 확정 — {month}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* 기준일 배너 */}
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 border px-3 py-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">기준일 (당월 마지막 영업일):</span>
            <span className="text-xs font-semibold tabular-nums">{lastTradingDay}</span>
          </div>

          {/* 조회 버튼 */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-8 text-xs gap-1.5"
            onClick={handleFetch}
            disabled={fetching}
          >
            {fetching ? (
              <><Loader2 className="w-3 h-3 animate-spin" />{lastTradingDay} 종가·환율 조회 중...</>
            ) : (
              <><RefreshCw className="w-3 h-3" />{lastTradingDay} 종가·환율 조회</>
            )}
          </Button>

          {/* 에러 */}
          {error && (
            <div className="flex items-start gap-1.5 rounded bg-red-50 border border-red-200 p-2">
              <AlertTriangle className="w-3 h-3 text-red-600 mt-0.5 shrink-0" />
              <span className="text-[11px] text-red-800">{error}</span>
            </div>
          )}

          {/* 미리보기 섹션 — 종가 + 환율 */}
          {preview && (
            <>
              {renderKrSection()}
              {mode === "I" && renderUsSection()}
              {renderFxSection()}
            </>
          )}

          {/* 조회 전 안내 */}
          {!preview && !fetching && (
            <div className="text-[11px] text-muted-foreground rounded bg-muted/40 p-3 space-y-1">
              <p>• 한국 종목은 <strong>KRX 마감(15:30 KST)</strong> 후 확정하세요.</p>
              {mode === "I" && (
                <p>• 미국 종목은 <strong>익일 06:00 KST</strong> 이후 별도로 확정하세요.</p>
              )}
              <p>• 환율은 Yahoo Finance 기준으로 자동 조회되며 수동 수정이 가능합니다.</p>
              <p>• 종가·환율 확정은 각각 독립적으로 수행할 수 있습니다.</p>
              <p>• 재무제표 Confirm 전에 모두 확정을 완료하세요.</p>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={handleClose}>닫기</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
