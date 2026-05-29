/**
 * FS 확정 종가 조회 모듈
 *
 * 역할:
 *   월말 종가 확정(lock-balances) 시 저장된 종목별 종가 맵을 조회한다.
 *   Performance 계산에서 완료된 달(currentPeriod 아닌 달)의 가격을
 *   Yahoo/Naver에서 재호출하는 대신 이 값을 우선 사용한다.
 *
 * 설계 원칙:
 *   - FS 확정값 = 사용자가 명시적으로 검토·확정한 유일한 기준
 *   - Yahoo Historical은 수정주가·데이터 누락 등으로 재조회 시 값이 달라질 수 있음
 *   - FS 수치와 Performance 수치의 일관성 보장을 위해 동일 소스 사용
 */

import { readKey } from "@/lib/db";
import type { FinancialSnapshot } from "@/types/financial";

const SNAPSHOTS_KEY = "financial_snapshots";

/**
 * 특정 월의 확정 종가 맵 반환
 *
 * @param period   - "YYYY-MM" 형식 월
 * @param currency - "KRW" (Naver 기준) | "USD" (Yahoo 기준)
 * @returns stockCode → 종가 맵, 확정 데이터 없으면 null
 */
export async function getLockedPrices(
  period: string,
  currency: "KRW" | "USD"
): Promise<Record<string, number> | null> {
  const snapshots = await readKey<FinancialSnapshot[]>(SNAPSHOTS_KEY, []);
  const snapshot = snapshots.find((s) => s.month === period);

  if (!snapshot?.lockedBalances) return null;

  const prices =
    currency === "KRW"
      ? snapshot.lockedBalances.krPrices
      : snapshot.lockedBalances.usPrices;

  // 빈 객체는 "확정했지만 보유 종목 없음"과 "미확정"을 구분할 수 없으므로
  // 키가 하나라도 있어야 유효한 확정값으로 인정한다
  if (!prices || Object.keys(prices).length === 0) return null;

  return prices;
}
