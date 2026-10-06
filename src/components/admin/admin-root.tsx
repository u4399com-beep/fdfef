'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminShell } from '@/components/admin/admin-shell'
import { LoginForm } from '@/components/admin/login-form'
import { SitePreview } from '@/components/site/preview-shell'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BookText, ExternalLink, Gauge, Loader2, LogOut, TriangleAlert } from 'lucide-react'

type Mode = 'admin' | 'front'

/**
 * 后台壳（前后端分离的后端侧）：
 * - 未登录（服务端传入 authed=false）→ 登录墙
 * - 已登录 → 管理控制台 / 内嵌前台预览 切换 + 账户信息 + 退出登录
 */
export function AdminRoot({
  authed,
  username,
  firstRun,
}: {
  authed: boolean
  username?: string
  firstRun?: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('admin')
  const [frontSiteId, setFrontSiteId] = useState('')
  const [defaultPw, setDefaultPw] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const read = () => {
      try {
        setDefaultPw(sessionStorage.getItem('nm-default-pw') === '1')
      } catch {
        /* sessionStorage 不可用时跳过提醒 */
      }
    }
    read()
    // 登录成功（router.refresh 不重挂载）与改密后由事件驱动重读
    window.addEventListener('nm-default-pw', read)
    return () => window.removeEventListener('nm-default-pw', read)
  }, [])

  if (!authed) return <LoginForm firstRun={firstRun} />

  const logout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      try {
        sessionStorage.removeItem('nm-default-pw')
      } catch {
        /* 忽略 */
      }
      router.refresh()
    }
  }

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
          <div className="flex items-center gap-2">
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
            <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{username}</span>
            <Button variant="ghost" size="sm" className="hidden h-7 gap-1.5 px-2.5 text-xs sm:inline-flex" asChild>
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> 前台站点
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => void logout()}
              disabled={loggingOut}
            >
              {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              退出
            </Button>
          </div>
        </div>
      </header>

      {defaultPw && (
        <div className="border-b bg-amber-50 text-amber-900">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
            <span className="flex items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              当前仍在使用默认密码，请前往「系统设置 → 账户安全」尽快修改。
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setDefaultPw(false)
                try {
                  sessionStorage.removeItem('nm-default-pw')
                } catch {
                  /* 忽略 */
                }
              }}
            >
              知道了
            </Button>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 flex-col px-4 py-5">
        {mode === 'admin' ? (
          <AdminShell
            onPreview={(siteId) => {
              setFrontSiteId(siteId)
              setMode('front')
            }}
          />
        ) : (
          <div className={cn('min-h-0 flex-1 overflow-hidden rounded-xl border shadow-sm')}>
            <SitePreview siteId={frontSiteId} onBack={() => setMode('admin')} />
          </div>
        )}
      </main>

      <footer className="mt-auto border-t bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground">
          <span>小说管理系统 · Next.js + SQLite · 支持多线程采集 / 反反爬 / 站群 / 6 套主题</span>
          <span className="flex items-center gap-3">
            <span>后台已启用账户权限</span>
            <span aria-hidden>·</span>
            <span>数据存储：db/custom.db + storage/</span>
          </span>
        </div>
      </footer>
    </div>
  )
}
