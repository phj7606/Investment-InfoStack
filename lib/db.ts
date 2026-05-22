/**
 * Supabase 클라이언트 싱글턴
 *
 * 서버 전용 모듈 — Next.js Route Handler / Server Action에서만 사용 (브라우저 import 금지)
 * SUPABASE_SERVICE_ROLE_KEY는 RLS를 우회하므로 클라이언트 번들에 포함되면 안 됨
 *
 * 앱 전체 데이터는 단일 app_data 테이블의 JSONB 컬럼에 key-value 방식으로 저장
 */

import { createClient } from "@supabase/supabase-js";

// Supabase 프로젝트 URL 및 서비스 롤 키 — Vercel 환경변수에 등록 필요
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

// ─────────────────────────────────────────────────────────────────
// app_data 테이블 헬퍼
// 테이블 구조: { key TEXT PK, data JSONB, updated_at TIMESTAMPTZ }
// ─────────────────────────────────────────────────────────────────

/**
 * key에 해당하는 JSONB 데이터를 읽어 반환
 * 키가 없거나 오류 발생 시 fallback 반환
 */
export async function readKey<T>(key: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await supabase
      .from("app_data")
      .select("data")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      console.error(`[db] readKey(${key}) 오류:`, error.message);
      return fallback;
    }
    // 행이 없으면 maybeSingle은 data = null 반환
    if (!data) return fallback;
    return data.data as T;
  } catch (err) {
    console.error(`[db] readKey(${key}) 예외:`, err);
    return fallback;
  }
}

/**
 * key에 해당하는 JSONB 데이터를 저장 (upsert)
 * 기존 값이 있으면 덮어쓰고, 없으면 신규 삽입
 */
export async function writeKey<T>(key: string, value: T): Promise<void> {
  const { error } = await supabase.from("app_data").upsert(
    { key, data: value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  if (error) {
    throw new Error(`[db] writeKey(${key}) 실패: ${error.message}`);
  }
}
