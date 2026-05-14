// Notion Integration이 접근 가능한 페이지 목록 조회
import { NextRequest, NextResponse } from 'next/server'

export interface NotionPageItem {
  id: string
  title: string
  emoji: string
  url: string
}

export async function GET(req: NextRequest) {
  // API 키는 헤더로 수신 (클라이언트에서 직접 노출되지 않도록 서버 경유)
  const apiKey = req.headers.get('x-notion-key') ?? ''
  if (!apiKey.startsWith('secret_')) {
    return NextResponse.json({ pages: [], error: '유효하지 않은 API 키 형식입니다' })
  }

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: { value: 'page', property: 'object' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ pages: [], error: data.message ?? '알 수 없는 오류' })
    }

    // 페이지 제목 · 이모지 추출
    const pages: NotionPageItem[] = data.results.map((page: Record<string, unknown>) => {
      const props = page.properties as Record<string, Record<string, unknown>> | undefined
      const titleArr =
        (props?.title?.title as Array<{ plain_text: string }>) ??
        (props?.Name?.title as Array<{ plain_text: string }>) ??
        []
      const title = titleArr[0]?.plain_text ?? '(제목 없음)'
      const icon = page.icon as { type: string; emoji?: string } | null
      const emoji = icon?.type === 'emoji' ? (icon.emoji ?? '') : ''
      return { id: page.id as string, title, emoji, url: page.url as string }
    })

    return NextResponse.json({ pages })
  } catch (err) {
    return NextResponse.json({ pages: [], error: String(err) })
  }
}
