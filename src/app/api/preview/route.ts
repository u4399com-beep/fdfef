import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
 * type=book 书籍详情（主关键词落地页）
 * type=chapter 章节正文
 * type=keyword 关键词落地页（均指向主书籍信息页）
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
  }

  if (type === 'home') {
    const all = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
    const offset = site?.offset ?? 0
    const rotated = all.length > 1 ? [...all.slice(offset % all.length), ...all.slice(0, offset % all.length)] : all
    const books = rotated.slice(0, 36).map(toCard)
    const categories = [...new Set(all.map((b) => b.category).filter(Boolean))]
    return NextResponse.json({ site: siteMeta, view: { type: 'home' }, data: { books, categories } })
  }

  if (type === 'book') {
    const bookId = sp.get('bookId') ?? siteMeta.mainBookId
    const book = bookId ? await db.book.findUnique({ where: { id: bookId } }) : null
    if (!book) return NextResponse.json({ error: '书籍不存在' }, { status: 404 })
    const chapters = await db.chapter.findMany({
      where: { bookId: book.id },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, order: true },
      take: 5000,
    })
    return NextResponse.json({
      site: siteMeta,
      view: { type: 'book', bookId: book.id },
      data: { book: { ...toCard(book), chapters, updatedAt: book.updatedAt.toISOString() } },
    })
  }

  if (type === 'chapter') {
    const chapterId = sp.get('chapterId') ?? ''
    const chapter = await db.chapter.findUnique({ where: { id: chapterId } })
    if (!chapter) return NextResponse.json({ error: '章节不存在' }, { status: 404 })
    const book = await db.book.findUnique({ where: { id: chapter.bookId } })
    const [prev, next] = await Promise.all([
      db.chapter.findFirst({ where: { bookId: chapter.bookId, order: { lt: chapter.order } }, orderBy: { order: 'desc' }, select: { id: true } }),
      db.chapter.findFirst({ where: { bookId: chapter.bookId, order: { gt: chapter.order } }, orderBy: { order: 'asc' }, select: { id: true } }),
    ])
    let content = chapter.content
    if (!content && chapter.contentLocal) {
      const { readChapterTxt } = await import('@/lib/collect/storage')
      content = await readChapterTxt(chapter.contentLocal).catch(() => '')
    }
    return NextResponse.json({
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

  if (type === 'keyword') {
    const keyword = sp.get('keyword') ?? ''
    const all = await db.book.findMany({ orderBy: { updatedAt: 'desc' }, take: 200 })
    const kw = keyword.trim().toLowerCase()
    const matched = all
      .filter((b) => {
        const hay = [b.title, b.keywords, b.suggestKeywords, b.category, b.intro.slice(0, 200)].join(',').toLowerCase()
        return hay.includes(kw)
      })
      .slice(0, 12)
      .map(toCard)
    return NextResponse.json({
      site: siteMeta,
      view: { type: 'keyword', keyword },
      data: { keywordBooks: matched, books: all.slice(0, 12).map(toCard) },
    })
  }

  return NextResponse.json({ error: '未知视图' }, { status: 400 })
}
