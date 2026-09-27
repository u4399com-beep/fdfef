'use client'

import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  Feather,
  List,
  Tag,
  User,
} from 'lucide-react'
import type { BookCard, SiteMeta, SiteView, ThemeProps } from '@/lib/theme-types'

type Nav = (v: SiteView) => void

/* ================= 封面（含占位） ================= */

function Cover({
  book,
  className,
}: {
  book: Pick<BookCard, 'title' | 'coverUrl'>
  className: string
}) {
  if (book.coverUrl) {
    return (
      <img
        src={book.coverUrl}
        alt={`《${book.title}》封面`}
        className={`${className} shrink-0 rounded-sm border border-amber-200/80 object-cover shadow-sm`}
      />
    )
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-sm border border-amber-300/70 bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200 font-serif text-2xl font-bold text-amber-800 shadow-sm`}
    >
      {book.title.charAt(0) || '书'}
    </div>
  )
}

/* ================= 页头 / 页脚 / 面包屑 ================= */

function Header({ site, onNavigate }: { site: SiteMeta; onNavigate: Nav }) {
  return (
    <header className="border-b-2 border-amber-700/50 bg-amber-50/80">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => onNavigate({ type: 'home' })}
          className="flex min-h-[44px] items-center gap-2 self-start font-serif text-2xl font-bold tracking-wide text-stone-800 transition-colors hover:text-amber-800"
        >
          <Feather className="h-6 w-6 text-amber-700" aria-hidden="true" />
          {site.siteName}
        </button>
        <nav aria-label="主导航" className="flex items-center font-serif text-sm text-stone-600">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="min-h-[44px] px-3 transition-colors hover:text-amber-800"
          >
            首页
          </button>
          <span className="text-amber-300" aria-hidden="true">｜</span>
          {site.mainBookId ? (
            <button
              type="button"
              onClick={() => onNavigate({ type: 'book', bookId: site.mainBookId })}
              className="min-h-[44px] px-3 transition-colors hover:text-amber-800"
            >
              主推书籍
            </button>
          ) : null}
          <span className="hidden font-serif text-xs text-stone-400 sm:inline sm:px-3">
            {site.domain}
          </span>
        </nav>
      </div>
    </header>
  )
}

function Footer({ site }: { site: SiteMeta }) {
  return (
    <footer className="mt-14 border-t border-amber-200 bg-amber-100/50 py-8 text-center">
      <p className="font-serif text-sm text-stone-600">
        {site.footerText || `${site.siteName} · ${site.domain}`}
      </p>
      <p className="mt-2 font-serif text-xs text-stone-400">{site.title}</p>
    </footer>
  )
}

function Breadcrumb({ items }: { items: { label: string; onSelect?: () => void }[] }) {
  return (
    <nav
      aria-label="面包屑"
      className="flex flex-wrap items-center gap-0.5 py-3 font-serif text-sm text-stone-500"
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-0.5">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />}
          {item.onSelect ? (
            <button
              type="button"
              onClick={item.onSelect}
              className="inline-flex min-h-[44px] items-center px-1 underline-offset-4 transition-colors hover:text-amber-800 hover:underline"
            >
              {item.label}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center px-1 text-stone-700">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ================= 骨架屏 ================= */

function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-amber-100" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-4 py-5 sm:gap-5">
          <div className="h-32 w-24 animate-pulse rounded-sm bg-amber-200/60" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-5 w-1/3 animate-pulse rounded bg-amber-200/60" />
            <div className="h-4 w-1/4 animate-pulse rounded bg-amber-100" />
            <div className="h-4 w-full animate-pulse rounded bg-amber-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-amber-100" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function BookSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-6 md:flex-row md:gap-10" aria-hidden="true">
      <div className="h-60 w-44 animate-pulse self-center rounded-sm bg-amber-200/60 md:self-start" />
      <div className="flex-1 space-y-4 py-2">
        <div className="h-8 w-1/2 animate-pulse rounded bg-amber-200/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-amber-100" />
        <div className="h-4 w-full animate-pulse rounded bg-amber-100" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-amber-100" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-amber-100" />
      </div>
    </div>
  )
}

function ChapterSkeleton() {
  return (
    <div className="mx-auto mt-4 max-w-3xl space-y-5" aria-hidden="true">
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-amber-200/60" />
      <div className="mx-auto h-4 w-1/4 animate-pulse rounded bg-amber-100" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`h-4 animate-pulse rounded bg-amber-100 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

/* ================= 书籍行（home / keyword 复用） ================= */

function BookRow({ book, onNavigate }: { book: BookCard; onNavigate: Nav }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onNavigate({ type: 'book', bookId: book.id })}
        className="group flex w-full items-start gap-4 py-5 text-left transition-colors hover:bg-amber-100/40 sm:gap-5"
      >
        <Cover book={book} className="h-32 w-24" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-lg font-bold text-stone-800 transition-colors group-hover:text-amber-900">
            {book.title}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              {book.author}
            </span>
            <span className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              {book.category}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />
              {book.totalChapters} 章 · {book.status}
            </span>
          </span>
          <span className="mt-2 line-clamp-2 block font-serif text-sm leading-relaxed text-stone-500">
            {book.intro}
          </span>
          <span className="mt-1.5 flex items-center gap-1 font-serif text-xs text-amber-700">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            最新：{book.latestChapter}
          </span>
        </span>
      </button>
    </li>
  )
}

/* ================= Home ================= */

function ClassicHome({ site, data, loading, onNavigate }: ThemeProps) {
  const [category, setCategory] = useState('全部')
  const books = data.books ?? []
  const categories = ['全部', ...(data.categories ?? [])]
  const filtered = category === '全部' ? books : books.filter((b) => b.category === category)

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 text-stone-800">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="py-10 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-wide text-stone-800 sm:text-4xl">
            {site.title || site.siteName}
          </h1>
          {site.description ? (
            <p className="mx-auto mt-4 max-w-2xl font-serif leading-loose text-stone-500">
              {site.description}
            </p>
          ) : null}
          <div className="mt-6 flex items-center justify-center gap-3" aria-hidden="true">
            <span className="h-px w-20 bg-gradient-to-r from-transparent to-amber-400" />
            <BookOpen className="h-4 w-4 text-amber-700" />
            <span className="h-px w-20 bg-gradient-to-l from-transparent to-amber-400" />
          </div>
        </section>

        <nav
          aria-label="分类筛选"
          className="flex flex-wrap items-center gap-2 border-y border-amber-200 py-3"
        >
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`min-h-[44px] rounded-sm px-4 font-serif text-sm transition-colors ${
                category === c
                  ? 'bg-amber-800 text-amber-50 shadow-sm'
                  : 'bg-amber-100/80 text-stone-600 hover:bg-amber-200/80'
              }`}
            >
              {c}
            </button>
          ))}
        </nav>

        <section aria-label="书籍列表" className="pb-4">
          {loading ? (
            <ListSkeleton />
          ) : filtered.length === 0 ? (
            <p className="py-20 text-center font-serif text-stone-500">书架空空，暂无收录书籍。</p>
          ) : (
            <ul className="divide-y divide-amber-100">
              {filtered.map((book) => (
                <BookRow key={book.id} book={book} onNavigate={onNavigate} />
              ))}
            </ul>
          )}
        </section>
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Book ================= */

function ClassicBook({ site, data, loading, onNavigate }: ThemeProps) {
  const [asc, setAsc] = useState(true)
  const book = data.book

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 text-stone-800">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            { label: book?.title ?? (loading ? '加载中' : '书籍详情') },
          ]}
        />

        {loading ? (
          <BookSkeleton />
        ) : !book ? (
          <div className="py-24 text-center">
            <p className="font-serif text-lg text-stone-500">未找到该书籍，可能已被移除。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] rounded-sm bg-amber-800 px-6 font-serif text-sm text-amber-50 transition-colors hover:bg-amber-900"
            >
              返回首页
            </button>
          </div>
        ) : (
          <>
            <article className="mt-2 flex flex-col gap-6 md:flex-row md:gap-10">
              <Cover book={book} className="h-60 w-44 self-center md:self-start" />
              <div className="min-w-0 flex-1">
                <h1 className="font-serif text-3xl font-bold text-stone-900">{book.title}</h1>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-600">
                  <span className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    {book.author}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    {book.category}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    共 {book.totalChapters} 章
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-amber-700" aria-hidden="true" />
                    更新：{book.updatedAt}
                  </span>
                  <span className="rounded-sm border border-amber-700 px-2 py-0.5 font-serif text-xs text-amber-800">
                    {book.status}
                  </span>
                </div>
                <p className="mt-5 font-serif leading-loose text-stone-600">{book.intro}</p>
                {book.keywords.length + book.suggestKeywords.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {Array.from(new Set([...book.keywords, ...book.suggestKeywords])).map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => onNavigate({ type: 'keyword', keyword: kw })}
                        className="min-h-[44px] rounded-sm bg-amber-100/90 px-3 py-1 font-serif text-sm text-amber-900 transition-colors hover:bg-amber-200"
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <section aria-label="章节目录" className="mt-10">
              <div className="flex items-center justify-between border-b-2 border-amber-700/50 pb-3">
                <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-stone-800">
                  <List className="h-5 w-5 text-amber-700" aria-hidden="true" />
                  章节目录
                  <span className="ml-1 font-serif text-sm font-normal text-stone-400">
                    共 {book.chapters.length} 章
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setAsc((v) => !v)}
                  className="min-h-[44px] rounded-sm border border-amber-300 bg-amber-50 px-4 font-serif text-sm text-amber-900 transition-colors hover:bg-amber-100"
                >
                  {asc ? '正序 ↑' : '倒序 ↓'}
                </button>
              </div>
              {book.chapters.length === 0 ? (
                <p className="py-10 text-center font-serif text-stone-400">暂无章节。</p>
              ) : (
                <ul className="grid max-h-96 grid-cols-1 overflow-y-auto border-x border-b border-amber-200 md:grid-cols-2">
                  {[...book.chapters]
                    .sort((a, b) => (asc ? a.order - b.order : b.order - a.order))
                    .map((ch) => (
                      <li key={ch.id} className="border-b border-amber-100">
                        <button
                          type="button"
                          onClick={() => onNavigate({ type: 'chapter', chapterId: ch.id })}
                          className="flex min-h-[44px] w-full items-center gap-3 px-4 text-left font-serif text-sm text-stone-700 transition-colors hover:bg-amber-100/70 hover:text-amber-900"
                        >
                          <span className="w-7 shrink-0 text-xs text-amber-700">
                            {String(ch.order).padStart(2, '0')}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{ch.title}</span>
                        </button>
                      </li>
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

function ClassicChapter({ site, data, loading, onNavigate }: ThemeProps) {
  const chapter = data.chapter
  const paragraphs = chapter
    ? chapter.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 text-stone-800">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            {
              label: chapter?.bookTitle ?? '书籍',
              onSelect: chapter
                ? () => onNavigate({ type: 'book', bookId: chapter.bookId })
                : undefined,
            },
            { label: chapter?.title ?? '正文' },
          ]}
        />

        {loading ? (
          <ChapterSkeleton />
        ) : !chapter ? (
          <div className="py-24 text-center">
            <p className="font-serif text-lg text-stone-500">未找到该章节内容。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] rounded-sm bg-amber-800 px-6 font-serif text-sm text-amber-50 transition-colors hover:bg-amber-900"
            >
              返回首页
            </button>
          </div>
        ) : (
          <article className="pb-6">
            <h1 className="text-center font-serif text-2xl font-bold text-stone-900 sm:text-3xl">
              {chapter.title}
            </h1>
            <p className="mt-3 text-center font-serif text-sm text-stone-500">
              《{chapter.bookTitle}》· 第 {chapter.order} 章
            </p>
            <div className="mb-2 mx-auto mt-8 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-amber-200" />
              <BookOpen className="h-4 w-4 text-amber-600" />
              <span className="h-px flex-1 bg-amber-200" />
            </div>
            <div className="space-y-6 py-4 font-serif text-lg leading-loose text-stone-800">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <nav
              aria-label="章节导航"
              className="mt-8 flex flex-col items-stretch justify-center gap-3 border-t border-amber-200 pt-6 sm:flex-row"
            >
              <button
                type="button"
                disabled={!chapter.prevId}
                onClick={() => {
                  if (chapter.prevId) onNavigate({ type: 'chapter', chapterId: chapter.prevId })
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-sm border border-amber-300 bg-amber-50 px-6 font-serif text-sm text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                上一章
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ type: 'book', bookId: chapter.bookId })}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-sm bg-amber-800 px-6 font-serif text-sm text-amber-50 transition-colors hover:bg-amber-900"
              >
                <List className="h-4 w-4" aria-hidden="true" />
                返回目录
              </button>
              <button
                type="button"
                disabled={!chapter.nextId}
                onClick={() => {
                  if (chapter.nextId) onNavigate({ type: 'chapter', chapterId: chapter.nextId })
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-sm border border-amber-300 bg-amber-50 px-6 font-serif text-sm text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一章
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          </article>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Keyword ================= */

function ClassicKeyword({
  site,
  data,
  loading,
  onNavigate,
  keyword,
}: ThemeProps & { keyword: string }) {
  const books = data.keywordBooks ?? []
  const goMain = () =>
    onNavigate(site.mainBookId ? { type: 'book', bookId: site.mainBookId } : { type: 'home' })
  const relatedKeywords = Array.from(
    new Set(
      books
        .flatMap((b) => [...b.keywords, ...b.suggestKeywords])
        .filter((k) => k !== keyword),
    ),
  ).slice(0, 12)

  return (
    <div className="flex min-h-screen flex-col bg-amber-50 text-stone-800">
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            { label: `关键词：${keyword}` },
          ]}
        />

        {/* 最醒目的主书籍入口 */}
        <button
          type="button"
          onClick={goMain}
          className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-sm border-2 border-amber-800 bg-amber-800 px-6 py-4 font-serif text-base font-bold text-amber-50 shadow-sm transition-colors hover:bg-amber-900"
        >
          <BookOpen className="h-5 w-5" aria-hidden="true" />
          进入主书籍信息页
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <section className="py-10 text-center">
          <h1 className="font-serif text-3xl font-bold text-stone-900 sm:text-4xl">{keyword}</h1>
          <p className="mt-3 font-serif text-stone-500">与《{keyword}》相关的书籍与内容</p>
        </section>

        {loading ? (
          <ListSkeleton rows={3} />
        ) : books.length === 0 ? (
          <p className="py-16 text-center font-serif text-stone-500">
            暂无与「{keyword}」相关的书籍。
          </p>
        ) : (
          <ul className="divide-y divide-amber-100">
            {books.map((book) => (
              <BookRow key={book.id} book={book} onNavigate={onNavigate} />
            ))}
          </ul>
        )}

        {relatedKeywords.length > 0 && (
          <section aria-label="相关关键词" className="mt-10 border-t border-amber-200 py-6">
            <h2 className="font-serif text-sm text-stone-500">相关关键词</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {relatedKeywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onNavigate({ type: 'keyword', keyword: k })}
                  className="min-h-[44px] rounded-sm bg-amber-100/80 px-3 py-1 font-serif text-sm text-amber-900 transition-colors hover:bg-amber-200"
                >
                  {k}
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

export function ThemeClassic(props: ThemeProps): ReactElement {
  const { view } = props
  switch (view.type) {
    case 'home':
      return <ClassicHome {...props} />
    case 'book':
      return <ClassicBook {...props} />
    case 'chapter':
      return <ClassicChapter {...props} />
    case 'keyword':
      return <ClassicKeyword {...props} keyword={view.keyword} />
    default:
      return <ClassicHome {...props} />
  }
}

export default ThemeClassic
