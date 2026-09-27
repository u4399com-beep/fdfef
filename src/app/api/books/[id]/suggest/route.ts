import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { fetchSuggestKeywords, mergeSuggestKeywords } from '@/lib/collect/suggest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string }> }

/** 抓取多搜索引擎下拉词并保存为书籍辅助标签 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const book = await db.book.findUnique({ where: { id } })
  if (!book) return NextResponse.json({ error: '书籍不存在' }, { status: 404 })

  const results = await fetchSuggestKeywords(book.title)
  const merged = mergeSuggestKeywords(results, book.title)
  const existing = book.suggestKeywords.split(',').filter(Boolean)
  const combined = [...new Set([...existing, ...merged])]

  await db.book.update({ where: { id }, data: { suggestKeywords: combined.join(',') } })
  return NextResponse.json({
    ok: true,
    sources: results.map((r) => ({ source: r.source, count: r.keywords.length, error: r.error })),
    keywords: merged,
    total: combined.length,
  })
}
