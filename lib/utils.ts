import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 종목코드 → 네이버 금융 URL
 * KR 판별: 길이 6자리 + 숫자 1개 이상 (순수숫자·영숫자 혼합 모두 포함)
 *   예) 005930, 0023A0, 069500 → 국내
 *       TSLA, AAPL, SPY       → 해외
 */
export function naverStockUrl(stockCode: string): string {
  const isKr = stockCode.length === 6 && /[0-9]/.test(stockCode);
  return isKr
    ? `https://stock.naver.com/domestic/stock/${stockCode}/price`
    : `https://finance.naver.com/world/sise.nhn?symbol=${stockCode}`;
}
