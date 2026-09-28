'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { api, formatDate, formatNumber } from '@/lib/client-api'
import { BookOpen, Download, ExternalLink, Loader2, Search, Sparkles, Tag, Trash2 } from 'lucide-react'

interface BookRow {
  id: string
  title: string
  author: string
  category: string
  keywords: string
  suggestKeywords: string
  intro: string
  coverUrl: string
  coverLocal: string
  status: string
  statusConfidence: number
  statusSource: string
  latestChapter: string
  totalChapters: number
  sourceUrl: string
  updatedAt: string
}

interface ChapterRow {
  id: string
  title: string
  order: number
  wordCount: number
  collected: boolean
}

function coverSrc(b: BookRow): string {
  return b.coverLocal ? `/api/covers/${b.coverLocal}` : b.coverUrl
}

export function BooksPage() {
  const { toast } = useToast()
  const [books, setBooks] = useState<BookRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<BookRow | null>(null)
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [chapterQ, setChapterQ] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [chapterContent, setChapterContent] = useState<{ title: string; content: string } | null>(null)
  const pageSize = 12

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (q.trim()) params.set('q', q.trim())
      if (category) params.set('category', category)
      const r = await api<{ books: BookRow[]; total: number }>(`/api/books?${params}`)
      setBooks(r.books)
      setTotal(r.total)
    } catch (e) {
      toast({ title: '加载失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [page, q, category, toast])

  useEffect(() => { void load() }, [load])

  const openDetail = async (book: BookRow) => {
    setDetail(book)
    setChapters([])
    try {
      const r = await api<{ chapters: ChapterRow[] }>(`/api/books/${book.id}/chapters?pageSize=500`)
      setChapters(r.chapters)
    } catch { /* ignore */ }
  }

  const fetchSuggest = async (book: BookRow) => {
    setSuggesting(true)
    try {
      const r = await api<{ total: number; keywords: string[]; sources: { source: string; count: number; error?: string }[] }>(
        `/api/books/${book.id}/suggest`, { method: 'POST' }
      )
      const fail = r.sources.filter((s) => s.error).map((s) => s.source)
      toast({
        title: `下拉词抓取完成，共 ${r.total} 个关联词`,
        description: fail.length ? `部分来源不可用：${fail.join('、')}` : '全部来源成功',
      })
      setDetail((d) => (d && d.id === book.id ? { ...d, suggestKeywords: [...new Set([...d.suggestKeywords.split(',').filter(Boolean), ...r.keywords])].join(',') } : d))
      await load()
    } catch (e) {
      toast({ title: '抓取失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSuggesting(false)
    }
  }

  const downloadTxt = (book: BookRow) => {
    window.open(`/api/books/${book.id}/download`, '_blank')
  }

  const removeBook = async (book: BookRow) => {
    if (!confirm(`确定删除《${book.title}》及其全部章节？`)) return
    try {
      await api(`/api/books/${book.id}`, { method: 'DELETE' })
      toast({ title: '已删除' })
      setDetail(null)
      await load()
    } catch (e) {
      toast({ title: '删除失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  const openChapter = async (chapterId: string) => {
    try {
      const r = await api<{ chapter: { title: string; content: string } }>(`/api/chapters/${chapterId}`)
      setChapterContent({ title: r.chapter.title, content: r.chapter.content || '（正文未采集或为空）' })
    } catch { /* ignore */ }
  }

  const categories = [...new Set(books.map((b) => b.category).filter(Boolean))]
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const filteredChapters = chapters.filter((c) => !chapterQ.trim() || c.title.includes(chapterQ.trim()))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="搜索书名 / 作者 / 关键词" value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => { setCategory(''); setPage(1) }}
            className={`rounded-full border px-3 py-1.5 text-xs ${category === '' ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            全部
          </button>
          {categories.map((c) => (
            <button key={c} onClick={() => { setCategory(c); setPage(1) }}
              className={`rounded-full border px-3 py-1.5 text-xs ${category === c ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : books.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">暂无书籍，先运行采集任务入库。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((b) => (
            <Card key={b.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => void openDetail(b)}>
              <CardContent className="flex gap-3 p-4">
                <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-md border bg-muted">
                  {coverSrc(b) ? (
                    <img src={coverSrc(b)} alt={`${b.title} 封面`} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-bold text-muted-foreground">
                      {b.title.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-sm font-semibold">《{b.title}》</p>
                  <p className="truncate text-xs text-muted-foreground">{b.author || '佚名'} · {b.category || '未分类'}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.intro || '暂无简介'}</p>
                  <div className="mt-auto flex items-center justify-between pt-1.5">
                    <div className="flex gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{b.category || '其他'}</Badge>
                      <Badge variant={b.status === '完结' ? 'secondary' : 'outline'} className="text-[10px]">{b.status}</Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{b.totalChapters} 章</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}（共 {formatNumber(total)} 本）</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
        </div>
      )}

      {/* 书籍详情 */}
      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>《{detail.title}》</DialogTitle>
                <DialogDescription>
                  {detail.author || '佚名'} · {detail.category || '未分类'} · {detail.status}
                  （置信度 {(detail.statusConfidence * 100).toFixed(0)}%）· {detail.totalChapters} 章
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="h-32 w-[88px] shrink-0 overflow-hidden rounded-md border bg-muted">
                    {coverSrc(detail) ? (
                      <img src={coverSrc(detail)} alt={`${detail.title} 封面`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xl font-bold text-muted-foreground">{detail.title.slice(0, 1)}</div>
                    )}
                  </div>
                  <ScrollArea className="max-h-32 flex-1 rounded-md border bg-muted/30 p-3">
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">{detail.intro || '暂无简介'}</p>
                  </ScrollArea>
                </div>

                {detail.keywords && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    {detail.keywords.split(',').filter(Boolean).map((k) => (
                      <Badge key={k} variant="outline" className="text-[11px]">{k}</Badge>
                    ))}
                  </div>
                )}
                {detail.suggestKeywords && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                    {detail.suggestKeywords.split(',').filter(Boolean).slice(0, 20).map((k) => (
                      <Badge key={k} variant="secondary" className="text-[11px]">{k}</Badge>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={suggesting} onClick={() => void fetchSuggest(detail)}>
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    抓取搜索引擎下拉词
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadTxt(detail)}>
                    <Download className="h-3.5 w-3.5" /> 下载 TXT
                  </Button>
                  {detail.sourceUrl && (
                    <Button size="sm" variant="ghost" onClick={() => window.open(detail.sourceUrl, '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" /> 源站页面
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto text-red-600" onClick={() => void removeBook(detail)}>
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">章节目录（{chapters.length}）</p>
                    <Input className="h-7 w-40 text-xs" placeholder="筛选章节" value={chapterQ} onChange={(e) => setChapterQ(e.target.value)} />
                  </div>
                  <ScrollArea className="max-h-72 rounded-md border" data-testid="chapter-list">
                    <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                      {filteredChapters.map((c) => (
                        <button key={c.id} onClick={() => void openChapter(c.id)}
                          className="flex items-center justify-between gap-2 bg-background px-3 py-2 text-left text-xs hover:bg-accent">
                          <span className="truncate">{c.title}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {c.collected ? formatNumber(c.wordCount) + '字' : '未采'}
                          </span>
                        </button>
                      ))}
                      {filteredChapters.length === 0 && (
                        <div className="col-span-2 bg-background px-3 py-6 text-center text-xs text-muted-foreground">暂无章节</div>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <p className="text-[11px] text-muted-foreground">入库时间：{formatDate(detail.updatedAt)} · 完结判断依据：{detail.statusSource || '—'}</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 章节正文 */}
      <Dialog open={!!chapterContent} onOpenChange={(open) => !open && setChapterContent(null)}>
        <DialogContent className="max-h-[85vh] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{chapterContent?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[64vh] rounded-md border bg-muted/20 p-4">
            <div className="space-y-2 text-sm leading-7">
              {(chapterContent?.content ?? '').split('\n').filter(Boolean).map((p, i) => (
                <p key={i} className="indent-8">{p}</p>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}
