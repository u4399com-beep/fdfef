'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BookText, Loader2, ShieldCheck } from 'lucide-react'

/**
 * 后台登录墙（前后端分离：/admin 未登录时唯一可见内容）
 * 成功后 router.refresh() 让服务端组件按新会话 Cookie 重渲染为管理控制台。
 */
export function LoginForm({ firstRun }: { firstRun?: boolean }) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; defaultPassword?: boolean }
      if (!res.ok) {
        setError(data.error || `登录失败（${res.status}）`)
        return
      }
      try {
        sessionStorage.removeItem('nm-default-pw')
        if (data.defaultPassword) sessionStorage.setItem('nm-default-pw', '1')
        // router.refresh() 只重渲染不重挂载，AdminRoot 的 useEffect 不会重跑 → 显式通知读取
        window.dispatchEvent(new CustomEvent('nm-default-pw'))
      } catch {
        /* sessionStorage 不可用时仅损失提醒 */
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookText className="h-5 w-5" />
          </div>
          <CardTitle className="text-lg">小说管理系统 · 后台登录</CardTitle>
          <CardDescription>管理后台已启用账户密码权限，请登录后继续</CardDescription>
        </CardHeader>
        <CardContent>
          {firstRun && (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              首次部署已创建默认账户：<b>admin</b> / <b>admin123</b>，登录后请前往「系统设置 → 账户安全」修改密码。
            </p>
          )}
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="login-username">用户名</Label>
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">密码</Label>
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading || !username.trim() || !password}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} 登录
            </Button>
          </form>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            前台站点无需登录，直接访问 <a href="/" className="underline underline-offset-2 hover:text-foreground">/</a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
