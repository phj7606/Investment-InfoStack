/**
 * 연금 계좌 거래 내역 저장소
 *
 * data/pension-transactions.json — 거래 이력 영구 저장
 * data/pension-rebalancing.json — 리밸런싱 목표 비중 저장
 *
 * 자동 백업: writeTransactions() 호출 시 당일 첫 쓰기 직전 백업 생성 (30일 보관)
 */

import fs from "fs";
import path from "path";
import type { PensionTransaction, PensionRebalancingTarget, PensionRebalancingConfig } from "@/types/portfolio";

const TX_FILE       = path.join(process.cwd(), "data", "pension-transactions.json");
const REBAL_FILE    = path.join(process.cwd(), "data", "pension-rebalancing.json");
const BACKUP_DIR    = path.join(process.cwd(), "data", "pension-backups");
const RETAIN_DAYS   = 30;

// ─────────────────────────────────────────
// 백업 유틸
// ─────────────────────────────────────────

function pruneOldBackups(): void {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETAIN_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (const file of files) {
      if (file.replace(".json", "") < cutoffStr) {
        fs.unlinkSync(path.join(BACKUP_DIR, file));
      }
    }
  } catch { /* 무시 */ }
}

/** 쓰기 직전 당일 첫 쓰기 시에만 백업 생성 */
function autoBackup(): void {
  try {
    if (!fs.existsSync(TX_FILE)) return;
    const today = new Date().toISOString().slice(0, 10);
    const backupFile = path.join(BACKUP_DIR, `${today}.json`);
    if (fs.existsSync(backupFile)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(TX_FILE, backupFile);
    pruneOldBackups();
  } catch { /* 백업 실패가 원본 쓰기를 막지 않음 */ }
}

/**
 * 수동 백업 — 호출 시마다 타임스탬프 파일명으로 저장
 * UI "백업" 버튼에서 호출
 */
export function manualBackup(): { filename: string } {
  if (!fs.existsSync(TX_FILE)) throw new Error("거래 내역 파일이 없습니다.");
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `manual-${ts}.json`;
  fs.copyFileSync(TX_FILE, path.join(BACKUP_DIR, filename));
  pruneOldBackups();
  return { filename };
}

// ─────────────────────────────────────────
// 거래 내역 CRUD
// ─────────────────────────────────────────

export function readTransactions(): PensionTransaction[] {
  try {
    if (!fs.existsSync(TX_FILE)) return [];
    const raw = fs.readFileSync(TX_FILE, "utf-8");
    return JSON.parse(raw) as PensionTransaction[];
  } catch {
    return [];
  }
}

export function writeTransactions(data: PensionTransaction[]): void {
  autoBackup();
  fs.writeFileSync(TX_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function addTransaction(tx: PensionTransaction): void {
  const all = readTransactions();
  all.push(tx);
  writeTransactions(all);
}

export function updateTransaction(id: string, updated: PensionTransaction): void {
  const all = readTransactions();
  const idx = all.findIndex((t) => t.id === id);
  if (idx !== -1) all[idx] = updated;
  writeTransactions(all);
}

export function deleteTransaction(id: string): void {
  const all = readTransactions().filter((t) => t.id !== id);
  writeTransactions(all);
}

// ─────────────────────────────────────────
// 리밸런싱 목표 비중
// ─────────────────────────────────────────

/** 계좌별 목표 비중 기본값 */
const DEFAULT_CONFIG: PensionRebalancingConfig = {
  RETIREMENT: { bondRatio: 40, equityRatio: 60 },
  SAVINGS:    { bondRatio: 30, equityRatio: 70 },
};

/**
 * 계좌별 리밸런싱 목표 비중 읽기
 *
 * 구형 포맷 ({ bondRatio, equityRatio }) 자동 마이그레이션:
 * 구형 파일이 있으면 RETIREMENT 목표로 간주하고 새 포맷으로 변환
 */
export function readRebalancingConfig(): PensionRebalancingConfig {
  try {
    if (!fs.existsSync(REBAL_FILE)) return { ...DEFAULT_CONFIG };
    const raw  = fs.readFileSync(REBAL_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // 구형 포맷 감지: RETIREMENT 키가 없고 bondRatio 키가 있으면 구형
    if (!("RETIREMENT" in parsed) && "bondRatio" in parsed) {
      const legacy = parsed as unknown as PensionRebalancingTarget;
      return {
        RETIREMENT: { bondRatio: legacy.bondRatio, equityRatio: legacy.equityRatio },
        SAVINGS:    DEFAULT_CONFIG.SAVINGS,
      };
    }

    return {
      RETIREMENT: (parsed.RETIREMENT as PensionRebalancingTarget) ?? DEFAULT_CONFIG.RETIREMENT,
      SAVINGS:    (parsed.SAVINGS    as PensionRebalancingTarget) ?? DEFAULT_CONFIG.SAVINGS,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** 계좌별 리밸런싱 목표 비중 전체 저장 */
export function writeRebalancingConfig(config: PensionRebalancingConfig): void {
  fs.writeFileSync(REBAL_FILE, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * 단일 계좌의 목표 비중만 업데이트
 * 기존 다른 계좌 설정은 유지
 */
export function writeRebalancingTarget(
  accountType: "RETIREMENT" | "SAVINGS",
  target: PensionRebalancingTarget
): void {
  const config = readRebalancingConfig();
  config[accountType] = target;
  writeRebalancingConfig(config);
}
