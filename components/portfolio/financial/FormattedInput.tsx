"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";

/** raw 숫자 문자열 → 콤마 포맷 문자열 */
export function toFormatted(raw: string, isUsd: boolean): string {
  if (!raw || raw === "0") return "";
  const num = isUsd ? parseFloat(raw) : parseInt(raw, 10);
  if (isNaN(num) || num === 0) return "";
  return isUsd
    ? num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : num.toLocaleString("ko-KR");
}

function digitsBefore(str: string, pos: number): number {
  return str.slice(0, pos).replace(/[^0-9]/g, "").length;
}

function posAfterNthDigit(str: string, n: number): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (/[0-9]/.test(str[i])) {
      count++;
      if (count === n) return i + 1;
    }
  }
  return str.length;
}

/**
 * 숫자 입력 필드 — 타이핑하면서 실시간 콤마 포맷 적용
 * - value: raw 숫자 문자열 (콤마 없음)
 * - onChange: raw 문자열 반환
 * - isUsd: true면 소수점 2자리까지 허용 (en-US 포맷)
 */
export function FormattedInput({
  value,
  onChange,
  isUsd = false,
  className = "",
  placeholder = "0",
}: {
  value: string;
  onChange: (raw: string) => void;
  isUsd?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const oldFormatted = el.value;
    const cursorPos = el.selectionStart ?? oldFormatted.length;

    const raw = isUsd
      ? e.target.value.replace(/[^0-9.]/g, "")
      : e.target.value.replace(/[^0-9]/g, "");

    const digitsBeforeCursor = digitsBefore(oldFormatted, cursorPos);
    const newFormatted = toFormatted(raw, isUsd);
    const newCursor = raw ? posAfterNthDigit(newFormatted, digitsBeforeCursor) : 0;

    onChange(raw);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode={isUsd ? "decimal" : "numeric"}
      value={toFormatted(value, isUsd)}
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={(e) => setTimeout(() => e.target.select(), 0)}
      className={`h-7 text-xs ${className}`}
    />
  );
}
