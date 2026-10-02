'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/client-api'
import { toNumOr } from '@/lib/utils'
import type { SeoConfig } from '@/lib/seo/engine'
import { THEME_LIST } from '@/components/themes'
import { ChevronDown, ExternalLink, Globe, Loader2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'

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
  seoConfig: string
}

interface BookLite {
  id: string
  title: string
}

const emptyForm = {
  siteName: '',
  domain: '',
  themeId: 'classic',
  title: '',
  description: '',
  keywords: '',
  offset: 0,
  mainBookId: '',
  footerText: '',
}

/** SEO 增强表单态（独立结构：pseo.keywords 为每行一个的文本；保存时序列化为 SeoConfig JSON） */
interface SeoFormState {
  obfuscate: { enabled: boolean; strength: 'light' | 'standard' | 'heavy' }
  transcode: { enabled: boolean; mode: 'entity' | 'decimal' | 'zerowidth' | 'mixed' }
  interfere: { enabled: boolean; density: 'low' | 'medium' | 'high'; pseudo: boolean; zeroWidth: boolean }
  pseo: { enabled: boolean; keywords: string; titleTemplate: string; descTemplate: string; kwTemplate: string }
}

const emptySeo: SeoFormState = {
  obfuscate: { enabled: false, strength: 'standard' },
  transcode: { enabled: false, mode: 'mixed' },
  interfere: { enabled: false, density: 'low', pseudo: true, zeroWidth: true },
  pseo: { enabled: false, keywords: '', titleTemplate: '', descTemplate: '', kwTemplate: '' },
}

/** 宽松解析已存 seoConfig → 表单态（损坏配置回退默认，不阻断编辑） */
function parseSeoForm(raw: string | undefined | null): SeoFormState {
  const base = JSON.parse(JSON.stringify(emptySeo)) as SeoFormState
  if (!raw) return base
  try {
    const v = JSON.parse(raw) as SeoConfig
    if (v.obfuscate) {
      base.obfuscate.enabled = !!v.obfuscate.enabled
      if (v.obfuscate.strength) base.obfuscate.strength = v.obfuscate.strength
    }
    if (v.transcode) {
      base.transcode.enabled = !!v.transcode.enabled
      if (v.transcode.mode) base.transcode.mode = v.transcode.mode
    }
    if (v.interfere) {
      base.interfere.enabled = !!v.interfere.enabled
      if (v.interfere.density) base.interfere.density = v.interfere.density
      base.interfere.pseudo = v.interfere.pseudo ?? true
      base.interfere.zeroWidth = v.interfere.zeroWidth ?? true
    }
    if (v.pseo) {
      base.pseo.enabled = !!v.pseo.enabled
      base.pseo.keywords = (v.pseo.keywords ?? []).join('\n')
      base.pseo.titleTemplate = v.pseo.titleTemplate ?? ''
      base.pseo.descTemplate = v.pseo.descTemplate ?? ''
      base.pseo.kwTemplate = v.pseo.kwTemplate ?? ''
    }
  } catch {
    /* 损坏配置回退默认 */
  }
  return base
}

function seoFormToJson(seo: SeoFormState): string {
  return JSON.stringify({
    obfuscate: seo.obfuscate,
    transcode: seo.transcode,
    interfere: seo.interfere,
    pseo: {
      enabled: seo.pseo.enabled,
      keywords: seo.pseo.keywords.split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 200),
      titleTemplate: seo.pseo.titleTemplate.trim(),
      descTemplate: seo.pseo.descTemplate.trim(),
      kwTemplate: seo.pseo.kwTemplate.trim(),
    },
  } satisfies SeoConfig)
}

/** SEO 增强区块内的行容器 */
function SeoRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {children}
      </div>
      {hint && <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** 开关 + 说明的横排 */
function SeoSwitch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}

export function SitesPage({ onPreview }: { onPreview: (siteId: string) => void }) {
  const { toast } = useToast()
  const [sites, setSites] = useState<SiteRow[]>([])
  const [books, setBooks] = useState<BookLite[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [seo, setSeo] = useState(emptySeo)
  const [seoOpen, setSeoOpen] = useState(false)
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

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setSeo(parseSeoForm(''))
    setSeoOpen(false)
    setDialogOpen(true)
  }

  const openEdit = (site: SiteRow) => {
    setEditingId(site.id)
    setForm({
      siteName: site.siteName,
      domain: site.domain,
      themeId: site.themeId,
      title: site.title,
      description: site.description,
      keywords: site.keywords,
      offset: site.offset,
      mainBookId: site.mainBookId,
      footerText: site.footerText,
    })
    setSeo(parseSeoForm(site.seoConfig))
    setSeoOpen(false)
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.siteName.trim()) {
      toast({ title: '站点名称必填', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const body = JSON.stringify({ ...form, seoConfig: seoFormToJson(seo) })
      if (editingId) {
        await api(`/api/sites/${editingId}`, { method: 'PUT', body })
      } else {
        await api('/api/sites', { method: 'POST', body })
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

  /** 站点卡片的 SEO 状态徽章（一眼看出哪些增强已开启） */
  const seoBadges = (raw: string) => {
    const s = parseSeoForm(raw)
    const badges: string[] = []
    if (s.obfuscate.enabled) badges.push('混淆')
    if (s.transcode.enabled) badges.push('转码')
    if (s.interfere.enabled) badges.push('干扰')
    if (s.pseo.enabled) badges.push('PSEO')
    return badges
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          站群共用同一套后台、数据库与本地文件；每个站点独立域名、站名、主题、TDK 与偏移量，前台按配置渲染不同外观与内容序列。
        </p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> 添加站点
        </Button>
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
          const badges = seoBadges(site.seoConfig)
          return (
            <Card key={site.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="truncate">{site.siteName}</span>
                  <Badge variant="outline" className="shrink-0">
                    {theme?.meta.name ?? site.themeId}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="truncate">域名：{site.domain || '（未设置）'}</p>
                  <p className="truncate">T：{site.title || site.siteName}</p>
                  <p className="truncate">D：{site.description || '（未设置）'}</p>
                  <p className="truncate">K：{site.keywords || '（未设置）'}</p>
                  <p>
                    偏移量：{site.offset} · 主书籍：
                    {books.find((b) => b.id === site.mainBookId)?.title ?? (site.mainBookId ? '已绑定（不在列表）' : '未绑定')}
                  </p>
                </div>
                {badges.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    {badges.map((b) => (
                      <Badge key={b} variant="secondary" className="h-4 px-1.5 text-[10px]">
                        {b}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onPreview(site.id)}>
                    <ExternalLink className="h-3.5 w-3.5" /> 预览前台
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(site)} aria-label={`编辑站点「${site.siteName}」`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => void remove(site)}
                    aria-label={`删除站点「${site.siteName}」`}
                  >
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
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THEME_LIST.map((t) => (
                    <SelectItem key={t.meta.id} value={t.meta.id}>
                      {t.meta.name}（{t.meta.preview}）
                    </SelectItem>
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
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="未绑定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未绑定</SelectItem>
                  {form.mainBookId && !books.some((b) => b.id === form.mainBookId) && (
                    <SelectItem value={form.mainBookId}>当前绑定（不在列表内）</SelectItem>
                  )}
                  {books.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      《{b.title}》
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">页脚文案</Label>
              <Input className="h-8 text-xs" value={form.footerText} onChange={(e) => setForm({ ...form, footerText: e.target.value })} placeholder="© 书香阁 · 本站小说均收集于网络" />
            </div>
          </div>

          {/* ---------- SEO 增强（折叠面板） ---------- */}
          <div className="rounded-lg border">
            <button
              type="button"
              onClick={() => setSeoOpen(!seoOpen)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              aria-expanded={seoOpen}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                SEO 增强（混淆代码 / TDK 转码 / 内容干扰 / PSEO）
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${seoOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {seoOpen && (
              <div className="space-y-4 border-t px-3 py-3">
                {/* ① 混淆代码模式 */}
                <SeoRow
                  label="① 混淆代码模式"
                  hint="为本站注入站点唯一的结构噪声（专属类名/属性/注释），蜘蛛抓到的代码逐站不同，页面外观零变化。"
                >
                  <div className="flex items-center gap-2">
                    {seo.obfuscate.enabled && (
                      <Select value={seo.obfuscate.strength} onValueChange={(v) => setSeo({ ...seo, obfuscate: { ...seo.obfuscate, strength: v as 'light' | 'standard' | 'heavy' } })}>
                        <SelectTrigger className="h-7 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">轻度</SelectItem>
                          <SelectItem value="standard">标准</SelectItem>
                          <SelectItem value="heavy">重度</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Switch checked={seo.obfuscate.enabled} onCheckedChange={(v) => setSeo({ ...seo, obfuscate: { ...seo.obfuscate, enabled: v } })} aria-label="混淆代码模式" />
                  </div>
                </SeoRow>

                {/* ② TDK 转码 */}
                <SeoRow
                  label="② TDK / 关键词转码"
                  hint="以 HTML 实体或零宽字符改写 TDK 源码（浏览器渲染不变），干扰搜索引擎的关键词审核匹配；标题仅用不可见零宽。"
                >
                  <div className="flex items-center gap-2">
                    {seo.transcode.enabled && (
                      <Select value={seo.transcode.mode} onValueChange={(v) => setSeo({ ...seo, transcode: { ...seo.transcode, mode: v as 'entity' | 'decimal' | 'zerowidth' | 'mixed' } })}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="entity">实体 &#x4E66;</SelectItem>
                          <SelectItem value="decimal">十进制实体</SelectItem>
                          <SelectItem value="zerowidth">零宽字符</SelectItem>
                          <SelectItem value="mixed">混合（推荐）</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Switch checked={seo.transcode.enabled} onCheckedChange={(v) => setSeo({ ...seo, transcode: { ...seo.transcode, enabled: v } })} aria-label="TDK 转码" />
                  </div>
                </SeoRow>

                {/* ③ 内容干扰 + 伪原创 */}
                <div className="space-y-2">
                  <SeoRow
                    label="③ 句子干扰 + 伪原创"
                    hint="渲染层改写正文（数据库原文不动）：同义词伪原创按「词+位置+章节」种子替换，跨章不重复；干扰句章内轮转去重；同章文本保持稳定（重访一致）。"
                  >
                    <Switch checked={seo.interfere.enabled} onCheckedChange={(v) => setSeo({ ...seo, interfere: { ...seo.interfere, enabled: v } })} aria-label="内容干扰" />
                  </SeoRow>
                  {seo.interfere.enabled && (
                    <div className="grid gap-2 rounded-md bg-muted/40 p-2.5 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">干扰密度</Label>
                        <Select value={seo.interfere.density} onValueChange={(v) => setSeo({ ...seo, interfere: { ...seo.interfere, density: v as 'low' | 'medium' | 'high' } })}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">低</SelectItem>
                            <SelectItem value="medium">中</SelectItem>
                            <SelectItem value="high">高</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end pb-1.5">
                        <SeoSwitch checked={seo.interfere.pseudo} onCheckedChange={(v) => setSeo({ ...seo, interfere: { ...seo.interfere, pseudo: v } })} label="伪原创" />
                      </div>
                      <div className="flex items-end pb-1.5">
                        <SeoSwitch checked={seo.interfere.zeroWidth} onCheckedChange={(v) => setSeo({ ...seo, interfere: { ...seo.interfere, zeroWidth: v } })} label="零宽打散" />
                      </div>
                    </div>
                  )}
                </div>

                {/* ④ PSEO */}
                <div className="space-y-2">
                  <SeoRow
                    label="④ PSEO 关键词落地页"
                    hint="开启后页脚出现「专题导航」枢纽页，聚合站点设定关键词 + 书籍标签 + 搜索下拉词 + 分类的落地页（TDK 按下方模板生成，占位符 {keyword}/{siteName}）。"
                  >
                    <Switch checked={seo.pseo.enabled} onCheckedChange={(v) => setSeo({ ...seo, pseo: { ...seo.pseo, enabled: v } })} aria-label="PSEO" />
                  </SeoRow>
                  {seo.pseo.enabled && (
                    <div className="space-y-2.5 rounded-md bg-muted/40 p-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">站点设定关键词（每行一个，自动并入书籍标签/下拉词/分类派生）</Label>
                        <Textarea
                          className="h-20 font-mono text-xs"
                          value={seo.pseo.keywords}
                          onChange={(e) => setSeo({ ...seo, pseo: { ...seo.pseo, keywords: e.target.value } })}
                          placeholder={'都市重生小说\n免费完本推荐'}
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">标题模板</Label>
                          <Input className="h-7 text-xs" value={seo.pseo.titleTemplate} onChange={(e) => setSeo({ ...seo, pseo: { ...seo.pseo, titleTemplate: e.target.value } })} placeholder="{keyword}_小说专题_{siteName}" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">描述模板</Label>
                          <Input className="h-7 text-xs" value={seo.pseo.descTemplate} onChange={(e) => setSeo({ ...seo, pseo: { ...seo.pseo, descTemplate: e.target.value } })} placeholder="{siteName}精选「{keyword}」相关小说…" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">关键词模板</Label>
                          <Input className="h-7 text-xs" value={seo.pseo.kwTemplate} onChange={(e) => setSeo({ ...seo, pseo: { ...seo.pseo, kwTemplate: e.target.value } })} placeholder="{keyword},{siteName}" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
