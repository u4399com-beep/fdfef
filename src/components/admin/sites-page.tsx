'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/client-api'
import { toNumOr } from '@/lib/utils'
import { THEME_LIST } from '@/components/themes'
import { ExternalLink, Globe, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'

interface SiteRow {
  id: string
  domain: string
  siteName: string
  themeId: string
  title: string
  description: string
  keywords: string
  offset: number
  mainBookId: string
  footerText: string
}

interface BookLite { id: string; title: string }

const emptyForm = {
  siteName: '', domain: '', themeId: 'classic',
  title: '', description: '', keywords: '',
  offset: 0, mainBookId: '', footerText: '',
}

export function SitesPage({ onPreview }: { onPreview: (siteId: string) => void }) {
  const { toast } = useToast()
  const [sites, setSites] = useState<SiteRow[]>([])
  const [books, setBooks] = useState<BookLite[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([
        api<{ sites: SiteRow[] }>('/api/sites'),
        api<{ books: BookLite[] }>('/api/books?pageSize=60'),
      ])
      setSites(s.sites)
      setBooks(b.books)
    } catch (e) {
      toast({ title: '加载失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setLoaded(true)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEdit = (site: SiteRow) => {
    setEditingId(site.id)
    setForm({ ...site })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.siteName.trim()) {
      toast({ title: '站点名称必填', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api(`/api/sites/${editingId}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/api/sites', { method: 'POST', body: JSON.stringify(form) })
      }
      toast({ title: editingId ? '站点已更新' : '站点已创建' })
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast({ title: '保存失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (site: SiteRow) => {
    if (!confirm(`确定删除站点「${site.siteName}」？`)) return
    try {
      await api(`/api/sites/${site.id}`, { method: 'DELETE' })
      toast({ title: '已删除' })
      await load()
    } catch (e) {
      toast({ title: '删除失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          站群共用同一套后台、数据库与本地文件；每个站点独立域名、站名、主题、TDK 与偏移量，前台按配置渲染不同外观与内容序列。
        </p>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> 添加站点</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sites.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center gap-2 py-10">
              <Globe className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{loaded ? '暂无站点，点击「添加站点」生成第一个分站。' : '加载中…'}</p>
            </CardContent>
          </Card>
        )}
        {sites.map((site) => {
          const theme = THEME_LIST.find((t) => t.meta.id === site.themeId)
          return (
            <Card key={site.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="truncate">{site.siteName}</span>
                  <Badge variant="outline" className="shrink-0">{theme?.meta.name ?? site.themeId}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="truncate">域名：{site.domain || '（未设置）'}</p>
                  <p className="truncate">T：{site.title || site.siteName}</p>
                  <p className="truncate">D：{site.description || '（未设置）'}</p>
                  <p className="truncate">K：{site.keywords || '（未设置）'}</p>
                  <p>偏移量：{site.offset} · 主书籍：{books.find((b) => b.id === site.mainBookId)?.title ?? (site.mainBookId ? '已绑定（不在列表）' : '未绑定')}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onPreview(site.id)}>
                    <ExternalLink className="h-3.5 w-3.5" /> 预览前台
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(site)} aria-label={`编辑站点「${site.siteName}」`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => void remove(site)} aria-label={`删除站点「${site.siteName}」`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑站点' : '添加站点'}</DialogTitle>
            <DialogDescription>域名用于生成分站链接与下载注入中的站点信息；偏移量让不同站点展示不同内容序列。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">站名</Label>
              <Input className="h-8" value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} placeholder="如：书香阁" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">域名</Label>
              <Input className="h-8" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="novel1.example.com" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">主题模板</Label>
              <Select value={form.themeId} onValueChange={(v) => setForm({ ...form, themeId: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {THEME_LIST.map((t) => (
                    <SelectItem key={t.meta.id} value={t.meta.id}>{t.meta.name}（{t.meta.preview}）</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">T —— 页面标题</Label>
              <Input className="h-8" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="书香阁 - 全本小说免费阅读" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">D —— 页面描述</Label>
              <Textarea className="h-16 text-xs" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">K —— 页面关键词（逗号分隔）</Label>
              <Input className="h-8 text-xs" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="小说,免费小说,全本" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">列表偏移量</Label>
              <Input className="h-8" type="number" min={0} value={form.offset} onChange={(e) => setForm({ ...form, offset: Math.max(0, toNumOr(e.target.value, 0)) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">绑定主书籍（主关键词）</Label>
              <Select value={form.mainBookId || 'none'} onValueChange={(v) => setForm({ ...form, mainBookId: v === 'none' ? '' : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="未绑定" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未绑定</SelectItem>
                  {form.mainBookId && !books.some((b) => b.id === form.mainBookId) && (
                    <SelectItem value={form.mainBookId}>当前绑定（不在列表内）</SelectItem>
                  )}
                  {books.map((b) => (
                    <SelectItem key={b.id} value={b.id}>《{b.title}》</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">页脚文案</Label>
              <Input className="h-8 text-xs" value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} placeholder="© 书香阁 · 本站小说均收集于网络" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
