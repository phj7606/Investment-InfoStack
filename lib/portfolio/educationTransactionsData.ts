/**
 * Education 계좌 거래내역 데이터 읽기/쓰기 헬퍼
 * Supabase app_data 테이블의 'education_transactions' 키에 저장
 *
 * LongtermTransaction 단건 모델(BUY/SELL/DIVIDEND) 사용 — longterm-store 패턴 동일
 * 기존 education_account(EducationPosition+EducationTrade)와 분리된 독립 키
 * Next.js App Router RSC/Route Handler에서만 사용 (서버 전용)
 */

import { readKey, writeKey } from "@/lib/db";
import type { LongtermTransaction } from "@/types/portfolio";

// Short-term 계좌(shortterm_transactions)와 분리된 독립 키
const DATA_KEY = "education_transactions";

// ─────────────────────────────────────────
// 기본 CRUD
// ─────────────────────────────────────────

export async function readTransactions(): Promise<LongtermTransaction[]> {
  return readKey<LongtermTransaction[]>(DATA_KEY, []);
}

export async function writeTransactions(data: LongtermTransaction[]): Promise<void> {
  await writeKey(DATA_KEY, data);
}

export async function addTransaction(tx: LongtermTransaction): Promise<void> {
  const all = await readTransactions();
  await writeTransactions([...all, tx]);
}

export async function deleteTransaction(id: string): Promise<void> {
  const all = await readTransactions();
  await writeTransactions(all.filter((t) => t.id !== id));
}

export async function updateTransaction(tx: LongtermTransaction): Promise<void> {
  const all = await readTransactions();
  const idx = all.findIndex((t) => t.id === tx.id);
  if (idx === -1) throw new Error(`거래 ID ${tx.id} 없음`);
  const updated = [...all];
  updated[idx] = tx;
  await writeTransactions(updated);
}
