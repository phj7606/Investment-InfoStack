"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";

/** raw 숫자 문자열 → 콤마 포맷 문자열 */
export function toFormatted(raw: string, isUsd: boolean): string {
  if (!raw || raw === "0") return "";

  if (isUsd) {
    // 소수점 입력 중간 상태 보존 — parseFloat은 trailing dot·zero를 제거하므로 직접 처리
    const hasTrailingDot = raw.endsWith(".");
    const decimalMatch = raw.match(/\.(\d+)$/);
    const rawDecimalStr = decimalMatch ? decimalMatch[1] : "";

    const num = parseFloat(raw);
    if (isNaN(num)) return "";
    // 0.xx 형태는 유효 — 소수점이나 소수부 있으면 통과
    if (num === 0 && !hasTrailingDot && !rawDecimalStr) return "";

    // 정수부만 콤마 포맷 (Math.trunc으로 소수부 분리)
    const intFormatted = Math.trunc(Math.abs(num)).toLocaleString("en-US");

    if (hasTrailingDot) return intFormatted + ".";
    if (rawDecimalStr) {
      // 최대 2자리, trailing zero 그대로 유지 (14.50 → "14.50")
      return intFormatted + "." + rawDecimalStr.slice(0, 2);
    }
    return intFormatted;
  }

  const num = parseInt(raw, 10);
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("ko-KR");
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

    // USD: 숫자·소수점만 허용, 소수점 2개 이상 입력 방지
    const raw = isUsd
      ? e.target.value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d{0,2}).*/, "$1")
      : e.target.value.replace(/[^0-9]/g, "");

    const digitsBeforeCursor = digitsBefore(oldFormatted, cursorPos);
    const newFormatted = toFormatted(raw, isUsd);
    let newCursor = raw ? posAfterNthDigit(newFormatted, digitsBeforeCursor) : 0;

    // USD 소수점 입력 시 커서가 "." 앞에 멈추지 않고 뒤로 이동하도록 보정
    if (isUsd && newFormatted[newCursor] === ".") {
      newCursor += 1;
    }

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
