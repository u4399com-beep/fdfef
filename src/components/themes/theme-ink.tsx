'use client'

import { useState } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Brush, Scroll } from 'lucide-react'
import type { BookCard, ChapterItem, SiteMeta, SiteView, ThemeProps } from '@/lib/theme-types'

type Nav = (v: SiteView) => void

/* ================= 宣纸纹理背景（径向渐变模拟） ================= */

const PAPER: CSSProperties = {
  backgroundImage:
    'radial-gradient(rgba(87, 83, 78, 0.055) 1px, transparent 1.6px), radial-gradient(circle at 18% 12%, rgba(87, 83, 78, 0.05) 0, transparent 42%), radial-gradient(circle at 82% 78%, rgba(87, 83, 78, 0.05) 0, transparent 46%), radial-gradient(ellipse at 50% 120%, rgba(158, 43, 37, 0.05) 0, transparent 55%)',
  backgroundSize: '26px 26px, 100% 100%, 100% 100%, 100% 100%',
}

/* ================= 墨线分隔 ================= */

function InkRule({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`h-px bg-gradient-to-r from-transparent via-stone-400/70 to-transparent ${className}`}
    />
  )
}

/* ================= 外壳（含竖排诗句装饰） ================= */

function Shell({
  site,
  poem,
  onNavigate,
  children,
}: {
  site: SiteMeta
  poem: string
  onNavigate: Nav
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-stone-100 font-serif text-stone-900" style={PAPER}>
      {/* 竖排诗句装饰（仅桌面端） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-4 top-24 hidden select-none text-sm leading-7 tracking-[0.55em] text-stone-400 lg:block"
        style={{ writingMode: 'vertical-rl' }}
      >
        {poem}
      </div>

      <header className="relative z-10 bg-stone-100/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="flex min-h-[44px] items-center gap-3"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-sm bg-[#9e2b25] text-lg font-bold text-stone-50 shadow-sm">
              {site.siteName.charAt(0)}
            </span>
            <span className="text-2xl font-bold tracking-[0.2em] text-stone-900">
              {site.siteName}
            </span>
          </button>
          <nav aria-label="主导航" className="flex items-center gap-2 text-sm text-stone-600">
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="min-h-[44px] rounded-sm px-3 tracking-widest transition-colors hover:text-[#9e2b25]"
            >
              首页
            </button>
            {site.mainBookId ? (
              <button
                type="button"
                onClick={() => onNavigate({ type: 'book', bookId: site.mainBookId })}
                className="min-h-[44px] rounded-sm px-3 tracking-widest transition-colors hover:text-[#9e2b25]"
              >
                主推书籍
              </button>
            ) : null}
          </nav>
        </div>
        <InkRule />
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">{children}</main>

      <footer className="mt-12 py-8 text-center">
        <InkRule className="mx-auto mb-5 w-2/3" />
        <p className="text-sm text-stone-500">
          {site.footerText || `${site.siteName} · ${site.domain}`}
        </p>
        <p className="mt-2 text-xs text-stone-400">{site.title}</p>
      </footer>
    </div>
  )
}

/* ================= 面包屑 ================= */

function Crumbs({ trail }: { trail: { label: string; onSelect?: () => void }[] }) {
  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-1 py-4 text-sm text-stone-500">
      {trail.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-1">
          {index > 0 && (
            <span className="px-1 text-stone-300" aria-hidden="true">/</span>
          )}
          {item.onSelect ? (
            <button
              type="button"
              onClick={item.onSelect}
              className="inline-flex min-h-[44px] items-center px-1 tracking-wider transition-colors hover:text-[#9e2b25]"
            >
              {item.label}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center px-1 tracking-wider text-stone-700">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ================= 骨架屏 ================= */

function InkSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-sm border border-stone-300/70 bg-white/60 p-4">
          <div className="h-24 w-20 animate-pulse bg-stone-200" />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-5 w-1/3 animate-pulse bg-stone-200" />
            <div className="h-4 w-1/2 animate-pulse bg-stone-100" />
            <div className="h-4 w-5/6 animate-pulse bg-stone-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function InkBookSkeleton() {
  return (
    <div
      className="flex flex-col gap-8 rounded-sm border border-stone-300/80 bg-white/60 p-6 md:flex-row"
      aria-hidden="true"
    >
      <div className="h-64 w-44 animate-pulse bg-stone-200" />
      <div className="flex-1 space-y-4 py-2">
        <div className="h-9 w-1/2 animate-pulse bg-stone-200" />
        <div className="h-4 w-2/3 animate-pulse bg-stone-100" />
        <div className="h-4 w-full animate-pulse bg-stone-100" />
        <div className="h-4 w-5/6 animate-pulse bg-stone-100" />
      </div>
    </div>
  )
}

function InkChapterSkeleton() {
  return (
    <div
      className="space-y-5 rounded-sm border border-stone-300/80 bg-white/60 p-8"
      aria-hidden="true"
    >
      <div className="mx-auto h-8 w-2/3 animate-pulse bg-stone-200" />
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className={`h-4 animate-pulse bg-stone-100 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

/* ================= 章节行（book / toc 复用） ================= */

function ChapterLine({
  chapter,
  onNavigate,
}: {
  chapter: ChapterItem
  onNavigate: Nav
}) {
  return (
    <li className="bg-white/85">
      <button
        type="button"
        onClick={() => onNavigate({ type: 'chapter', chapterId: chapter.id })}
        className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 text-left text-sm transition-colors hover:bg-[#9e2b25]/5 hover:text-[#9e2b25]"
      >
        <span className="shrink-0 text-xs text-[#9e2b25]">
          {String(chapter.order).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
      </button>
    </li>
  )
}

/* ================= 横向长卷卡片（home / keyword 复用） ================= */

function ScrollCard({ book, onNavigate }: { book: BookCard; onNavigate: Nav }) {
  return (
    <article className="group relative flex items-stretch overflow-hidden rounded-sm border border-stone-300/90 bg-white/70 shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => onNavigate({ type: 'book', bookId: book.id })}
        className="absolute inset-0 z-10"
        aria-label={`阅读《${book.title}》`}
      />
      <span
        className="w-1 shrink-0 bg-[#9e2b25]/60 transition-colors group-hover:bg-[#9e2b25]"
        aria-hidden="true"
      />
      <div className="relative w-24 shrink-0 sm:w-28">
        {book.coverUrl ? (
          <img
            src={book.coverUrl}
            alt={`《${book.title}》封面`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-stone-200/80 text-3xl font-bold text-stone-400">
            {book.title.charAt(0) || '书'}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-lg font-bold tracking-wide text-stone-900 transition-colors group-hover:text-[#9e2b25]">
            {book.title}
          </h3>
          <span className="border border-[#9e2b25]/50 px-1.5 py-0.5 text-[11px] tracking-widest text-[#9e2b25]">
            {book.category}
          </span>
          <span className="text-xs text-stone-400">{book.status}</span>
        </div>
        <p className="text-sm text-stone-500">
          {book.author} · 共 {book.totalChapters} 章 · 最新 {book.latestChapter}
        </p>
        <p className="line-clamp-2 text-sm leading-relaxed text-stone-500">{book.intro}</p>
      </div>
    </article>
  )
}

/* ================= Home ================= */

function InkHome({ site, data, loading, onNavigate }: ThemeProps) {
  const [category, setCategory] = useState('全部')
  const books = data.books ?? []
  const categories = ['全部', ...(data.categories ?? [])]
  const filtered = category === '全部' ? books : books.filter((b) => b.category === category)

  return (
    <Shell site={site} poem="闲庭独坐对闲花 · 卷帙浩繁映月华" onNavigate={onNavigate}>
      <section className="pb-10 pt-12 text-center">
        <p className="text-xs tracking-[0.7em] text-[#9e2b25]">卷 · 首</p>
        <h1 className="mt-4 text-4xl font-bold tracking-[0.15em] text-stone-900 sm:text-5xl">
          {site.title || site.siteName}
        </h1>
        {site.description && (
          <p className="mx-auto mt-5 max-w-xl leading-loose text-stone-500">{site.description}</p>
        )}
        <InkRule className="mx-auto mt-8 w-1/2" />
      </section>

      <nav aria-label="分类筛选" className="flex flex-wrap items-center justify-center gap-1 pb-6">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`min-h-[44px] border-b-2 px-4 tracking-widest transition-colors ${
              category === c
                ? 'border-[#9e2b25] font-bold text-[#9e2b25]'
                : 'border-transparent text-stone-500 hover:text-stone-900'
            }`}
          >
            {c}
          </button>
        ))}
      </nav>

      <section aria-label="书籍列表" className="pb-4">
        {loading ? (
          <InkSkeletonRows />
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-stone-500">书架尚空，静候墨香。</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((book) => (
              <ScrollCard key={book.id} book={book} onNavigate={onNavigate} />
            ))}
          </div>
        )}
      </section>
    </Shell>
  )
}

/* ================= Book ================= */

function InkBook({ site, data, loading, onNavigate }: ThemeProps) {
  const book = data.book
  const keywords = book
    ? Array.from(new Set([...book.keywords, ...book.suggestKeywords]))
    : []

  return (
    <Shell site={site} poem="读书破万卷 · 下笔如有神" onNavigate={onNavigate}>
      <Crumbs
        trail={[
          { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
          { label: book?.title ?? (loading ? '加载中' : '书籍详情') },
        ]}
      />

      {loading ? (
        <div className="mt-2">
          <InkBookSkeleton />
        </div>
      ) : !book ? (
        <div className="py-24 text-center">
          <p className="text-stone-500">未寻得此书，或已散佚。</p>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="mt-6 min-h-[44px] bg-[#9e2b25] px-6 text-sm tracking-widest text-stone-50 transition-colors hover:bg-[#7f221d]"
          >
            返回首页
          </button>
        </div>
      ) : (
        <>
          <article className="mt-2 flex flex-col gap-8 rounded-sm border border-stone-300/80 bg-white/60 p-6 sm:p-8 md:flex-row">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={`《${book.title}》封面`}
                className="h-64 w-44 shrink-0 self-center border border-stone-300 object-cover md:self-start"
              />
            ) : (
              <div className="flex h-64 w-44 shrink-0 self-center items-center justify-center border border-stone-300 bg-stone-200/70 text-5xl font-bold text-stone-400 md:self-start">
                {book.title.charAt(0) || '书'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-4">
                <h1 className="text-3xl font-bold tracking-wider text-stone-900 sm:text-4xl">
                  {book.title}
                </h1>
                <span className="mt-1 hidden shrink-0 rotate-3 rounded-sm bg-[#9e2b25] px-2 py-1 text-xs text-stone-50 shadow-sm sm:block">
                  {book.status}
                </span>
              </div>
              <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                <span>{book.author}</span>
                <span aria-hidden="true">·</span>
                <span>{book.category}</span>
                <span aria-hidden="true">·</span>
                <span>共 {book.totalChapters} 章</span>
                <span aria-hidden="true">·</span>
                <span>更新 {book.updatedAt.slice(0, 10)}</span>
              </p>
              <InkRule className="my-5" />
              <p className="leading-loose text-stone-600">{book.intro}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!book.firstChapterId}
                  onClick={() => {
                    if (book.firstChapterId) onNavigate({ type: 'chapter', chapterId: book.firstChapterId })
                  }}
                  className="inline-flex min-h-[44px] items-center bg-[#9e2b25] px-6 text-sm tracking-widest text-stone-50 transition-colors hover:bg-[#7f221d] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  开始阅读
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate({ type: 'toc', bookId: book.id })}
                  className="inline-flex min-h-[44px] items-center border border-stone-300 bg-white/80 px-6 text-sm tracking-widest text-stone-600 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25]"
                >
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
                      className="min-h-[44px] border border-stone-300 bg-white/80 px-3 tracking-wider text-stone-600 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25]"
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </article>

          <section aria-label="最新更新" className="mt-8 pb-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-widest text-stone-900">
                <Scroll className="h-5 w-5 text-[#9e2b25]" aria-hidden="true" />
                最新更新
                <span className="text-sm font-normal text-stone-400">
                  最近 {book.chapters.length} 章 / 共 {book.totalChapters} 章
                </span>
              </h2>
              <button
                type="button"
                onClick={() => onNavigate({ type: 'toc', bookId: book.id })}
                className="min-h-[44px] shrink-0 border border-stone-300 bg-white/70 px-4 text-sm tracking-widest text-stone-600 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25]"
              >
                完整目录 →
              </button>
            </div>
            {book.chapters.length === 0 ? (
              <p className="py-10 text-center text-stone-400">尚无章节。</p>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-px border border-stone-300/80 bg-stone-200/70 md:grid-cols-3">
                {book.chapters.map((ch) => (
                  <ChapterLine key={ch.id} chapter={ch} onNavigate={onNavigate} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Shell>
  )
}

/* ================= Toc（完整章节目录页） ================= */

const TOC_PAGE_SIZE = 100

function InkToc({ site, data, loading, onNavigate }: ThemeProps) {
  const [page, setPage] = useState(1)
  const book = data.book
  const chapters = book?.chapters ?? []
  const totalPages = Math.max(1, Math.ceil(chapters.length / TOC_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visible = chapters.slice((safePage - 1) * TOC_PAGE_SIZE, safePage * TOC_PAGE_SIZE)

  return (
    <Shell site={site} poem="千章罗列 · 纲举目张" onNavigate={onNavigate}>
      <div className="mx-auto max-w-4xl">
        <Crumbs
          trail={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            {
              label: book?.title ?? (loading ? '加载中' : '书籍'),
              onSelect: book ? () => onNavigate({ type: 'book', bookId: book.id }) : undefined,
            },
            { label: '章节目录' },
          ]}
        />

        {loading ? (
          <div className="mt-2">
            <InkBookSkeleton />
          </div>
        ) : !book ? (
          <div className="py-24 text-center">
            <p className="text-stone-500">未寻得此书，或已散佚。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] bg-[#9e2b25] px-6 text-sm tracking-widest text-stone-50 transition-colors hover:bg-[#7f221d]"
            >
              返回首页
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-2xl font-bold tracking-widest text-stone-900">
                {book.title}
                <span className="ml-3 text-base font-normal text-stone-400">章节目录</span>
              </h1>
              <p className="text-sm text-stone-500">
                {book.author} · 共 {book.totalChapters} 章
              </p>
            </div>

            <nav
              aria-label="目录分页"
              className="mt-4 flex flex-wrap items-center gap-3 border-b border-stone-300/70 pb-4"
            >
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex min-h-[36px] items-center border border-stone-300 bg-white/80 px-4 text-sm tracking-widest text-stone-600 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25] disabled:cursor-not-allowed disabled:opacity-40"
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
                className="inline-flex min-h-[36px] items-center border border-stone-300 bg-white/80 px-4 text-sm tracking-widest text-stone-600 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25] disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
            </nav>

            {visible.length === 0 ? (
              <p className="py-10 text-center text-stone-400">暂无章节。</p>
            ) : (
              <ul className="mb-10 mt-4 grid grid-cols-1 gap-px border border-stone-300/80 bg-stone-200/70 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((ch) => (
                  <ChapterLine key={ch.id} chapter={ch} onNavigate={onNavigate} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Shell>
  )
}

/* ================= Chapter ================= */

function InkChapter({ site, data, loading, onNavigate }: ThemeProps) {
  const chapter = data.chapter
  const paragraphs = chapter
    ? chapter.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <Shell site={site} poem="笔下起风云 · 书中藏日月" onNavigate={onNavigate}>
      <div className="mx-auto max-w-3xl">
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
          <InkChapterSkeleton />
        ) : !chapter ? (
          <div className="py-24 text-center">
            <p className="text-stone-500">未寻得此章。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className="mt-6 min-h-[44px] bg-[#9e2b25] px-6 text-sm tracking-widest text-stone-50 transition-colors hover:bg-[#7f221d]"
            >
              返回首页
            </button>
          </div>
        ) : (
          <article className="mt-2 rounded-sm border border-stone-300/80 bg-white/60 px-6 py-10 sm:px-12">
            <h1 className="text-center text-3xl font-bold tracking-widest text-stone-900">
              {chapter.title}
            </h1>
            <p className="mt-3 text-center text-sm tracking-widest text-stone-400">
              《{chapter.bookTitle}》 · 第 {chapter.order} 章
            </p>
            <InkRule className="my-8" />
            <div className="space-y-6 text-[17px] leading-8 text-stone-800">
              {paragraphs.map((p, i) => (
                <p key={i} className="indent-8">
                  {p}
                </p>
              ))}
            </div>
            <InkRule className="my-8" />
            <nav
              aria-label="章节导航"
              className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center"
            >
              <button
                type="button"
                disabled={!chapter.prevId}
                onClick={() => {
                  if (chapter.prevId) onNavigate({ type: 'chapter', chapterId: chapter.prevId })
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-stone-300 bg-white/80 px-6 text-sm tracking-widest text-stone-700 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                上一章
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ type: 'toc', bookId: chapter.bookId })}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-[#9e2b25] px-6 text-sm tracking-widest text-stone-50 transition-colors hover:bg-[#7f221d]"
              >
                返回目录
              </button>
              <button
                type="button"
                disabled={!chapter.nextId}
                onClick={() => {
                  if (chapter.nextId) onNavigate({ type: 'chapter', chapterId: chapter.nextId })
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 border border-stone-300 bg-white/80 px-6 text-sm tracking-widest text-stone-700 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25] disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一章
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          </article>
        )}
      </div>
    </Shell>
  )
}

/* ================= Keyword ================= */

function InkKeyword({
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
    <Shell site={site} poem="千卷藏天地 · 一键入主册" onNavigate={onNavigate}>
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
        className="flex min-h-[44px] w-full items-center justify-center gap-3 bg-[#9e2b25] px-6 py-4 text-lg font-bold tracking-[0.3em] text-stone-50 shadow-md transition-colors hover:bg-[#7f221d]"
      >
        <BookOpen className="h-5 w-5" aria-hidden="true" />
        进入主书籍信息页
      </button>

      <section className="py-10 text-center">
        <p className="text-xs tracking-[0.7em] text-[#9e2b25]">关 键 词</p>
        <h1 className="mt-4 text-4xl font-bold tracking-[0.2em] text-stone-900">{keyword}</h1>
        <p className="mt-4 text-stone-500">与《{keyword}》相关的书籍与内容</p>
      </section>

      {loading ? (
        <InkSkeletonRows rows={3} />
      ) : books.length === 0 ? (
        <p className="py-16 text-center text-stone-500">未觅得相关书卷。</p>
      ) : (
        <div className="space-y-4 pb-4">
          {books.map((book) => (
            <ScrollCard key={book.id} book={book} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {related.length > 0 && (
        <section aria-label="相关关键词" className="mt-8 border-t border-stone-300/70 pb-2 pt-6">
          <h2 className="flex items-center gap-2 text-sm tracking-[0.3em] text-stone-400">
            <Brush className="h-4 w-4 text-[#9e2b25]" aria-hidden="true" />
            相关关键词
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {related.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => onNavigate({ type: 'keyword', keyword: k })}
                className="min-h-[44px] border border-stone-300 bg-white/80 px-3 tracking-wider text-stone-600 transition-colors hover:border-[#9e2b25] hover:text-[#9e2b25]"
              >
                {k}
              </button>
            ))}
          </div>
        </section>
      )}
    </Shell>
  )
}

/* ================= 主组件 ================= */

export function ThemeInk(props: ThemeProps): ReactElement {
  const { view } = props
  switch (view.type) {
    case 'home':
      return <InkHome {...props} />
    case 'book':
      return <InkBook {...props} />
    case 'toc':
      return <InkToc {...props} />
    case 'chapter':
      return <InkChapter {...props} />
    case 'keyword':
      return <InkKeyword {...props} keyword={view.keyword} />
    default:
      return <InkHome {...props} />
  }
}

export default ThemeInk
