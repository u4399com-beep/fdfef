import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { fetchSuggestKeywords, mergeSuggestKeywords } from '@/lib/collect/suggest'
import { json, RouteCtx } from '../../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 抓取多搜索引擎下拉词并保存为书籍辅助标签 */
export async function POST(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(_req)
  if (denied) return denied
  const { id } = await params
  const book = await db.book.findUnique({ where: { id } })
  if (!book) return json({ error: '书籍不存在' }, { status: 404 })

  const results = await fetchSuggestKeywords(book.title)
  const merged = mergeSuggestKeywords(results, book.title)
  const existing = book.suggestKeywords.split(',').filter(Boolean)
  // 封顶防重复触发的无限增长（单轮 mergeSuggestKeywords 上限 30）
  const combined = [...new Set([...existing, ...merged])].slice(0, 40)

  await db.book.update({ where: { id }, data: { suggestKeywords: combined.join(',') } })
  return json({
    ok: true,
    sources: results.map((r) => ({ source: r.source, count: r.keywords.length, error: r.error })),
    keywords: merged,
    total: combined.length,
  })
}
