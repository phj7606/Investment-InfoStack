/**
 * 시장 마감 시간 유틸리티 — KST 기준 KRX/NYSE 개장 여부 판단
 *
 * 종가 확정 UI에서 "지금 확정해도 되는지" 여부와 안내 문구를 제공.
 */

export interface KstTime {
  hour: number;
  minute: number;
  dayOfWeek: number; // 0=일, 6=토
  isoDate: string;   // "YYYY-MM-DD" (KST 기준)
}

/** 현재 KST 시각 반환 */
export function getNowKst(): KstTime {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    dayOfWeek: kst.getUTCDay(),
    isoDate: kst.toISOString().slice(0, 10),
  };
}

/** KRX (한국거래소) 개장 여부 — 평일 09:00~15:30 KST */
export function isKrxOpen(kst?: KstTime): boolean {
  const t = kst ?? getNowKst();
  if (t.dayOfWeek === 0 || t.dayOfWeek === 6) return false;
  const afterOpen  = t.hour > 9  || (t.hour === 9  && t.minute >= 0);
  const beforeClose = t.hour < 15 || (t.hour === 15 && t.minute < 30);
  return afterOpen && beforeClose;
}

/**
 * NYSE/NASDAQ 개장 여부 (KST 기준)
 *
 * 서머타임(3~11월): ET 9:30~16:00 = KST 22:30~05:00
 * 겨울(12~2월):    ET 9:30~16:00 = KST 23:30~06:00
 *
 * 주말: 미국 기준 토/일은 KST로도 대부분 주말에 속하므로 KST dayOfWeek으로 근사
 */
export function isUsMarketOpen(kst?: KstTime): boolean {
  const t = kst ?? getNowKst();
  if (t.dayOfWeek === 0 || t.dayOfWeek === 6) return false;

  // 서머타임 여부 (3~11월 근사)
  const month = Number(t.isoDate.slice(5, 7));
  const isSummerTime = month >= 3 && month <= 11;

  // 장 시작: 서머타임 22:30 / 겨울 23:30
  const openKstMinutes  = (isSummerTime ? 22 : 23) * 60 + 30;
  // 장 마감: 서머타임 05:00 / 겨울 06:00
  const closeKstMinutes = (isSummerTime ? 5  : 6 ) * 60;

  const curMinutes = t.hour * 60 + t.minute;
  // 자정을 넘는 범위 (22:30 이후 OR 06:00 이전)
  return curMinutes >= openKstMinutes || curMinutes < closeKstMinutes;
}

export interface MarketStatus {
  krxOpen: boolean;
  usOpen: boolean;
  /** null = 확정 가능, string = 경고 문구 */
  krWarning: string | null;
  /** null = 확정 가능, string = 경고 문구 */
  usWarning: string | null;
}

/**
 * 월의 마지막 영업일 반환 (KST 주말 제외, 공휴일 미고려)
 *
 * @param month - "YYYY-MM" 형식
 * @returns "YYYY-MM-DD" 형식
 */
export function getLastTradingDay(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  // 다음 달 0일 = 이번 달 말일
  const lastDay = new Date(Date.UTC(year, mon, 0));
  while (lastDay.getUTCDay() === 0 || lastDay.getUTCDay() === 6) {
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  }
  return lastDay.toISOString().slice(0, 10);
}

/** KR 종가 확정 가능 여부 — 마지막 거래일 15:30 KST 이후 */
export function canLockKr(lastTradingDay: string): { ok: boolean; reason: string | null } {
  const kst = getNowKst();
  if (kst.isoDate < lastTradingDay) {
    return { ok: false, reason: `마지막 거래일(${lastTradingDay}) 전입니다. 당일 장 마감 후 확정하세요.` };
  }
  if (kst.isoDate === lastTradingDay) {
    const afterClose = kst.hour > 15 || (kst.hour === 15 && kst.minute >= 30);
    if (!afterClose) {
      return { ok: false, reason: `KRX 장 마감(15:30 KST) 전입니다. 마감 후 확정하세요.` };
    }
  }
  return { ok: true, reason: null };
}

/**
 * US 종가 확정 가능 여부 (서머타임 자동 반영)
 * US는 마지막 거래일 다음날 KST 새벽에 마감
 */
export function canLockUs(lastTradingDay: string): { ok: boolean; reason: string | null } {
  const kst = getNowKst();
  const nextDayStr = new Date(new Date(lastTradingDay + "T00:00:00Z").getTime() + 86400_000)
    .toISOString().slice(0, 10);

  // 서머타임 여부 (3~11월 근사)
  const month = Number(kst.isoDate.slice(5, 7));
  const isSummerTime = month >= 3 && month <= 11;
  const closeHour = isSummerTime ? 5 : 6; // KST 기준 NYSE 마감

  if (kst.isoDate < nextDayStr) {
    return {
      ok: false,
      reason: `US 종가는 익일(${nextDayStr}) ${String(closeHour).padStart(2, "0")}:00 KST 이후 확정하세요.`,
    };
  }
  if (kst.isoDate === nextDayStr && kst.hour < closeHour) {
    return {
      ok: false,
      reason: `NYSE 마감(${String(closeHour).padStart(2, "0")}:00 KST) 전입니다. 잠시 후 확정하세요.`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * KRX/NYSE 현재 개장 상태와 안내 문구 반환
 *
 * 클라이언트(브라우저)에서 호출할 수 있도록 Date 기반으로만 계산.
 */
export function getMarketStatus(): MarketStatus {
  const kst = getNowKst();
  const krxOpen = isKrxOpen(kst);
  const usOpen  = isUsMarketOpen(kst);
  const isWeekend = kst.dayOfWeek === 0 || kst.dayOfWeek === 6;

  return {
    krxOpen,
    usOpen,
    krWarning: krxOpen
      ? "KRX 장이 진행 중입니다 (마감: 오후 3:30 KST). 마감 후 실행하세요."
      : isWeekend
      ? "주말입니다. 가장 최근 영업일의 종가로 조회됩니다."
      : null,
    usWarning: usOpen
      ? "NYSE/NASDAQ 장이 진행 중입니다. 마감 후 KST 기준 익일 오전 6시 이후 실행하세요."
      : null,
  };
}
