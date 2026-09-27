'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { THEME_LIST } from '@/components/themes'
import { ExternalLink, Palette } from 'lucide-react'

/** 五套主题模板一览（样式/颜色/布局完全不同，均适配 TDK/SEO/GEO） */
export function TemplatesPage({ onPreview }: { onPreview: (siteId: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        5 套主题在配色、字体、布局上完全不同；前台按视图（书单/书籍/章节/关键词页）动态输出 TDK 与 JSON-LD 结构化数据（Book / BreadcrumbList），满足 SEO 与 GEO 要求。
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {THEME_LIST.map((t, idx) => (
          <Card key={t.meta.id} className="overflow-hidden">
            <div className={`flex h-24 items-center justify-center ${['bg-amber-100', 'bg-zinc-900', 'bg-gradient-to-r from-emerald-100 via-amber-100 to-rose-100', 'bg-stone-200', 'bg-zinc-800'][idx]}`}>
              <span className={`text-lg font-bold ${idx === 1 || idx === 4 ? 'text-zinc-100' : 'text-stone-800'}`}>
                {t.meta.name}
              </span>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" /> {t.meta.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">{t.meta.description}</p>
              <div className="flex items-center justify-between">
                <code className="rounded bg-muted px-2 py-0.5 text-[10px]">{t.meta.id}</code>
                <Button size="sm" variant="outline" onClick={() => onPreview('')}>
                  <ExternalLink className="h-3.5 w-3.5" /> 预览
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
