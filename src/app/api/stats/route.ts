import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 仪表盘统计 */
export async function GET() {
  const [books, chapters, tasks, sites, rules, collected] = await Promise.all([
    db.book.count(),
    db.chapter.count(),
    db.collectTask.count(),
    db.siteConfig.count(),
    db.collectRule.count(),
    db.chapter.count({ where: { collected: true } }),
  ])
  const words = await db.chapter.aggregate({ _sum: { wordCount: true } })
  const [booksDone, booksSerial] = await Promise.all([
    db.book.count({ where: { status: '完结' } }),
    db.book.count({ where: { status: '连载' } }),
  ])
  const recentTasks = await db.collectTask.findMany({ orderBy: { updatedAt: 'desc' }, take: 5 })
  const recentBooks = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 5 })
  return NextResponse.json({
    books,
    chapters,
    contents: collected,
    tasks,
    sites,
    rules,
    words: words._sum.wordCount ?? 0,
    booksDone,
    booksSerial,
    recentTasks,
    recentBooks,
  })
}
