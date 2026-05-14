// 등록된 폴더 목록 조회 — ~/notion-sync/config.json 읽기
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_PATH = path.join(os.homedir(), 'notion-sync', 'config.json')

export interface FolderEntry {
  database_id: string
  database_name: string
  parent_page_id: string
}

export async function GET() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return NextResponse.json({ folders: {} })
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const config = JSON.parse(raw)
    return NextResponse.json({ folders: config.folders ?? {} })
  } catch {
    return NextResponse.json({ folders: {} })
  }
}
