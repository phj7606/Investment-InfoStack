/**
 * Monthly CF Excel Import API
 *
 * POST /api/portfolio/financial/monthly-cf/import-excel
 *   query: ?overwrite=false  (기본값 false — 기존 항목이 있으면 skip)
 *          ?overwrite=true   — 기존 항목이 있으면 금액 업데이트
 *
 * 엑셀 파일 경로(EXCEL_PATH 환경변수 또는 하드코딩)의 "Monthly CF" 시트를 파싱해
 * Jan~Apr(D~G열) 데이터를 monthly-cf.json에 일괄 저장.
 *
 * 행 번호 → (category, name, isExpense) 매핑은 엑셀 시트 구조와 정확히 일치해야 함.
 * 엑셀 행 번호는 1-indexed (xlsx 패키지 기준).
 */

import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";
import type { MonthlyCFEntry, CFCategoryType, CreateMonthlyCFRequest } from "@/types/financial";

const DATA_PATH = path.join(process.cwd(), "data", "monthly-cf.json");

// 엑셀 파일 기본 경로 — 환경변수로 오버라이드 가능
const DEFAULT_EXCEL_PATH =
  process.env.CF_EXCEL_PATH ||
  "/Users/mac/Library/CloudStorage/OneDrive-Personal/I Investment/I-1 Financial Statement/FS 2026.xlsx";

// ─── 행 번호 → 카테고리·항목명·지출여부 매핑 ──────────────────────
// 엑셀 Monthly CF 시트의 실제 행 위치에 맞게 정의 (1-indexed)
const ROW_MAP: Record<
  number,
  { category: CFCategoryType; name: string; isExpense: boolean }
> = {
  // Income (rows 4~7)
  4: { category: "INCOME", name: "Salary", isExpense: false },
  5: { category: "INCOME", name: "Interest/dividend income", isExpense: false },
  6: { category: "INCOME", name: "Rental/lease income", isExpense: false },
  7: { category: "INCOME", name: "Others", isExpense: false },

  // Fixed Expense (rows 10~12, 14)
  10: { category: "FIXED_EXPENSE", name: "Insurance", isExpense: true },
  11: { category: "FIXED_EXPENSE", name: "Telecommunication", isExpense: true },
  12: { category: "FIXED_EXPENSE", name: "Monthly Installment", isExpense: true },
  // row 13: Cumulative (calculated) — skip
  14: { category: "FIXED_EXPENSE", name: "Monthly Installment Spent", isExpense: true },
  // rows 15, 16: Cumulative Spent, Balance (calculated) — skip

  // Credit Card (rows 18~20)
  18: { category: "CREDIT_CARD", name: "Samsung", isExpense: true },
  19: { category: "CREDIT_CARD", name: "Hana", isExpense: true },
  20: { category: "CREDIT_CARD", name: "Citi", isExpense: true },

  // Cash Expense (rows 22~25)
  22: { category: "CASH_EXPENSE", name: "CNY Exchange", isExpense: true },
  23: { category: "CASH_EXPENSE", name: "Cash-gift/Condolence", isExpense: true },
  24: { category: "CASH_EXPENSE", name: "Tuition", isExpense: true },
  25: { category: "CASH_EXPENSE", name: "Others", isExpense: true },

  // Tax (rows 27~29)
  27: { category: "TAX", name: "Real estate - rent", isExpense: true },
  28: { category: "TAX", name: "Real estate", isExpense: true },
  29: { category: "TAX", name: "Investment", isExpense: true },

  // Account Transfer (rows 35~37)
  35: { category: "ACCOUNT_TRANSFER", name: "Account Transfer", isExpense: false },
  36: { category: "ACCOUNT_TRANSFER", name: "Foreign Exchange", isExpense: false },
  37: { category: "ACCOUNT_TRANSFER", name: "Education Savings", isExpense: false },
};

// ─── 열 인덱스(0-indexed) → 월 번호 매핑 ───────────────────────
// D열=3(0-indexed)→1월, E=4→2월, F=5→3월, G=6→4월
const COL_TO_MONTH: Record<number, number> = { 3: 1, 4: 2, 5: 3, 6: 4 };

// ─── 헬퍼 ──────────────────────────────────────────────────────

async function readEntries(): Promise<MonthlyCFEntry[]> {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf-8");
    return JSON.parse(raw) as MonthlyCFEntry[];
  } catch {
    return [];
  }
}

async function writeEntries(entries: MonthlyCFEntry[]): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

/** 엑셀 셀에서 숫자 값 추출 — 빈 셀·비숫자는 null 반환 */
function getCellNumber(
  ws: XLSX.WorkSheet,
  row: number,
  col: number
): number | null {
  // xlsx 셀 주소: 열 인덱스(0-based) → 알파벳 변환
  const colLetter = XLSX.utils.encode_col(col);
  const addr = `${colLetter}${row}`;
  const cell = ws[addr];
  if (!cell) return null;
  const val = cell.v;
  if (typeof val !== "number" || isNaN(val)) return null;
  return val;
}

// ─── POST 핸들러 ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const overwrite = req.nextUrl.searchParams.get("overwrite") === "true";
  // year 쿼리 파라미터 지원 (?year=2026), 기본값은 현재 연도
  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "") || new Date().getFullYear();

  // 엑셀 파일 읽기 — XLSX.readFile은 OneDrive 심링크 경로를 따라가지 못하는 경우가 있어
  // fs.readFile로 버퍼를 먼저 읽은 뒤 XLSX.read(buffer)로 파싱
  let wb: XLSX.WorkBook;
  try {
    const buffer = await fs.readFile(DEFAULT_EXCEL_PATH);
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    return NextResponse.json(
      { error: `엑셀 파일을 읽을 수 없습니다 (경로: ${DEFAULT_EXCEL_PATH}): ${String(e)}` },
      { status: 500 }
    );
  }

  // "Monthly CF" 시트 찾기 (시트명 대소문자 무시)
  const sheetName = wb.SheetNames.find(
    (n) => n.toLowerCase().replace(/\s/g, "") === "monthlycf"
  );
  if (!sheetName) {
    return NextResponse.json(
      {
        error: `"Monthly CF" 시트를 찾을 수 없습니다. 사용 가능한 시트: ${wb.SheetNames.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const ws = wb.Sheets[sheetName];
  const entries = await readEntries();

  let imported = 0;
  let skipped = 0;
  let updated = 0;
  const newEntries: MonthlyCFEntry[] = [];

  // 행/열 순회하며 데이터 수집
  for (const [rowStr, rowMeta] of Object.entries(ROW_MAP)) {
    const rowNum = parseInt(rowStr);

    for (const [colStr, monthNum] of Object.entries(COL_TO_MONTH)) {
      const colIdx = parseInt(colStr);
      const raw = getCellNumber(ws, rowNum, colIdx);

      // 빈 셀 / 0 은 skip (0을 저장하면 불필요한 데이터가 쌓임)
      if (raw === null || raw === 0) continue;

      // 부호 정규화
      // - ACCOUNT_TRANSFER: 엑셀 부호 그대로 보존 (양수=수취, 음수=지급)
      // - 지출 카테고리: 항상 음수 (엑셀에 양수로 입력된 값 → 음수 변환)
      // - INCOME: 항상 양수
      let amount: number;
      if (rowMeta.category === "ACCOUNT_TRANSFER") {
        amount = raw; // 엑셀 원본 부호 유지
      } else if (rowMeta.isExpense) {
        amount = -Math.abs(raw);
      } else {
        amount = Math.abs(raw);
      }

      // "2026-01" 형식 월 문자열
      const month = `${year}-${String(monthNum).padStart(2, "0")}`;

      // 기존 항목 탐색 (category + name + month 유일 키)
      const existingIdx = entries.findIndex(
        (e) =>
          e.category === rowMeta.category &&
          e.name === rowMeta.name &&
          e.month === month
      );

      if (existingIdx !== -1) {
        if (overwrite) {
          // 기존 항목 금액 업데이트
          entries[existingIdx] = { ...entries[existingIdx], amount };
          updated++;
        } else {
          // 기존 항목 skip
          skipped++;
        }
        continue;
      }

      // 신규 항목 생성
      const req: CreateMonthlyCFRequest = {
        category: rowMeta.category,
        name: rowMeta.name,
        month,
        amount,
      };
      const newEntry: MonthlyCFEntry = {
        id: crypto.randomUUID(),
        category: req.category,
        name: req.name,
        month: req.month,
        amount: req.amount,
        createdAt: new Date().toISOString(),
      };
      entries.push(newEntry);
      newEntries.push(newEntry);
      imported++;
    }
  }

  await writeEntries(entries);

  return NextResponse.json({
    ok: true,
    imported,
    updated,
    skipped,
    total: entries.length,
  });
}
