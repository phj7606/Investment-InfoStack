/**
 * 중장기 투자 거래 내역 저장소
 *
 * Supabase app_data 테이블의 'longterm_transactions' 키에 영구 저장 (TTL 없음)
 * 캐시와 달리 만료 개념 없이 순수 CRUD 역할
 *
 * 기존 파일 기반 자동 백업 기능은 Supabase DB 자체 복구 기능으로 대체됨
 * (수동 백업은 /api/portfolio/longterm/backup API로 JSON 다운로드 지원)
 */

import { readKey, writeKey } from "@/lib/db";
import type { LongtermTransaction } from "@/types/portfolio";

const DATA_KEY = "longterm_transactions";

/** 전체 거래 내역 읽기 */
export async function readTransactions(): Promise<LongtermTransaction[]> {
  return readKey<LongtermTransaction[]>(DATA_KEY, []);
}

/** 전체 거래 내역 덮어쓰기 (백업 복원 등 일괄 교체 시 사용) */
export async function writeTransactions(data: LongtermTransaction[]): Promise<void> {
  await writeKey(DATA_KEY, data);
}

/** 거래 추가 */
export async function addTransaction(tx: LongtermTransaction): Promise<LongtermTransaction> {
  const all = await readTransactions();
  all.push(tx);
  await writeTransactions(all);
  return tx;
}

/** 거래 삭제 */
export async function deleteTransaction(id: string): Promise<void> {
  const all = await readTransactions();
  await writeTransactions(all.filter((t) => t.id !== id));
}

/** 거래 수정 (id 기준으로 교체) */
export async function updateTransaction(tx: LongtermTransaction): Promise<void> {
  const all = await readTransactions();
  const idx = all.findIndex((t) => t.id === tx.id);
  if (idx >= 0) {
    all[idx] = tx;
    await writeTransactions(all);
  }
}

/** 종목별 조회 (메모리 필터) */
export async function getByStock(stockCode: string): Promise<LongtermTransaction[]> {
  const all = await readTransactions();
  return all.filter((t) => t.stockCode === stockCode);
}

/** 계좌별 조회 (메모리 필터) */
export async function getByAccount(accountNo: string): Promise<LongtermTransaction[]> {
  const all = await readTransactions();
  return all.filter((t) => t.accountNo === accountNo);
}
