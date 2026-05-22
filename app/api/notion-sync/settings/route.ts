// Notion API 키 저장/조회 — Supabase app_data 테이블 사용
import { NextRequest, NextResponse } from "next/server";
import { readKey, writeKey } from "@/lib/db";

const KEY = "notion_api_key";

// API 키 읽기
export async function GET() {
  try {
    const apiKey = await readKey<string>(KEY, "");
    return NextResponse.json({ apiKey });
  } catch {
    return NextResponse.json({ apiKey: "" });
  }
}

// API 키 저장
export async function POST(req: NextRequest) {
  const { apiKey } = await req.json();
  await writeKey(KEY, apiKey ?? "");
  return NextResponse.json({ success: true });
}
