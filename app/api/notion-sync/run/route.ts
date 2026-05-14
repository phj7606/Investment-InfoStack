// Notion Sync 실행 API — Python 스크립트를 spawn해서 stdout/stderr를 SSE로 스트리밍
import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'

// ~/notion-sync/notion_sync.py 경로 고정
const SCRIPT_PATH = path.join(os.homedir(), 'notion-sync', 'notion_sync.py')
const SCRIPT_DIR = path.join(os.homedir(), 'notion-sync')

export async function POST(req: NextRequest) {
  const { command, folder, parentPage, dbName, dryRun } = await req.json()

  // 커맨드별 python3 인자 조합
  const args: string[] = [
    '-u',       // stdout 버퍼링 해제 → 실시간 스트리밍
    SCRIPT_PATH,
    command,
  ]

  if (folder) args.push('--folder', folder)

  if (command === 'init') {
    if (parentPage) args.push('--parent-page', parentPage)
    if (dbName) args.push('--db-name', dbName)
  }

  if (command === 'sync' && dryRun) {
    args.push('--dry-run')
  }

  const encoder = new TextEncoder()

  // ReadableStream으로 python 프로세스 출력을 실시간 SSE 전송
  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn('python3', args, { cwd: SCRIPT_DIR })

      const send = (text: string, error = false) => {
        const payload = JSON.stringify({ text, error })
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
      }

      proc.stdout.on('data', (data: Buffer) => send(data.toString()))
      proc.stderr.on('data', (data: Buffer) => send(data.toString(), true))

      proc.on('close', (code: number | null) => {
        // done 이벤트로 종료 코드 전달
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, code: code ?? -1 })}\n\n`)
        )
        controller.close()
      })

      proc.on('error', (err: Error) => {
        send(`프로세스 실행 오류: ${err.message}`, true)
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, code: -1 })}\n\n`)
        )
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
