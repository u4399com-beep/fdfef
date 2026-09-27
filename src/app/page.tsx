'use client'

import { useState } from 'react'
import { AdminShell } from '@/components/admin/admin-shell'
import { SitePreview } from '@/components/site/preview-shell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BookText, Gauge } from 'lucide-react'

type Mode = 'admin' | 'front'

export default function Page() {
  const [mode, setMode] = useState<Mode>('admin')
  const [frontSiteId, setFrontSiteId] = useState('')

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookText className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold leading-tight">小说管理系统</h1>
              <p className="truncate text-[10px] leading-tight text-muted-foreground">
                采集 · 清洗 · 站群 · 多主题 · 下载注入 一体化
              </p>
            </div>
          </div>
          <nav aria-label="模式切换" className="flex items-center gap-1 rounded-lg border bg-background p-1">
            <Button
              size="sm"
              variant={mode === 'admin' ? 'default' : 'ghost'}
              className="h-7 gap-1.5 px-2.5"
              onClick={() => setMode('admin')}
              aria-pressed={mode === 'admin'}
            >
              <Gauge className="h-3.5 w-3.5" /> 管理后台
            </Button>
            <Button
              size="sm"
              variant={mode === 'front' ? 'default' : 'ghost'}
              className="h-7 gap-1.5 px-2.5"
              onClick={() => setMode('front')}
              aria-pressed={mode === 'front'}
            >
              <BookText className="h-3.5 w-3.5" /> 前台预览
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">
        {mode === 'admin' ? (
          <AdminShell
            onPreview={(siteId) => {
              setFrontSiteId(siteId)
              setMode('front')
            }}
          />
        ) : (
          <div className={cn('h-[calc(100vh-118px)] overflow-hidden rounded-xl border shadow-sm')}>
            <SitePreview siteId={frontSiteId} onBack={() => setMode('admin')} />
          </div>
        )}
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground">
          <span>小说管理系统 · Next.js + SQLite · 支持多线程采集 / 反反爬 / 站群 / 5 套主题</span>
          <span className="flex items-center gap-3">
            <span>Docker 一键部署</span>
            <span aria-hidden>·</span>
            <span>数据存储：db/custom.db + storage/</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
