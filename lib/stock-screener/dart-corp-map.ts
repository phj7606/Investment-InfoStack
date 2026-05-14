// DART corpCode.xml 파싱 + ticker → corp_code 메모리 + 디스크 캐시
// DART API는 ticker가 아닌 8자리 corp_code로 조회하므로 매핑이 필수
// corpCode.xml은 전체 상장사 목록이 담긴 ZIP 파일로, 최초 1회만 다운로드 후 캐싱
// xml2js 의존성 없이 정규식 기반 XML 파싱 사용
//
// 캐시 전략:
//   메모리: 서버 재시작 전까지 재사용 (Map<string,string>)
//   디스크: data/cache/dart-corp-map.json, TTL 7일 → 서버 재시작 후에도 유지

import { createInflateRaw } from "zlib";
import { Readable } from "stream";
import { readCache, writeCache } from "@/lib/cache";

const CORP_MAP_CACHE_KEY = "dart-corp-map";
const CORP_MAP_TTL = 7 * 24 * 60 * 60;   // 7일 (corp_code는 자주 변하지 않음)

// 메모리 캐시 — 서버 재시작 전까지 재사용
let corpMap: Map<string, string> | null = null;

/**
 * DART corpCode.xml ZIP → Map<stock_code(6자리), corp_code(8자리)> 파싱
 * XML 구조 예시:
 * <list><corp_code>00126380</corp_code><stock_code>005930</stock_code>...</list>
 */
async function fetchAndParseCorpCodes(): Promise<Map<string, string>> {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) throw new Error("DART_API_KEY 환경변수가 설정되지 않았습니다.");

  const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`DART corpCode 다운로드 실패: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const xmlContent = await unzipBuffer(buffer);

  return parseCorpXml(xmlContent);
}

/**
 * ZIP 버퍼 내 첫 번째 파일 압축 해제 → UTF-8 문자열
 * DART corpCode.xml은 deflate 알고리즘으로 압축된 단일 XML 파일
 */
async function unzipBuffer(buffer: Buffer): Promise<string> {
  try {
    // ZIP 로컬 파일 헤더: 파일명 길이(26번째), 확장 필드 길이(28번째) 읽기
    const fileNameLength = buffer.readUInt16LE(26);
    const extraLength = buffer.readUInt16LE(28);
    const dataOffset = 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(dataOffset);

    return await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      // ZIP DEFLATE는 zlib 헤더 없는 raw deflate — createUnzip이 아닌 createInflateRaw 사용
      const inflate = createInflateRaw();
      Readable.from(compressed).pipe(inflate);
      inflate.on("data", (chunk: Buffer) => chunks.push(chunk));
      inflate.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      inflate.on("error", reject);
    });
  } catch {
    // ZIP 파싱 실패 시 직접 UTF-8 텍스트로 시도
    return buffer.toString("utf-8");
  }
}

/**
 * XML 문자열에서 corp_code ↔ stock_code 매핑 추출
 * xml2js 없이 정규식으로 처리 — DART XML 구조가 단순하므로 충분
 */
function parseCorpXml(xml: string): Map<string, string> {
  const map = new Map<string, string>();

  // <list> 블록 전체 추출
  const listRegex = /<list>([\s\S]*?)<\/list>/g;
  let match: RegExpExecArray | null;

  while ((match = listRegex.exec(xml)) !== null) {
    const block = match[1];

    // corp_code, stock_code 필드 추출
    const corpCode  = /<corp_code>(\d{8})<\/corp_code>/.exec(block)?.[1];
    const stockCode = /<stock_code>(\d{6})<\/stock_code>/.exec(block)?.[1];

    // stock_code가 있는 상장사만 등록 (비상장사는 공백)
    if (corpCode && stockCode && stockCode.trim()) {
      map.set(stockCode.trim(), corpCode.trim());
    }
  }

  return map;
}

/**
 * ticker(종목코드 6자리) → DART corp_code 반환
 *
 * 로드 순서:
 * 1. 메모리 캐시 (서버 재시작 전까지 유지)
 * 2. 디스크 캐시 (data/cache/dart-corp-map.json, TTL 7일)
 * 3. DART API 다운로드 + 파싱 → 디스크·메모리 캐시 저장
 */
export async function getCorpCode(stockCode: string): Promise<string | null> {
  // 1. 메모리 캐시
  if (corpMap) return corpMap.get(stockCode) ?? null;

  // 2. 디스크 캐시 — 서버 재시작 후에도 재다운로드 없이 빠르게 로드
  const diskCached = await readCache<Record<string, string>>(CORP_MAP_CACHE_KEY);
  if (diskCached) {
    corpMap = new Map(Object.entries(diskCached));
    return corpMap.get(stockCode) ?? null;
  }

  // 3. DART API 다운로드 + 파싱
  const freshMap = await fetchAndParseCorpCodes();
  corpMap = freshMap;

  // 디스크 캐시 저장 (실패해도 메모리에는 있으므로 무시)
  try {
    await writeCache(CORP_MAP_CACHE_KEY, Object.fromEntries(freshMap), CORP_MAP_TTL);
  } catch { /* 캐시 저장 실패 무시 */ }

  return corpMap.get(stockCode) ?? null;
}

/** 캐시 강제 초기화 (갱신 또는 테스트 용도) */
export function clearCorpMapCache(): void {
  corpMap = null;
}
