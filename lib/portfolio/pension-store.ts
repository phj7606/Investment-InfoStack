/**
 * 연금 계좌 거래 내역 저장소
 *
 * Supabase app_data 테이블에 영구 저장:
 * - 'pension_transactions'  : 거래 이력
 * - 'pension_rebalancing'   : 리밸런싱 목표 비중
 */

import { readKey, writeKey } from "@/lib/db";
import type {
  PensionTransaction,
  PensionRebalancingTarget,
  PensionRebalancingConfig,
} from "@/types/portfolio";

const TX_KEY    = "pension_transactions";
const REBAL_KEY = "pension_rebalancing";

/** 계좌별 목표 비중 기본값 */
const DEFAULT_CONFIG: PensionRebalancingConfig = {
  RETIREMENT: { bondRatio: 40, equityRatio: 60 },
  SAVINGS:    { bondRatio: 30, equityRatio: 70 },
};

// ─────────────────────────────────────────
// 거래 내역 CRUD
// ─────────────────────────────────────────

export async function readTransactions(): Promise<PensionTransaction[]> {
  return readKey<PensionTransaction[]>(TX_KEY, []);
}

/** 전체 거래 내역 덮어쓰기 (백업 복원 등 일괄 교체 시 사용) */
export async function writeTransactions(data: PensionTransaction[]): Promise<void> {
  await writeKey(TX_KEY, data);
}

export async function addTransaction(tx: PensionTransaction): Promise<void> {
  const all = await readTransactions();
  all.push(tx);
  await writeTransactions(all);
}

export async function updateTransaction(id: string, updated: PensionTransaction): Promise<void> {
  const all = await readTransactions();
  const idx = all.findIndex((t) => t.id === id);
  if (idx !== -1) all[idx] = updated;
  await writeTransactions(all);
}

export async function deleteTransaction(id: string): Promise<void> {
  const all = await readTransactions();
  await writeTransactions(all.filter((t) => t.id !== id));
}

// ─────────────────────────────────────────
// 리밸런싱 목표 비중
// ─────────────────────────────────────────

/**
 * 계좌별 리밸런싱 목표 비중 읽기
 *
 * 구형 포맷 ({ bondRatio, equityRatio }) 자동 마이그레이션:
 * 구형 데이터가 있으면 RETIREMENT 목표로 간주하고 새 포맷으로 변환
 */
export async function readRebalancingConfig(): Promise<PensionRebalancingConfig> {
  const parsed = await readKey<Record<string, unknown>>(REBAL_KEY, {});

  // 데이터가 없으면 기본값 반환
  if (!parsed || Object.keys(parsed).length === 0) return { ...DEFAULT_CONFIG };

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
}

/** 계좌별 리밸런싱 목표 비중 전체 저장 */
export async function writeRebalancingConfig(config: PensionRebalancingConfig): Promise<void> {
  await writeKey(REBAL_KEY, config);
}

/**
 * 단일 계좌의 목표 비중만 업데이트
 * 기존 다른 계좌 설정은 유지
 */
export async function writeRebalancingTarget(
  accountType: "RETIREMENT" | "SAVINGS",
  target: PensionRebalancingTarget
): Promise<void> {
  const config = await readRebalancingConfig();
  config[accountType] = target;
  await writeRebalancingConfig(config);
}
