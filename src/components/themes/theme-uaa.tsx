'use client'

import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  Flame,
  LayoutGrid,
  List,
  Search,
  Tag,
  TrendingUp,
  User,
} from 'lucide-react'
import type { BookCard, ChapterItem, SiteMeta, SiteView, ThemeProps } from '@/lib/theme-types'

type Nav = (v: SiteView) => void

// ============================================================
// UAA 克隆主题：uaa.com/novel/list 版式（顶栏搜索 + 筛选条 + 封面卡片流 +
// 右侧排行侧栏）× 浅蓝笔趣阁底色。主色 #1a72c4，底色 #e9f2f9。
// ============================================================

const ACCENT = 'text-[#1a72c4]'
const ACCENT_BG = 'bg-[#1a72c4]'
const CARD = 'rounded-md border border-[#d4e4f0] bg-white shadow-sm'
const PAGE_BG = 'bg-[#e9f2f9]'

/* ================= 基础部件 ================= */

function Cover({ book, className }: { book: Pick<BookCard, 'title' | 'coverUrl'>; className: string }) {
  if (book.coverUrl) {
    return (
      <img
        src={book.coverUrl}
        alt={`《${book.title}》封面`}
        className={`${className} shrink-0 rounded border border-[#d4e4f0] bg-white object-cover shadow-sm`}
      />
    )
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded border border-[#bcd8ec] bg-gradient-to-br from-[#eaf4fb] via-[#dcecf8] to-[#c9e2f4] text-2xl font-bold text-[#4a89b8] shadow-sm`}
      aria-label={`《${book.title}》封面占位`}
    >
      {book.title.charAt(0) || '书'}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const done = status.includes('完')
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
        done ? 'bg-[#e6f4ea] text-[#2e8b57]' : 'bg-[#e8f2fb] text-[#1a72c4]'
      }`}
    >
      {status}
    </span>
  )
}

function Header({ site, onNavigate }: { site: SiteMeta; onNavigate: Nav }) {
  const [kw, setKw] = useState('')
  const submit = () => {
    const k = kw.trim()
    if (k) onNavigate({ type: 'keyword', keyword: k })
  }
  return (
    <header className="sticky top-0 z-10 border-b border-[#d4e4f0] bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <button
          type="button"
          onClick={() => onNavigate({ type: 'home' })}
          className="flex min-h-[44px] shrink-0 items-center gap-2"
          aria-label={`返回${site.siteName}首页`}
        >
          <span className={`flex h-8 w-8 items-center justify-center rounded ${ACCENT_BG} text-white`}>
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-wide text-[#20517a]">{site.siteName}</span>
        </button>
        <nav aria-label="主导航" className="hidden items-center gap-1 text-sm text-[#4a6b85] sm:flex">
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="min-h-[44px] rounded px-3 transition-colors hover:bg-[#e8f2fb] hover:text-[#1a72c4]"
          >
            首页
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ type: 'home' })}
            className="min-h-[44px] rounded px-3 transition-colors hover:bg-[#e8f2fb] hover:text-[#1a72c4]"
          >
            全部小说
          </button>
          {site.mainBookId ? (
            <button
              type="button"
              onClick={() => onNavigate({ type: 'book', bookId: site.mainBookId })}
              className="min-h-[44px] rounded px-3 transition-colors hover:bg-[#e8f2fb] hover:text-[#1a72c4]"
            >
              主推作品
            </button>
          ) : null}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center rounded-full border border-[#c9dff0] bg-[#f4f9fd] focus-within:border-[#1a72c4]">
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="搜索书名 / 作者 / 关键词"
              aria-label="站内搜索"
              className="min-h-[38px] w-36 min-w-0 bg-transparent px-4 text-sm text-[#20517a] outline-none placeholder:text-[#9db8cc] sm:w-56"
            />
            <button
              type="button"
              onClick={submit}
              aria-label="搜索"
              className={`flex h-9 w-10 shrink-0 items-center justify-center rounded-full ${ACCENT_BG} text-white transition-opacity hover:opacity-90`}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <span className="hidden shrink-0 text-xs text-[#9db8cc] lg:inline">{site.domain}</span>
        </div>
      </div>
    </header>
  )
}

function Footer({ site }: { site: SiteMeta }) {
  return (
    <footer className="mt-auto border-t border-[#c9dff0] bg-[#dcebf7] py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
      <p className="text-sm text-[#4a6b85]">{site.footerText || `${site.siteName} · ${site.domain}`}</p>
      <p className="mt-1.5 text-xs text-[#7d9cb5]">{site.title}</p>
    </footer>
  )
}

function Breadcrumb({ items }: { items: { label: string; onSelect?: () => void }[] }) {
  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-0.5 py-3 text-sm text-[#7d9cb5]">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-0.5">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#b7cfdf]" aria-hidden="true" />}
          {item.onSelect ? (
            <button
              type="button"
              onClick={item.onSelect}
              className="inline-flex min-h-[44px] items-center px-1 transition-colors hover:text-[#1a72c4]"
            >
              {item.label}
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center px-1 text-[#20517a]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

/* ================= 骨架屏 ================= */

function CardSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`flex gap-4 rounded-md border border-[#d4e4f0] bg-white p-4 ${i === 0 ? '' : 'opacity-80'}`}>
          <div className="h-28 w-20 animate-pulse rounded bg-[#dbe9f5]" />
          <div className="flex-1 space-y-2.5 py-1">
            <div className="h-5 w-1/3 animate-pulse rounded bg-[#dbe9f5]" />
            <div className="h-3.5 w-1/4 animate-pulse rounded bg-[#e8f2fb]" />
            <div className="h-3.5 w-full animate-pulse rounded bg-[#e8f2fb]" />
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-[#e8f2fb]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function BookSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-6 rounded-md border border-[#d4e4f0] bg-white p-6 md:flex-row md:gap-8" aria-hidden="true">
      <div className="h-64 w-48 animate-pulse self-center rounded bg-[#dbe9f5] md:self-start" />
      <div className="flex-1 space-y-4 py-2">
        <div className="h-8 w-1/2 animate-pulse rounded bg-[#dbe9f5]" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-[#e8f2fb]" />
        <div className="h-4 w-full animate-pulse rounded bg-[#e8f2fb]" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-[#e8f2fb]" />
        <div className="h-10 w-48 animate-pulse rounded bg-[#e8f2fb]" />
      </div>
    </div>
  )
}

function ChapterSkeleton() {
  return (
    <div className="mx-auto mt-4 max-w-3xl space-y-5" aria-hidden="true">
      <div className="mx-auto h-8 w-2/3 animate-pulse rounded bg-[#dbe9f5]" />
      <div className="mx-auto h-4 w-1/4 animate-pulse rounded bg-[#e8f2fb]" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={`h-4 animate-pulse rounded bg-[#e8f2fb] ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  )
}

/* ================= 书籍卡片（home 列表 / keyword 复用） ================= */

function BookItem({ book, onNavigate }: { book: BookCard; onNavigate: Nav }) {
  const tags = Array.from(new Set([...book.keywords.slice(0, 3), ...book.suggestKeywords.slice(0, 2)]))
  return (
    <article className={`${CARD} group p-4 transition-shadow hover:shadow-md`}>
      <button
        type="button"
        onClick={() => onNavigate({ type: 'book', bookId: book.id })}
        className="flex w-full items-start gap-4 text-left"
      >
        <Cover book={book} className="h-28 w-20" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-[#20517a] transition-colors group-hover:text-[#1a72c4]">
            {book.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7d9cb5]">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              {book.author || '佚名'}
            </span>
            <span className="flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              {book.category || '未分类'}
            </span>
            <StatusPill status={book.status} />
            <span>{book.totalChapters} 章</span>
          </span>
          <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-[#6b8aa2]">{book.intro}</span>
          <span className="mt-1.5 flex items-center gap-1 truncate text-xs text-[#1a72c4]">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            最新：{book.latestChapter || '暂无'}
          </span>
        </span>
      </button>
      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[#eef4f9] pt-2.5">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onNavigate({ type: 'keyword', keyword: t })}
              className="min-h-[32px] rounded-full bg-[#e8f2fb] px-2.5 text-xs text-[#3a7ca8] transition-colors hover:bg-[#d8eafa] hover:text-[#1a72c4]"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

/* ================= 首页（小说列表） ================= */

const HOME_PAGE_SIZE = 12

function UaaHome({ site, data, loading, onNavigate }: ThemeProps) {
  const [category, setCategory] = useState('全部')
  const [status, setStatus] = useState('全部')
  const [page, setPage] = useState(1)
  const books = data.books ?? []
  const categories = ['全部', ...(data.categories ?? [])]

  const filtered = useMemo(
    () =>
      books.filter(
        (b) =>
          (category === '全部' || b.category === category) &&
          (status === '全部' || (status === '完结' ? b.status.includes('完') : !b.status.includes('完'))),
      ),
    [books, category, status],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / HOME_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visible = filtered.slice((safePage - 1) * HOME_PAGE_SIZE, safePage * HOME_PAGE_SIZE)
  const rank = books.slice(0, 10)
  const hotTags = Array.from(new Set(books.flatMap((b) => b.keywords).filter(Boolean))).slice(0, 14)

  return (
    <div className={`flex min-h-screen flex-col ${PAGE_BG} text-[#20517a]`}>
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <section className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#20517a]">
            <LayoutGrid className={`h-5 w-5 ${ACCENT}`} aria-hidden="true" />
            {site.title || site.siteName || '小说列表'}
          </h1>
          <p className="text-xs text-[#7d9cb5]">{site.description}</p>
        </section>

        {/* 筛选条 */}
        <section aria-label="筛选" className={`${CARD} mt-3 space-y-2 p-4`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 shrink-0 text-xs text-[#9db8cc]">分类</span>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c)
                  setPage(1)
                }}
                className={`min-h-[32px] rounded-full px-3 text-xs transition-colors ${
                  category === c ? `${ACCENT_BG} text-white` : 'bg-[#f0f6fb] text-[#4a6b85] hover:bg-[#e2eef8]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 shrink-0 text-xs text-[#9db8cc]">状态</span>
            {['全部', '连载', '完结'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s)
                  setPage(1)
                }}
                className={`min-h-[32px] rounded-full px-3 text-xs transition-colors ${
                  status === s ? `${ACCENT_BG} text-white` : 'bg-[#f0f6fb] text-[#4a6b85] hover:bg-[#e2eef8]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-4 flex gap-5">
          {/* 左：卡片流 */}
          <div className="min-w-0 flex-1">
            <section aria-label="书籍列表">
              {loading ? (
                <CardSkeleton />
              ) : visible.length === 0 ? (
                <div className={`${CARD} py-16 text-center text-sm text-[#9db8cc]`}>
                  没有符合条件的书籍，换个筛选试试。
                </div>
              ) : (
                <div className="space-y-3">
                  {visible.map((book) => (
                    <BookItem key={book.id} book={book} onNavigate={onNavigate} />
                  ))}
                </div>
              )}
            </section>

            {/* 分页 */}
            {!loading && filtered.length > HOME_PAGE_SIZE && (
              <nav aria-label="列表分页" className="mt-5 flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex min-h-[36px] items-center gap-1 rounded border border-[#c9dff0] bg-white px-3 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  上一页
                </button>
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i + 1)}
                    aria-current={safePage === i + 1 ? 'page' : undefined}
                    className={`h-9 min-w-[36px] rounded text-sm transition-colors ${
                      safePage === i + 1
                        ? `${ACCENT_BG} text-white`
                        : 'border border-[#c9dff0] bg-white text-[#4a6b85] hover:border-[#1a72c4] hover:text-[#1a72c4]'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="flex min-h-[36px] items-center gap-1 rounded border border-[#c9dff0] bg-white px-3 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一页
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>

          {/* 右：侧栏（uaa 版式：排行 + 热门标签） */}
          <aside className="hidden w-72 shrink-0 space-y-4 lg:block">
            <section aria-label="最近更新榜" className={`${CARD} overflow-hidden`}>
              <h2 className="flex items-center gap-2 border-b border-[#eef4f9] px-4 py-3 text-sm font-bold text-[#20517a]">
                <TrendingUp className={`h-4 w-4 ${ACCENT}`} aria-hidden="true" />
                最近更新榜
              </h2>
              <ol>
                {rank.map((b, i) => (
                  <li key={b.id} className="border-b border-[#f1f7fb] last:border-0">
                    <button
                      type="button"
                      onClick={() => onNavigate({ type: 'book', bookId: b.id })}
                      className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[#f4f9fd]"
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
                          i < 3 ? `${ACCENT_BG} text-white` : 'bg-[#e8f2fb] text-[#7d9cb5]'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-[#20517a]">{b.title}</span>
                        <span className="block truncate text-xs text-[#9db8cc]">{b.latestChapter}</span>
                      </span>
                    </button>
                  </li>
                ))}
                {rank.length === 0 && <li className="px-4 py-6 text-center text-xs text-[#9db8cc]">暂无数据</li>}
              </ol>
            </section>

            {hotTags.length > 0 && (
              <section aria-label="热门标签" className={`${CARD} p-4`}>
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#20517a]">
                  <Flame className={`h-4 w-4 ${ACCENT}`} aria-hidden="true" />
                  热门标签
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {hotTags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onNavigate({ type: 'keyword', keyword: t })}
                      className="min-h-[32px] rounded-full bg-[#f0f6fb] px-2.5 text-xs text-[#4a6b85] transition-colors hover:bg-[#e2eef8] hover:text-[#1a72c4]"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= 章节行（book 最新更新 / toc 复用） ================= */

function ChapterLine({ chapter, onNavigate }: { chapter: ChapterItem; onNavigate: Nav }) {
  return (
    <li className="border-b border-[#f1f7fb] last:border-0">
      <button
        type="button"
        onClick={() => onNavigate({ type: 'chapter', chapterId: chapter.id })}
        className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left text-sm text-[#4a6b85] transition-colors hover:bg-[#f4f9fd] hover:text-[#1a72c4]"
      >
        <span className="w-8 shrink-0 text-xs text-[#9db8cc]">{String(chapter.order).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c9dff0]" aria-hidden="true" />
      </button>
    </li>
  )
}

/* ================= Book（书籍页：最新更新 12 章 + 目录入口） ================= */

function UaaBook({ site, data, loading, onNavigate }: ThemeProps) {
  const book = data.book

  return (
    <div className={`flex min-h-screen flex-col ${PAGE_BG} text-[#20517a]`}>
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            { label: book?.title ?? (loading ? '加载中' : '书籍详情') },
          ]}
        />

        {loading ? (
          <BookSkeleton />
        ) : !book ? (
          <div className={`${CARD} py-24 text-center`}>
            <p className="text-lg text-[#9db8cc]">未找到该书籍，可能已被移除。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className={`mt-6 min-h-[44px] rounded px-6 text-sm text-white transition-opacity ${ACCENT_BG} hover:opacity-90`}
            >
              返回首页
            </button>
          </div>
        ) : (
          <>
            <article className={`${CARD} flex flex-col gap-6 p-5 md:flex-row md:gap-8 md:p-6`}>
              <Cover book={book} className="h-64 w-48 self-center md:self-start" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-[#20517a] sm:text-3xl">{book.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#7d9cb5]">
                  <span className="flex items-center gap-1.5">
                    <User className="h-4 w-4" aria-hidden="true" />
                    {book.author || '佚名'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-4 w-4" aria-hidden="true" />
                    {book.category || '未分类'}
                  </span>
                  <StatusPill status={book.status} />
                  <span>{book.totalChapters} 章</span>
                  <span>更新：{book.updatedAt.slice(0, 10)}</span>
                </div>
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#6b8aa2]">{book.intro}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={!book.firstChapterId}
                    onClick={() => {
                      if (book.firstChapterId) onNavigate({ type: 'chapter', chapterId: book.firstChapterId })
                    }}
                    className={`flex min-h-[44px] items-center gap-2 rounded px-6 text-sm font-medium text-white transition-opacity ${ACCENT_BG} hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    开始阅读
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate({ type: 'toc', bookId: book.id })}
                    className="flex min-h-[44px] items-center gap-2 rounded border border-[#1a72c4] bg-white px-6 text-sm text-[#1a72c4] transition-colors hover:bg-[#e8f2fb]"
                  >
                    <List className="h-4 w-4" aria-hidden="true" />
                    查看全部 {book.totalChapters} 章目录
                  </button>
                </div>
                {book.keywords.length + book.suggestKeywords.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {Array.from(new Set([...book.keywords, ...book.suggestKeywords])).map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => onNavigate({ type: 'keyword', keyword: kw })}
                        className="min-h-[32px] rounded-full bg-[#e8f2fb] px-3 text-xs text-[#3a7ca8] transition-colors hover:bg-[#d8eafa] hover:text-[#1a72c4]"
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>

            <section aria-label="最新更新" className={`${CARD} mt-4 overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-[#eef4f9] px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#20517a]">
                  <Clock className={`h-4 w-4 ${ACCENT}`} aria-hidden="true" />
                  最新更新
                  <span className="text-xs font-normal text-[#9db8cc]">
                    最近 {book.chapters.length} 章 / 共 {book.totalChapters} 章
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate({ type: 'toc', bookId: book.id })}
                  className="flex min-h-[36px] items-center gap-1 rounded border border-[#c9dff0] bg-white px-3 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4]"
                >
                  完整目录
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              {book.chapters.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#9db8cc]">暂无章节。</p>
              ) : (
                <ul className="grid grid-cols-1 md:grid-cols-2">
                  {book.chapters.map((ch) => (
                    <ChapterLine key={ch.id} chapter={ch} onNavigate={onNavigate} />
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

/* ================= Toc（完整章节目录页） ================= */

const TOC_PAGE_SIZE = 100

function UaaToc({ site, data, loading, onNavigate }: ThemeProps) {
  const [page, setPage] = useState(1)
  const book = data.book
  const chapters = book?.chapters ?? []
  const totalPages = Math.max(1, Math.ceil(chapters.length / TOC_PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const visible = chapters.slice((safePage - 1) * TOC_PAGE_SIZE, safePage * TOC_PAGE_SIZE)

  return (
    <div className={`flex min-h-screen flex-col ${PAGE_BG} text-[#20517a]`}>
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            {
              label: book?.title ?? '书籍',
              onSelect: book ? () => onNavigate({ type: 'book', bookId: book.id }) : undefined,
            },
            { label: '章节目录' },
          ]}
        />

        {loading ? (
          <BookSkeleton />
        ) : !book ? (
          <div className={`${CARD} py-24 text-center`}>
            <p className="text-lg text-[#9db8cc]">未找到该书籍，可能已被移除。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className={`mt-6 min-h-[44px] rounded px-6 text-sm text-white transition-opacity ${ACCENT_BG} hover:opacity-90`}
            >
              返回首页
            </button>
          </div>
        ) : (
          <section className={`${CARD} overflow-hidden`}>
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[#eef4f9] px-5 py-4">
              <h1 className="text-xl font-bold text-[#20517a]">
                {book.title}
                <span className="ml-2.5 text-sm font-normal text-[#9db8cc]">章节目录</span>
              </h1>
              <p className="text-sm text-[#7d9cb5]">
                {book.author} · 共 {book.totalChapters} 章
              </p>
            </div>

            <nav aria-label="目录分页" className="flex flex-wrap items-center gap-2 border-b border-[#eef4f9] bg-[#f8fbfe] px-5 py-3">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex min-h-[36px] items-center gap-1 rounded border border-[#c9dff0] bg-white px-3 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                上一页
              </button>
              <span className="text-sm text-[#7d9cb5]">
                第 {safePage} / {totalPages} 页
              </span>
              {totalPages > 1 &&
                Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i + 1)}
                    aria-current={safePage === i + 1 ? 'page' : undefined}
                    className={`h-8 min-w-[32px] rounded text-xs transition-colors ${
                      safePage === i + 1
                        ? `${ACCENT_BG} text-white`
                        : 'border border-[#c9dff0] bg-white text-[#4a6b85] hover:border-[#1a72c4] hover:text-[#1a72c4]'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="flex min-h-[36px] items-center gap-1 rounded border border-[#c9dff0] bg-white px-3 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </nav>

            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#9db8cc]">暂无章节。</p>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2">
                {visible.map((ch) => (
                  <ChapterLine key={ch.id} chapter={ch} onNavigate={onNavigate} />
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
      <Footer site={site} />
    </div>
  )
}

/* ================= Chapter ================= */

function UaaChapter({ site, data, loading, onNavigate }: ThemeProps) {
  const chapter = data.chapter
  const paragraphs = chapter
    ? chapter.content
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    : []

  return (
    <div className={`flex min-h-screen flex-col ${PAGE_BG} text-[#20517a]`}>
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            {
              label: chapter?.bookTitle ?? '书籍',
              onSelect: chapter ? () => onNavigate({ type: 'toc', bookId: chapter.bookId }) : undefined,
            },
            { label: chapter?.title ?? '正文' },
          ]}
        />

        {loading ? (
          <ChapterSkeleton />
        ) : !chapter ? (
          <div className={`${CARD} py-24 text-center`}>
            <p className="text-lg text-[#9db8cc]">未找到该章节内容。</p>
            <button
              type="button"
              onClick={() => onNavigate({ type: 'home' })}
              className={`mt-6 min-h-[44px] rounded px-6 text-sm text-white transition-opacity ${ACCENT_BG} hover:opacity-90`}
            >
              返回首页
            </button>
          </div>
        ) : (
          <article className={`${CARD} p-5 sm:p-8`}>
            <h1 className="text-center text-2xl font-bold text-[#20517a] sm:text-3xl">{chapter.title}</h1>
            <p className="mt-3 text-center text-sm text-[#9db8cc]">
              《{chapter.bookTitle}》· 第 {chapter.order} 章
            </p>
            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-[#e2eef8]" />
              <BookOpen className={`h-4 w-4 ${ACCENT}`} />
              <span className="h-px flex-1 bg-[#e2eef8]" />
            </div>
            <div className="space-y-6 text-[17px] leading-loose text-[#3a5a74]">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <nav
              aria-label="章节导航"
              className="mt-8 flex flex-col items-stretch justify-center gap-3 border-t border-[#eef4f9] pt-6 sm:flex-row"
            >
              <button
                type="button"
                disabled={!chapter.prevId}
                onClick={() => {
                  if (chapter.prevId) onNavigate({ type: 'chapter', chapterId: chapter.prevId })
                }}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded border border-[#c9dff0] bg-white px-6 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                上一章
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ type: 'toc', bookId: chapter.bookId })}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded px-6 text-sm text-white transition-opacity ${ACCENT_BG} hover:opacity-90`}
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
                className="flex min-h-[44px] items-center justify-center gap-2 rounded border border-[#c9dff0] bg-white px-6 text-sm text-[#4a6b85] transition-colors hover:border-[#1a72c4] hover:text-[#1a72c4] disabled:cursor-not-allowed disabled:opacity-40"
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

function UaaKeyword({ site, data, loading, onNavigate, keyword }: ThemeProps & { keyword: string }) {
  const books = data.keywordBooks ?? []
  const goMain = () =>
    onNavigate(site.mainBookId ? { type: 'book', bookId: site.mainBookId } : { type: 'home' })
  const relatedKeywords = Array.from(
    new Set(books.flatMap((b) => [...b.keywords, ...b.suggestKeywords]).filter((k) => k !== keyword)),
  ).slice(0, 12)

  return (
    <div className={`flex min-h-screen flex-col ${PAGE_BG} text-[#20517a]`}>
      <Header site={site} onNavigate={onNavigate} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        <Breadcrumb
          items={[
            { label: '首页', onSelect: () => onNavigate({ type: 'home' }) },
            { label: `关键词：${keyword}` },
          ]}
        />

        <button
          type="button"
          onClick={goMain}
          className={`flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-opacity ${ACCENT_BG} hover:opacity-90`}
        >
          <BookOpen className="h-5 w-5" aria-hidden="true" />
          进入主书籍信息页
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        <section className="py-8 text-center">
          <h1 className="text-2xl font-bold text-[#20517a] sm:text-3xl">{keyword}</h1>
          <p className="mt-2 text-sm text-[#7d9cb5]">与「{keyword}」相关的书籍与内容</p>
        </section>

        {loading ? (
          <CardSkeleton rows={3} />
        ) : books.length === 0 ? (
          <div className={`${CARD} py-16 text-center text-sm text-[#9db8cc]`}>暂无与「{keyword}」相关的书籍。</div>
        ) : (
          <div className="space-y-3">
            {books.map((book) => (
              <BookItem key={book.id} book={book} onNavigate={onNavigate} />
            ))}
          </div>
        )}

        {relatedKeywords.length > 0 && (
          <section aria-label="相关关键词" className={`${CARD} mt-4 p-4`}>
            <h2 className="text-sm font-bold text-[#20517a]">相关关键词</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {relatedKeywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => onNavigate({ type: 'keyword', keyword: k })}
                  className="min-h-[32px] rounded-full bg-[#f0f6fb] px-3 text-xs text-[#4a6b85] transition-colors hover:bg-[#e2eef8] hover:text-[#1a72c4]"
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

export function ThemeUaa(props: ThemeProps): ReactElement {
  const { view } = props
  switch (view.type) {
    case 'home':
      return <UaaHome {...props} />
    case 'book':
      return <UaaBook {...props} />
    case 'toc':
      return <UaaToc {...props} />
    case 'chapter':
      return <UaaChapter {...props} />
    case 'keyword':
      return <UaaKeyword {...props} keyword={view.keyword} />
    default:
      return <UaaHome {...props} />
  }
}

export default ThemeUaa
