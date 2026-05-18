/**
 * 중장기 투자 거래 내역 저장소
 *
 * data/longterm-transactions.json 파일에 영구 저장 (TTL 없음).
 * 캐시와 달리 만료 개념 없이 순수 CRUD 역할.
 */

import fs from "fs";
import path from "path";
import type { LongtermTransaction } from "@/types/portfolio";

// 프로젝트 루트 기준 data 디렉토리
const FILE_PATH = path.join(process.cwd(), "data", "longterm-transactions.json");

/** 전체 거래 내역 읽기 */
export function readTransactions(): LongtermTransaction[] {
  try {
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    return JSON.parse(raw) as LongtermTransaction[];
  } catch {
    return [];
  }
}

/** 전체 거래 내역 덮어쓰기 */
export function writeTransactions(data: LongtermTransaction[]): void {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

/** 거래 추가 (id는 호출자가 미리 생성해서 전달) */
export function addTransaction(tx: LongtermTransaction): LongtermTransaction {
  const all = readTransactions();
  all.push(tx);
  writeTransactions(all);
  return tx;
}

/** 거래 삭제 */
export function deleteTransaction(id: string): void {
  const all = readTransactions();
  writeTransactions(all.filter((t) => t.id !== id));
}

/** 거래 수정 (id 기준으로 교체) */
export function updateTransaction(tx: LongtermTransaction): void {
  const all = readTransactions();
  const idx = all.findIndex((t) => t.id === tx.id);
  if (idx >= 0) {
    all[idx] = tx;
    writeTransactions(all);
  }
}

/** 종목별 조회 (메모리 필터) */
export function getByStock(stockCode: string): LongtermTransaction[] {
  return readTransactions().filter((t) => t.stockCode === stockCode);
}

/** 계좌별 조회 (메모리 필터) */
export function getByAccount(accountNo: string): LongtermTransaction[] {
  return readTransactions().filter((t) => t.accountNo === accountNo);
}
