/**
 * Upstash Redis 기반 캐시 유틸리티
 *
 * 서버 전용 모듈 — Next.js Route Handler에서만 사용 (브라우저 import 금지)
 * 파일 기반 캐시(data/cache/)를 대체하여 Vercel/서버리스 환경에서도 동작
 *
 * 함수 시그니처는 기존 파일 기반 캐시와 동일하게 유지 (호출부 변경 불필요)
 */

import { Redis } from "@upstash/redis";

// Vercel KV (Upstash Redis) 연결 — 환경변수에서 자동 로드
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/** 캐시 항목 구조 — 기존 파일 캐시와 동일한 포맷 유지 */
interface CacheEntry<T> {
  data: T;
  cachedAt: string;   // ISO 8601
  expiresAt: string;  // ISO 8601
}

/** 캐시 키 정규화 — 경로 구분자를 하이픈으로 변환 (경로 탐색 공격 방지) */
function safeKey(key: string): string {
  return key.replace(/[/\\]/g, "-");
}

/**
 * 캐시에서 데이터를 읽어 반환
 * - 키가 없거나 만료된 경우 null 반환 → Route Handler에서 외부 API 재호출
 */
export async function readCache<T>(key: string): Promise<T | null> {
  try {
    // Redis에서 JSON 파싱 포함하여 읽기
    const entry = await redis.get<CacheEntry<T>>(safeKey(key));
    if (!entry) return null;

    // 만료 시각과 현재 시각 비교
    if (new Date() > new Date(entry.expiresAt)) return null;

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * 데이터를 캐시에 저장
 * TTL 정보는 JSON 내부에 포함 + Redis 키 자체는 만료 없이 저장
 * (만료 후에도 stale-while-revalidate 패턴으로 폴백 가능하게 유지)
 */
export async function writeCache<T>(
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  const now = new Date();
  const entry: CacheEntry<T> = {
    data,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  };

  try {
    // Redis에 저장 — TTL 없이 영구 보관 (총 키 수가 소수라 스토리지 문제 없음)
    // stale-while-revalidate 지원을 위해 만료 후에도 키 유지
    await redis.set(safeKey(key), entry);
  } catch (error) {
    // Vercel 환경 외 연결 오류 등 → 경고만 출력, 요청은 계속 진행
    console.warn("[cache] writeCache 실패:", (error as Error).message);
  }
}

/**
 * 만료 여부와 무관하게 캐시 데이터를 읽는다 (stale-while-revalidate 패턴용)
 * 외부 API 실패 시 기존 캐시라도 반환하여 500 에러 대신 stale 데이터를 제공
 */
export async function readStaleCache<T>(key: string): Promise<T | null> {
  try {
    const entry = await redis.get<CacheEntry<T>>(safeKey(key));
    return entry?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 특정 캐시 항목을 삭제
 * 데이터 갱신을 강제할 때 사용
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(safeKey(key));
  } catch {
    // 키가 없어도 오류 무시
  }
}
