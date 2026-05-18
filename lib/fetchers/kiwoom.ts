/**
 * 키움증권 REST API 클라이언트
 * 서버 전용 모듈 — Next.js Route Handler에서만 import (AppKey/Secret은 서버에서만 접근)
 *
 * 공식 문서: https://developers.kiwoom.com/
 * Base URL (실전): https://openapi.kiwoom.com:8443
 * Base URL (모의): https://openapi.kiwoom.com:9443
 *
 * 계좌별로 앱키/앱시크릿이 별도 발급되므로, 계좌 유형(AccountType)을 받아
 * 해당 환경 변수를 참조한다.
 *
 * 환경 변수 구조 (계좌 유형별):
 *   KIWOOM_{TYPE}_APP_KEY      — 앱 키
 *   KIWOOM_{TYPE}_APP_SECRET   — 앱 시크릿
 *   KIWOOM_{TYPE}_ACCOUNT_NO   — 계좌번호
 *   KIWOOM_IS_REAL             — "true" 이면 실전, 그 외 모의투자 (전 계좌 공통)
 *
 * 현재 지원 TYPE:
 *   TREND    — 추세추종 계좌 (Account 1470)
 *   LONGTERM — 장기투자 계좌 (추후)
 *   MIDTERM  — 단/중기 투자 계좌 (추후)
 */

import { readCache, writeCache } from "@/lib/cache";
import type {
  KiwoomPosition,
  KiwoomTokenCache,
  Trade,
} from "@/types/portfolio";

// ─────────────────────────────────────────
// 계좌 유형 정의
// ─────────────────────────────────────────

/** 지원하는 키움 계좌 유형 */
export type KiwoomAccountType = "TREND" | "LONGTERM" | "MIDTERM";

/** 계좌 유형별 환경 변수 접두사 맵 */
const ACCOUNT_ENV_PREFIX: Record<KiwoomAccountType, string> = {
  TREND: "KIWOOM_TREND",
  LONGTERM: "KIWOOM_LONGTERM",
  MIDTERM: "KIWOOM_MIDTERM",
};

// ─────────────────────────────────────────
// 환경 변수 헬퍼
// ─────────────────────────────────────────

function getBaseUrl(): string {
  return process.env.KIWOOM_IS_REAL === "true"
    ? "https://openapi.kiwoom.com:8443"
    : "https://openapi.kiwoom.com:9443";
}

/** 환경 변수 존재 여부 확인 후 값 반환 */
function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[키움API] 환경 변수 미설정: ${key}`);
  return val;
}

/** 계좌 유형별 앱키 조회 */
function getAppKey(accountType: KiwoomAccountType): string {
  return requireEnv(`${ACCOUNT_ENV_PREFIX[accountType]}_APP_KEY`);
}

/** 계좌 유형별 앱시크릿 조회 */
function getAppSecret(accountType: KiwoomAccountType): string {
  return requireEnv(`${ACCOUNT_ENV_PREFIX[accountType]}_APP_SECRET`);
}

/** 계좌 유형별 계좌번호 조회 */
export function getAccountNo(accountType: KiwoomAccountType): string {
  return requireEnv(`${ACCOUNT_ENV_PREFIX[accountType]}_ACCOUNT_NO`);
}

// ─────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────

/** YYYYMMDD → YYYY-MM-DD */
function parseDateStr(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/** 쉼표·공백이 포함된 숫자 문자열 → number */
function parseNumber(raw: string): number {
  if (!raw || raw.trim() === "") return 0;
  const cleaned = raw.replace(/[,\s]/g, "");
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

// ─────────────────────────────────────────
// 토큰 관리 (계좌 유형별 독립 캐시)
// ─────────────────────────────────────────

const TOKEN_REFRESH_MARGIN_SEC = 300; // 만료 5분 전 갱신

/**
 * OAuth 2.0 Access Token을 발급하거나 캐시에서 재사용한다.
 *
 * 계좌마다 앱키/앱시크릿이 다르므로 토큰도 계좌 유형별로 독립 관리한다.
 * 캐시 키: `kiwoom-token-{accountType}` (예: "kiwoom-token-TREND")
 */
export async function getKiwoomToken(accountType: KiwoomAccountType): Promise<string> {
  const cacheKey = `kiwoom-token-${accountType}`;

  // 1. 캐시에서 유효한 토큰 확인
  const cached = await readCache<KiwoomTokenCache>(cacheKey);
  if (cached) {
    const expiresAt = new Date(cached.expiresAt).getTime();
    if (expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_SEC * 1000) {
      return cached.accessToken;
    }
  }

  // 2. 신규 발급
  const appKey = getAppKey(accountType);
  const appSecret = getAppSecret(accountType);

  const url = `${getBaseUrl()}/oauth2/tokenP`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appkey: appKey,
      appsecret: appSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[키움API:${accountType}] 토큰 발급 실패 (${res.status}): ${text}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };

  // 3. 계좌별 캐시에 저장
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await writeCache<KiwoomTokenCache>(
    cacheKey,
    { accessToken: data.access_token, expiresAt },
    data.expires_in - TOKEN_REFRESH_MARGIN_SEC
  );

  console.log(`[키움API:${accountType}] 토큰 발급 완료 (만료: ${expiresAt})`);
  return data.access_token;
}

// ─────────────────────────────────────────
// TR 조회 공통 함수
// ─────────────────────────────────────────

interface KiwoomTrRequestParams {
  accountType: KiwoomAccountType;
  trCode: string;
  body: Record<string, string>;
  prevNextKey?: string;
}

interface KiwoomTrResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output2?: any;
  prevNextKey?: string;
}

/**
 * 키움 REST API TR 조회를 수행한다.
 * 계좌 유형별 앱키/토큰을 사용하여 요청한다.
 */
async function requestTr(params: KiwoomTrRequestParams): Promise<KiwoomTrResponse> {
  const { accountType } = params;
  const token = await getKiwoomToken(accountType);
  const url = `${getBaseUrl()}/uapi/domestic-stock/v1/trading/inquire-account`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    appkey: getAppKey(accountType),
    appsecret: getAppSecret(accountType),
    tr_id: params.trCode,
  };
  if (params.prevNextKey) {
    headers["prev_next"] = params.prevNextKey;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params.body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `[키움API:${accountType}] TR(${params.trCode}) 조회 실패 (${res.status}): ${text}`
    );
  }

  return res.json() as Promise<KiwoomTrResponse>;
}

// ─────────────────────────────────────────
// 보유 포지션 조회 (opw00004)
// ─────────────────────────────────────────

/**
 * 계좌 보유 포지션을 조회한다 (키움 TR: opw00004).
 * accountType에 해당하는 환경 변수에서 계좌번호를 자동으로 읽는다.
 */
export async function fetchPositions(
  accountType: KiwoomAccountType
): Promise<KiwoomPosition[]> {
  const accountNo = getAccountNo(accountType);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems: any[] = [];
  let prevNextKey: string | undefined;

  do {
    const res = await requestTr({
      accountType,
      trCode: "opw00004",
      body: {
        계좌번호: accountNo,
        비밀번호: "",
        비밀번호입력매체구분: "00",
        조회구분: "1",
      },
      prevNextKey,
    });

    const items = Array.isArray(res.output2) ? res.output2 : [];
    allItems.push(...items);
    prevNextKey = res.prevNextKey;
  } while (prevNextKey);

  return allItems
    .filter((item) => item.종목코드 && item.종목코드.trim() !== "")
    .map((item): KiwoomPosition => ({
      stockCode: item.종목코드.trim(),
      stockName: (item.종목명 ?? "").trim(),
      quantity: Math.round(parseNumber(item.보유수량)),
      avgPrice: Math.round(parseNumber(item.매입단가)),
      currentPrice: Math.round(parseNumber(item.현재가)),
      evalAmount: Math.round(parseNumber(item.평가금액)),
      profitLoss: Math.round(parseNumber(item.평가손익)),
      profitLossPct: Math.round(parseNumber(item.수익률) * 100) / 100,
    }));
}

// ─────────────────────────────────────────
// 거래 내역 조회 (opw00018)
// ─────────────────────────────────────────

/**
 * 계좌 거래 내역을 조회한다 (키움 TR: opw00018).
 * accountType에 해당하는 환경 변수에서 계좌번호를 자동으로 읽는다.
 */
export async function fetchTrades(
  accountType: KiwoomAccountType,
  startDate: string, // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
): Promise<Trade[]> {
  const accountNo = getAccountNo(accountType);
  const startYYYYMMDD = startDate.replace(/-/g, "");
  const endYYYYMMDD = endDate.replace(/-/g, "");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems: any[] = [];
  let prevNextKey: string | undefined;

  do {
    const res = await requestTr({
      accountType,
      trCode: "opw00018",
      body: {
        계좌번호: accountNo,
        비밀번호: "",
        비밀번호입력매체구분: "00",
        조회구분: "1",
        시작일: startYYYYMMDD,
        종료일: endYYYYMMDD,
      },
      prevNextKey,
    });

    const items = Array.isArray(res.output) ? res.output : [];
    allItems.push(...items);
    prevNextKey = res.prevNextKey;
  } while (prevNextKey);

  return allItems
    .filter((item) => item.종목코드 && item.종목코드.trim() !== "")
    .map((item): Trade => {
      const tradeTypeRaw: string = item.매매구분 ?? "";
      const isSell = tradeTypeRaw.includes("매도");

      return {
        date: parseDateStr(item.주문일 ?? ""),
        stockCode: item.종목코드.trim(),
        stockName: (item.종목명 ?? "").trim(),
        tradeType: isSell ? "SELL" : "BUY",
        quantity: Math.round(parseNumber(item.체결수량)),
        price: Math.round(parseNumber(item.체결단가)),
        amount: Math.round(parseNumber(item.체결금액)),
        profitLoss: isSell ? Math.round(parseNumber(item.손익 ?? "")) : null,
        profitLossPct: isSell
          ? Math.round(parseNumber(item.수익률 ?? "") * 100) / 100
          : null,
      };
    });
}
