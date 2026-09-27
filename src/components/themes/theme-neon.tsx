'use client'

import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Flame,
  List,
  Sparkles,
  User,
  Zap,
} from 'lucide-react'
import type { BookCard, SiteMeta, SiteView, ThemeProps } from '@/lib/theme-types'

type Nav = (v: SiteView) => void

/* ================= 渐变常量（violet → fuchsia → orange） ================= */

const GRAD_R = 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400'
const GRAD_BR = 'bg-gradient-to-br from-violet-500 via-fuchsia-500 to-orange-400'
const GRAD_TEXT = 'bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-300 bg-clip-text text-transparent'

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
    <div className="flex min-h-screen flex-col bg-[#18181b] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#18181b]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="min-h-[44px] text-2xl font-black tracking-tight"
          >
            <span className={GRAD_TEXT}>{site.siteName}</span>
          </button>
          <nav aria-label="主导航" className="flex items-center gap-1 text-sm font-semibold text-zinc-400">
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="min-h-[44px] rounded-full px-4 transition-colors hover:bg-white/5 hover:text-white"
            >
              首页
            </button>
            {site.mainBookId ? (
              <button
                type="button"
                onClick={() => onNavigate({ type: 'book', bookId: site.mainBookId })}
                className="min-h-[44px] rounded-full px-4 transition-colors hover:bg-white/5 hover:text-white"
              >
                主推书籍
              </button>
            ) : null}
          </nav>
        </div>
        <div className={`h-0.5 w-full ${GRAD_R}`} aria-hidden="true" />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">{children}</main>
      <footer className="mt-14 border-t border-white/10 py-8 text-center text-sm text-zinc-500">
        <p>{site.footerText || `${site.siteName} · ${site.domain}`}</p>
        <p className="mt-1.5 text-xs text-zinc-600">{site.title}</p>
      </footer>
    </div>
  )
}

/* ================= 面包屑 ================= */

function Crumbs({ trail }: { trail: { label: string; onSelect?: () => void }[] }) {
  return (
    <nav
      aria-label="面包屑"
      className="flex flex-wrap items-center gap-1 py-4 text-sm font-medium text-zinc-500"
    >
      {trail.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1">
          {index > 0 && <ChevronRight className="h-4 w-4 text-zinc-700" aria-hidden="true" />}
          {item.onSelect ? (
            <button
              type="button"
              onClick={item.onSelect}
              className="inline-flex min-h-[44px] items-center rounded-full px-2 transition-colors hover:text-white"
            >
              {item.label}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center px-2 text-zinc-300">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ================= 骨架屏 ================= */

function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-white/10" />
          <div className="space-y-2.5 px-1 pb-1 pt-3">
            <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

function BookSkeleton() {
  return (
    <div className={`mt-2 rounded-3xl ${GRAD_BR} p-[2px]`} aria-hidden="true">
      <div className="flex flex-col gap-8 rounded-[22px] bg-[#1d1d22] p-6 sm:p-8 md:flex-row">
        <div className="aspect-[3/4] w-44 animate-pulse self-center rounded-xl bg-white/10 md:self-start" />
        <div className="flex-1 space-y-4 py-1">
          <div className="h-9 w-1/2 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-white/5" />
          <div className="h-4 w-full animate-pulse rounded bg-white/5" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-white/5" />
        </div>
      </div>
    </div>
  )
}

function ChapterSkeleton() {
  return (
    <div className="rounded-3xl bg-white/5 p-8 ring-1 ring-white/10" aria-hidden="true">
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-4 animate-pulse rounded bg-white/5 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`}
          />
        ))}
      </div>
    </div>
  )
}

/* ================= 渐变描边卡片（home / keyword 复用） ================= */

function NeonCard({ book, onNavigate }: { book: BookCard; onNavigate: Nav }) {
  return (
    <div
      className={`group rounded-2xl ${GRAD_BR} p-[2px] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_0_35px_rgba(192,38,211,0.35)]`}
    >
      <button
        type="button"
        onClick={() => onNavigate({ type: 'book', bookId: book.id })}
        className="flex h-full w-full flex-col rounded-[14px] bg-[#1d1d22] p-3 text-left"
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-zinc-800">
          {book.coverUrl ? (
            <img
              src={book.coverUrl}
              alt={`《${book.title}》封面`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-5xl font-black">
              <span className="bg-gradient-to-br from-violet-300 via-fuchsia-300 to-orange-200 bg-clip-text text-transparent">
                {book.title.charAt(0) || '书'}
              </span>
            </div>
          )}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-bold text-fuchsia-200 ring-1 ring-fuchsia-400/40 backdrop-blur">
            {book.category}
          </span>
        </div>
        <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
          <h3 className="truncate text-base font-extrabold text-zinc-100">{book.title}</h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
            <User className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" aria-hidden="true" />
            <span className="truncate">{book.author}</span>
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <Zap className="h-3.5 w-3.5 shrink-0 text-orange-300" aria-hidden="true" />
            <span className="truncate">{book.latestChapter}</span>
          </p>
        </div>
      </button>
    </div>
  )
}

/* ================= Home ================= */

function NeonHome({ site, data, loading, onNavigate }: ThemeProps) {
  const [category, setCategory] = useState('全部')
  const books = data.books ?? []
  const categories = ['全部', ...(data.categories ?? [])]
  const filtered = category === '全部' ? books : books.filter((b) => b.category === category)
  const goHeroTarget = () =>
    onNavigate(site.mainBookId ? { type: 'book', bookId: site.mainBookId } : { type: 'home' })

  return (
    <Shell site={site} onNavigate={onNavigate}>
      {/* 大渐变 hero 横幅 */}
      <section
        className={`relative mt-6 overflow-hidden rounded-3xl ${GRAD_R} px-6 py-12 sm:px-12 sm:py-16`}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/20 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/4 h-56 w-56 rounded-full bg-white/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.25em] text-white backdrop-blur">
            <Flame className="h-4 w-4" aria-hidden="true" />
            Hot Now
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-black leading-tight text-white sm:text-6xl">
            {site.title || site.siteName}
          </h1>
          {site.description && (
            <p className="mt-5 max-w-xl text-sm font-medium leading-relaxed text-white/90 sm:text-base">
              {site.description}
            </p>
          )}
          <button
            type="button"
            onClick={goHeroTarget}
            className="mt-7 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#18181b] px-6 text-sm font-bold text-white transition-transform hover:scale-105"
          >
            <Sparkles className="h-4 w-4 text-fuchsia-300" aria-hidden="true" />
            立即开读
          </button>
        </div>
      </section>

      {/* 分类筛选 */}
      <nav aria-label="分类筛选" className="flex flex-wrap items-center gap-2 py-6">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`min-h-[44px] rounded-full px-4 text-sm font-bold transition-all ${
              category === c
                ? `${GRAD_R} text-white shadow-lg shadow-fuchsia-500/25`
                : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100'
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
          <p className="text-sm text-zinc-500">这个分类还很空，敬请期待。</p>
        </div>
      ) : (
        <section
          aria-label="书籍列表"
          className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((book) => (
            <NeonCard key={book.id} book={book} onNavigate={onNavigate} />
          ))}
        </section>
      )}
    </Shell>
  )
}

/* ================= Book ================= */

function NeonBook({ site, data, loading, onNavigate }: ThemeProps) {
  const [asc, setAsc] = useState(true)
  const book = data.book
  const chapters = book
    ? [...book.chapters].sort((a, b) => (asc ? a.order - b.order : b.order - a.order))
    : []
  const keywords = book
    ? Array.from(new Set([...book.keywords, ...book.suggestKeywords]))
    : []

  return (
    <Shell site={site} onNavigate={onNavigate}>
      <Crumbs
        trail={[
          { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
          { label: book?.title ?? (loading ? '加载中' : '书籍详情') },
        ]}
      />

      {loading ? (
        <BookSkeleton />
      ) : !book ? (
        <div className="py-24 text-center">
          <p className="text-sm text-zinc-500">未找到该书籍。</p>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-white/10 px-6 text-sm font-bold text-zinc-100 transition-colors hover:bg-white/20"
          >
            返回首页
          </button>
        </div>
      ) : (
        <>
          <article className={`mt-2 rounded-3xl ${GRAD_BR} p-[2px]`}>
            <div className="flex flex-col gap-8 rounded-[22px] bg-[#1d1d22] p-6 sm:p-8 md:flex-row">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={`《${book.title}》封面`}
                  className="aspect-[3/4] w-44 shrink-0 self-center rounded-xl object-cover md:self-start"
                />
              ) : (
                <div className="flex aspect-[3/4] w-44 shrink-0 self-center items-center justify-center rounded-xl bg-zinc-800 text-6xl font-black md:self-start">
                  <span className="bg-gradient-to-br from-violet-300 via-fuchsia-300 to-orange-200 bg-clip-text text-transparent">
                    {book.title.charAt(0) || '书'}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="inline-block rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-fuchsia-300 ring-1 ring-fuchsia-400/40">
                  {book.category}
                </span>
                <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                  {book.title}
                </h1>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <User className="h-4 w-4 text-fuchsia-400" aria-hidden="true" />
                    {book.author}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <List className="h-4 w-4 text-orange-300" aria-hidden="true" />
                    {book.totalChapters} 章
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      book.status.includes('完')
                        ? 'bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-400/40'
                        : 'bg-orange-400/10 text-orange-300 ring-1 ring-orange-400/40'
                    }`}
                  >
                    {book.status}
                  </span>
                </div>
                <p className="mt-5 leading-relaxed text-zinc-300">{book.intro}</p>
                {keywords.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {keywords.map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => onNavigate({ type: 'keyword', keyword: kw })}
                        className="min-h-[44px] rounded-full bg-white/5 px-3.5 text-sm font-semibold text-violet-300 ring-1 ring-violet-500/40 transition-all hover:text-fuchsia-300 hover:ring-fuchsia-400/60"
                      >
                        # {kw}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>

          <section aria-label="章节目录" className="mt-8 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-black text-white">
                <List className="h-5 w-5 text-fuchsia-400" aria-hidden="true" />
                章节目录
                <span className="text-sm font-medium text-zinc-500">
                  共 {book.chapters.length} 章
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setAsc((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/5 px-4 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/10"
              >
                {asc ? '正序' : '倒序'}
              </button>
            </div>
            {chapters.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">暂无章节。</p>
            ) : (
              <ul className="mt-4 max-h-96 divide-y divide-white/5 overflow-y-auto rounded-2xl bg-black/30 ring-1 ring-white/10">
                {chapters.map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate({ type: 'chapter', chapterId: ch.id })}
                      className="group flex min-h-[44px] w-full items-center gap-4 px-5 py-2.5 text-left transition-colors hover:bg-white/5"
                    >
                      <span className="w-8 shrink-0 font-mono text-xs font-bold text-fuchsia-400">
                        {String(ch.order).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-300 transition-colors group-hover:text-white">
                        {ch.title}
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-zinc-700 transition-colors group-hover:text-fuchsia-300"
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

function NeonChapter({ site, data, loading, onNavigate }: ThemeProps) {
  const chapter = data.chapter
  const paragraphs = chapter
    ? chapter.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <Shell site={site} onNavigate={onNavigate}>
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
          <p className="text-sm text-zinc-500">未找到该章节内容。</p>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-white/10 px-6 text-sm font-bold text-zinc-100 transition-colors hover:bg-white/20"
          >
            返回首页
          </button>
        </div>
      ) : (
        <>
          <article className="py-4">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.4em] text-fuchsia-400">
              Chapter {String(chapter.order).padStart(3, '0')}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              {chapter.title}
            </h1>
            <p className="mt-3 text-sm text-zinc-500">《{chapter.bookTitle}》</p>
            <div className={`mt-6 h-1 w-24 rounded-full ${GRAD_R}`} aria-hidden="true" />
            <div className="mt-8 max-w-3xl space-y-5">
              {paragraphs.map((p, i) => (
                <p key={i} className="text-[17px] leading-8 text-zinc-200">
                  {p}
                </p>
              ))}
            </div>
          </article>
          <nav
            aria-label="章节导航"
            className="mt-8 flex flex-col gap-3 pb-4 sm:flex-row sm:justify-between"
          >
            <button
              type="button"
              disabled={!chapter.prevId}
              onClick={() => {
                if (chapter.prevId) onNavigate({ type: 'chapter', chapterId: chapter.prevId })
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-300 transition-colors hover:border-fuchsia-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              上一章
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'book', bookId: chapter.bookId })}
              className={`inline-flex min-h-[44px] items-center justify-center rounded-full ${GRAD_R} px-6 text-sm font-bold text-white transition-opacity hover:opacity-90`}
            >
              返回目录
            </button>
            <button
              type="button"
              disabled={!chapter.nextId}
              onClick={() => {
                if (chapter.nextId) onNavigate({ type: 'chapter', chapterId: chapter.nextId })
              }}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-white/15 px-6 text-sm font-semibold text-zinc-300 transition-colors hover:border-fuchsia-400/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一章
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </>
      )}
    </Shell>
  )
}

/* ================= Keyword ================= */

function NeonKeyword({
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
      <Crumbs
        trail={[
          { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
          { label: `关键词：${keyword}` },
        ]}
      />

      {/* 最醒目的主书籍入口：渐变描边大按钮 */}
      <div className={`mt-4 rounded-2xl ${GRAD_BR} p-[2px] shadow-[0_0_35px_rgba(192,38,211,0.3)]`}>
        <button
          type="button"
          onClick={goMain}
          className="group flex min-h-[44px] w-full items-center justify-between gap-4 rounded-[14px] bg-[#1d1d22] px-6 py-5 text-left"
        >
          <span className="flex items-center gap-3 text-base font-black text-white">
            <Sparkles className="h-5 w-5 text-fuchsia-400" aria-hidden="true" />
            进入主书籍信息页
          </span>
          <ArrowRight
            className="h-5 w-5 text-fuchsia-400 transition-transform group-hover:translate-x-1"
            aria-hidden="true"
          />
        </button>
      </div>

      <section className="py-10">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.4em] text-zinc-500">
          Keyword
        </p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
          <span className={GRAD_TEXT}>{keyword}</span>
        </h1>
        <p className="mt-4 text-sm text-zinc-400">与《{keyword}》相关的书籍与内容</p>
      </section>

      {loading ? (
        <GridSkeleton count={3} />
      ) : books.length === 0 ? (
        <p className="py-20 text-center text-sm text-zinc-500">暂无相关书籍。</p>
      ) : (
        <section
          aria-label="相关书籍"
          className="grid grid-cols-1 gap-5 pb-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {books.map((book) => (
            <NeonCard key={book.id} book={book} onNavigate={onNavigate} />
          ))}
        </section>
      )}

      {related.length > 0 && (
        <section aria-label="相关关键词" className="mt-6 pb-4">
          <h2 className="text-sm font-bold text-zinc-500">相关关键词</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onNavigate({ type: 'keyword', keyword: k })}
                className="min-h-[44px] rounded-full bg-white/5 px-4 text-sm font-semibold text-zinc-300 ring-1 ring-white/10 transition-all hover:text-fuchsia-300 hover:ring-fuchsia-400/50"
              >
                # {k}
              </button>
            ))}
          </div>
        </section>
      )}
    </Shell>
  )
}

/* ================= 主组件 ================= */

export function ThemeNeon(props: ThemeProps): ReactElement {
  const { view } = props
  switch (view.type) {
    case 'home':
      return <NeonHome {...props} />
    case 'book':
      return <NeonBook {...props} />
    case 'chapter':
      return <NeonChapter {...props} />
    case 'keyword':
      return <NeonKeyword {...props} keyword={view.keyword} />
    default:
      return <NeonHome {...props} />
  }
}

export default ThemeNeon
