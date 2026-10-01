import { db } from '@/lib/db'
import { json } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 仪表盘统计 */
export async function GET() {
  // 全部计数查询并行化（原先拆成 3 串行批次）
  const [books, chapters, tasks, sites, rules, collected, words, booksDone, booksSerial, recentTasks, recentBooks] =
    await Promise.all([
      db.book.count(),
      db.chapter.count(),
      db.collectTask.count(),
      db.siteConfig.count(),
      db.collectRule.count(),
      db.chapter.count({ where: { collected: true } }),
      db.chapter.aggregate({ _sum: { wordCount: true } }),
      db.book.count({ where: { status: '完结' } }),
      db.book.count({ where: { status: '连载' } }),
      db.collectTask.findMany({ orderBy: { updatedAt: 'desc' }, take: 5 }),
      db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 5 }),
    ])
  return json({
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
