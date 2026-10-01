'use client'

import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  Flame,
  List,
  Sparkles,
  User,
} from 'lucide-react'
import type { BookCard, ChapterItem, SiteMeta, SiteView, ThemeProps } from '@/lib/theme-types'

type Nav = (v: SiteView) => void

/* ================= 分类徽章配色 ================= */

const BADGES = [
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-600',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700',
] as const

function badgeClass(category: string): string {
  let hash = 0
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash * 31 + category.charCodeAt(i)) % 997
  }
  return BADGES[hash % BADGES.length]
}

/* ================= 页头 / 页脚 / 面包屑 ================= */

function Header({ site, onNavigate }: { site: SiteMeta; onNavigate: Nav }) {
  return (
    <header className="border-b border-stone-200 bg-white/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => onNavigate({ type: 'home' })}
          className="flex min-h-[44px] items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-stone-900">
            {site.siteName}
          </span>
        </button>
        <nav aria-label="主导航" className="flex items-center gap-1 text-sm font-semibold text-stone-500">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="min-h-[44px] rounded-full px-4 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            首页
          </button>
          {site.mainBookId ? (
            <button
              type="button"
              onClick={() => onNavigate({ type: 'book', bookId: site.mainBookId })}
              className="min-h-[44px] rounded-full px-4 transition-colors hover:bg-stone-100 hover:text-stone-900"
            >
              主推书籍
            </button>
          ) : null}
        </nav>
      </div>
    </header>
  )
}

function Footer({ site }: { site: SiteMeta }) {
  return (
    <footer className="mt-14 bg-stone-900 py-8 text-center text-sm text-stone-400">
      <p>{site.footerText || `${site.siteName} · ${site.domain}`}</p>
      <p className="mt-1.5 text-xs text-stone-500">{site.title}</p>
    </footer>
  )
}

function Crumbs({ trail }: { trail: { label: string; onSelect?: () => void }[] }) {
  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1 py-4 text-sm font-medium text-stone-500">
      {trail.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-4 w-4 text-stone-300" aria-hidden="true" />}
          {item.onSelect ? (
            <button
              type="button"
              onClick={item.onSelect}
              className="inline-flex min-h-[44px] items-center rounded-full px-2 transition-colors hover:bg-stone-100 hover:text-emerald-700"
            >
              {item.label}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center px-2 font-semibold text-stone-800">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ================= 骨架屏 ================= */

function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
          <div className="aspect-[16/10] animate-pulse bg-stone-200 sm:aspect-[3/4]" />
          <div className="space-y-2.5 p-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function BookPageSkeleton() {
  return (
    <div
      className="mt-2 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70 sm:p-10"
      aria-hidden="true"
    >
      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <div className="aspect-[3/4] w-44 animate-pulse self-center rounded-2xl bg-stone-200 md:self-start" />
        <div className="flex-1 space-y-4 py-1">
          <div className="h-8 w-1/2 animate-pulse rounded bg-stone-200" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-stone-100" />
        </div>
      </div>
    </div>
  )
}

function ChapterSkeleton() {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-stone-200/70" aria-hidden="true">
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-stone-200" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 animate-pulse rounded bg-stone-100 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`}
          />
        ))}
      </div>
    </div>
  )
}

/* ================= 书籍卡片（home / keyword 复用） ================= */

function BookCard({ book, onNavigate }: { book: BookCard; onNavigate: Nav }) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/80 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
      <button
        type="button"
        onClick={() => onNavigate({ type: 'book', bookId: book.id })}
        className="absolute inset-0 z-10"
        aria-label={`阅读《${book.title}》`}
      />
      <div className="relative aspect-[16/10] overflow-hidden bg-stone-100 sm:aspect-[3/4]">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={`《${book.title}》封面`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-200 via-amber-100 to-rose-200 text-5xl font-black text-stone-700">
            {book.title.charAt(0) || '书'}
          </div>
        )}
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${badgeClass(book.category)}`}
        >
          {book.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-base font-extrabold text-stone-900 transition-colors group-hover:text-emerald-600">
          {book.title}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
          <User className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{book.author}</span>
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-stone-400">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{book.latestChapter || '暂无'}</span>
        </p>
      </div>
    </article>
  )
}

/* ================= 章节行（book 最新更新 / toc 复用） ================= */

function ChapterRow({ chapter, onNavigate }: { chapter: ChapterItem; onNavigate: Nav }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onNavigate({ type: 'chapter', chapterId: chapter.id })}
        className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-emerald-50"
      >
        <span className="w-8 shrink-0 text-xs font-bold text-stone-300">
          {String(chapter.order).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-stone-700">{chapter.title}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300" aria-hidden="true" />
      </button>
    </li>
  )
}

/* ================= Home ================= */

function MagazineHome({ site, data, loading, onNavigate }: ThemeProps) {
  const [category, setCategory] = useState('全部')
  const books = data.books ?? []
  const categories = ['全部', ...(data.categories ?? [])]
  const filtered = category === '全部' ? books : books.filter((b) => b.category === category)

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        {/* 渐变斑马纹大 banner */}
        <section
          className="relative mt-6 overflow-hidden rounded-3xl px-6 py-10 sm:px-12 sm:py-14"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.28) 0 20px, rgba(255,255,255,0) 20px 40px), linear-gradient(100deg, #34d399 0%, #fbbf24 52%, #fb7185 100%)',
          }}
        >
          <div className="relative">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1 text-xs font-bold tracking-wide text-emerald-700 shadow-sm">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              本周热门书单
            </p>
            <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight text-white drop-shadow-sm sm:text-5xl">
              {site.title || site.siteName}
            </h1>
            {site.description && (
              <p className="mt-4 max-w-xl text-sm font-medium leading-relaxed text-white/90 sm:text-base">
                {site.description}
              </p>
            )}
          </div>
        </section>

        {/* 分类筛选胶囊 */}
        <nav aria-label="分类筛选" className="flex flex-wrap items-center gap-2 py-6">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition-all ${
                category === c
                  ? 'bg-stone-900 text-white shadow-md'
                  : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-100 hover:text-stone-800'
              }`}
            >
              {c}
            </button>
          ))}
        </nav>

        {loading ? (
          <GridSkeleton />
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-stone-300" aria-hidden="true" />
            <p className="mt-4 text-sm text-stone-500">这个分类下还没有书籍，去看看别的吧。</p>
          </div>
        ) : (
          <section
            aria-label="书籍列表"
            className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {filtered.map((book) => (
              <BookCard key={book.id} book={book} onNavigate={onNavigate} />
            ))}
          </section>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Book ================= */

function MagazineBook({ site, data, loading, onNavigate }: ThemeProps) {
  const book = data.book
  const keywords = book
    ? Array.from(new Set([...book.keywords, ...book.suggestKeywords]))
    : []

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <Crumbs
          trail={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            { label: book?.title ?? (loading ? '加载中' : '书籍详情') },
          ]}
        />

        {loading ? (
          <BookPageSkeleton />
        ) : !book ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-stone-300" aria-hidden="true" />
            <p className="mt-4 text-sm text-stone-500">未找到该书籍，可能已被移除。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-stone-700"
            >
              返回首页
            </button>
          </div>
        ) : (
          <>
            <article className="mt-2 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70 sm:p-10">
              <div className="flex flex-col gap-6 md:flex-row md:gap-10">
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={`《${book.title}》封面`}
                    className="aspect-[3/4] w-40 shrink-0 self-center rounded-2xl object-cover shadow-md md:self-start"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-40 shrink-0 self-center items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-200 via-amber-100 to-rose-200 text-5xl font-black text-stone-700 md:self-start">
                    {book.title.charAt(0) || '书'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${badgeClass(book.category)}`}
                  >
                    {book.category}
                  </span>
                  <h1 className="mt-3 text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">
                    {book.title}
                  </h1>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-500">
                    <span className="flex items-center gap-1.5">
                      <User className="h-4 w-4" aria-hidden="true" />
                      {book.author}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <List className="h-4 w-4" aria-hidden="true" />
                      {book.totalChapters} 章
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        // 否定前缀防误判：「未完结」「未完待续」不算完结（与引擎侧完结判定语义对齐）
                        book.status.includes('完') && !book.status.includes('未')
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-rose-100 text-rose-600'
                      }`}
                    >
                      {book.status}
                    </span>
                  </div>
                  <p className="mt-4 leading-relaxed text-stone-600">{book.intro}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={!book.firstChapterId}
                      onClick={() => {
                        if (book.firstChapterId) onNavigate({ type: 'chapter', chapterId: book.firstChapterId })
                      }}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 text-sm font-bold text-white shadow-md shadow-emerald-500/25 transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                    >
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                      开始阅读
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate({ type: 'toc', bookId: book.id })}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-700 transition-colors hover:border-emerald-400 hover:text-emerald-700"
                    >
                      <List className="h-4 w-4" aria-hidden="true" />
                      查看全部 {book.totalChapters} 章目录
                    </button>
                  </div>
                  {keywords.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {keywords.map((kw) => (
                        <button
                          key={kw}
                          type="button"
                          onClick={() => onNavigate({ type: 'keyword', keyword: kw })}
                          className="min-h-[44px] rounded-full bg-stone-100 px-3.5 py-1 text-sm font-medium text-stone-600 transition-colors hover:bg-emerald-100 hover:text-emerald-700"
                        >
                          # {kw}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>

            <section
              aria-label="最新更新"
              className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70 sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-extrabold text-stone-900">
                  <Clock className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                  最新更新
                  <span className="text-sm font-medium text-stone-400">
                    最近 {book.chapters.length} 章 / 共 {book.totalChapters} 章
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate({ type: 'toc', bookId: book.id })}
                  className="min-h-[44px] rounded-full bg-stone-100 px-4 text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-200"
                >
                  完整目录 →
                </button>
              </div>
              {book.chapters.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone-400">暂无章节。</p>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {book.chapters.map((ch) => (
                    <ChapterRow key={ch.id} chapter={ch} onNavigate={onNavigate} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Chapter ================= */

function MagazineChapter({ site, data, loading, onNavigate }: ThemeProps) {
  const chapter = data.chapter
  const paragraphs = chapter
    ? chapter.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4">
        <Crumbs
          trail={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            chapter
              ? {
                  label: chapter.bookTitle,
                  onSelect: () => onNavigate({ type: 'book', bookId: chapter.bookId }),
                }
              : { label: '书籍' },
            { label: chapter?.title ?? '正文' },
          ]}
        />

        {loading ? (
          <ChapterSkeleton />
        ) : !chapter ? (
          <div className="py-24 text-center">
            <p className="text-sm text-stone-500">未找到该章节内容。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-stone-700"
            >
              返回首页
            </button>
          </div>
        ) : (
          <>
            <article className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-200/70 sm:p-10">
              <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
                {chapter.title}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-400">
                <span>《{chapter.bookTitle}》</span>
                <span aria-hidden="true">·</span>
                <span>第 {chapter.order} 章</span>
              </p>
              <div className="mt-6 border-t border-stone-100 pt-6" aria-hidden="true" />
              <div className="space-y-5">
                {paragraphs.map((p, i) => (
                  <p key={i} className="text-[17px] leading-8 text-stone-700">
                    {p}
                  </p>
                ))}
              </div>
            </article>
            <nav
              aria-label="章节导航"
              className="mt-6 flex flex-col gap-3 pb-4 sm:flex-row sm:justify-between"
            >
              <button
                type="button"
                disabled={!chapter.prevId}
                onClick={() => {
                  if (chapter.prevId) onNavigate({ type: 'chapter', chapterId: chapter.prevId })
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-6 text-sm font-semibold text-stone-600 shadow-sm transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                上一章
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ type: 'toc', bookId: chapter.bookId })}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-stone-700"
              >
                返回目录
              </button>
              <button
                type="button"
                disabled={!chapter.nextId}
                onClick={() => {
                  if (chapter.nextId) onNavigate({ type: 'chapter', chapterId: chapter.nextId })
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一章
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          </>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Toc（完整章节目录页） ================= */

const TOC_PAGE_SIZE = 100

function MagazineToc({ site, data, loading, onNavigate }: ThemeProps) {
  const [page, setPage] = useState(1)
  const book = data.book
  const chapters = book?.chapters ?? []
  const totalPages = Math.max(1, Math.ceil(chapters.length / TOC_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visible = chapters.slice((safePage - 1) * TOC_PAGE_SIZE, safePage * TOC_PAGE_SIZE)

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <Crumbs
          trail={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            {
              label: book?.title ?? '书籍',
              onSelect: book ? () => onNavigate({ type: 'book', bookId: book.id }) : undefined,
            },
            { label: '章节目录' },
          ]}
        />

        {loading ? (
          <BookPageSkeleton />
        ) : !book ? (
          <div className="py-24 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-stone-300" aria-hidden="true" />
            <p className="mt-4 text-sm text-stone-500">未找到该书籍，可能已被移除。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-stone-700"
            >
              返回首页
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
                {book.title}
                <span className="ml-3 text-base font-medium text-stone-400">章节目录</span>
              </h1>
              <p className="text-sm text-stone-500">
                {book.author} · 共 {book.totalChapters} 章
              </p>
            </div>

            <nav
              aria-label="目录分页"
              className="mt-4 flex flex-wrap items-center gap-2 border-y border-stone-200 py-3"
            >
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[36px] rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-stone-500">
                第 {safePage} / {totalPages} 页
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[36px] rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
            </nav>

            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone-400">暂无章节。</p>
            ) : (
              <div className="mb-2 mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 sm:p-6">
                <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                  {visible.map((ch) => (
                    <ChapterRow key={ch.id} chapter={ch} onNavigate={onNavigate} />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Keyword ================= */

function MagazineKeyword({
  site,
  data,
  loading,
  onNavigate,
  keyword,
}: ThemeProps & { keyword: string }) {
  const books = data.keywordBooks ?? []
  const goMain = () =>
    onNavigate(site.mainBookId ? { type: 'book', bookId: site.mainBookId } : { type: 'home' })
  const related = Array.from(
    new Set(
      books
        .flatMap((b) => [...b.keywords, ...b.suggestKeywords])
        .filter((k) => k !== keyword),
    ),
  ).slice(0, 12)

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-900">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <Crumbs
          trail={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            { label: `关键词：${keyword}` },
          ]}
        />

        {/* 最醒目的主书籍入口 */}
        <button
          type="button"
          onClick={goMain}
          className="group flex min-h-[44px] w-full items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-6 py-5 text-left shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:shadow-xl"
        >
          <span className="flex items-center gap-3 text-base font-extrabold text-white">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            进入主书籍信息页
          </span>
          <ArrowRight
            className="h-5 w-5 text-white transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </button>

        <section className="py-10">
          <h1 className="text-3xl font-black tracking-tight text-stone-900 sm:text-4xl">
            {keyword}
          </h1>
          <p className="mt-3 text-sm text-stone-500">与《{keyword}》相关的书籍与内容</p>
        </section>

        {loading ? (
          <GridSkeleton count={4} />
        ) : books.length === 0 ? (
          <div className="py-20 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-stone-300" aria-hidden="true" />
            <p className="mt-4 text-sm text-stone-500">暂无与「{keyword}」相关的书籍。</p>
          </div>
        ) : (
          <section
            aria-label="相关书籍"
            className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {books.map((book) => (
              <BookCard key={book.id} book={book} onNavigate={onNavigate} />
            ))}
          </section>
        )}

        {related.length > 0 && (
          <section aria-label="相关关键词" className="mt-6 pb-4">
            <h2 className="text-sm font-bold text-stone-400">相关关键词</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onNavigate({ type: 'keyword', keyword: k })}
                  className="min-h-[44px] rounded-full bg-white px-4 text-sm font-medium text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                >
                  # {k}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= 主组件 ================= */

export function ThemeMagazine(props: ThemeProps): ReactElement {
  const { view } = props
  switch (view.type) {
    case 'home':
      return <MagazineHome {...props} />
    case 'book':
      return <MagazineBook {...props} />
    case 'toc':
      return <MagazineToc {...props} />
    case 'chapter':
      return <MagazineChapter {...props} />
    case 'keyword':
      return <MagazineKeyword {...props} keyword={view.keyword} />
    default:
      return <MagazineHome {...props} />
  }
}

export default ThemeMagazine
