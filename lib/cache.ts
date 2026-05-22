// JSON 파일 기반 캐시 유틸리티
// 서버 전용 모듈 — Next.js Route Handler에서만 사용 (브라우저 import 금지)
// Vercel 등 읽기 전용 파일시스템 환경에서는 동작하지 않으며, 로컬/자체 서버 환경 전용

import { promises as fs } from "fs";
import path from "path";

// 프로젝트 루트 기준 캐시 디렉토리 경로
const CACHE_DIR = path.join(process.cwd(), "data", "cache");

/** 캐시 파일의 구조 — 만료 시간으로 TTL을 관리 */
interface CacheEntry<T> {
  data: T;
  // 캐시가 저장된 시각 (ISO 8601)
  cachedAt: string;
  // 캐시 만료 시각 (ISO 8601) — 이 시각 이후 요청 시 외부 API 재호출
  expiresAt: string;
}

/**
 * 캐시 파일 경로를 반환하는 헬퍼
 * 키 값을 파일명으로 사용: "kr-index" → "data/cache/kr-index.json"
 */
function getCachePath(key: string): string {
  // 경로 탐색 공격 방지: 키에서 경로 구분자 제거
  const safeKey = key.replace(/[/\\]/g, "-");
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

/**
 * 캐시에서 데이터를 읽어 반환
 * - 파일이 없거나 만료된 경우 null 반환 → Route Handler에서 외부 API 재호출
 * @param key - 캐시 키 (예: "kr-index-20250327", "price-us")
 * @returns 유효한 캐시 데이터 또는 null
 */
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const filePath = getCachePath(key);
    const raw = await fs.readFile(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);

    // 만료 시각과 현재 시각 비교
    const now = new Date();
    const expiresAt = new Date(entry.expiresAt);

    if (now > expiresAt) {
      // 만료된 캐시 — null 반환 (파일은 덮어쓰기로 자연 갱신)
      return null;
    }

    return entry.data;
  } catch {
    // 파일 없음(ENOENT) 또는 JSON 파싱 오류 — 캐시 미스로 처리
    return null;
  }
}

/**
 * 데이터를 캐시 파일에 저장
 * 원자적 쓰기(atomic write) 패턴: 임시 파일에 먼저 기록 후 rename으로 교체
 * → 쓰기 도중 서버가 종료되더라도 기존 캐시 파일이 손상되지 않음
 * @param key          - 캐시 키
 * @param data         - 저장할 데이터
 * @param ttlSeconds   - 캐시 유효 시간 (초)
 */
export async function writeCache<T>(
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const entry: CacheEntry<T> = {
    data,
    cachedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const filePath = getCachePath(key);
  // 임시 파일 경로 — 원자적 쓰기를 위해 같은 디렉토리에 생성
  const tmpPath = `${filePath}.tmp`;

  try {
    // 캐시 디렉토리가 없을 경우 자동 생성 (최초 실행 대비)
    await fs.mkdir(CACHE_DIR, { recursive: true });

    // 1단계: 임시 파일에 기록
    await fs.writeFile(tmpPath, JSON.stringify(entry), "utf-8");

    // 2단계: 임시 파일을 대상 파일로 원자적 교체
    // fs.rename은 같은 파일시스템 내에서 원자적으로 동작
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // 임시 파일이 남아 있을 경우 정리 시도 (실패해도 무시)
    try {
      await fs.unlink(tmpPath);
    } catch {
      // 임시 파일 삭제 실패는 무시
    }
    // Vercel 등 읽기 전용 파일시스템 환경에서는 쓰기가 불가능하므로
    // 에러를 throw하지 않고 경고만 출력 — 캐시 없이도 정상 응답 가능
    console.warn("[cache] writeCache 실패 (읽기 전용 환경 또는 권한 오류):", (error as Error).message);
  }
}

/**
 * 만료 여부와 무관하게 캐시 데이터를 읽는다 (stale-while-revalidate 패턴용)
 * 외부 API 실패 시 기존 캐시라도 반환하여 500 에러 대신 stale 데이터를 제공
 * @param key - 캐시 키
 * @returns 캐시 데이터 또는 null (파일 없음 / JSON 파싱 오류)
 */
export async function readStaleCache<T>(key: string): Promise<T | null> {
  try {
    const filePath = getCachePath(key);
    const raw = await fs.readFile(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(raw);
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * 특정 캐시 항목을 삭제
 * 데이터 갱신을 강제할 때 사용
 * @param key - 삭제할 캐시 키
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await fs.unlink(getCachePath(key));
  } catch {
    // 파일이 없어도 오류 무시
  }
}
