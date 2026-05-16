// 재무제표 병합 유틸 — 클라이언트/서버 공용
//
// 목적:
//   FnGuide/Alpha Vantage는 최근 4~5개년만 반환하므로,
//   localStorage에 저장된 과거 연도 데이터를 잃지 않도록 병합
//
// 전략:
//   - fresh(새로 수집한 데이터)가 source of truth
//   - fresh에 없는 연도만 saved(기존 로컬 데이터)에서 가져와 보완
//   - account_nm + sj_div 기준 매칭 (계정명 단위 연도 병합)

import type { FinancialStatements, RawDartItem } from "@/types/fundamental-screening";

/**
 * 두 RawDartItem[] 배열을 연도 기준으로 병합
 *
 * @param savedItems  - 기존 로컬 저장 데이터 (과거 연도 포함 가능)
 * @param freshItems  - 새로 수집한 데이터 (최근 연도 포함, source of truth)
 */
export function mergeItemArrays(
  savedItems: RawDartItem[],
  freshItems: RawDartItem[]
): RawDartItem[] {
  // fresh에 이미 있는 연도 목록
  const freshYears = new Set(freshItems.flatMap((i) => i.amounts.map((a) => a.year)));

  // saved에만 있는 연도 — fresh에 없어서 보완이 필요한 연도들
  const extraYears = new Set(
    savedItems
      .flatMap((i) => i.amounts.map((a) => a.year))
      .filter((y) => !freshYears.has(y))
  );

  // 보완할 연도가 없으면 fresh 그대로 반환
  if (extraYears.size === 0) return freshItems;

  return freshItems.map((freshItem) => {
    // account_nm + sj_div 기준으로 saved에서 동일 항목 검색
    const savedItem = savedItems.find(
      (s) => s.account_nm === freshItem.account_nm && s.sj_div === freshItem.sj_div
    );
    // saved에 같은 계정이 없거나, 보완할 연도 데이터가 없으면 fresh 그대로
    const extraAmounts = savedItem?.amounts.filter((a) => extraYears.has(a.year)) ?? [];
    if (extraAmounts.length === 0) return freshItem;

    return {
      ...freshItem,
      amounts: [...freshItem.amounts, ...extraAmounts].sort((a, b) =>
        a.year.localeCompare(b.year)
      ),
    };
  });
}

/**
 * FinancialStatements 전체 병합
 * rawItems / quarterlyItems / ratioItems / quarterlyRatioItems 모두 처리
 *
 * @param saved  - localStorage 저장 데이터 (과거 연도 보존용)
 * @param fresh  - 새로 수집한 데이터 (source of truth)
 */
export function mergeStatements(
  saved: FinancialStatements,
  fresh: FinancialStatements
): FinancialStatements {
  return {
    ...fresh,
    rawItems: mergeItemArrays(saved.rawItems, fresh.rawItems),

    // quarterlyItems — 둘 다 있을 때만 병합
    quarterlyItems:
      saved.quarterlyItems && fresh.quarterlyItems
        ? mergeItemArrays(saved.quarterlyItems, fresh.quarterlyItems)
        : fresh.quarterlyItems,

    // ratioItems — 둘 다 있을 때만 병합
    ratioItems:
      saved.ratioItems && fresh.ratioItems
        ? mergeItemArrays(saved.ratioItems, fresh.ratioItems)
        : fresh.ratioItems,

    // quarterlyRatioItems — 둘 다 있을 때만 병합
    quarterlyRatioItems:
      saved.quarterlyRatioItems && fresh.quarterlyRatioItems
        ? mergeItemArrays(saved.quarterlyRatioItems, fresh.quarterlyRatioItems)
        : fresh.quarterlyRatioItems,
  };
}
