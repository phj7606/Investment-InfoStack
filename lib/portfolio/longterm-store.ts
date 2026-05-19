/**
 * 중장기 투자 거래 내역 저장소
 *
 * data/longterm-transactions.json 파일에 영구 저장 (TTL 없음).
 * 캐시와 달리 만료 개념 없이 순수 CRUD 역할.
 *
 * 자동 백업:
 * - writeTransactions() 호출 시 당일 첫 쓰기 직전 data/backups/YYYY-MM-DD.json 생성
 * - 30일치 보관 후 오래된 파일 자동 삭제
 * - 백업 실패는 무시 (원본 쓰기를 막지 않음)
 */

import fs from "fs";
import path from "path";
import type { LongtermTransaction } from "@/types/portfolio";

// 프로젝트 루트 기준 data 디렉토리
const FILE_PATH = path.join(process.cwd(), "data", "longterm-transactions.json");
const BACKUP_DIR = path.join(process.cwd(), "data", "backups");
const BACKUP_RETAIN_DAYS = 30;

/**
 * 30일 초과 백업 파일 삭제
 *
 * 파일명 형식 YYYY-MM-DD.json 기준으로 오늘로부터 BACKUP_RETAIN_DAYS일 이전 파일을 제거한다.
 */
function pruneOldBackups(): void {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - BACKUP_RETAIN_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    for (const file of files) {
      const dateStr = file.replace(".json", "");
      if (dateStr < cutoffStr) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    }
  } catch {
    // 삭제 실패 무시
  }
}

/**
 * 오늘 날짜 백업 파일이 없으면 현재 데이터를 백업
 *
 * 쓰기 직전에 호출 — "오늘 변경 이전" 상태를 보존한다.
 * 같은 날 여러 번 호출해도 하루 1회만 백업된다.
 */
function autoBackup(): void {
  try {
    if (!fs.existsSync(FILE_PATH)) return;
    const today = new Date().toISOString().slice(0, 10);
    const backupFile = path.join(BACKUP_DIR, `${today}.json`);
    if (fs.existsSync(backupFile)) return; // 오늘 이미 백업됨

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(FILE_PATH, backupFile);
    pruneOldBackups();
  } catch {
    // 백업 실패가 원본 쓰기를 막지 않도록 모든 예외 무시
  }
}

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
  // 쓰기 직전 자동 백업 (당일 첫 쓰기 시에만)
  autoBackup();
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
