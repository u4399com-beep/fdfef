import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, chapterContentText } from '../_lib/http'
import { parseSeoConfig } from '@/lib/seo/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function coverSrc(book: { coverLocal: string; coverUrl: string }): string {
  return book.coverLocal ? `/api/covers/${book.coverLocal}` : book.coverUrl || ''
}

function toCard(b: {
  id: string
  title: string
  author: string
  category: string
  intro: string
  coverUrl: string
  coverLocal: string
  status: string
  latestChapter: string
  totalChapters: number
  keywords: string
  suggestKeywords: string
}) {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    category: b.category,
    intro: b.intro,
    coverUrl: coverSrc(b),
    status: b.status,
    latestChapter: b.latestChapter,
    totalChapters: b.totalChapters,
    keywords: b.keywords.split(',').filter(Boolean),
    suggestKeywords: b.suggestKeywords.split(',').filter(Boolean),
  }
}

/**
 * 前台预览数据（站群主题渲染数据源）
 * type=home 书单（offset 偏移派生不同站点内容序列）
 * type=book 书籍详情（主关键词落地页；chapters 仅返回最新 12 章，完整目录见 toc）
 * type=toc 书籍完整章节目录页
 * type=chapter 章节正文
 * type=keyword 关键词落地页（均指向主书籍信息页）
 * type=pseo PSEO 内链枢纽（站点全部派生关键词索引）
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? 'home'
  const siteId = sp.get('siteId') ?? ''

  const site = siteId ? await db.siteConfig.findUnique({ where: { id: siteId } }) : await db.siteConfig.findFirst()
  const siteMeta = {
    id: site?.id ?? '',
    domain: site?.domain ?? 'localhost:3000',
    siteName: site?.siteName ?? '小说站预览',
    themeId: site?.themeId ?? 'classic',
    title: site?.title ?? '',
    description: site?.description ?? '',
    keywords: site?.keywords ?? '',
    footerText: site?.footerText ?? '',
    mainBookId: site?.mainBookId ?? '',
    seoConfig: site?.seoConfig ?? '{}',
  }

  if (type === 'home') {
    const all = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
    const offset = site?.offset ?? 0
    const rotated = all.length > 1 ? [...all.slice(offset % all.length), ...all.slice(0, offset % all.length)] : all
    const books = rotated.slice(0, 36).map(toCard)
    const categories = [...new Set(all.map((b) => b.category).filter(Boolean))]
    return json({ site: siteMeta, view: { type: 'home' }, data: { books, categories } })
  }

  if (type === 'book' || type === 'toc') {
    // || 而非 ??：bookId=（空串）同样视为未传，回退主书籍（与注释语义一致）
    const bookId = sp.get('bookId') || siteMeta.mainBookId
    const book = bookId ? await db.book.findUnique({ where: { id: bookId } }) : null
    if (!book) return json({ error: '书籍不存在' }, { status: 404 })

    if (type === 'toc') {
      const chapters = await db.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { order: 'asc' },
        select: { id: true, title: true, order: true },
        take: 5000,
      })
      return json({
        site: siteMeta,
        view: { type: 'toc', bookId: book.id },
        data: { book: { ...toCard(book), chapters, firstChapterId: chapters[0]?.id ?? null, updatedAt: book.updatedAt.toISOString() } },
      })
    }

    const [latest, first] = await Promise.all([
      db.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { order: 'desc' },
        select: { id: true, title: true, order: true },
        take: 12,
      }),
      db.chapter.findFirst({ where: { bookId: book.id }, orderBy: { order: 'asc' }, select: { id: true } }),
    ])
    return json({
      site: siteMeta,
      view: { type: 'book', bookId: book.id },
      data: { book: { ...toCard(book), chapters: latest, firstChapterId: first?.id ?? null, updatedAt: book.updatedAt.toISOString() } },
    })
  }

  if (type === 'chapter') {
    const chapterId = sp.get('chapterId') ?? ''
    const chapter = await db.chapter.findUnique({ where: { id: chapterId } })
    if (!chapter) return json({ error: '章节不存在' }, { status: 404 })
    const book = await db.book.findUnique({ where: { id: chapter.bookId } })
    const [prev, next] = await Promise.all([
      db.chapter.findFirst({ where: { bookId: chapter.bookId, order: { lt: chapter.order } }, orderBy: { order: 'desc' }, select: { id: true } }),
      db.chapter.findFirst({ where: { bookId: chapter.bookId, order: { gt: chapter.order } }, orderBy: { order: 'asc' }, select: { id: true } }),
    ])
    const content = await chapterContentText(chapter)
    return json({
      site: siteMeta,
      view: { type: 'chapter', chapterId: chapter.id },
      data: {
        chapter: {
          id: chapter.id,
          title: chapter.title,
          order: chapter.order,
          content,
          bookId: chapter.bookId,
          bookTitle: book?.title ?? '',
          prevId: prev?.id ?? null,
          nextId: next?.id ?? null,
        },
      },
    })
  }

  if (type === 'pseo') {
    // PSEO 内链枢纽：站点设定关键词 + 书籍标签/下拉词/分类聚合派生
    const cfg = parseSeoConfig(site?.seoConfig).pseo
    const manual = (cfg?.keywords ?? []).map((k) => ({ keyword: k, count: 0, source: 'manual' as const }))
    const all = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 200, select: { category: true, keywords: true, suggestKeywords: true } })
    const tally = new Map<string, { count: number; source: 'book' | 'suggest' | 'category' }>()
    const add = (kw: string, source: 'book' | 'suggest' | 'category') => {
      const key = kw.trim()
      if (!key || key.length > 24) return
      const cur = tally.get(key)
      if (cur) cur.count++
      else tally.set(key, { count: 1, source })
    }
    for (const b of all) {
      if (b.category) add(b.category, 'category')
      for (const k of b.keywords.split(',')) add(k, 'book')
      for (const k of b.suggestKeywords.split(',')) add(k, 'suggest')
    }
    // 权重降序，书籍标签与下拉词派生上限 60（枢纽页链接数可控）
    const derived = [...tally.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 60)
      .map(([keyword, v]) => ({ keyword, count: v.count, source: v.source }))
    const books = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 12 })
    // 去重（同词多源取首个来源）
    const seen = new Set<string>()
    const keywords = [...manual, ...derived].filter((k) => {
      const key = k.keyword.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return json({
      site: siteMeta,
      view: { type: 'pseo' },
      data: { pseoKeywords: keywords, books: books.map(toCard) },
    })
  }

  if (type === 'keyword') {
    const keyword = sp.get('keyword') ?? ''
    const kw = keyword.trim().toLowerCase()
    const all = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
    // 空关键词不派生「相关书籍」（includes('') 恒真会返回泛化列表，产生无意义落地页数据）
    const matched = kw
      ? all
          .filter((b) => {
            const hay = [b.title, b.keywords, b.suggestKeywords, b.category, b.intro.slice(0, 200)].join(',').toLowerCase()
            return hay.includes(kw)
          })
          .slice(0, 12)
          .map(toCard)
      : []
    return json({
      site: siteMeta,
      view: { type: 'keyword', keyword },
      data: { keywordBooks: matched, books: all.slice(0, 12).map(toCard) },
    })
  }

  return json({ error: '未知视图' }, { status: 400 })
}
