"use client";

// 포지션 리스크 테이블 — Excel "Risk Management Account I" 하단 테이블 재현
//
// 사용법:
//   1. 종목코드 입력 후 Enter 또는 새로고침 버튼 → 현재가 자동 조회
//   2. 현재가 기준으로 손절가/주당리스크/nR 수량/투자금/계좌손절비중 자동 계산
//
// 계산 공식 (config 기반):
//   riskAmount       = totalCapital × multipleR          (1R 손실 허용액)
//   cutoffPrice      = bidPrice × (1 - cutoff)           (손절가)
//   riskPerShare     = bidPrice × cutoff                 (주당 손실)
//   oneTimeLimit     = totalCapital / (unit + 1)         (1회 투자 한도)
//   nR_vol           = min(floor(n × riskAmount / riskPerShare),
//                          floor(oneTimeLimit / bidPrice))  (25% 제한)
//   investment_1R    = 1R_vol × bidPrice
//   sl_account       = (1R_vol × riskPerShare) / totalCapital × 100

import { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RiskManagementConfig } from "@/types/portfolio";

// ─────────────────────────────────────────
// 타입
// ─────────────────────────────────────────

interface RiskRow {
  id: string;
  code: string;
  name: string | null;     // 기업명 (API에서 자동 조회)
  price: number | null;    // 현재가 (자동 조회 또는 수동 입력)
  isLoading: boolean;
  error: string | null;
}

/** localStorage에 저장하는 행 데이터 (휘발성 필드 제외) */
interface PersistedRow {
  id: string;
  code: string;
  name: string | null;
  price: number | null;
}

interface PositionRiskTableProps {
  config: RiskManagementConfig;
  /**
   * localStorage 저장 키 — 계좌별로 독립 보관.
   * 미지정 시 기본값 사용.
   */
  storageKey?: string;
}

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

const DEFAULT_STORAGE_KEY = "portfolio-position-risk-table-v1";

function createRow(): RiskRow {
  return {
    id: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now()),
    code: "",
    name: null,
    price: null,
    isLoading: false,
    error: null,
  };
}

/** localStorage에서 행 목록 복원 */
function loadRows(key: string): RiskRow[] {
  if (typeof window === "undefined") return [createRow()];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [createRow()];
    const parsed = JSON.parse(raw) as PersistedRow[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [createRow()];
    // isLoading/error는 항상 초기값으로 복원
    return parsed.map((p) => ({
      id: p.id ?? (typeof crypto !== "undefined" ? crypto.randomUUID() : String(Date.now())),
      code: p.code ?? "",
      name: p.name ?? null,
      price: p.price ?? null,
      isLoading: false,
      error: null,
    }));
  } catch {
    return [createRow()];
  }
}

/** rows에서 저장할 필드만 추출 */
function toPersistedRows(rows: RiskRow[]): PersistedRow[] {
  return rows.map(({ id, code, name, price }) => ({ id, code, name, price }));
}

function fmt(v: number): string {
  return v.toLocaleString();
}

// ─────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────

export function PositionRiskTable({ config, storageKey = DEFAULT_STORAGE_KEY }: PositionRiskTableProps) {
  // 클라이언트 마운트 후 localStorage에서 복원
  // SSR 환경에서는 window가 없으므로 빈 행으로 시작하고, useEffect에서 클라이언트 로드
  const [rows, setRows] = useState<RiskRow[]>(() => loadRows(storageKey));

  // 이전 storageKey 추적 — 계좌 전환 시에만 재로드 (마운트 시 lazy init과 중복 방지)
  const prevKeyRef = useRef(storageKey);
  // 저장 허용 플래그 — 초기 렌더(SSR 빈 상태)나 storageKey 전환 직후에는 저장 스킵
  const canSaveRef = useRef(false);

  // storageKey 변경(계좌 전환) 시에만 재로드
  // - 마운트 시는 lazy initializer가 처리하므로 이 effect는 스킵
  // - canSaveRef를 false로 리셋해 이전 계좌 rows가 새 key에 저장되는 것을 방지
  useEffect(() => {
    if (prevKeyRef.current === storageKey) return;
    prevKeyRef.current = storageKey;
    canSaveRef.current = false; // 다음 save effect가 이전 rows를 저장하지 않도록
    setRows(loadRows(storageKey));
  }, [storageKey]);

  // rows 변경 시 localStorage에 저장
  // - 첫 렌더(마운트)는 스킵 → SSR hydration 빈 상태가 저장된 데이터를 덮어쓰는 버그 방지
  // - storageKey 전환 직후도 스킵 → 이전 계좌 rows가 새 key에 오염되지 않도록
  useEffect(() => {
    if (!canSaveRef.current) {
      canSaveRef.current = true;
      return;
    }
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(toPersistedRows(rows)));
    } catch { /* ignore */ }
  }, [rows, storageKey]);

  // ── 계좌 기반 파생 상수 ──────────────────
  // 1R 허용 손실액
  const riskAmount = Math.round(config.totalCapital * config.multipleR);
  // 1회 투자 한도 (25% 제한 — 초과 시 빨간색 강조)
  const oneTimeLimit =
    config.totalCapital > 0 && config.unit > 0
      ? Math.round(config.totalCapital / (config.unit + 1))
      : 0;

  // ── 현재가 + 기업명 자동 조회 ────────────────────────
  const fetchPrice = useCallback(async (rowId: string, code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // 로딩 상태 진입
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId ? { ...r, isLoading: true, error: null, price: null, name: null } : r
      )
    );

    try {
      const res = await fetch(
        `/api/portfolio/risk/prices?codes=${encodeURIComponent(trimmed)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        prices: Record<string, number>;
        names: Record<string, string>;
      };
      const price = data.prices[trimmed] ?? null;
      // 기업명: API가 반환한 names 맵에서 조회
      const name = data.names?.[trimmed] ?? null;

      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                price,
                name,
                isLoading: false,
                error: price === null ? "조회 실패 — 코드 확인 필요" : null,
              }
            : r
        )
      );
    } catch {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? { ...r, isLoading: false, error: "네트워크 오류" }
            : r
        )
      );
    }
  }, []);

  // ── nR 수량 계산 (3R 기준) ─────────────────────
  // nR 금액(3R) = riskAmount × 3 을 주당리스크로 나눈 값.
  // 1회 투자 한도(unit+1 분할) 초과 불가.
  function calcVolume(price: number): number {
    const riskPerShare = price * config.cutoff;
    const maxByLimit =
      oneTimeLimit > 0 ? Math.floor(oneTimeLimit / price) : Infinity;
    const byRisk = riskPerShare > 0 ? Math.floor((riskAmount * 3) / riskPerShare) : 0;
    return Math.min(byRisk, maxByLimit);
  }

  // ── 렌더링 ─────────────────────────────────
  const hasCapital = config.totalCapital > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Position Sizing</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
            onClick={() => setRows((prev) => [...prev, createRow()])}
          >
            <Plus className="h-3 w-3" />
            종목 추가
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Account Total 미설정 안내 */}
        {!hasCapital ? (
          <p className="text-center text-[11px] text-muted-foreground py-6 border border-dashed rounded">
            리스크 설정(⚙)에서 Account Total을 먼저 입력하세요.
          </p>
        ) : (
          <>
            {/* ── 테이블 (가로 스크롤) ── */}
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-xs min-w-[580px]">
                <thead>
                  <tr className="border-b text-[10px] text-muted-foreground">
                    {/* 종목코드 입력 영역 */}
                    <th className="text-left pb-1.5 font-medium w-32 pr-2">종목코드</th>
                    {/* 현재가 — API 자동 조회 */}
                    <th className="text-right pb-1.5 font-medium pr-2">현재가</th>
                    {/* 손절가 = 현재가 × (1 - Cutoff%) */}
                    <th className="text-right pb-1.5 font-medium pr-2">
                      손절가
                      <span className="block text-[9px] font-normal">×(1-{(config.cutoff*100).toFixed(0)}%)</span>
                    </th>
                    {/* 주당 리스크 = 현재가 × Cutoff% */}
                    <th className="text-right pb-1.5 font-medium pr-2">
                      주당리스크
                      <span className="block text-[9px] font-normal">×{(config.cutoff*100).toFixed(0)}%</span>
                    </th>
                    {/* nR 수량 (3R 기준 — nR 금액 / 주당리스크, Max 25%) */}
                    <th className="text-right pb-1.5 font-medium pr-2">nR 수량</th>
                    {/* nR 기준 투자금 */}
                    <th className="text-right pb-1.5 font-medium pr-2">
                      투자금
                      {oneTimeLimit > 0 && (
                        <span className="block text-[9px] font-normal">한도 {fmt(oneTimeLimit)}</span>
                      )}
                    </th>
                    {/* 손절 시 계좌 손실 비중 */}
                    <th className="text-right pb-1.5 font-medium">SL/계좌</th>
                    {/* 삭제 버튼 열 */}
                    <th className="w-5" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/40">
                  {rows.map((row) => {
                    // 현재가 기반 계산
                    const price = row.price;
                    const cutoffPrice = price ? Math.round(price * (1 - config.cutoff)) : null;
                    const riskPerShare = price ? price * config.cutoff : null;
                    const volNR = price != null ? calcVolume(price) : null;
                    const investment = price && volNR != null ? volNR * price : null;
                    // 손절 시 계좌 손실 비중 = (수량 × 주당리스크) / 계좌 총액 × 100
                    const slAccountPct =
                      volNR != null && riskPerShare != null && config.totalCapital > 0
                        ? ((volNR * riskPerShare) / config.totalCapital) * 100
                        : null;
                    // 투자금이 1회 한도 초과 여부
                    const isOverLimit =
                      investment != null && oneTimeLimit > 0 && investment > oneTimeLimit;

                    return (
                      <tr key={row.id} className="group hover:bg-muted/30">
                        {/* ── 종목코드 입력 + 조회 버튼 ── */}
                        <td className="py-1.5 pr-2">
                          <div className="flex items-center gap-1">
                            <input
                              value={row.code}
                              onChange={(e) =>
                                setRows((prev) =>
                                  prev.map((r) =>
                                    r.id === row.id
                                      ? { ...r, code: e.target.value, price: null, name: null, error: null }
                                      : r
                                  )
                                )
                              }
                              onKeyDown={(e) =>
                                e.key === "Enter" && fetchPrice(row.id, row.code)
                              }
                              placeholder="005930"
                              className="w-[72px] rounded border border-input bg-background px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                            {/* 현재가 조회 버튼 */}
                            <button
                              onClick={() => fetchPrice(row.id, row.code)}
                              disabled={row.isLoading || !row.code.trim()}
                              title="현재가 조회"
                              className="p-1 rounded hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                            >
                              <RefreshCw
                                className={cn(
                                  "h-3 w-3 text-emerald-600",
                                  row.isLoading && "animate-spin"
                                )}
                              />
                            </button>
                          </div>
                          {/* 기업명 — 조회 성공 시 네이버 주식 페이지 링크로 표시 */}
                          {row.name && row.code.trim() && (
                            <a
                              href={`https://stock.naver.com/domestic/stock/${row.code.trim()}/price`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block mt-0.5 text-[10px] text-emerald-600 hover:text-emerald-700 hover:underline leading-tight truncate max-w-[90px]"
                              title={row.name}
                            >
                              {row.name}
                            </a>
                          )}
                          {/* 오류 메시지 */}
                          {row.error && (
                            <p className="text-[10px] text-red-500 mt-0.5 leading-tight">
                              {row.error}
                            </p>
                          )}
                        </td>

                        {/* ── 현재가 ── */}
                        <td className="text-right py-1.5 pr-2 tabular-nums">
                          {row.isLoading ? (
                            <span className="text-muted-foreground text-[11px]">조회 중…</span>
                          ) : price != null ? (
                            <span className="font-medium">{fmt(price)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* ── 손절가 ── */}
                        <td className="text-right py-1.5 pr-2 tabular-nums">
                          {cutoffPrice != null ? (
                            <span className="text-blue-500 font-medium">{fmt(cutoffPrice)}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* ── 주당 리스크 ── */}
                        <td className="text-right py-1.5 pr-2 tabular-nums text-muted-foreground">
                          {riskPerShare != null ? fmt(Math.round(riskPerShare)) : "-"}
                        </td>

                        {/* ── nR 수량 (3R 기준) ── */}
                        <td className="text-right py-1.5 pr-2 tabular-nums">
                          {volNR != null ? (
                            <span className={cn("font-semibold", volNR === 0 && "text-muted-foreground")}>
                              {fmt(volNR)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* ── 투자금 (한도 초과 시 빨간색) ── */}
                        <td className="text-right py-1.5 pr-2 tabular-nums">
                          {investment != null ? (
                            <span
                              className={cn(
                                "font-medium",
                                isOverLimit
                                  ? "text-red-500 font-bold"
                                  : "text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {fmt(investment)}
                              {isOverLimit && (
                                <span className="ml-0.5 text-[9px]">⚠</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* ── SL/계좌 (손절 시 계좌 손실 비중) ── */}
                        <td className="text-right py-1.5 tabular-nums">
                          {slAccountPct != null ? (
                            <span
                              className={cn(
                                slAccountPct > config.multipleR * 100 * 1.1
                                  ? "text-red-500 font-semibold"
                                  : "text-muted-foreground"
                              )}
                            >
                              {slAccountPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* ── 행 삭제 버튼 (hover 시 노출) ── */}
                        <td className="pl-1">
                          {rows.length > 1 && (
                            <button
                              onClick={() =>
                                setRows((prev) =>
                                  prev.filter((r) => r.id !== row.id)
                                )
                              }
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-950/40 transition-opacity"
                              title="행 삭제"
                            >
                              <Trash2 className="h-3 w-3 text-red-400" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── 계산 기준 요약 ── */}
            <div className="mt-2 pt-2 border-t flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
              <span>nR(3R) = <strong>{fmt(riskAmount * 3)}</strong>원</span>
              <span>Cutoff = <strong>{(config.cutoff * 100).toFixed(0)}%</strong></span>
              {oneTimeLimit > 0 && (
                <span>1회 한도 = <strong>{fmt(oneTimeLimit)}</strong>원 (계좌의 {(1/(config.unit+1)*100).toFixed(0)}%)</span>
              )}
              <span className="text-muted-foreground/60">
                ※ Enter키 또는 🔄 버튼으로 현재가 조회
              </span>
            </div>

            {/* ── 용어 설명 (Excel 셀 메모 기반) ── */}
            <div className="mt-3 pt-3 border-t space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">용어 설명</p>
              <dl className="space-y-2 text-[11px]">

                <div>
                  <dt className="font-semibold text-foreground/80">Multiple R</dt>
                  <dd className="text-muted-foreground mt-0.5">
                    노출 가능한 포지션 사이즈, 이상적인 리스크 양 — 어떤 1회 거래에서도 투자 자본의 최대 2%를 잃지 않도록 포지션 크기를 제한한다.
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-foreground/80">Cutoff</dt>
                  <dd className="text-muted-foreground mt-0.5 space-y-1">
                    <p>매매당 R이 2%라고 해서 손절을 -2% 지점에서 한다는 말이 아니다. 몰빵한다면 -2%이겠지만 현실은 분배를 해야한다.</p>
                    <p>즉, -8% 지점에서 손절을 해도 최대 손실금액은 Seed Money 2% 손실과 동일.</p>
                    <p>손절값은 투자자의 성향, 투자 전략, 시장 변동성을 고려하여 조정할 수 있다: 최근 20일간의 평균 ATR(Average True Range — 변동성 지표)에서 2배 이상 주가가 하락하면 손절로 정할 수 있다.</p>
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-foreground/80">Target profit, 3R</dt>
                  <dd className="text-muted-foreground mt-0.5">
                    손익비를 1:3으로 본다면, R이 1%일 때, 매매당 손절은 -8%(-1R)에 하고, 수익 실현은 24%(3R)에 한다.
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-foreground/80">One-time Investment</dt>
                  <dd className="text-muted-foreground mt-0.5 space-y-1">
                    <p>= 최대손실금액(Seed Money × R) / Cutoff</p>
                    <p>R이 2%일 때 매매당 투자 비중은 25%, R이 1%이면 매매당 투자 비중은 12.5%.</p>
                    <p>투자금(1R)이 이 한도를 초과하면 빨간색으로 경고합니다.</p>
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-foreground/80">Market (시장 장세에 따른 Unit 투자)</dt>
                  <dd className="text-muted-foreground mt-0.5">
                    상승장 = 3 Unit &nbsp;·&nbsp; 횡보장 = 2 Unit or 1 Unit &nbsp;·&nbsp; 하락장 = 1 Unit or 3 Unit
                  </dd>
                </div>

                <div>
                  <dt className="font-semibold text-foreground/80">Win Rate (점진적 투자)</dt>
                  <dd className="text-muted-foreground mt-0.5">
                    최대 투자 금액을 유닛으로 나누어 시장환경 변화에 대응 — 1 Unit으로 시작, 매매에 성공하면 1 Unit씩 늘여가고 실패하면 Unit을 줄임.
                  </dd>
                </div>

              </dl>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
