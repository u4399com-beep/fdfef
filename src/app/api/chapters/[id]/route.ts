import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 单章正文（后台章节预览用） */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const chapter = await db.chapter.findUnique({ where: { id } })
  if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 })
  let content = chapter.content
  if (!content && chapter.contentLocal) {
    const { readChapterTxt } = await import('@/lib/collect/storage')
    content = await readChapterTxt(chapter.contentLocal).catch(() => '')
  }
  return NextResponse.json({ chapter: { id: chapter.id, title: chapter.title, order: chapter.order, content, wordCount: chapter.wordCount, collected: chapter.collected } })
}
