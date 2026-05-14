// Notion API 키 저장/조회 — ~/notion-sync/.env 파일 읽기·쓰기
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ENV_PATH = path.join(os.homedir(), 'notion-sync', '.env')

// API 키 읽기
export async function GET() {
  try {
    if (!fs.existsSync(ENV_PATH)) return NextResponse.json({ apiKey: '' })
    const content = fs.readFileSync(ENV_PATH, 'utf-8')
    const match = content.match(/^NOTION_API_KEY=(.+)$/m)
    return NextResponse.json({ apiKey: match ? match[1].trim() : '' })
  } catch {
    return NextResponse.json({ apiKey: '' })
  }
}

// API 키 저장 — 기존 값 있으면 replace, 없으면 append
export async function POST(req: NextRequest) {
  const { apiKey } = await req.json()

  let content = ''
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8')
    if (/^NOTION_API_KEY=.*/m.test(content)) {
      content = content.replace(/^NOTION_API_KEY=.*/m, `NOTION_API_KEY=${apiKey}`)
    } else {
      content = content.trimEnd() + `\nNOTION_API_KEY=${apiKey}\n`
    }
  } else {
    content = `NOTION_API_KEY=${apiKey}\n`
  }

  fs.writeFileSync(ENV_PATH, content, 'utf-8')
  return NextResponse.json({ success: true })
}
