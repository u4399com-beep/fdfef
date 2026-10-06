'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BookCard, PseoKeyword, SiteMeta } from '@/lib/theme-types'
import { parseSeoConfig } from '@/lib/seo/engine'
import { BookOpen, Network } from 'lucide-react'

/**
 * 页脚 PSEO 枢纽入口：pseo.enabled 时渲染「专题导航」链接（蜘蛛内链骨架的根入口），
 * 未启用时渲染 null —— 各主题页脚统一插入一行即可，无需关心配置判断。
 */
export function PseoFooterLink({
  site,
  onNavigate,
}: {
  site: SiteMeta
  onNavigate: (v: import('@/lib/theme-types').SiteView) => void
}) {
  if (!parseSeoConfig(site.seoConfig).pseo?.enabled) return null
  return (
    <button
      onClick={() => onNavigate({ type: 'pseo' })}
      className="mt-2 inline-flex items-center gap-1 text-xs underline-offset-2 transition-colors hover:underline"
    >
      <Network className="h-3 w-3" aria-hidden="true" />
      {site.siteName}专题导航
    </button>
  )
}

/**
 * PSEO 内链枢纽页：站点全部派生关键词落地页的索引。
 * 蜘蛛从这里一跳可达全部关键词页（每页再链回主书籍）——站群内链骨架。
 * 由 preview-shell 通用渲染（不进各主题，六主题共享同一枢纽形态）。
 */
export function PseoHub({
  site,
  keywords,
  books,
  onNavigate,
}: {
  site: SiteMeta
  keywords: PseoKeyword[]
  books: BookCard[]
  onNavigate: (v: import('@/lib/theme-types').SiteView) => void
}) {
  const bySource = {
    manual: keywords.filter((k) => k.source === 'manual').length,
    book: keywords.filter((k) => k.source === 'book').length,
    suggest: keywords.filter((k) => k.source === 'suggest').length,
    category: keywords.filter((k) => k.source === 'category').length,
  }
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Network className="h-3.5 w-3.5" />
            {site.siteName} · PSEO 关键词枢纽
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{site.siteName}——全部专题与关键词导航</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            共 {keywords.length} 个专题页：
            {bySource.manual > 0 && ` 站点设定 ${bySource.manual} 个、`}
            {bySource.book > 0 && ` 书籍标签 ${bySource.book} 个、`}
            {bySource.suggest > 0 && ` 搜索下拉词 ${bySource.suggest} 个、`}
            {bySource.category > 0 && ` 分类 ${bySource.category} 个。`}
            点击任意专题进入对应聚合页，每个聚合页均指向主书籍信息页。
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">关键词专题页</CardTitle>
          </CardHeader>
          <CardContent>
            {keywords.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                暂无派生关键词：可在站群管理 → 编辑站点 → PSEO 设置中添加关键词，或采集书籍后由标签/下拉词自动派生。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {keywords.map((k) => (
                  <button
                    key={`${k.source}:${k.keyword}`}
                    onClick={() => onNavigate({ type: 'keyword', keyword: k.keyword })}
                    className="group inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary hover:bg-accent"
                  >
                    <span className="font-medium">{k.keyword}</span>
                    <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                      {k.count}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {books.length > 0 && (
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <BookOpen className="h-4 w-4" /> 热门书籍入口
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {books.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => onNavigate({ type: 'book', bookId: b.id })}
                      className="w-full truncate rounded px-2 py-1 text-left text-sm transition-colors hover:bg-accent hover:text-primary"
                    >
                      《{b.title}》
                      <span className="ml-1.5 text-xs text-muted-foreground">{b.author}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
