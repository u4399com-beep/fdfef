'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { THEME_LIST } from '@/components/themes'
import { ExternalLink, Palette } from 'lucide-react'

/** 六套主题模板一览（样式/颜色/布局完全不同，均适配 TDK/SEO/GEO） */

/** 各主题预览色卡（按 themeId 键控，新增主题只需在此补一行，避免按索引越界漏底色） */
const THEME_SWATCH: Record<string, { bg: string; fg: string }> = {
  classic: { bg: 'bg-amber-100', fg: 'text-stone-800' },
  noir: { bg: 'bg-zinc-900', fg: 'text-zinc-100' },
  magazine: { bg: 'bg-gradient-to-r from-emerald-100 via-amber-100 to-rose-100', fg: 'text-stone-800' },
  ink: { bg: 'bg-stone-200', fg: 'text-stone-800' },
  neon: { bg: 'bg-zinc-800', fg: 'text-zinc-100' },
  uaa: { bg: 'bg-[#dcebf7]', fg: 'text-[#1a72c4]' },
}

export function TemplatesPage({ onPreview }: { onPreview: (siteId: string) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {THEME_LIST.length} 套主题在配色、字体、布局上完全不同；前台按视图（书单/书籍/目录/章节/关键词页）动态输出 TDK 与 JSON-LD 结构化数据（Book / BreadcrumbList），满足 SEO 与 GEO 要求。
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {THEME_LIST.map((t) => {
          const swatch = THEME_SWATCH[t.meta.id] ?? { bg: 'bg-muted', fg: 'text-foreground' }
          return (
            <Card key={t.meta.id} className="overflow-hidden">
              <div className={`flex h-24 items-center justify-center ${swatch.bg}`}>
                <span className={`text-lg font-bold ${swatch.fg}`}>
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
          )
        })}
      </div>
    </div>
  )
}
