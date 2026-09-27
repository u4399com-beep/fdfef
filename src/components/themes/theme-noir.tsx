'use client'

import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Hash,
} from 'lucide-react'
import type { SiteMeta, SiteView, ThemeProps } from '@/lib/theme-types'

type Nav = (v: SiteView) => void

/* ================= 外壳 ================= */

function Shell({
  site,
  onNavigate,
  children,
}: {
  site: SiteMeta
  onNavigate: Nav
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100 antialiased">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="inline-flex min-h-[44px] items-center font-mono text-sm uppercase tracking-[0.35em] text-zinc-100 transition-colors hover:text-white"
          >
            {site.siteName}
          </button>
          <span className="font-mono text-xs text-zinc-600">{site.domain}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6">{children}</main>
      <footer className="border-t border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <p className="font-mono text-xs text-zinc-600">
            {site.footerText || `${site.siteName} — ${site.domain}`}
          </p>
          <p className="mt-2 font-mono text-[11px] text-zinc-700">{site.title}</p>
        </div>
      </footer>
    </div>
  )
}

/* ================= 面包屑 / 骨架 ================= */

function Crumb({ trail }: { trail: { label: string; onSelect?: () => void }[] }) {
  return (
    <nav
      aria-label="面包屑"
      className="flex flex-wrap items-center gap-2 pt-6 font-mono text-xs uppercase tracking-widest text-zinc-600"
    >
      {trail.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {index > 0 && (
            <span className="text-zinc-700" aria-hidden="true">/</span>
          )}
          {item.onSelect ? (
            <button
              type="button"
              onClick={item.onSelect}
              className="inline-flex min-h-[44px] items-center transition-colors hover:text-zinc-200"
            >
              {item.label}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center text-zinc-400">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

function Lines({ n }: { n: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className={`h-4 animate-pulse bg-zinc-800 ${i % 4 === 3 ? 'w-1/2' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

function DirectorySkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-zinc-800/60" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-6 py-5">
          <div className="h-3 w-6 animate-pulse bg-zinc-800" />
          <div className="h-4 flex-1 animate-pulse bg-zinc-800" />
          <div className="hidden h-3 w-16 animate-pulse bg-zinc-800 sm:block" />
        </div>
      ))}
    </div>
  )
}

/* ================= Home ================= */

function NoirHome({ site, data, loading, onNavigate }: ThemeProps) {
  const [category, setCategory] = useState<string | null>(null)
  const books = data.books ?? []
  const categories = data.categories ?? []
  const filtered = category ? books.filter((b) => b.category === category) : books

  return (
    <Shell site={site} onNavigate={onNavigate}>
      <section className="pb-10 pt-14">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-zinc-600">Index / 书目</p>
        <h1 className="mt-5 text-4xl font-light tracking-tight text-zinc-50">
          {site.title || site.siteName}
        </h1>
        {site.description && (
          <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400">{site.description}</p>
        )}
      </section>

      <nav
        aria-label="分类筛选"
        className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-zinc-800 pb-2"
      >
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={`inline-flex min-h-[44px] items-center font-mono text-xs uppercase tracking-[0.25em] transition-colors ${
            category === null ? 'text-zinc-50' : 'text-zinc-600 hover:text-zinc-300'
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`inline-flex min-h-[44px] items-center font-mono text-xs uppercase tracking-[0.25em] transition-colors ${
              category === c ? 'text-zinc-50' : 'text-zinc-600 hover:text-zinc-300'
            }`}
          >
            {c}
          </button>
        ))}
      </nav>

      <section aria-label="书籍列表" className="pb-6">
        {loading ? (
          <DirectorySkeleton />
        ) : filtered.length === 0 ? (
          <p className="py-20 font-mono text-sm text-zinc-600">NO DATA — 暂无收录。</p>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {filtered.map((book, index) => (
              <li key={book.id}>
                <button
                  type="button"
                  onClick={() => onNavigate({ type: 'book', bookId: book.id })}
                  className="group flex min-h-[44px] w-full items-baseline gap-6 py-5 text-left"
                >
                  <span className="w-7 shrink-0 font-mono text-xs text-zinc-700 transition-colors group-hover:text-zinc-400">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-light text-zinc-300 transition-colors group-hover:text-white">
                      {book.title}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-600">
                      {book.category} / {book.author} / {book.status}
                    </span>
                  </span>
                  <span className="hidden shrink-0 font-mono text-xs text-zinc-700 transition-colors group-hover:text-zinc-400 sm:block">
                    {book.totalChapters} ch
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  )
}

/* ================= Book ================= */

function NoirBook({ site, data, loading, onNavigate }: ThemeProps) {
  const [asc, setAsc] = useState(true)
  const book = data.book
  const chapters = book
    ? [...book.chapters].sort((a, b) => (asc ? a.order - b.order : b.order - a.order))
    : []

  return (
    <Shell site={site} onNavigate={onNavigate}>
      <Crumb
        trail={[
          { label: 'Home', onSelect: () => onNavigate({ type: 'home' }) },
          { label: book?.title ?? (loading ? 'Loading' : 'Not Found') },
        ]}
      />

      {loading ? (
        <div className="space-y-4 py-8" aria-hidden="true">
          <div className="h-10 w-2/3 animate-pulse bg-zinc-800" />
          <div className="h-3 w-1/3 animate-pulse bg-zinc-800" />
          <Lines n={6} />
        </div>
      ) : !book ? (
        <div className="py-24">
          <p className="font-mono text-sm text-zinc-500">404 — 未找到该书籍。</p>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="mt-6 inline-flex min-h-[44px] items-center border border-zinc-700 px-5 font-mono text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
          >
            返回首页
          </button>
        </div>
      ) : (
        <>
          <article className="pb-4 pt-4">
            <h1 className="text-4xl font-light tracking-tight text-zinc-50">{book.title}</h1>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.25em] text-zinc-500">
              {book.author} · {book.category} · {book.status} · {book.totalChapters} chapters
            </p>
            <p className="mt-6 max-w-xl text-sm leading-7 text-zinc-400">{book.intro}</p>
            {book.keywords.length + book.suggestKeywords.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1">
                {Array.from(new Set([...book.keywords, ...book.suggestKeywords])).map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => onNavigate({ type: 'keyword', keyword: kw })}
                    className="inline-flex min-h-[44px] items-center font-mono text-xs text-zinc-600 transition-colors hover:text-zinc-100"
                  >
                    [{kw}]
                  </button>
                ))}
              </div>
            )}
          </article>

          <section aria-label="章节目录" className="border-t border-zinc-800 pb-10 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">
                目录 / Contents
              </h2>
              <button
                type="button"
                onClick={() => setAsc((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-100"
              >
                {asc ? (
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {asc ? '正序' : '倒序'}
              </button>
            </div>
            {chapters.length === 0 ? (
              <p className="py-10 font-mono text-sm text-zinc-600">暂无章节。</p>
            ) : (
              <ul className="mt-3 max-h-96 divide-y divide-zinc-800/60 overflow-y-auto pr-1">
                {chapters.map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate({ type: 'chapter', chapterId: ch.id })}
                      className="group flex min-h-[44px] w-full items-center gap-5 py-3 text-left"
                    >
                      <span className="w-8 shrink-0 font-mono text-xs text-zinc-700 transition-colors group-hover:text-zinc-400">
                        {String(ch.order).padStart(3, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-400 transition-colors group-hover:text-zinc-100">
                        {ch.title}
                      </span>
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-zinc-800 transition-colors group-hover:text-zinc-400"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Shell>
  )
}

/* ================= Chapter ================= */

function NoirChapter({ site, data, loading, onNavigate }: ThemeProps) {
  const chapter = data.chapter
  const paragraphs = chapter
    ? chapter.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <Shell site={site} onNavigate={onNavigate}>
      <Crumb
        trail={[
          { label: 'Home', onSelect: () => onNavigate({ type: 'home' }) },
          chapter
            ? {
                label: chapter.bookTitle,
                onSelect: () => onNavigate({ type: 'book', bookId: chapter.bookId }),
              }
            : { label: 'Book' },
          { label: chapter?.title ?? 'Chapter' },
        ]}
      />

      {loading ? (
        <div className="py-10" aria-hidden="true">
          <Lines n={10} />
        </div>
      ) : !chapter ? (
        <div className="py-24">
          <p className="font-mono text-sm text-zinc-500">404 — 未找到该章节。</p>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="mt-6 inline-flex min-h-[44px] items-center border border-zinc-700 px-5 font-mono text-xs uppercase tracking-widest text-zinc-300 transition-colors hover:border-zinc-400 hover:text-white"
          >
            返回首页
          </button>
        </div>
      ) : (
        <article className="pb-10 pt-6">
          <p className="font-mono text-xs uppercase tracking-[0.4em] text-zinc-600">
            Chapter {String(chapter.order).padStart(3, '0')}
          </p>
          <h1 className="mt-4 text-3xl font-light tracking-tight text-zinc-50">{chapter.title}</h1>
          <div className="mt-6 border-t border-zinc-800" aria-hidden="true" />
          <div className="mx-auto max-w-xl space-y-6 pt-8">
            {paragraphs.map((p, i) => (
              <p key={i} className="text-[15px] leading-8 text-zinc-300">
                {p}
              </p>
            ))}
          </div>
          <nav
            aria-label="章节导航"
            className="mt-14 flex items-center justify-between gap-3 border-t border-zinc-800 pt-5"
          >
            <button
              type="button"
              disabled={!chapter.prevId}
              onClick={() => {
                if (chapter.prevId) onNavigate({ type: 'chapter', chapterId: chapter.prevId })
              }}
              className="inline-flex min-h-[44px] items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:text-zinc-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              上一章
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'book', bookId: chapter.bookId })}
              className="inline-flex min-h-[44px] items-center font-mono text-xs uppercase tracking-widest text-zinc-500 transition-colors hover:text-white"
            >
              目录
            </button>
            <button
              type="button"
              disabled={!chapter.nextId}
              onClick={() => {
                if (chapter.nextId) onNavigate({ type: 'chapter', chapterId: chapter.nextId })
              }}
              className="inline-flex min-h-[44px] items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:text-zinc-700"
            >
              下一章
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </nav>
        </article>
      )}
    </Shell>
  )
}

/* ================= Keyword ================= */

function NoirKeyword({
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
    <Shell site={site} onNavigate={onNavigate}>
      <Crumb
        trail={[
          { label: 'Home', onSelect: () => onNavigate({ type: 'home' }) },
          { label: 'Keyword' },
        ]}
      />

      {/* 最醒目的主书籍入口 */}
      <button
        type="button"
        onClick={goMain}
        className="mt-4 flex min-h-[44px] w-full items-center justify-between gap-4 border border-zinc-700 bg-zinc-900/60 px-5 py-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-900"
      >
        <span className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.3em] text-zinc-200">
          <Hash className="h-4 w-4" aria-hidden="true" />
          进入主书籍信息页
        </span>
        <ArrowRight className="h-4 w-4 text-zinc-500" aria-hidden="true" />
      </button>

      <section className="py-10">
        <p className="font-mono text-xs uppercase tracking-[0.4em] text-zinc-600">Keyword</p>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-zinc-50">{keyword}</h1>
        <p className="mt-4 text-sm leading-7 text-zinc-400">与《{keyword}》相关的书籍与内容</p>
      </section>

      {loading ? (
        <div className="pb-10">
          <DirectorySkeleton rows={4} />
        </div>
      ) : books.length === 0 ? (
        <p className="pb-20 font-mono text-sm text-zinc-600">NO DATA — 暂无相关书籍。</p>
      ) : (
        <ul className="divide-y divide-zinc-800/60 pb-10">
          {books.map((book, index) => (
            <li key={book.id}>
              <button
                type="button"
                onClick={() => onNavigate({ type: 'book', bookId: book.id })}
                className="group flex min-h-[44px] w-full items-baseline gap-6 py-5 text-left"
              >
                <span className="w-7 shrink-0 font-mono text-xs text-zinc-700 transition-colors group-hover:text-zinc-400">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-light text-zinc-300 transition-colors group-hover:text-white">
                    {book.title}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-600">
                    {book.author} / {book.category}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {related.length > 0 && (
        <section aria-label="相关关键词" className="border-t border-zinc-800 py-8">
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-600">Related</h2>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
            {related.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onNavigate({ type: 'keyword', keyword: k })}
                className="inline-flex min-h-[44px] items-center font-mono text-xs text-zinc-600 transition-colors hover:text-zinc-100"
              >
                [{k}]
              </button>
            ))}
          </div>
        </section>
      )}
    </Shell>
  )
}

/* ================= 主组件 ================= */

export function ThemeNoir(props: ThemeProps): ReactElement {
  const { view } = props
  switch (view.type) {
    case 'home':
      return <NoirHome {...props} />
    case 'book':
      return <NoirBook {...props} />
    case 'chapter':
      return <NoirChapter {...props} />
    case 'keyword':
      return <NoirKeyword {...props} keyword={view.keyword} />
    default:
      return <NoirHome {...props} />
  }
}

export default ThemeNoir
