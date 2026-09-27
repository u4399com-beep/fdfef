'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { api, formatDate, formatNumber } from '@/lib/client-api'
import { BookMarked, BookOpen, FileText, Globe, ListChecks, ScrollText, Timer, Type } from 'lucide-react'

interface Stats {
  books: number
  chapters: number
  contents: number
  tasks: number
  sites: number
  rules: number
  words: number
  booksDone: number
  booksSerial: number
  recentTasks: { id: string; name: string; status: string; progress: number; stage: string; updatedAt: string }[]
  recentBooks: { id: string; title: string; author: string; category: string; status: string; updatedAt: string }[]
}

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-emerald-600',
  paused: 'bg-amber-600',
  pending: 'bg-stone-400',
  stopping: 'bg-orange-500',
  stopped: 'bg-stone-500',
  done: 'bg-teal-600',
  failed: 'bg-red-600',
}
const STATUS_LABEL: Record<string, string> = {
  running: '运行中', paused: '已暂停', pending: '待执行', stopping: '停止中',
  stopped: '已停止', done: '已完成', failed: '失败',
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const s = await api<Stats>('/api/stats')
        if (alive) setStats(s)
      } catch { /* ignore */ }
    }
    void load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (!stats) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    )
  }

  const cards = [
    { label: '书籍总数', value: formatNumber(stats.books), icon: BookMarked, sub: `完结 ${stats.booksDone} / 连载 ${stats.booksSerial}` },
    { label: '章节总数', value: formatNumber(stats.chapters), icon: ScrollText, sub: `已采正文 ${formatNumber(stats.contents)}` },
    { label: '累计字数', value: formatNumber(stats.words), icon: Type, sub: '清洗后正文字数' },
    { label: '采集规则', value: formatNumber(stats.rules), icon: ListChecks, sub: '列表/书籍/目录/内容' },
    { label: '采集任务', value: formatNumber(stats.tasks), icon: Timer, sub: '支持并行运行' },
    { label: '站点群', value: formatNumber(stats.sites), icon: Globe, sub: '共用一套后台与库' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{c.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4" /> 最近任务
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.recentTasks.length === 0 && (
              <p className="text-sm text-muted-foreground">暂无任务，前往「采集任务」创建。</p>
            )}
            {stats.recentTasks.map((t) => (
              <div key={t.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{t.name}</span>
                  <Badge className={STATUS_COLOR[t.status] ?? 'bg-stone-400'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                </div>
                <Progress value={t.progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {t.stage || '—'} · {formatDate(t.updatedAt)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" /> 最新入库
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentBooks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                暂无书籍，创建采集任务后自动入库。
              </p>
            )}
            <div className="space-y-2.5">
              {stats.recentBooks.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      《{b.title}》
                      {b.author && <span className="text-muted-foreground"> / {b.author}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(b.updatedAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {b.category && <Badge variant="outline">{b.category}</Badge>}
                    <Badge variant={b.status === '完结' ? 'secondary' : 'outline'}>{b.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-center gap-2 pt-5 text-xs text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          存储说明：数据库模式正文写入 SQLite；txt 模式写入 storage/novels/书名/；封面统一转存为 webp 至 storage/covers/。
        </CardContent>
      </Card>
    </div>
  )
}
