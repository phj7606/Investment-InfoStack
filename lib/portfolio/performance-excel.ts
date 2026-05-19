/**
 * FS 2026.xlsx "Stock Investment" 시트 파서
 *
 * 역할: Jan~Apr 2026 포트폴리오 성과 데이터를 엑셀에서 추출
 *
 * 배경:
 * - 2026년 Jan~Apr 동안 매도 완료된 종목들은 longterm-transactions.json에서 삭제됨
 * - 따라서 해당 기간 성과를 정확히 재현하려면 엑셀이 유일한 소스
 * - May 2026부터는 longterm-transactions.json 기반 동적 계산으로 전환
 *
 * 엑셀 구조 (0-indexed 컬럼):
 *   Col 0: 종목명, Col 1: Ticker, Col 2: Sector, Col 3: Account
 *   Col 14: Dec 2025 Balance
 *   Jan: 18~26, Feb: 27~35, Mar: 36~44, Apr: 45~53
 *   각 월 오프셋: +0=Principal, +1=Bid, +2=AskBV, +3=FixedPL, +4=Balance, +5=Tax, +6=CumPL, +7=Cum%, +8=MoM%
 *
 * 계좌 구조 (col 3):
 *   KR: 4802 (개별주식), 1635 (ETF), 1402 (추가 계좌)
 *   US: 4802 (개별주식), 1635 (ETF)
 */

import fs from "fs";
import * as XLSX from "xlsx";
import type { PerformanceMonthPoint, StockMonthPerformance } from "@/types/portfolio";

// ─────────────────────────────────────────
// 상수 정의
// ─────────────────────────────────────────

const EXCEL_FILE_PATH =
  "/Users/mac/Library/CloudStorage/OneDrive-Personal/I Investment/I-1 Financial Statement/FS 2026.xlsx";

const SHEET_NAME = "Stock Investment";

/** Dec 2025 Balance 컬럼 (단일, 이전 달 잔고 기준점) */
const COL_DEC_2025_BALANCE = 14;

/** 계좌번호 컬럼 */
const COL_ACCOUNT = 3;

/**
 * 각 월의 첫 번째 컬럼 인덱스
 *
 * Jan~Apr만 엑셀에서 파싱 — May+는 longterm-transactions.json 기반 API 계산
 * (May 이후 매도된 종목들이 엑셀에 0잔고로 기재되어 오파싱 방지)
 */
const MONTH_START_COLS: Record<string, number> = {
  "2026-01": 18,
  "2026-02": 27,
  "2026-03": 36,
  "2026-04": 45,
};

/** 각 월 컬럼 내 오프셋 */
const OFFSET = {
  PRINCIPAL: 0,  // 잔여원금
  BID:       1,  // 신규매수 금액 (Bid)
  ASK_BV:    2,  // 매도장부가 (AskBV = 매도수량 × 매입평균단가)
  FIXED_PL:  3,  // 실현손익 (FixedPL)
  BALANCE:   4,  // 월말 잔고
  TAX:       5,  // 세금
  CUM_PL:    6,  // 누적 손익
  CUM_PCT:   7,  // 누적 수익률
  MOM_PCT:   8,  // 전월 대비 수익률
};

/** KR 종목 행 범위 (0-indexed) — 엑셀 row 4~33 */
const KR_STOCK_ROW_START = 3;
const KR_STOCK_ROW_END   = 32;

/** KR Total 행 (0-indexed) — 엑셀 row 36 */
const KR_TOTAL_ROW = 35;

/** US 종목 행 범위 (0-indexed) — 엑셀 row 51~66 */
const US_STOCK_ROW_START = 50;
const US_STOCK_ROW_END   = 65;

/** US Total 행 (0-indexed) — 엑셀 row 67 */
const US_TOTAL_ROW = 66;

// ─────────────────────────────────────────
// 내부 타입 (집계 계산용)
// ─────────────────────────────────────────

/** 종목의 특정 월 원시 데이터 (계좌별 집계를 위해 내부적으로 사용) */
interface RawMonthData {
  period: string;
  principal: number; // 잔여원금
  bid:       number; // 신규매수
  askBV:     number; // 매도장부가
  fixedPL:   number; // 실현손익
  balance:   number; // 월말 잔고
  tax:       number; // 세금
}

/** 엑셀에서 파싱한 종목 내부 표현 */
interface StockRaw {
  stockName: string;
  ticker:    string;
  market:    "KR" | "US";
  accountNo: string;
  decBalance: number;     // Dec 2025 잔고
  rawMonths:  RawMonthData[];
}

// ─────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────

function toNum(cell: unknown): number {
  if (typeof cell === "number") return cell;
  if (typeof cell === "string") {
    const n = parseFloat(cell.replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function readSheet(): unknown[][] {
  if (!fs.existsSync(EXCEL_FILE_PATH)) {
    throw new Error(`엑셀 파일을 찾을 수 없습니다: ${EXCEL_FILE_PATH}`);
  }

  const buffer = fs.readFileSync(EXCEL_FILE_PATH);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`시트를 찾을 수 없습니다: ${SHEET_NAME}`);
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: undefined,
  });
}

// ─────────────────────────────────────────
// 핵심 계산 함수
// ─────────────────────────────────────────

/**
 * 원시 월별 데이터 배열(같은 계좌)로 PerformanceMonthPoint[] 계산
 *
 * 집계 공식:
 *   MoM% = (Σbalance - Σtax - (전월잔고 + Σbid - ΣaskBV) + ΣfixedPL)
 *          / (전월잔고 + Σbid)
 *   Cum% = (Σbalance - Σprincipal + 누적ΣfixedPL - 누적Σtax)
 *          / (Σprincipal + 누적ΣaskBV)
 */
function buildMonthlyFromRaw(
  stocksInAccount: StockRaw[],
  periods: string[]
): PerformanceMonthPoint[] {
  // Dec 2025 잔고 합산 (전월잔고 초기값)
  const decBalance = stocksInAccount.reduce((s, st) => s + st.decBalance, 0);
  let prevBalance = decBalance;

  // 누적 변수 (Cum% 분자/분모 계산용)
  let cumulativeFixedPL = 0;
  let cumulativeAskBV   = 0;
  let cumulativeTax     = 0;

  const result: PerformanceMonthPoint[] = [];

  for (const period of periods) {
    // 해당 기간 종목들의 원시 데이터 합산
    let balance   = 0;
    let bid       = 0;
    let askBV     = 0;
    let fixedPL   = 0;
    let tax       = 0;
    let principal = 0;
    let hasData   = false;

    for (const stock of stocksInAccount) {
      const raw = stock.rawMonths.find((m) => m.period === period);
      if (!raw) continue;

      // 데이터가 있는 종목만 포함 (잔고 or 실현손익 or 잔여원금)
      if (raw.balance > 0 || raw.fixedPL !== 0 || raw.principal > 0 || raw.bid > 0) {
        balance   += raw.balance;
        bid       += raw.bid;
        askBV     += raw.askBV;
        fixedPL   += raw.fixedPL;
        tax       += raw.tax;
        principal += raw.principal;
        hasData    = true;
      }
    }

    if (!hasData) continue;

    // 누적값 갱신
    cumulativeFixedPL += fixedPL;
    cumulativeAskBV   += askBV;
    cumulativeTax     += tax;

    // MoM% 계산
    const denomMoM = prevBalance + bid;
    const momPct = denomMoM > 0
      ? ((balance - tax - (prevBalance + bid - askBV) + fixedPL) / denomMoM) * 100
      : 0;

    // Cum% 계산
    // cumPL = 당월잔고 - 잔여원금 + 누적실현손익 - 누적세금
    // Cum% = cumPL / (잔여원금 + 누적매도장부가)
    const cumPL   = balance - principal + cumulativeFixedPL - cumulativeTax;
    const denomCum = principal + cumulativeAskBV;
    const cumPct  = denomCum > 0 ? (cumPL / denomCum) * 100 : 0;

    result.push({
      period,
      balance:  Math.round(balance),
      momPct:   Math.round(momPct * 100) / 100,
      cumPL:    Math.round(cumPL),
      cumPct:   Math.round(cumPct * 100) / 100,
      source:   "excel",
    });

    prevBalance = balance > 0 ? balance : prevBalance;
  }

  return result;
}

/**
 * 종목 행에서 원시 월별 데이터 추출
 */
function extractStockRaw(
  row: unknown[],
  market: "KR" | "US",
  periods: string[]
): StockRaw | null {
  const stockName = String(row[0] ?? "").trim();
  if (!stockName || stockName === "Total") return null;

  const ticker   = market === "KR" ? String(row[1] ?? "").trim() : stockName;
  const accountNo = String(toNum(row[COL_ACCOUNT]) || "").trim() || "unknown";
  const decBalance = toNum(row[COL_DEC_2025_BALANCE]);

  const rawMonths: RawMonthData[] = [];
  let hasAnyData = false;

  for (const period of periods) {
    const startCol = MONTH_START_COLS[period];
    const principal = toNum(row[startCol + OFFSET.PRINCIPAL]);
    const bid       = toNum(row[startCol + OFFSET.BID]);
    const askBV     = toNum(row[startCol + OFFSET.ASK_BV]);
    const fixedPL   = toNum(row[startCol + OFFSET.FIXED_PL]);
    const balance   = toNum(row[startCol + OFFSET.BALANCE]);
    const tax       = toNum(row[startCol + OFFSET.TAX]);

    if (balance > 0 || fixedPL !== 0 || principal > 0 || bid > 0) {
      rawMonths.push({ period, principal, bid, askBV, fixedPL, balance, tax });
      hasAnyData = true;
    }
  }

  if (!hasAnyData) return null;

  return { stockName, ticker, market, accountNo, decBalance, rawMonths };
}

/**
 * StockRaw → StockMonthPerformance 변환
 * (엑셀에서 직접 읽은 MoM%/Cum% 사용 — Total 행과 동일한 검증값)
 */
function toStockMonthPerformance(
  raw: StockRaw,
  row: unknown[]
): StockMonthPerformance {
  const periods = Object.keys(MONTH_START_COLS).sort();
  const months: PerformanceMonthPoint[] = [];
  let lastBalance = 0;

  for (const period of periods) {
    const startCol = MONTH_START_COLS[period];
    const rawMonth = raw.rawMonths.find((m) => m.period === period);
    if (!rawMonth) continue;

    // 엑셀에서 직접 읽은 MoM%/Cum% (소수 → %)
    const momPct = toNum(row[startCol + OFFSET.MOM_PCT]) * 100;
    const cumPct = toNum(row[startCol + OFFSET.CUM_PCT]) * 100;
    const cumPL  = toNum(row[startCol + OFFSET.CUM_PL]);

    months.push({
      period,
      balance: rawMonth.balance,
      momPct:  Math.round(momPct * 100) / 100,
      cumPL:   Math.round(cumPL),
      cumPct:  Math.round(cumPct * 100) / 100,
      source:  "excel",
    });

    lastBalance = rawMonth.balance;
  }

  return {
    stockName:   raw.stockName,
    ticker:      raw.ticker,
    market:      raw.market,
    accountNo:   raw.accountNo,
    months,
    fullyExited: lastBalance === 0,
  };
}

// ─────────────────────────────────────────
// 공개 API
// ─────────────────────────────────────────

export interface ExcelPerformanceData {
  /** KR 포트폴리오 월별 합산 성과 (전체) */
  krMonths: PerformanceMonthPoint[];
  /** KR 계좌별 월별 성과 */
  krByAccount: Record<string, PerformanceMonthPoint[]>;
  /** US 포트폴리오 월별 합산 성과 (전체) */
  usMonths: PerformanceMonthPoint[];
  /** US 계좌별 월별 성과 */
  usByAccount: Record<string, PerformanceMonthPoint[]>;
  /** KR 종목별 성과 (accountNo 포함) */
  krStocks: StockMonthPerformance[];
  /** US 종목별 성과 (accountNo 포함) */
  usStocks: StockMonthPerformance[];
  /** KR Dec 2025 잔고 (May+ MoM% 계산 기준) */
  krDecBalance: number;
  /** US Dec 2025 잔고 */
  usDecBalance: number;
  /** KR 계좌별 Dec 2025 잔고 */
  krDecByAccount: Record<string, number>;
  /** US 계좌별 Dec 2025 잔고 */
  usDecByAccount: Record<string, number>;
}

/**
 * "Stock Investment" 시트에서 Jan~Apr 성과 데이터 전체 추출
 *
 * Total 행: KR/US 전체 합산 성과 (검증된 엑셀 값 직접 사용)
 * 개별 종목: 계좌별 집계를 위해 원시 데이터 재계산
 */
export function parseStockInvestmentSheet(): ExcelPerformanceData {
  const rows  = readSheet();
  const periods = Object.keys(MONTH_START_COLS).sort();

  // ── KR/US Total 행 → 전체 합산 성과 ──
  const krTotalRow = rows[KR_TOTAL_ROW] ?? [];
  const usTotalRow = rows[US_TOTAL_ROW] ?? [];
  const krDecBalance = toNum(krTotalRow[COL_DEC_2025_BALANCE]);
  const usDecBalance = toNum(usTotalRow[COL_DEC_2025_BALANCE]);

  // Total 행에서 엑셀 검증값 직접 읽기 (buildMonthlyFromRaw 대신 사용)
  const krMonths = buildTotalMonths(krTotalRow, krDecBalance, periods);
  const usMonths = buildTotalMonths(usTotalRow, usDecBalance, periods);

  // ── 개별 종목 원시 데이터 파싱 ──
  const krRaws = parseStockRaws(rows, KR_STOCK_ROW_START, KR_STOCK_ROW_END, "KR", periods);
  const usRaws = parseStockRaws(rows, US_STOCK_ROW_START, US_STOCK_ROW_END, "US", periods);

  // ── StockMonthPerformance 변환 (종목 테이블용) ──
  const krStocks = krRaws.map((raw, i) =>
    toStockMonthPerformance(raw, rows[KR_STOCK_ROW_START + i] ?? [])
  );
  const usStocks = usRaws.map((raw, i) =>
    toStockMonthPerformance(raw, rows[US_STOCK_ROW_START + i] ?? [])
  );

  // ── 계좌별 월별 성과 집계 ──
  const krByAccount = buildByAccount(krRaws, periods);
  const usByAccount = buildByAccount(usRaws, periods);

  // ── 계좌별 Dec 2025 잔고 ──
  const krDecByAccount = buildDecByAccount(krRaws);
  const usDecByAccount = buildDecByAccount(usRaws);

  return {
    krMonths,
    krByAccount,
    usMonths,
    usByAccount,
    krStocks,
    usStocks,
    krDecBalance,
    usDecBalance,
    krDecByAccount,
    usDecByAccount,
  };
}

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

/**
 * Total 행에서 엑셀 검증값(MoM%, Cum%)을 직접 읽어 PerformanceMonthPoint[] 반환
 *
 * Total 행의 값은 엑셀 수식으로 계산된 정확한 값 — 별도 재계산 불필요
 */
function buildTotalMonths(
  totalRow: unknown[],
  decBalance: number,
  periods: string[]
): PerformanceMonthPoint[] {
  const result: PerformanceMonthPoint[] = [];
  let prevBalance = decBalance;

  for (const period of periods) {
    const startCol = MONTH_START_COLS[period];
    const balance  = toNum(totalRow[startCol + OFFSET.BALANCE]);
    const fixedPL  = toNum(totalRow[startCol + OFFSET.FIXED_PL]);
    const cumPL    = toNum(totalRow[startCol + OFFSET.CUM_PL]);
    const momPct   = toNum(totalRow[startCol + OFFSET.MOM_PCT]) * 100;
    const cumPct   = toNum(totalRow[startCol + OFFSET.CUM_PCT]) * 100;

    if (balance > 0 || fixedPL !== 0) {
      result.push({
        period,
        balance:  Math.round(balance),
        momPct:   Math.round(momPct * 100) / 100,
        cumPL:    Math.round(cumPL),
        cumPct:   Math.round(cumPct * 100) / 100,
        source:   "excel",
      });
      prevBalance = balance > 0 ? balance : prevBalance;
    }
  }

  return result;
}

/**
 * 종목 행 범위에서 StockRaw[] 파싱
 */
function parseStockRaws(
  rows: unknown[][],
  rowStart: number,
  rowEnd: number,
  market: "KR" | "US",
  periods: string[]
): StockRaw[] {
  const result: StockRaw[] = [];

  for (let i = rowStart; i <= rowEnd && i < rows.length; i++) {
    const row = rows[i] ?? [];
    const raw = extractStockRaw(row, market, periods);
    if (raw) result.push(raw);
  }

  return result;
}

/**
 * StockRaw[] → 계좌별 PerformanceMonthPoint[] 집계
 */
function buildByAccount(
  raws: StockRaw[],
  periods: string[]
): Record<string, PerformanceMonthPoint[]> {
  // 계좌별 종목 그룹화
  const groups = new Map<string, StockRaw[]>();
  for (const raw of raws) {
    const list = groups.get(raw.accountNo) ?? [];
    list.push(raw);
    groups.set(raw.accountNo, list);
  }

  const result: Record<string, PerformanceMonthPoint[]> = {};
  for (const [accountNo, stocksInAccount] of groups) {
    result[accountNo] = buildMonthlyFromRaw(stocksInAccount, periods);
  }
  return result;
}

/**
 * 계좌별 Dec 2025 잔고 합산
 */
function buildDecByAccount(raws: StockRaw[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const raw of raws) {
    result[raw.accountNo] = (result[raw.accountNo] ?? 0) + raw.decBalance;
  }
  return result;
}
