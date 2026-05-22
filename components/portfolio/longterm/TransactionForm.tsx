"use client";

// 중장기 투자 거래 추가/편집 다이얼로그
// - shadcn Dialog 기반
// - initialTx 전달 시 편집 모드, 없으면 추가 모드
// - 시장(KR/US) 선택 시 통화(KRW/USD) 자동 결정
// - 수량 × 단가 → 금액 자동 계산
// - DIVIDEND 선택 시 수량/단가 유효성 검사 면제 (금액만 필요)

import { useState, useEffect } from "react";
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
  accountNo: "4802" | "1635" | "1402" | "8654";
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
  };
}

export function TransactionForm({ open, onOpenChange, initialTx, onSubmit }: TransactionFormProps) {
  const isEditMode = !!initialTx;

  const [form, setForm] = useState<FormState>(
    initialTx ? txToFormState(initialTx) : defaultForm
  );

  // 다이얼로그 열릴 때 폼 초기화 (편집이면 기존 값, 추가면 기본값)
  useEffect(() => {
    if (open) {
      setForm(initialTx ? txToFormState(initialTx) : defaultForm);
    }
  }, [open, initialTx]);

  // 수량 또는 단가 변경 시 금액 자동 계산
  function handleQuantityOrPrice(field: "quantity" | "price", value: string) {
    const next = { ...form, [field]: value };
    const qty = parseFloat(field === "quantity" ? value : form.quantity) || 0;
    const price = parseFloat(field === "price" ? value : form.price) || 0;
    // 금액이 비어 있거나 아직 수동 입력 안 했으면 자동 계산
    const autoAmount = qty > 0 && price > 0 ? String(Math.round(qty * price)) : "";
    setForm({ ...next, amount: autoAmount });
  }

  function handleMarketChange(market: "KR" | "US") {
    setForm({ ...form, market });
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
                <option value="4802">4802 Stock</option>
                <option value="1635">1635 ETF</option>
                <option value="1402">1402 Mixed</option>
                <option value="8654">8654 (펀드)</option>
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
                onChange={(e) => setForm({ ...form, stockCode: e.target.value })}
                placeholder="예: 005930"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground">종목명</label>
              <input
                type="text"
                value={form.stockName}
                onChange={(e) => setForm({ ...form, stockName: e.target.value })}
                placeholder="예: 삼성전자"
                className={inputClass}
              />
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
