import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 미국 종목 네이버 심볼 매핑 테이블
 *
 * 네이버 AC API (ac.stock.naver.com/ac?q={ticker}&target=stock,worldstock) 로
 * 조회한 reutersCode / url 경로를 정적 테이블로 관리.
 *
 * type : 'stock' | 'etf' — /worldstock/{type}/{reutersCode}/price 경로에 사용
 * reutersCode: 거래소 suffix 포함 심볼 (.O=NASDAQ, .K=NYSE/NYSE Arca, .N=NYSE)
 *
 * 신규 종목 추가 시 네이버 AC API로 확인 후 이 테이블에 추가할 것.
 */
const US_NAVER_SYMBOLS: Record<string, { type: "stock" | "etf"; reutersCode: string }> = {
  // ─── 개별 주식 ───
  AAPL:  { type: "stock", reutersCode: "AAPL.O" },   // Apple (NASDAQ)
  AVGO:  { type: "stock", reutersCode: "AVGO.O" },   // Broadcom (NASDAQ)
  GOOGL: { type: "stock", reutersCode: "GOOGL.O" },  // Alphabet (NASDAQ)
  META:  { type: "stock", reutersCode: "META.O" },   // Meta (NASDAQ)
  MSFT:  { type: "stock", reutersCode: "MSFT.O" },   // Microsoft (NASDAQ)
  NVDA:  { type: "stock", reutersCode: "NVDA.O" },   // NVIDIA (NASDAQ)
  PLTR:  { type: "stock", reutersCode: "PLTR.O" },   // Palantir (NASDAQ)
  TSLA:  { type: "stock", reutersCode: "TSLA.O" },   // Tesla (NASDAQ)
  AMZN:  { type: "stock", reutersCode: "AMZN.O" },   // Amazon (NASDAQ)
  CRCL:  { type: "stock", reutersCode: "CRCL.K" },   // Circle Internet (NYSE)

  // ─── ETF ───
  COPX:  { type: "etf", reutersCode: "COPX.K" },    // Global X Copper Miners (NYSE Arca)
  SOXX:  { type: "etf", reutersCode: "SOXX.O" },    // iShares Semiconductor (NASDAQ)
  GRID:  { type: "etf", reutersCode: "GRID.O" },    // First Trust Smart Grid (NASDAQ)
  SPY:   { type: "etf", reutersCode: "SPY.K" },     // SPDR S&P 500 (NYSE Arca)
  QQQ:   { type: "etf", reutersCode: "QQQ.O" },     // Invesco QQQ (NASDAQ)
  GLD:   { type: "etf", reutersCode: "GLD.K" },     // SPDR Gold (NYSE Arca)
};

/**
 * 종목코드 → 네이버 금융 URL
 *
 * KR 판별: 길이 6자리 + 숫자 1개 이상 (순수숫자·영숫자 혼합 모두 포함)
 *   예) 005930, 0023A0, 069500 → 국내 domestic URL
 *       TSLA, AAPL, COPX      → 해외 worldstock URL
 *
 * 미국 종목: US_NAVER_SYMBOLS 테이블 조회 → 미매핑 종목은 Naver 검색으로 폴백
 */
export function naverStockUrl(stockCode: string): string {
  // KR 종목 판별 (6자리 + 숫자 포함)
  const isKr = stockCode.length === 6 && /[0-9]/.test(stockCode);
  if (isKr) {
    return `https://stock.naver.com/domestic/stock/${stockCode}/price`;
  }

  // 미국 종목: 정적 매핑 테이블에서 조회
  const mapped = US_NAVER_SYMBOLS[stockCode.toUpperCase()];
  if (mapped) {
    return `https://stock.naver.com/worldstock/${mapped.type}/${mapped.reutersCode}/price`;
  }

  // 매핑되지 않은 해외 종목: 네이버 통합검색으로 폴백
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(stockCode)}+주가`;
}
