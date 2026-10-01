import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, chapterContentText, RouteCtx } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 单章正文（后台章节预览用） */
export async function GET(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const chapter = await db.chapter.findUnique({ where: { id } })
  if (!chapter) return json({ error: '章节不存在' }, { status: 404 })
  const content = await chapterContentText(chapter)
  return json({ chapter: { id: chapter.id, title: chapter.title, order: chapter.order, content, wordCount: chapter.wordCount, collected: chapter.collected } })
}
