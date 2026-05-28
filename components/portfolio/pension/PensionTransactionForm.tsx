"use client";

// 연금 계좌 거래 추가/편집 다이얼로그
// BUY / SELL / DIVIDEND 3가지 거래유형 지원
// SELL 선택 시 현재 보유 종목 자동완성 + 잔여수량 표시
// RETIREMENT 계좌는 채권형/주식형 카테고리 추가 선택
// 종목코드 입력 시 네이버 자동조회 (STOCK·ETF) + 기존 이름 제안

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  PensionTransaction,
  PensionPosition,
  PensionAccountType,
  PensionCategory,
} from "@/types/portfolio";

interface PensionTransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  /** 편집 모드: 기존 거래 전달 */
  editTransaction?: PensionTransaction;
  /** 기본 선택 계좌 */
  defaultAccountType?: PensionAccountType;
  /** 현재 보유 포지션 (SELL 자동완성용) */
  positions?: PensionPosition[];
  /** 기존 거래 목록 — 같은 종목코드의 이름 후보 제안용 */
  existingTransactions?: PensionTransaction[];
}

interface FormState {
  date: string;
  accountType: PensionAccountType;
  category: PensionCategory | "";
  tradeType: "BUY" | "SELL" | "DIVIDEND";
  stockCode: string;
  stockName: string;
  quantity: string;
  price: string;
  amount: string;     // DIVIDEND만 직접 입력, BUY/SELL은 price×quantity 자동
  fee: string;
  assetType: "STOCK" | "BOND" | "FUND" | "ETF";
  memo: string;
}

const today = new Date().toISOString().slice(0, 10);

function makeDefault(defaultAccountType: PensionAccountType = "RETIREMENT"): FormState {
  return {
    date:        today,
    accountType: defaultAccountType,
    category:    (defaultAccountType === "RETIREMENT" || defaultAccountType === "SAVINGS") ? "BOND" : "",
    tradeType:   "BUY",
    stockCode:   "",
    stockName:   "",
    quantity:    "",
    price:       "",
    amount:      "",
    fee:         "",
    assetType:   "FUND",
    memo:        "",
  };
}

function txToForm(tx: PensionTransaction): FormState {
  return {
    date:        tx.date,
    accountType: tx.accountType,
    category:    tx.category ?? "",
    tradeType:   tx.tradeType,
    stockCode:   tx.stockCode,
    stockName:   tx.stockName,
    quantity:    tx.quantity > 0 ? String(tx.quantity) : "",
    price:       tx.price > 0 ? String(tx.price) : "",
    amount:      String(tx.amount),
    fee:         tx.fee ? String(tx.fee) : "",
    assetType:   tx.assetType as FormState["assetType"],
    memo:        tx.memo ?? "",
  };
}

const ACCOUNT_LABELS: Record<PensionAccountType, string> = {
  RETIREMENT: "퇴직연금",
  SAVINGS:    "연금저축",
  IRP:        "IRP",
};
void ACCOUNT_LABELS; // 미사용 경고 억제

export function PensionTransactionForm({
  open,
  onOpenChange,
  onSaved,
  editTransaction,
  defaultAccountType = "RETIREMENT",
  positions = [],
  existingTransactions = [],
}: PensionTransactionFormProps) {
  const isEdit = !!editTransaction;

  const [form, setForm]     = useState<FormState>(() =>
    isEdit ? txToForm(editTransaction) : makeDefault(defaultAccountType)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // ── 종목명 자동완성 상태 ─────────────────────
  const [nameLookupStatus, setNameLookupStatus] = useState<"idle" | "loading" | "done">("idle");
  const [suggestions, setSuggestions]           = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 다이얼로그 열릴 때마다 폼 초기화
  useEffect(() => {
    if (open) {
      setForm(isEdit ? txToForm(editTransaction!) : makeDefault(defaultAccountType));
      setError(null);
      setSuggestions([]);
      setNameLookupStatus("idle");
    }
  }, [open, isEdit, editTransaction, defaultAccountType]);

  // ── 종목명 자동완성 로직 ─────────────────────
  const lookupStockName = useCallback(
    (code: string, assetType: FormState["assetType"]) => {
      const trimmed = code.trim().toUpperCase();
      setSuggestions([]);
      setNameLookupStatus("idle");

      if (!trimmed) return;

      // 기존 transactions에서 같은 종목코드 이름 즉시 제안
      const existingNames = [
        ...new Set(
          existingTransactions
            .filter((t) => t.stockCode === trimmed)
            .map((t) => t.stockName)
        ),
      ];
      if (existingNames.length > 0) setSuggestions(existingNames);

      // FUND·BOND는 코드 체계가 불규칙하므로 API 조회 스킵
      if (assetType === "FUND" || assetType === "BOND") return;

      // STOCK·ETF: 6자리 완성 후 네이버 조회
      if (trimmed.length < 6) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setNameLookupStatus("loading");
        try {
          const res = await fetch(`/api/stock-info?code=${encodeURIComponent(trimmed)}&market=KR`);
          if (!res.ok) { setNameLookupStatus("done"); return; }
          const data = await res.json() as { name: string | null };
          if (data.name) {
            setSuggestions((prev) => [data.name!, ...prev.filter((n) => n !== data.name)]);
            setForm((f) => f.stockName.trim() === "" ? { ...f, stockName: data.name! } : f);
          }
        } finally {
          setNameLookupStatus("done");
        }
      }, 600);
    },
    [existingTransactions]
  );

  // 필드 업데이트 헬퍼 — 연쇄 효과 처리
  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "accountType") {
        next.category = (value === "RETIREMENT" || value === "SAVINGS") ? "BOND" : "";
      }
      return next;
    });
    // stockCode 변경 시 자동완성 트리거
    if (field === "stockCode") {
      lookupStockName(value as string, form.assetType);
    }
    // assetType 변경 시 현재 코드로 재조회
    if (field === "assetType" && form.stockCode.trim()) {
      lookupStockName(form.stockCode, value as FormState["assetType"]);
    }
  }

  // SELL 자동완성: 현재 계좌+카테고리의 보유 포지션 목록
  const needsCategory = form.accountType === "RETIREMENT" || form.accountType === "SAVINGS";
  const availablePositions = useMemo(() =>
    positions.filter(
      (p) =>
        p.accountType === form.accountType &&
        (!needsCategory || p.category === form.category) &&
        p.quantity > 0
    ),
  [positions, form.accountType, form.category, needsCategory]);

  const selectedPos = useMemo(() =>
    availablePositions.find((p) => p.stockCode === form.stockCode),
  [availablePositions, form.stockCode]);

  const computedAmount = useMemo(() => {
    if (form.tradeType === "DIVIDEND") return null;
    const p = Number(form.price.replace(/,/g, ""));
    const q = Number(form.quantity.replace(/,/g, ""));
    return p > 0 && q > 0 ? p * q : null;
  }, [form.tradeType, form.price, form.quantity]);

  async function handleSave() {
    if (!form.stockCode.trim() || !form.stockName.trim()) {
      setError("종목코드와 종목명은 필수입니다.");
      return;
    }
    if (needsCategory && !form.category) {
      setError("채권형/주식형을 선택해야 합니다.");
      return;
    }

    const quantity = Number(form.quantity.replace(/,/g, ""));
    const price    = Number(form.price.replace(/,/g, ""));
    const fee      = Number(form.fee.replace(/,/g, "")) || 0;

    if (form.tradeType !== "DIVIDEND" && (!quantity || !price)) {
      setError("수량과 단가를 입력하세요.");
      return;
    }

    const amount = form.tradeType === "DIVIDEND"
      ? Number(form.amount.replace(/,/g, ""))
      : price * quantity;

    if (!amount) {
      setError("금액을 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Omit<PensionTransaction, "id"> = {
        date:        form.date,
        accountType: form.accountType,
        ...(form.category ? { category: form.category as PensionCategory } : {}),
        tradeType:   form.tradeType,
        stockCode:   form.stockCode.trim(),
        stockName:   form.stockName.trim(),
        quantity:    form.tradeType === "DIVIDEND" ? 0 : quantity,
        price:       form.tradeType === "DIVIDEND" ? 0 : price,
        amount,
        ...(fee > 0 ? { fee } : {}),
        assetType:   form.assetType as PensionTransaction["assetType"],
        ...(form.memo.trim() ? { memo: form.memo.trim() } : {}),
      };

      const url    = isEdit
        ? `/api/portfolio/pension/transactions/${editTransaction!.id}`
        : "/api/portfolio/pension/transactions";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { ...body, id: editTransaction!.id } : body),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "저장 실패");
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류");
    } finally {
      setSaving(false);
    }
  }

  const isDividend = form.tradeType === "DIVIDEND";
  const isSell     = form.tradeType === "SELL";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEdit ? "Edit Trade" : "Add Trade"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* 날짜 */}
          <div className="space-y-1">
            <Label className="text-xs">날짜 *</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </div>

          {/* 계좌 구분 + 거래유형 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">계좌 *</Label>
              <Select value={form.accountType} onValueChange={(v) => update("accountType", v as PensionAccountType)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RETIREMENT" className="text-xs">퇴직연금</SelectItem>
                  <SelectItem value="SAVINGS"    className="text-xs">연금저축</SelectItem>
                  <SelectItem value="IRP"        className="text-xs">IRP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">거래유형 *</Label>
              <Select value={form.tradeType} onValueChange={(v) => update("tradeType", v as FormState["tradeType"])}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY"      className="text-xs">매수 (BUY)</SelectItem>
                  <SelectItem value="SELL"     className="text-xs">매도 (SELL)</SelectItem>
                  <SelectItem value="DIVIDEND" className="text-xs">배당 (DIVIDEND)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 퇴직연금·연금저축 채권형/주식형 */}
          {needsCategory && (
            <div className="space-y-1">
              <Label className="text-xs">자산 유형 *</Label>
              <Select value={form.category} onValueChange={(v) => update("category", v as PensionCategory)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOND"   className="text-xs">채권형</SelectItem>
                  <SelectItem value="EQUITY" className="text-xs">주식형</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* SELL: 보유 종목 자동완성 */}
          {isSell && availablePositions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">보유 종목에서 선택</Label>
              <Select
                value={form.stockCode}
                onValueChange={(v) => {
                  const pos = availablePositions.find((p) => p.stockCode === v);
                  if (pos) {
                    setForm((prev) => ({ ...prev, stockCode: pos.stockCode, stockName: pos.stockName, assetType: pos.assetType as FormState["assetType"] }));
                    setSuggestions([pos.stockName]);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="종목 선택 (또는 직접 입력)" />
                </SelectTrigger>
                <SelectContent>
                  {availablePositions.map((p) => (
                    <SelectItem key={p.stockCode} value={p.stockCode} className="text-xs">
                      {p.stockName} ({p.stockCode}) — 잔여 {p.quantity.toLocaleString()}주
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPos && (
                <p className="text-[10px] text-muted-foreground">
                  평균단가 {selectedPos.avgCost.toLocaleString()}원 · 잔여 {selectedPos.quantity.toLocaleString()}좌
                </p>
              )}
            </div>
          )}

          {/* 종목코드 + 종목명 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">종목(펀드)코드 *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="코드"
                value={form.stockCode}
                onChange={(e) => update("stockCode", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                종목명 *
                {nameLookupStatus === "loading" && (
                  <span className="text-[10px] font-normal text-muted-foreground animate-pulse">조회 중…</span>
                )}
              </Label>
              <Input
                className="h-8 text-xs"
                placeholder="이름"
                value={form.stockName}
                onChange={(e) => update("stockName", e.target.value)}
              />
              {/* 제안 pill 목록 */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {suggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, stockName: name }))}
                      className={[
                        "rounded-full border px-2 py-0.5 text-[10px] leading-tight transition-colors",
                        form.stockName === name
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "border-border bg-muted/50 text-muted-foreground hover:border-emerald-400 hover:text-foreground",
                      ].join(" ")}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BUY/SELL: 단가 + 수량 */}
          {!isDividend && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">단가 (원) *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="단가"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">수량(주) *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="수량"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                />
              </div>
            </div>
          )}

          {/* DIVIDEND: 배당금액 직접 입력 */}
          {isDividend && (
            <div className="space-y-1">
              <Label className="text-xs">배당금액 (원) *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="배당금액"
                value={form.amount}
                onChange={(e) => update("amount", e.target.value)}
              />
            </div>
          )}

          {/* 수수료 */}
          <div className="space-y-1">
            <Label className="text-xs">수수료 (원)</Label>
            <Input
              className="h-8 text-xs"
              placeholder="0"
              value={form.fee}
              onChange={(e) => update("fee", e.target.value)}
            />
          </div>

          {/* 자산종류 */}
          <div className="space-y-1">
            <Label className="text-xs">자산종류</Label>
            <Select
              value={form.assetType}
              onValueChange={(v) => update("assetType", v as FormState["assetType"])}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FUND"  className="text-xs">펀드</SelectItem>
                <SelectItem value="STOCK" className="text-xs">주식</SelectItem>
                <SelectItem value="ETF"   className="text-xs">ETF</SelectItem>
                <SelectItem value="BOND"  className="text-xs">채권</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 메모 */}
          <div className="space-y-1">
            <Label className="text-xs">메모</Label>
            <Input
              className="h-8 text-xs"
              placeholder="선택 입력"
              value={form.memo}
              onChange={(e) => update("memo", e.target.value)}
            />
          </div>

          {/* 거래금액 미리보기 */}
          {computedAmount !== null && (
            <div className="rounded-lg border px-3 py-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">거래금액</span>
                <span className="font-semibold tabular-nums">
                  {computedAmount.toLocaleString()}원
                </span>
              </div>
              {Number(form.fee) > 0 && isSell && (
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground text-[10px]">순 매도금액 (수수료 차감)</span>
                  <span className="tabular-nums text-[10px]">
                    {(computedAmount - Number(form.fee)).toLocaleString()}원
                  </span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline" size="sm" className="h-8 text-xs"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "저장 중…" : isEdit ? "수정" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
