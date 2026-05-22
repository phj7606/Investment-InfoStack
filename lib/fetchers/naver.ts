/**
 * Naver Finance 현재가 조회 클라이언트 (KR 종목 전용)
 *
 * 역할:
 * - KR 종목 현재가를 Naver Finance 모바일 API에서 조회
 * - 종목코드 불일치 시 Naver 자동완성 API로 정상 코드를 검색 후 영구 저장
 *
 * 엔드포인트:
 *   현재가: https://m.stock.naver.com/api/stock/{code}/basic
 *   코드 검색: https://ac.stock.naver.com/ac?q={name}&target=stock
 *
 * 서버 전용 모듈 — Next.js Route Handler에서만 import
 */

import fs from "fs";
import path from "path";

// ─────────────────────────────────────────
// 종목코드 별칭 — 두 계층 통합 관리
// ─────────────────────────────────────────

/**
 * 빌드 시 알려진 오기 코드 (하드코딩)
 * 조회 실패 → 자동 검색으로 발견된 신규 별칭은 아래 JSON 파일에 누적 저장
 */
const BUILTIN_ALIASES: Record<string, string> = {
  "005939": "005930", // 삼성전자 보통주 (005939 오기 → 005930)
};

/** 자동 발견 별칭 영구 저장 파일 */
const ALIASES_FILE = path.join(process.cwd(), "data", "kr-code-aliases.json");

/** 파일에서 영구 별칭 로드 (없으면 빈 객체) */
function loadPersistedAliases(): Record<string, string> {
  try {
    if (!fs.existsSync(ALIASES_FILE)) return {};
    return JSON.parse(fs.readFileSync(ALIASES_FILE, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** 새로 발견된 별칭을 파일에 추가 저장 */
function saveAlias(wrongCode: string, correctCode: string): void {
  try {
    const existing = loadPersistedAliases();
    existing[wrongCode] = correctCode;
    fs.writeFileSync(ALIASES_FILE, JSON.stringify(existing, null, 2), "utf-8");
    console.log(`[naver] 별칭 저장: ${wrongCode} → ${correctCode} (${ALIASES_FILE})`);
  } catch (err) {
    console.warn("[naver] 별칭 파일 저장 실패:", err);
  }

  // 거래내역 JSON에도 동일하게 코드 수정 — 별칭 파일만으로는 거래내역·종목별 페이지에 반영 안 됨
  applyAliasToTransactions(wrongCode, correctCode);
}

/**
 * 거래내역 JSON 파일에서 잘못된 종목코드를 올바른 코드로 일괄 수정
 *
 * saveAlias 호출 시 자동 실행 — 코드 불일치가 발견될 때 price lookup뿐 아니라
 * 원본 데이터(거래내역, 종목별, 성과분석)도 함께 보정하기 위해 필요
 */
function applyAliasToTransactions(wrongCode: string, correctCode: string): void {
  const TXS_FILE = path.join(process.cwd(), "data", "longterm-transactions.json");
  try {
    if (!fs.existsSync(TXS_FILE)) return;
    const raw = fs.readFileSync(TXS_FILE, "utf-8");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = JSON.parse(raw);
    let count = 0;
    for (const tx of data) {
      if (tx.stockCode === wrongCode) {
        tx.stockCode = correctCode;
        count++;
      }
    }
    if (count > 0) {
      fs.writeFileSync(TXS_FILE, JSON.stringify(data, null, 2), "utf-8");
      console.log(`[naver] 거래내역 코드 수정: ${wrongCode} → ${correctCode} (${count}건, ${TXS_FILE})`);
    }
  } catch (err) {
    console.warn("[naver] 거래내역 코드 수정 실패:", err);
  }
}

/**
 * 런타임 전체 별칭 맵 반환 (빌트인 + 파일 영구 저장분 합산)
 * 파일 값이 빌트인 값을 덮어쓰지 않도록 빌트인 우선 적용
 */
export function getKrCodeAliases(): Record<string, string> {
  return { ...loadPersistedAliases(), ...BUILTIN_ALIASES };
}

// ─────────────────────────────────────────
// Naver 자동완성 API — 종목코드 검색
// ─────────────────────────────────────────

interface NaverAcItem {
  code: string;
  name: string;
  typeCode: string; // "KOSPI" | "KOSDAQ"
}

/**
 * 종목명으로 Naver Finance 자동완성 API를 검색해 정상 코드 반환
 *
 * 엔드포인트: https://ac.stock.naver.com/ac?q={name}&target=stock
 * 우선순위: 정확 일치(name === stockName) → 접두 일치 → null
 *
 * @param stockName - 검색할 종목명 (예: "삼성전자")
 * @returns KRX 종목코드 또는 null (찾지 못한 경우)
 */
export async function searchNaverStockCode(stockName: string): Promise<string | null> {
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(stockName)}&target=stock`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "application/json",
        "Referer": "https://m.stock.naver.com/",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null;
    const data = JSON.parse(text) as { items?: NaverAcItem[] };
    const items = data.items ?? [];
    // 정확 일치 우선, 없으면 접두 일치
    const exact  = items.find((i) => i.name === stockName);
    const prefix = items.find((i) => i.name.startsWith(stockName));
    const match  = exact ?? prefix ?? null;
    if (match) {
      console.log(`[naver] 코드 검색 성공: "${stockName}" → ${match.code} (${match.typeCode})`);
    }
    return match?.code ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// Naver Finance 현재가 단건 조회
// ─────────────────────────────────────────

/**
 * Node.js fetch로 Naver Finance 현재가 단건 조회
 *
 * curl 서브프로세스 대신 내장 fetch 사용 — Vercel 서버리스 환경 호환
 * closePrice 필드: "281,000" 형태 문자열 → parseInt 처리
 */
export async function fetchNaverPriceViaCurl(stockCode: string): Promise<number | null> {
  const url = `https://m.stock.naver.com/api/stock/${stockCode}/basic`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "application/json",
        "Referer": "https://m.stock.naver.com/",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null;
    const data = JSON.parse(text);
    const raw = data?.closePrice ?? data?.stockPrice;
    if (!raw) return null;
    const price = parseInt(String(raw).replace(/,/g, ""), 10);
    return !isNaN(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────
// 복수 종목 현재가 병렬 조회 (자동 코드 보정 포함)
// ─────────────────────────────────────────

export interface NaverStockInput {
  code: string;
  /** 종목명 — 조회 실패 시 Naver 자동완성으로 정상 코드 검색에 사용 */
  name?: string;
}

/**
 * 복수 KR 종목의 현재가를 Naver Finance에서 병렬 조회
 *
 * 자동 코드 보정 흐름:
 *   1. 별칭 맵(빌트인 + 파일 저장분) 적용 후 조회
 *   2. 조회 실패 + 종목명 있으면 → Naver 자동완성 검색
 *   3. 정상 코드 발견 시 → 파일에 영구 저장 → 재조회
 *
 * @param stocks - { code, name? }[] 배열 (name 있으면 자동 검색 활성)
 * @returns { [originalCode]: price } — 조회 실패 종목은 포함 안 됨
 */
export async function fetchNaverCurrentPrices(
  stocks: NaverStockInput[]
): Promise<Record<string, number>> {
  if (stocks.length === 0) return {};

  // 빌트인 + 파일 저장 별칭 합산
  const aliases = getKrCodeAliases();

  const entries = await Promise.all(
    stocks.map(async ({ code, name }) => {
      // 1. 별칭 맵 적용 후 1차 조회
      const queryCode = aliases[code] ?? code;
      let price = await fetchNaverPriceViaCurl(queryCode);

      if (price != null) {
        if (queryCode !== code) {
          console.log(`[naver] 별칭 적용: ${code} → ${queryCode} (${price.toLocaleString()})`);
        }
        return [code, price] as [string, number];
      }

      // 2. 조회 실패 + 종목명 있으면 자동완성으로 정상 코드 검색
      if (name) {
        console.warn(`[naver] 가격 조회 실패: ${code} (${name}) — 자동완성 검색 시도`);
        const foundCode = await searchNaverStockCode(name);

        if (foundCode && foundCode !== queryCode) {
          // 3. 새 코드 발견 → 영구 저장 → 재조회
          saveAlias(code, foundCode);
          price = await fetchNaverPriceViaCurl(foundCode);
          if (price != null) {
            console.log(`[naver] 자동 보정 성공: ${code} → ${foundCode} (${price.toLocaleString()})`);
            return [code, price] as [string, number];
          }
        }

        console.warn(`[naver] 자동완성으로도 가격 조회 실패: ${code} (${name})`);
      }

      return [code, null] as [string, null];
    })
  );

  return Object.fromEntries(
    entries.filter((e): e is [string, number] => e[1] != null)
  );
}
