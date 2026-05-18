/**
 * 포트폴리오 Excel Export / Import 유틸리티
 *
 * 클라이언트 전용 모듈 ("use client" 컴포넌트에서만 import)
 * xlsx(SheetJS) 라이브러리 사용
 *
 * 추세추종 시트 구성:
 *   1. 보유포지션  — KiwoomPosition[]
 *   2. 거래실적    — StockPerformance[]
 *   3. 성과요약    — PerformanceSummary 주요 지표
 *
 * 중장기 Export 시트 구성:
 *   1. 거래내역    — LongtermTransaction[]
 *   2. 보유포지션  — LongtermPosition[]
 *   3. 개별종목    — 종목별 BUY/SELL 이력 + 실현손익
 *   4. 월별성과    — 월별 손익 + 벤치마크 비교
 *   5. 성과요약    — KPI 지표
 *
 * 중장기 Import 컬럼 (Stock Trading / Fund Trading 시트):
 *   날짜 | 종목코드 | 종목명 | 매수매도 | 수량 | 단가 | 금액
 */

import * as XLSX from "xlsx";
import type {
  KiwoomPosition,
  StockPerformance,
  PerformanceSummary,
  LongtermTransaction,
  LongtermPosition,
} from "@/types/portfolio";

// ─────────────────────────────────────────
// Export
// ─────────────────────────────────────────

/** 보유 포지션 시트 행 정의 */
interface PositionRow {
  종목코드: string;
  종목명: string;
  보유수량: number;
  평균단가: number;
  현재가: number;
  평가금액: number;
  평가손익: number;
  "수익률(%)": number;
}

/** 거래실적 시트 행 정의 */
interface TradeRow {
  매도일: string;
  종목코드: string;
  종목명: string;
  보유일수: number;
  "손익(원)": number;
  "수익률(%)": number;
  결과: "WIN" | "LOSS";
}

/** 성과요약 시트 행 정의 */
interface SummaryRow {
  항목: string;
  값: string | number;
}

/**
 * 포트폴리오 데이터를 Excel 파일로 다운로드한다.
 *
 * @param positions - 보유 포지션 목록
 * @param performances - 거래실적 목록
 * @param summary - 성과 요약 (null 허용)
 * @param fileName - 저장 파일명 (기본: portfolio_YYYYMMDD.xlsx)
 */
export function exportPortfolioExcel(
  positions: KiwoomPosition[],
  performances: StockPerformance[],
  summary: PerformanceSummary | null,
  fileName?: string
): void {
  const wb = XLSX.utils.book_new();

  // ── 시트 1: 보유 포지션 ──
  const posRows: PositionRow[] = positions.map((p) => ({
    종목코드: p.stockCode,
    종목명: p.stockName,
    보유수량: p.quantity,
    평균단가: p.avgPrice,
    현재가: p.currentPrice,
    평가금액: p.evalAmount,
    평가손익: p.profitLoss,
    "수익률(%)": p.profitLossPct,
  }));
  const wsPos = XLSX.utils.json_to_sheet(posRows.length > 0 ? posRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsPos, "보유포지션");

  // ── 시트 2: 거래실적 ──
  const tradeRows: TradeRow[] = performances.map((p) => ({
    매도일: p.exitDate,
    종목코드: p.stockCode,
    종목명: p.stockName,
    보유일수: p.holdingDays,
    "손익(원)": p.profitLoss,
    "수익률(%)": p.profitLossPct,
    결과: p.result,
  }));
  const wsTrade = XLSX.utils.json_to_sheet(tradeRows.length > 0 ? tradeRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsTrade, "거래실적");

  // ── 시트 3: 성과요약 ──
  const summaryRows: SummaryRow[] = summary
    ? [
        { 항목: "총 거래 수", 값: summary.totalTrades },
        { 항목: "승리 횟수", 값: summary.winCount },
        { 항목: "손실 횟수", 값: summary.lossCount },
        { 항목: "승률 (%)", 값: Math.round(summary.winRate * 100 * 10) / 10 },
        {
          항목: "손익비 (PF)",
          값: summary.profitFactor === Infinity ? "∞" : Math.round(summary.profitFactor * 100) / 100,
        },
        { 항목: "기대값 EV (%)", 값: Math.round(summary.expectedValue * 100) / 100 },
        { 항목: "평균 수익률 (%)", 값: Math.round(summary.avgWinPct * 100) / 100 },
        { 항목: "평균 손실률 (%)", 값: Math.round(summary.avgLossPct * 100) / 100 },
        { 항목: "누적 손익 (원)", 값: summary.cumulativeProfitLoss },
        { 항목: "MDD (%)", 값: Math.round(summary.mdd * 100) / 100 },
        { 항목: "최대 연속 손실", 값: summary.maxConsecutiveLoss },
      ]
    : [{ 항목: "(데이터 없음)", 값: "" }];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "성과요약");

  // 파일 저장
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, fileName ?? `portfolio_${date}.xlsx`);
}

// ─────────────────────────────────────────
// Import
// ─────────────────────────────────────────

export interface ImportResult {
  positions: KiwoomPosition[];
  performances: StockPerformance[];
}

/**
 * Excel 파일을 읽어 보유 포지션 + 거래실적을 파싱한다.
 * 시트명 "보유포지션" / "거래실적"을 기준으로 읽는다.
 * 인식하지 못하는 컬럼은 무시하고 빈 행은 건너뛴다.
 *
 * @param file - 사용자가 업로드한 File 객체
 */
export async function importPortfolioExcel(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // ── 보유 포지션 파싱 ──
  const positions: KiwoomPosition[] = [];
  const wsPos = wb.Sheets["보유포지션"];
  if (wsPos) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsPos);
    for (const row of rows) {
      const stockCode = String(row["종목코드"] ?? "").trim();
      if (!stockCode) continue;
      positions.push({
        stockCode,
        stockName: String(row["종목명"] ?? ""),
        quantity: Number(row["보유수량"]) || 0,
        avgPrice: Number(row["평균단가"]) || 0,
        currentPrice: Number(row["현재가"]) || 0,
        evalAmount: Number(row["평가금액"]) || 0,
        profitLoss: Number(row["평가손익"]) || 0,
        profitLossPct: Number(row["수익률(%)"]) || 0,
      });
    }
  }

  // ── 거래실적 파싱 ──
  const performances: StockPerformance[] = [];
  const wsTrade = wb.Sheets["거래실적"];
  if (wsTrade) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wsTrade);
    for (const row of rows) {
      const stockCode = String(row["종목코드"] ?? "").trim();
      if (!stockCode) continue;
      const profitLoss = Number(row["손익(원)"]) || 0;
      const profitLossPct = Number(row["수익률(%)"]) || 0;
      performances.push({
        stockCode,
        stockName: String(row["종목명"] ?? ""),
        exitDate: String(row["매도일"] ?? ""),
        holdingDays: Number(row["보유일수"]) || 0,
        profitLoss,
        profitLossPct,
        result: profitLossPct > 0 ? "WIN" : "LOSS",
      });
    }
  }

  return { positions, performances };
}

// ─────────────────────────────────────────
// 중장기 투자 계좌 Export
// ─────────────────────────────────────────

interface LongtermTransactionRow {
  날짜: string;
  계좌: string;
  시장: string;
  종류: string;
  거래유형: string;
  종목코드: string;
  종목명: string;
  수량: number;
  단가: number;
  금액: number;
  통화: string;
  실현손익: number | string;
  "실현수익률(%)": number | string;
  메모: string;
}

interface LongtermPositionRow {
  종목코드: string;
  종목명: string;
  시장: string;
  계좌: string;
  보유수량: number;
  평균단가: number;
  현재가: number | string;
  평가금액: number | string;
  평가손익: number | string;
  "평가수익률(%)": number | string;
  누적실현손익: number;
  통화: string;
}

interface MonthlyPLRow {
  연도: number;
  월: number;
  "매도손익": number;
  통화: string;
  "KOSPI수익률(%)": number | string;
  "S&P500수익률(%)": number | string;
  "내수익률(%)": number | string;
  "알파(%)": number | string;
}

/**
 * 중장기 투자 계좌 데이터를 Excel로 내보낸다 (5개 시트).
 *
 * @param transactions - 전체 거래 내역
 * @param positions    - 현재 보유 포지션
 * @param monthlyPL    - 월별 실현손익
 * @param benchmarkData - 벤치마크 수익률 (KOSPI/S&P500)
 * @param fileName     - 파일명 (기본: portfolio_longterm_YYYYMMDD.xlsx)
 */
export function exportLongtermExcel(
  transactions: LongtermTransaction[],
  positions: LongtermPosition[],
  monthlyPL: { year: number; month: number; pl: number; currency: "KRW" | "USD" }[],
  benchmarkData: { year: number; month: number; kospiReturn?: number; sp500Return?: number }[],
  fileName?: string
): void {
  const wb = XLSX.utils.book_new();

  // ── 시트 1: 거래내역 ──
  const txRows: LongtermTransactionRow[] = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => ({
      날짜: t.date,
      계좌: t.accountNo,
      시장: t.market,
      종류: t.assetType,
      거래유형: t.tradeType,
      종목코드: t.stockCode,
      종목명: t.stockName,
      수량: t.quantity,
      단가: t.price,
      금액: t.amount,
      통화: t.currency,
      실현손익: t.realizedPL ?? "",
      "실현수익률(%)": t.realizedPLPct ?? "",
      메모: t.memo ?? "",
    }));
  const wsTx = XLSX.utils.json_to_sheet(txRows.length > 0 ? txRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsTx, "거래내역");

  // ── 시트 2: 보유포지션 ──
  const posRows: LongtermPositionRow[] = positions.map((p) => ({
    종목코드: p.stockCode,
    종목명: p.stockName,
    시장: p.market,
    계좌: p.accountNo,
    보유수량: p.quantity,
    평균단가: p.avgCost,
    현재가: p.currentPrice ?? "",
    평가금액: p.currentPrice ? p.evalAmount : "",
    평가손익: p.currentPrice ? p.evalPL : "",
    "평가수익률(%)": p.currentPrice ? p.evalPLPct : "",
    누적실현손익: p.totalRealizedPL,
    통화: p.currency,
  }));
  const wsPos = XLSX.utils.json_to_sheet(posRows.length > 0 ? posRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsPos, "보유포지션");

  // ── 시트 3: 개별종목 (종목별 거래 이력 + 소계) ──
  const stockCodes = [...new Set(transactions.map((t) => t.stockCode))];
  const stockRows: Record<string, unknown>[] = [];
  for (const code of stockCodes) {
    const txsOfStock = transactions
      .filter((t) => t.stockCode === code)
      .sort((a, b) => a.date.localeCompare(b.date));
    const stockName = txsOfStock[0]?.stockName ?? code;
    const totalRealizedPL = txsOfStock
      .filter((t) => t.tradeType === "SELL")
      .reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);

    // 소계 헤더 행
    stockRows.push({ "": `▶ ${stockName} (${code})  누적 실현손익: ${totalRealizedPL.toLocaleString()}` });
    for (const t of txsOfStock) {
      stockRows.push({
        날짜: t.date,
        계좌: t.accountNo,
        거래유형: t.tradeType,
        수량: t.quantity,
        단가: t.price,
        금액: t.amount,
        실현손익: t.realizedPL ?? "",
        "실현수익률(%)": t.realizedPLPct ?? "",
        메모: t.memo ?? "",
      });
    }
    stockRows.push({}); // 빈 줄 구분
  }
  const wsStock = XLSX.utils.json_to_sheet(stockRows.length > 0 ? stockRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsStock, "개별종목");

  // ── 시트 4: 월별성과 ──
  const monthlyRows: MonthlyPLRow[] = monthlyPL.map((m) => {
    const bm = benchmarkData.find(
      (b) => b.year === m.year && b.month === m.month
    );
    // 내 수익률: 단순히 손익 / 해당 시점 투자금 (대략값 — 정확한 TWRR은 미구현)
    return {
      연도: m.year,
      월: m.month,
      매도손익: m.pl,
      통화: m.currency,
      "KOSPI수익률(%)": bm?.kospiReturn !== undefined ? Math.round(bm.kospiReturn * 100) / 100 : "",
      "S&P500수익률(%)": bm?.sp500Return !== undefined ? Math.round(bm.sp500Return * 100) / 100 : "",
      "내수익률(%)": "",    // 클라이언트에서 totalInvested 기준으로 계산
      "알파(%)": "",
    };
  });
  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows.length > 0 ? monthlyRows : [{}]);
  XLSX.utils.book_append_sheet(wb, wsMonthly, "월별성과");

  // ── 시트 5: 성과요약 ──
  const krPL = transactions
    .filter((t) => t.tradeType === "SELL" && t.currency === "KRW")
    .reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);
  const usPL = transactions
    .filter((t) => t.tradeType === "SELL" && t.currency === "USD")
    .reduce((sum, t) => sum + (t.realizedPL ?? 0), 0);
  const summaryRows = [
    { 항목: "총 거래 수 (KR)", 값: transactions.filter((t) => t.tradeType === "SELL" && t.currency === "KRW").length },
    { 항목: "총 거래 수 (US)", 값: transactions.filter((t) => t.tradeType === "SELL" && t.currency === "USD").length },
    { 항목: "누적 실현손익 (KRW)", 값: krPL },
    { 항목: "누적 실현손익 (USD)", 값: usPL },
    { 항목: "현재 보유 종목 수 (KR)", 값: positions.filter((p) => p.currency === "KRW").length },
    { 항목: "현재 보유 종목 수 (US)", 값: positions.filter((p) => p.currency === "USD").length },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, "성과요약");

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(wb, fileName ?? `portfolio_longterm_${date}.xlsx`);
}

// ─────────────────────────────────────────
// 중장기 투자 계좌 Import
// ─────────────────────────────────────────

export interface LongtermImportResult {
  transactions: LongtermTransaction[];
  duplicates: number;   // 중복으로 건너뛴 건수
}

/**
 * 중장기 투자 계좌 Excel 임포트 (Stock Trading / Fund Trading 시트)
 *
 * 컬럼 형식: 날짜 | 종목코드 | 종목명 | 매수매도 | 수량 | 단가 | 금액
 *
 * @param file        - 업로드한 File 객체
 * @param accountNo   - 계좌번호 (사용자가 UI에서 선택)
 * @param market      - "KR" | "US"
 * @param sheetType   - "Stock Trading" | "Fund Trading"
 * @param existingIds - 이미 저장된 거래 ID 집합 (중복 방지용 복합키)
 */
export async function importLongtermExcel(
  file: File,
  accountNo: "4802" | "1635" | "1402" | "8654",
  market: "KR" | "US",
  sheetType: "Stock Trading" | "Fund Trading",
  existingTxs: LongtermTransaction[] = []
): Promise<LongtermImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const ws = wb.Sheets[sheetType];
  if (!ws) {
    return { transactions: [], duplicates: 0 };
  }

  // 기존 거래의 중복 방지 키 집합 (날짜+종목코드+거래유형+수량)
  const existingKeys = new Set(
    existingTxs.map(
      (t) => `${t.date}::${t.stockCode}::${t.tradeType}::${t.quantity}`
    )
  );

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
  const transactions: LongtermTransaction[] = [];
  let duplicates = 0;

  const assetType = sheetType === "Fund Trading" ? "FUND" : "STOCK";
  const currency: "KRW" | "USD" = market === "KR" ? "KRW" : "USD";

  for (const row of rows) {
    // 날짜 파싱: Excel 날짜 숫자 또는 문자열 처리
    const rawDate = row["날짜"];
    let date = "";
    if (typeof rawDate === "number") {
      // Excel 날짜 시리얼 → JS Date
      const d = XLSX.SSF.parse_date_code(rawDate);
      date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    } else {
      const str = String(rawDate ?? "").trim();
      // YYYY.MM.DD 또는 YYYY/MM/DD → YYYY-MM-DD
      date = str.replace(/[./]/g, "-");
    }

    const stockCode = String(row["종목코드"] ?? "").trim();
    if (!stockCode || !date) continue;

    const tradeTypeRaw = String(row["매수매도"] ?? "").trim();
    const tradeType: "BUY" | "SELL" =
      tradeTypeRaw === "매수" || tradeTypeRaw === "BUY" ? "BUY" : "SELL";

    const quantity = Number(row["수량"]) || 0;
    if (quantity <= 0) continue;

    const price = Number(row["단가"]) || 0;
    const amount = Number(row["금액"]) || price * quantity;

    // 중복 체크
    const key = `${date}::${stockCode}::${tradeType}::${quantity}`;
    if (existingKeys.has(key)) {
      duplicates++;
      continue;
    }
    existingKeys.add(key);

    transactions.push({
      id: crypto.randomUUID(),
      date,
      accountNo,
      market,
      assetType,
      tradeType,
      stockCode,
      stockName: String(row["종목명"] ?? stockCode),
      quantity,
      price,
      currency,
      amount,
    });
  }

  return { transactions, duplicates };
}

// ─────────────────────────────────────────
// FS 2026.xlsx 계층 구조 임포트 (parseHierarchicalExcel)
// ─────────────────────────────────────────

/**
 * Stock Investment 시트에서 읽어온 종목 메타 정보
 * 종목명 → { ticker, accountNo, market, assetType } lookup 맵 구성에 사용
 */
interface StockMeta {
  ticker: string;
  accountNo: "4802" | "1635" | "1402" | "8654";
  market: "KR" | "US";
  assetType: "STOCK" | "ETF" | "FUND";
}

/** parseHierarchicalExcel 반환 타입 */
export interface ParseHierarchicalResult {
  transactions: LongtermTransaction[];
  duplicates: number;
  stats: {
    krBuy: number;
    krSell: number;
    usBuy: number;
    usSell: number;
    dividend: number;
    byAccount: Record<string, number>;
  };
}

/**
 * Excel 시리얼 날짜 번호 → YYYY-MM-DD 문자열 변환
 * (1899-12-30 기준 offset)
 */
function excelSerialToDate(serial: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * 종목명/계좌번호가 없는 경우 이름 패턴으로 시장/자산유형 fallback 감지
 */
function detectMarketAndAssetType(
  name: string,
  sheetType: "Stock Trading" | "Fund Trading"
): { market: "KR" | "US"; assetType: "STOCK" | "ETF" | "FUND" } {
  // Fund Trading 시트는 항상 FUND
  if (sheetType === "Fund Trading") return { market: "KR", assetType: "FUND" };

  // KRX 종목코드(숫자만)는 항상 KR STOCK
  if (/^\d+$/.test(name.trim())) return { market: "KR", assetType: "STOCK" };

  // KR ETF 접두어 — US 패턴보다 먼저 확인
  // "KODEX200" 등이 /^[A-Z][A-Z0-9]*$/ 에 매칭되어 US로 오분류되는 것을 방지
  const isKRETF = /^(KODEX|SOL|TIGER|ACE|KoAct|HANARO|KBSTAR|ARIRANG|TIMEFOLIO)/i.test(name.trim());
  if (isKRETF) return { market: "KR", assetType: "ETF" };

  // US ticker: 영문 대문자로 시작하고 대문자+숫자만 구성
  const isUS = /^[A-Z][A-Z0-9]*$/.test(name.trim());
  if (isUS) return { market: "US", assetType: "STOCK" };

  return { market: "KR", assetType: "STOCK" };
}

/**
 * Stock Investment / Fund Investment 시트를 파싱하여 종목명 → StockMeta lookup 맵 반환
 *
 * 시트 컬럼 구조:
 *   A=Stocks(종목명), B=Ticker, C=Sector, D=Account
 * 헤더행(Row 2)과 소계행("Total") 제외
 */
function buildStockLookup(
  wb: XLSX.WorkBook
): Map<string, StockMeta> {
  const lookup = new Map<string, StockMeta>();

  // Stock Investment 시트에 주식·ETF·펀드(8654 계좌) 모두 포함됨
  const ws = wb.Sheets["Stock Investment"];
  if (!ws) return lookup;

  // sheet_to_json은 헤더 자동 추론이 어려우므로 header: 1 로 2D 배열로 읽기
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const stockName = String(row[0] ?? "").trim();  // A열
    const ticker    = String(row[1] ?? "").trim();  // B열
    const _sector   = String(row[2] ?? "").trim();  // C열
    const accountRaw = String(row[3] ?? "").trim(); // D열

    // 헤더행, 소계행, 빈 행 건너뜀
    if (!stockName || stockName === "Stocks" || stockName === "Total") continue;
    if (!accountRaw || accountRaw === "Account") continue;

    // 계좌번호 정규화
    const accountNo = (["4802", "1635", "1402", "8654"] as const).find(
      (a) => accountRaw === a
    );
    if (!accountNo) continue;

    // 시장/자산 유형 감지: ticker(숫자코드)가 아닌 stockName(한국어/영문명)으로 판별
    // ticker가 숫자코드인 KR 종목도 stockName으로 전달하면 KR STOCK으로 올바르게 분류됨
    const { market, assetType } = detectMarketAndAssetType(
      stockName,
      "Stock Trading"
    );

    // 계좌 기준 assetType 강제 보정
    // 8654 = 펀드 계좌(KR FUND), 1635 = ETF 계좌 (KR ETF 또는 US ETF 모두 포함)
    // ※ market은 이름 패턴 감지 결과를 그대로 사용 — 계좌 번호로 강제 변경하지 않음
    //   (1635에 COPX, GRID, SOXX 같은 US ETF와 KODEX200 같은 KR ETF가 공존)
    const finalAssetType: StockMeta["assetType"] =
      accountNo === "8654" ? "FUND" :
      accountNo === "1635" ? "ETF" :
      assetType;
    const finalMarket: StockMeta["market"] =
      accountNo === "8654" ? "KR" : market;

    const meta: StockMeta = {
      ticker: ticker || stockName,
      accountNo,
      market: finalMarket,
      assetType: finalAssetType,
    };

    // 원본 이름으로 저장
    lookup.set(stockName, meta);
    // 공백 정규화 버전도 저장 (Trading 시트 섹션명과 투자목록 시트 이름의 공백 차이 허용)
    // 예: "KODEX 미국빅테크10" vs "KODEX 미국빅테크 10"
    const normalized = stockName.replace(/\s+/g, "");
    if (normalized !== stockName) lookup.set(normalized, meta);
  }

  return lookup;
}

/**
 * FS 2026.xlsx의 계층 구조 시트(Stock Trading / Fund Trading)를 파싱하여
 * LongtermTransaction[] 로 변환한다.
 *
 * 파싱 로직:
 *  1. Stock Investment 시트에서 종목명 → { ticker, accountNo, market, assetType } lookup 구성
 *  2. 대상 시트를 행 순서로 스캔 (header: 1 모드)
 *  3. B열에만 값이 있으면 → 새 종목 섹션 시작
 *  4. C열이 날짜 시리얼(≥40000)이면 → 실제 거래 행
 *     - D='Bid'  → BUY
 *     - D='Ask'  → SELL
 *  5. D='Dividend' → DIVIDEND 거래 생성 (amount=H열, date=해당 섹션 마지막 거래일)
 *  6. C='Total' 또는 D in ['Balance','Fixed Profit/Loss','Profit/Loss'] → 건너뜀
 *
 * @param file       - 업로드한 File 객체 (FS 2026.xlsx)
 * @param existingTxs - 이미 저장된 거래 목록 (중복 방지용)
 */
export async function parseHierarchicalExcel(
  file: File,
  existingTxs: LongtermTransaction[] = []
): Promise<ParseHierarchicalResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // ── lookup 맵 구성 ──────────────────────────────────────
  const lookup = buildStockLookup(wb);

  // ── 중복 방지 키 집합 ────────────────────────────────────
  // DIVIDEND: date::stockCode::DIVIDEND::amount (price=0이라 구분 불가)
  // BUY/SELL: date::stockCode::tradeType::quantity::price
  // 파서 per-row 키 형식과 반드시 일치해야 재임포트 시 dedup이 작동함
  const existingKeys = new Set(
    existingTxs.map((t) =>
      t.tradeType === "DIVIDEND"
        ? `${t.date}::${t.stockCode}::DIVIDEND::${t.amount}`
        : `${t.date}::${t.stockCode}::${t.tradeType}::${t.quantity}::${t.price}`
    )
  );

  const transactions: LongtermTransaction[] = [];
  let duplicates = 0;

  // ── 통계 ────────────────────────────────────────────────
  const stats = {
    krBuy: 0, krSell: 0,
    usBuy: 0, usSell: 0,
    dividend: 0,
    byAccount: {} as Record<string, number>,
  };

  // ── Stock Trading 시트 파싱 ────────────────────────────
  {
    const ws = wb.Sheets["Stock Trading"];
    if (ws) {
      // 컬럼 구조: A=무시, B=종목명(섹션헤더), C=날짜시리얼, D=Bid/Ask, E=수량, F=단가, G=수수료, H=금액
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

      let currentMeta: StockMeta | null = null;
      let currentStockName = "";
      let currentRawName = "";
      let lastTxDate = "";

      for (const row of rows) {
        if (!Array.isArray(row)) continue;

        const colB = String(row[1] ?? "").trim(); // B열: 종목명(섹션헤더) or 빈칸
        const colC = row[2];                       // C열: 날짜 시리얼
        const colD = String(row[3] ?? "").trim(); // D열: Bid/Ask/Balance/...
        const colE = row[4];                       // E열: 수량
        const colF = row[5];                       // F열: 단가
        const colG = row[6];                       // G열: 수수료
        const colH = row[7];                       // H열: 거래금액

        const cStr = String(colC ?? "").trim();
        const isDataRow = typeof colC === "number" && colC >= 40000;
        const skipLabels = ["Balance", "Fixed Profit/Loss", "Profit/Loss", "Total"];

        if (cStr === "Total" || skipLabels.includes(colD)) continue;

        // DIVIDEND 처리
        if (colD === "Dividend" && currentMeta) {
          const dividendAmount = Number(colH) || 0;
          if (dividendAmount > 0 && lastTxDate) {
            const key = `${lastTxDate}::${currentStockName}::DIVIDEND::${dividendAmount}`;
            if (!existingKeys.has(key)) {
              existingKeys.add(key);
              transactions.push({
                id: crypto.randomUUID(), date: lastTxDate,
                accountNo: currentMeta.accountNo, market: currentMeta.market,
                assetType: currentMeta.assetType, tradeType: "DIVIDEND",
                stockCode: currentStockName, stockName: currentRawName,
                quantity: 1, price: 0,
                currency: currentMeta.market === "KR" ? "KRW" : "USD",
                amount: dividendAmount, memo: "배당 (Excel 합계)",
              });
              stats.dividend++;
              stats.byAccount[currentMeta.accountNo] = (stats.byAccount[currentMeta.accountNo] ?? 0) + 1;
            } else { duplicates++; }
          }
          continue;
        }

        // 섹션 헤더 감지: B열에 종목명, C·D열이 거래 데이터 아님
        const isKnownStock = colB
          ? (lookup.has(colB) || lookup.has(colB.replace(/\s+/g, "")))
          : false;
        const isTransactionLabel = colD === "Bid" || colD === "Ask" || colD === "Dividend";
        const isSectionHeader = colB && !isDataRow && !skipLabels.includes(colD) && !isTransactionLabel
          && (isKnownStock || (!cStr && !colD));

        if (isSectionHeader) {
          if (colB !== currentRawName) {
            lastTxDate = "";
            currentRawName = colB;
            const meta = lookup.get(colB) ?? lookup.get(colB.replace(/\s+/g, ""));
            if (meta) {
              currentMeta = meta;
              currentStockName = meta.ticker;
            } else {
              const detected = detectMarketAndAssetType(colB, "Stock Trading");
              currentMeta = { ticker: colB, accountNo: "4802", market: detected.market, assetType: detected.assetType };
              currentStockName = colB;
            }
          }
          continue;
        }

        if (!currentMeta) continue;

        const serial = Number(colC);
        if (!serial || serial < 40000) continue;
        if (colD !== "Bid" && colD !== "Ask") continue;

        const date = excelSerialToDate(serial);
        const tradeType: "BUY" | "SELL" = colD === "Bid" ? "BUY" : "SELL";
        const quantity = Number(colE) || 0;
        if (quantity <= 0) continue;

        const price = Number(colF) || 0;
        const fee = Number(colG) || undefined;
        const amount = Number(colH) || price * quantity;

        const key = `${date}::${currentStockName}::${tradeType}::${quantity}::${price}`;
        if (existingKeys.has(key)) { duplicates++; continue; }
        existingKeys.add(key);
        lastTxDate = date;

        transactions.push({
          id: crypto.randomUUID(), date,
          accountNo: currentMeta.accountNo, market: currentMeta.market,
          assetType: currentMeta.assetType, tradeType,
          stockCode: currentStockName, stockName: currentRawName,
          quantity, price,
          currency: currentMeta.market === "KR" ? "KRW" : "USD",
          amount, fee,
        });

        if (currentMeta.market === "KR") {
          tradeType === "BUY" ? stats.krBuy++ : stats.krSell++;
        } else {
          tradeType === "BUY" ? stats.usBuy++ : stats.usSell++;
        }
        stats.byAccount[currentMeta.accountNo] = (stats.byAccount[currentMeta.accountNo] ?? 0) + 1;
      }
    }
  }

  // ── Fund Trading 시트 파싱 ────────────────────────────
  // Stock Trading과 컬럼 구조가 다름:
  //   A=펀드명(섹션헤더), B=날짜시리얼, C=Bid/Ask, D=좌수, E=기준가(NAV), F=수수료, G=금액, H=메모
  {
    const ws = wb.Sheets["Fund Trading"];
    if (ws) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

      let currentMeta: StockMeta | null = null;
      let currentStockName = "";
      let currentRawName = "";
      let lastTxDate = "";

      for (const row of rows) {
        if (!Array.isArray(row)) continue;

        const colA = String(row[0] ?? "").trim(); // A열: 펀드명(섹션헤더)
        const colB = row[1];                       // B열: 날짜 시리얼 or "Total" or null
        const colC = String(row[2] ?? "").trim(); // C열: Bid/Ask/Balance/Dividend/...
        const colD = row[3];                       // D열: 좌수(volume)
        const colE = row[4];                       // E열: 기준가(NAV per unit)
        const colF = row[5];                       // F열: 수수료
        const colG = row[6];                       // G열: 거래금액(total)

        const bStr = String(colB ?? "").trim();
        const skipLabels = ["Balance", "Fixed Profit/Loss", "Profit/Loss"];

        // 요약 행 건너뜀 (B="Total" 또는 C가 요약 레이블)
        if (bStr === "Total" || skipLabels.includes(colC)) continue;

        // DIVIDEND 처리 (C열 = "Dividend")
        if (colC === "Dividend" && currentMeta) {
          const dividendAmount = Number(colG) || 0;
          if (dividendAmount > 0 && lastTxDate) {
            const key = `${lastTxDate}::${currentStockName}::DIVIDEND::${dividendAmount}`;
            if (!existingKeys.has(key)) {
              existingKeys.add(key);
              transactions.push({
                id: crypto.randomUUID(), date: lastTxDate,
                accountNo: currentMeta.accountNo, market: "KR",
                assetType: "FUND", tradeType: "DIVIDEND",
                stockCode: currentStockName, stockName: currentRawName,
                quantity: 1, price: 0, currency: "KRW",
                amount: dividendAmount, memo: "배당 (Excel 합계)",
              });
              stats.dividend++;
              stats.byAccount[currentMeta.accountNo] = (stats.byAccount[currentMeta.accountNo] ?? 0) + 1;
            } else { duplicates++; }
          }
          continue;
        }

        // 섹션 헤더 감지: A열에 펀드명, B열이 날짜 시리얼이 아님
        if (colA && !(typeof colB === "number" && colB >= 40000)) {
          if (colA !== currentRawName) {
            lastTxDate = "";
            currentRawName = colA;
            // Stock Investment 시트의 lookup에서 8654 계좌 메타 조회
            const meta = lookup.get(colA) ?? lookup.get(colA.replace(/\s+/g, ""));
            if (meta) {
              currentMeta = meta;
              currentStockName = meta.ticker;
            } else {
              // lookup 미등록 펀드 → 8654 계좌 기본값
              currentMeta = { ticker: colA, accountNo: "8654", market: "KR", assetType: "FUND" };
              currentStockName = colA;
            }
          }
          continue;
        }

        if (!currentMeta) continue;

        // 거래 행: B열이 날짜 시리얼, C열이 Bid/Ask
        const serial = typeof colB === "number" ? colB : Number(colB);
        if (!serial || serial < 40000) continue;
        if (colC !== "Bid" && colC !== "Ask") continue;

        const date = excelSerialToDate(serial);
        const tradeType: "BUY" | "SELL" = colC === "Bid" ? "BUY" : "SELL";
        const amount = Number(colG) || 0;
        if (amount <= 0) continue;

        // 좌수: D열에 있으면 사용, 없으면 금액/기준가로 근사
        const nav = Number(colE) || 0;
        const rawQty = Number(colD) || 0;
        const quantity = rawQty > 0 ? rawQty : (nav > 0 ? Math.round(amount / nav) : 1);
        const price = nav > 0 ? nav : 0;
        const fee = Number(colF) || undefined;

        const key = `${date}::${currentStockName}::${tradeType}::${amount}`;
        if (existingKeys.has(key)) { duplicates++; continue; }
        existingKeys.add(key);
        lastTxDate = date;

        transactions.push({
          id: crypto.randomUUID(), date,
          accountNo: currentMeta.accountNo, market: "KR",
          assetType: "FUND", tradeType,
          stockCode: currentStockName, stockName: currentRawName,
          quantity, price, currency: "KRW", amount, fee,
        });

        tradeType === "BUY" ? stats.krBuy++ : stats.krSell++;
        stats.byAccount[currentMeta.accountNo] = (stats.byAccount[currentMeta.accountNo] ?? 0) + 1;
      }
    }
  }

  // ── 최종 중복 제거 ─────────────────────────────────────────────────────
  // Excel 병합 셀·중복 섹션·종목명 표기 차이 등으로 동일 거래가 중복 파싱될 수 있음.
  // stockCode가 달라도 (섹션명 불일치 → fallback) stockName 기준으로 최종 탈중복.
  // 키: stockName::date::tradeType::quantity::price (DIVIDEND는 amount 포함)
  const deduped: LongtermTransaction[] = [];
  const finalKeys = new Set<string>();
  for (const tx of transactions) {
    const deKey = tx.tradeType === "DIVIDEND"
      ? `${tx.stockName}::DIVIDEND::${tx.amount}`
      : `${tx.stockName}::${tx.date}::${tx.tradeType}::${tx.quantity}::${tx.price}`;
    if (!finalKeys.has(deKey)) {
      finalKeys.add(deKey);
      deduped.push(tx);
    } else {
      duplicates++;
    }
  }

  return { transactions: deduped, duplicates, stats };
}
