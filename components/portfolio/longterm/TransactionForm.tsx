"use client";

// 중장기 투자 거래 추가/편집 다이얼로그
// - shadcn Dialog 기반
// - initialTx 전달 시 편집 모드, 없으면 추가 모드
// - 시장(KR/US) 선택 시 통화(KRW/USD) 자동 결정
// - 수량 × 단가 → 금액 자동 계산
// - DIVIDEND 선택 시 수량/단가 유효성 검사 면제 (금액만 필요)
// - 종목코드 입력 시 네이버/야후에서 공식 이름 자동 조회 + 기존 이름 제안

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LongtermTransaction } from "@/types/portfolio";

// 폼 내부 상태 타입 (모든 입력값을 문자열로 관리)
interface FormState {
  date: string;
  accountNo: "4802" | "1635" | "1402" | "2805" | "1470" | "8654";
  market: "KR" | "US";
  assetType: "STOCK" | "FUND" | "ETF";
  tradeType: "BUY" | "SELL" | "DIVIDEND";
  stockCode: string;
  stockName: string;
  quantity: string;
  price: string;
  amount: string;   // 자동 계산 (수동 입력도 허용)
  fee: string;      // 수수료 (선택)
  memo: string;
  sector: string;   // 섹터 (Short-term 계좌용, 선택)
}

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 편집 모드: 기존 거래를 전달하면 폼에 미리 채워짐.
   * 없으면 추가 모드.
   */
  initialTx?: LongtermTransaction;
  /**
   * 추가 모드: id 없는 트랜잭션 반환 — id는 API 레이어에서 부여
   * 편집 모드: id 포함 전체 트랜잭션 반환
   */
  onSubmit: (tx: Omit<LongtermTransaction, "id"> | LongtermTransaction) => void;
  /** true이면 섹터 입력 필드 표시 (Short-term 계좌용) */
  showSectorField?: boolean;
  /**
   * 기존 거래 목록 — 같은 종목코드의 이름 후보를 제안하는 데 사용
   * (오타 방지 + 트랜치 분리 의도 구분)
   */
  existingTransactions?: LongtermTransaction[];
}

// 공통 인풋 스타일
const inputClass =
  "mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500";

const selectClass =
  "mt-0.5 w-full rounded border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500";

const defaultForm: FormState = {
  date: new Date().toISOString().slice(0, 10),
  accountNo: "4802",
  market: "KR",
  assetType: "STOCK",
  tradeType: "BUY",
  stockCode: "",
  stockName: "",
  quantity: "",
  price: "",
  amount: "",
  fee: "",
  memo: "",
  sector: "",
};

// LongtermTransaction → FormState 변환 (편집 모드 초기값)
function txToFormState(tx: LongtermTransaction): FormState {
  return {
    date: tx.date,
    accountNo: tx.accountNo,
    market: tx.market,
    assetType: tx.assetType,
    tradeType: tx.tradeType,
    stockCode: tx.stockCode,
    stockName: tx.stockName,
    quantity: tx.quantity > 0 && tx.tradeType !== "DIVIDEND" ? String(tx.quantity) : "",
    price: tx.price > 0 ? String(tx.price) : "",
    amount: String(tx.amount),
    fee: tx.fee != null ? String(tx.fee) : "",
    memo: tx.memo ?? "",
    sector: tx.sector ?? "",
  };
}

export function TransactionForm({
  open,
  onOpenChange,
  initialTx,
  onSubmit,
  showSectorField = false,
  existingTransactions = [],
}: TransactionFormProps) {
  const isEditMode = !!initialTx;

  const [form, setForm] = useState<FormState>(
    initialTx ? txToFormState(initialTx) : defaultForm
  );

  // ── 종목명 자동완성 상태 ─────────────────────
  // "idle" | "loading" | "done" — 공식 이름 조회 상태
  const [nameLookupStatus, setNameLookupStatus] = useState<"idle" | "loading" | "done">("idle");
  // 제안 목록: 기존 이름 + 공식 이름 통합 (중복 제거)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 다이얼로그 열릴 때 폼 초기화 (편집이면 기존 값, 추가면 기본값)
  useEffect(() => {
    if (open) {
      setForm(initialTx ? txToFormState(initialTx) : defaultForm);
      setSuggestions([]);
      setNameLookupStatus("idle");
    }
  }, [open, initialTx]);

  // ── 종목코드 변경 시 이름 제안 로직 ─────────
  const lookupStockName = useCallback(
    (code: string, market: "KR" | "US", accountNo: string) => {
      const trimmed = code.trim().toUpperCase();

      // 제안 초기화
      setSuggestions([]);
      setNameLookupStatus("idle");

      if (!trimmed) return;

      // 1) 기존 transactions에서 같은 종목코드 이름 수집 (계좌 무관, 빠른 제안)
      const existingNames = [
        ...new Set(
          existingTransactions
            .filter((t) => t.stockCode === trimmed)
            .map((t) => t.stockName)
        ),
      ];

      if (existingNames.length > 0) {
        setSuggestions(existingNames);
      }

      // 2) KR: 6자리 / US: 1자 이상 입력 완료 후 공식 이름 조회
      const minLen = market === "KR" ? 6 : 1;
      if (trimmed.length < minLen) return;

      // FUND는 코드가 불규칙하므로 조회 스킵
      if (form.assetType === "FUND") return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setNameLookupStatus("loading");
        try {
          const res = await fetch(
            `/api/stock-info?code=${encodeURIComponent(trimmed)}&market=${market}`
          );
          if (!res.ok) { setNameLookupStatus("done"); return; }
          const data = await res.json() as { name: string | null };
          if (data.name) {
            // 공식 이름을 제안 목록 맨 앞에 추가 (중복 제거)
            setSuggestions((prev) => [
              data.name!,
              ...prev.filter((n) => n !== data.name),
            ]);
            // 종목명이 비어 있으면 자동 채워줌
            setForm((f) =>
              f.stockName.trim() === "" ? { ...f, stockName: data.name! } : f
            );
          }
        } finally {
          setNameLookupStatus("done");
        }
      }, 600);
    },
    [existingTransactions, form.assetType]
  );

  // stockCode 또는 market 변경 시 재조회
  function handleStockCodeChange(code: string) {
    setForm((f) => ({ ...f, stockCode: code }));
    lookupStockName(code, form.market, form.accountNo);
  }

  function handleMarketChange(market: "KR" | "US") {
    setForm((f) => ({ ...f, market }));
    if (form.stockCode.trim()) {
      lookupStockName(form.stockCode, market, form.accountNo);
    }
  }

  // 수량 또는 단가 변경 시 금액 자동 계산
  function handleQuantityOrPrice(field: "quantity" | "price", value: string) {
    const next = { ...form, [field]: value };
    const qty = parseFloat(field === "quantity" ? value : form.quantity) || 0;
    const price = parseFloat(field === "price" ? value : form.price) || 0;
    // 금액이 비어 있거나 아직 수동 입력 안 했으면 자동 계산
    const autoAmount = qty > 0 && price > 0 ? String(Math.round(qty * price)) : "";
    setForm({ ...next, amount: autoAmount });
  }

  function handleSubmit() {
    if (!form.date || !form.stockCode.trim() || !form.stockName.trim()) return;

    const isDividend = form.tradeType === "DIVIDEND";
    const quantity = isDividend ? 1 : parseFloat(form.quantity) || 0;
    const price = isDividend ? 0 : parseFloat(form.price) || 0;
    const amount = parseFloat(form.amount) || Math.round(quantity * price);

    // DIVIDEND 외에는 수량·단가 필수
    if (!isDividend && (quantity <= 0 || price <= 0)) return;
    // DIVIDEND는 금액 필수
    if (isDividend && amount <= 0) return;

    const base: Omit<LongtermTransaction, "id"> = {
      date: form.date,
      accountNo: form.accountNo,
      market: form.market,
      assetType: form.assetType,
      tradeType: form.tradeType,
      stockCode: form.stockCode.trim().toUpperCase(),
      stockName: form.stockName.trim(),
      quantity,
      price,
      currency: form.market === "KR" ? "KRW" : "USD",
      amount,
      fee: form.fee ? parseFloat(form.fee) : undefined,
      memo: form.memo.trim() || undefined,
      sector: form.sector.trim() || undefined,
    };

    if (isEditMode && initialTx) {
      // 편집 모드: id 포함해서 반환
      onSubmit({ ...base, id: initialTx.id });
    } else {
      onSubmit(base);
    }
    onOpenChange(false);
  }

  const isDividend = form.tradeType === "DIVIDEND";

  // 버튼 활성화 조건
  const isValid =
    form.date &&
    form.stockCode.trim() &&
    form.stockName.trim() &&
    (isDividend
      ? parseFloat(form.amount) > 0          // DIVIDEND: 금액만 있으면 됨
      : parseFloat(form.quantity) > 0 && parseFloat(form.price) > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {isEditMode ? "Edit Trade" : "Add Trade"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5 pt-1 text-xs">
          {/* ── 날짜 ── */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">날짜</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className={inputClass}
            />
          </div>

          {/* ── 계좌 / 시장 ── */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">계좌</label>
              <select
                value={form.accountNo}
                onChange={(e) =>
                  setForm({ ...form, accountNo: e.target.value as FormState["accountNo"] })
                }
                className={selectClass}
              >
                <option value="4802">4802</option>
                <option value="1635">1635</option>
                <option value="1402">1402</option>
                <option value="2805">2805</option>
                <option value="1470">1470</option>
                <option value="8654">8654</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                시장
                <span className="ml-1 text-emerald-600">
                  ({form.market === "KR" ? "KRW" : "USD"})
                </span>
              </label>
              <select
                value={form.market}
                onChange={(e) => handleMarketChange(e.target.value as "KR" | "US")}
                className={selectClass}
              >
                <option value="KR">KR (국내)</option>
                <option value="US">US (해외)</option>
              </select>
            </div>
          </div>

          {/* ── 종류 / 거래유형 ── */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">종류</label>
              <select
                value={form.assetType}
                onChange={(e) =>
                  setForm({ ...form, assetType: e.target.value as FormState["assetType"] })
                }
                className={selectClass}
              >
                <option value="STOCK">STOCK</option>
                <option value="FUND">FUND</option>
                <option value="ETF">ETF</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">거래유형</label>
              <select
                value={form.tradeType}
                onChange={(e) =>
                  setForm({ ...form, tradeType: e.target.value as FormState["tradeType"] })
                }
                className={selectClass}
              >
                <option value="BUY">BUY (매수)</option>
                <option value="SELL">SELL (매도)</option>
                <option value="DIVIDEND">DIVIDEND (배당)</option>
              </select>
            </div>
          </div>

          {/* ── 종목코드 / 종목명 ── */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">종목코드</label>
              <input
                type="text"
                value={form.stockCode}
                onChange={(e) => handleStockCodeChange(e.target.value)}
                placeholder="예: 005930"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                종목명
                {/* 조회 중 인디케이터 */}
                {nameLookupStatus === "loading" && (
                  <span className="text-[10px] text-muted-foreground animate-pulse">조회 중…</span>
                )}
              </label>
              <input
                type="text"
                value={form.stockName}
                onChange={(e) => setForm({ ...form, stockName: e.target.value })}
                placeholder="예: 삼성전자"
                className={inputClass}
              />
              {/* 제안 pill 목록 */}
              {suggestions.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
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

          {/* ── 수량 / 단가 (DIVIDEND 시 비활성) ── */}
          {!isDividend && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">수량</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => handleQuantityOrPrice("quantity", e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">단가</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.price}
                  onChange={(e) => handleQuantityOrPrice("price", e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* ── 금액 / 수수료 ── */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                금액
                {!isDividend && (
                  <span className="ml-0.5 text-[10px] text-muted-foreground">(자동)</span>
                )}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={isDividend ? "배당금액" : "자동계산"}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                수수료
                <span className="ml-0.5 text-[10px] text-muted-foreground">(선택)</span>
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
                placeholder="0"
                className={inputClass}
              />
            </div>
          </div>

          {/* ── 섹터 (Short-term 계좌 전용, showSectorField=true일 때만 표시) ── */}
          {showSectorField && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">
                섹터
                <span className="ml-0.5 text-[10px] text-muted-foreground">(선택)</span>
              </label>
              <input
                type="text"
                value={form.sector}
                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                placeholder="예: 반도체, IT, 금융..."
                className={inputClass}
              />
            </div>
          )}

          {/* ── 메모 (선택) ── */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">
              메모
              <span className="ml-0.5 text-[10px] text-muted-foreground">(선택)</span>
            </label>
            <input
              type="text"
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder="메모 입력..."
              className={inputClass}
            />
          </div>

          {/* ── 제출 버튼 ── */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            {isEditMode ? "수정 완료" : "추가"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
