'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/client-api'
import type { FieldSelector, FetchStrategy, RuleType } from '@/lib/collect-types'
import {
  Beaker, ChevronDown, FileText, LayoutList, Library, ListOrdered, Loader2, Pencil, Play,
  Plus, Trash2, Wand2,
} from 'lucide-react'

interface RuleRow {
  id: string
  name: string
  type: RuleType
  enabled: boolean
  config: string
  updatedAt: string
}

const TYPE_META: Record<RuleType, { label: string; desc: string; icon: typeof LayoutList }> = {
  list: { label: '列表页', desc: '书单列表页：解析候选书籍链接（支持范围采集与分页）', icon: LayoutList },
  book: { label: '书籍信息页', desc: '主关键词落地页：书名/作者/分类/关键词/简介/封面', icon: Library },
  toc: { label: '章节目录页', desc: '目录页：章节标题与链接、分页、乱序重排、去重', icon: ListOrdered },
  content: { label: '章节内容页', desc: '正文页：正文选择器、分页合并、附加广告清洗', icon: FileText },
}

function emptySelector(): FieldSelector {
  return { mode: 'css', expr: '', attr: 'text' }
}

function defaultConfig(type: RuleType): Record<string, unknown> {
  const base = { strategy: 'http', encoding: 'auto', timeout: 20000 }
  switch (type) {
    case 'list':
      return {
        ...base,
        items: {
          item: emptySelector(),
          title: emptySelector(),
          link: { mode: 'css', expr: 'a', attr: 'href' },
          intro: emptySelector(),
          cover: emptySelector(),
        },
        pagination: { enabled: false, mode: 'nextLink', nextLink: { mode: 'css', expr: '', attr: 'href' }, maxPages: 10 },
      }
    case 'book':
      return {
        ...base,
        smartCategory: true,
        smartCompletion: true,
        fetchSuggest: false,
        downloadCover: true,
        fields: {
          title: emptySelector(),
          author: emptySelector(),
          category: emptySelector(),
          keywords: emptySelector(),
          intro: emptySelector(),
          cover: { mode: 'css', expr: '', attr: 'src' },
          status: emptySelector(),
          latestChapter: emptySelector(),
          tocLink: { mode: 'css', expr: '', attr: 'href' },
        },
      }
    case 'toc':
      return {
        ...base,
        items: {
          item: emptySelector(),
          title: emptySelector(),
          link: { mode: 'css', expr: 'a', attr: 'href' },
        },
        pagination: { enabled: false, mode: 'nextLink', nextLink: { mode: 'css', expr: '', attr: 'href' }, maxPages: 20 },
        reorder: { enabled: true, numberPattern: '' },
        dedup: { byUrl: true, byTitle: false },
      }
    case 'content':
      return {
        ...base,
        content: emptySelector(),
        pagination: {
          enabled: false, mode: 'nextLink',
          nextLink: { mode: 'css', expr: '', attr: 'href' },
          maxConcat: 5,
        },
        extraAdPatterns: [],
      }
  }
}

/** 各类型示例规则（一键填充，便于快速理解写法） */
function presetConfig(type: RuleType): Record<string, unknown> {
  const c = defaultConfig(type) as Record<string, unknown>
  if (type === 'list') {
    const items = c.items as Record<string, FieldSelector>
    items.item = { mode: 'css', expr: '.item, li', attr: 'text' }
    items.title = { mode: 'css', expr: 'h3 a, .title', attr: 'text' }
    items.link = { mode: 'css', expr: 'a', attr: 'href' }
    c.pagination = { enabled: true, mode: 'template', urlTemplate: '', startPage: 1, endPage: 5, maxPages: 20 }
  } else if (type === 'book') {
    const f = c.fields as Record<string, FieldSelector>
    f.title = { mode: 'css', expr: 'h1, .book-title, #title', attr: 'text' }
    f.author = { mode: 'css', expr: '#author, .author', attr: 'text' }
    f.category = { mode: 'css', expr: '.breadcrumb a:nth-child(2), .category', attr: 'text' }
    f.keywords = { mode: 'regex', expr: '<meta\\s+name="keywords"\\s+content="([^"]+)"', group: 1 }
    f.intro = { mode: 'css', expr: '.intro, #intro, .book-desc', attr: 'text' }
    f.cover = { mode: 'css', expr: '.cover img, #cover img', attr: 'src' }
    f.status = { mode: 'css', expr: '.status', attr: 'text' }
    f.latestChapter = { mode: 'css', expr: '.latest a', attr: 'text' }
    f.tocLink = { mode: 'css', expr: 'a:contains("目录"), .btn-toc', attr: 'href' }
  } else if (type === 'toc') {
    const items = c.items as Record<string, FieldSelector>
    items.item = { mode: 'css', expr: '#list dd, .chapter-list li', attr: 'text' }
    items.title = { mode: 'css', expr: 'a', attr: 'text' }
    items.link = { mode: 'css', expr: 'a', attr: 'href' }
    const reorder = c.reorder as { enabled: boolean; numberPattern: string }
    reorder.enabled = true
  } else if (type === 'content') {
    c.content = { mode: 'css', expr: '#content, .read-content, .txt', attr: 'html' }
    c.extraAdPatterns = ['一秒记住.*?', '天才一秒记住.*?']
  }
  return c
}

// ---------------- 选择器行 ----------------
function SelectorRow({
  label, value, onChange, hint,
}: {
  label: string
  value: FieldSelector
  onChange: (v: FieldSelector) => void
  hint?: string
}) {
  const update = (patch: Partial<FieldSelector>) => onChange({ ...value, ...patch })
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={value.mode} onValueChange={(v) => update({ mode: v as FieldSelector['mode'] })}>
          <SelectTrigger className="h-8 w-[86px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="css">CSS</SelectItem>
            <SelectItem value="regex">正则</SelectItem>
            <SelectItem value="xpath">XPath</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="h-8 min-w-[140px] flex-1 font-mono text-xs"
          placeholder={
            value.mode === 'css' ? '如 #content 或 .item a' : value.mode === 'regex' ? '如 <div id="c">([\s\S]*?)</div>' : '如 //div[@id="content"]'
          }
          value={value.expr}
          onChange={(e) => update({ expr: e.target.value })}
        />
        {value.mode !== 'regex' && (
          <Select value={value.attr ?? 'text'} onValueChange={(v) => update({ attr: v })}>
            <SelectTrigger className="h-8 w-[92px] shrink-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">text</SelectItem>
              <SelectItem value="html">html</SelectItem>
              <SelectItem value="outerHtml">outerHtml</SelectItem>
              <SelectItem value="href">href</SelectItem>
              <SelectItem value="src">src</SelectItem>
              <SelectItem value="content">content</SelectItem>
            </SelectContent>
          </Select>
        )}
        {value.mode === 'regex' && (
          <Input
            className="h-8 w-16 shrink-0 text-xs"
            type="number" min={0}
            placeholder="组"
            value={value.group ?? 1}
            onChange={(e) => update({ group: Number(e.target.value) })}
          />
        )}
        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Checkbox checked={!!value.multiple} onCheckedChange={(v) => update({ multiple: v === true })} />
          多值
        </label>
      </div>
    </div>
  )
}

function SubSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-accent/50 rounded-t-lg"
      >
        {title}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="space-y-3 border-t px-3 py-3">{children}</div>}
    </div>
  )
}

function FetchFields({ cfg, onChange }: { cfg: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void }) {
  return (
    <SubSection title="请求与反反爬（策略 / 编码 / Cookie / UA 轮换）">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">抓取策略</Label>
          <Select value={String(cfg.strategy ?? 'http')} onValueChange={(v) => onChange({ strategy: v as FetchStrategy })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP 直连</SelectItem>
              <SelectItem value="playwright">Playwright (JS渲染)</SelectItem>
              <SelectItem value="hyperbrowser">Hyperbrowser (云隐身)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">编码</Label>
          <Select value={String(cfg.encoding ?? 'auto')} onValueChange={(v) => onChange({ encoding: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动识别</SelectItem>
              <SelectItem value="utf-8">UTF-8</SelectItem>
              <SelectItem value="gbk">GBK</SelectItem>
              <SelectItem value="gb2312">GB2312</SelectItem>
              <SelectItem value="big5">Big5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">超时(ms)</Label>
          <Input className="h-8 text-xs" type="number" value={Number(cfg.timeout ?? 20000)}
            onChange={(e) => onChange({ timeout: Number(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referer</Label>
          <Input className="h-8 text-xs" placeholder="可选" value={String(cfg.referer ?? '')}
            onChange={(e) => onChange({ referer: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Cookies（分号分隔 k=v;k2=v2）</Label>
        <Input className="h-8 font-mono text-xs" value={String(cfg.cookies ?? '')}
          onChange={(e) => onChange({ cookies: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">自定义 Headers（JSON）</Label>
        <Textarea className="h-16 font-mono text-xs" placeholder='{"X-Token": "xxx"}' value={String(cfg.headers ?? '')}
          onChange={(e) => onChange({ headers: e.target.value })} />
      </div>
    </SubSection>
  )
}

function PaginationFields({ cfg, onChange }: { cfg: Record<string, unknown>; onChange: (patch: Record<string, unknown>) => void }) {
  const pg = (cfg.pagination ?? {}) as Record<string, unknown>
  const setPg = (patch: Record<string, unknown>) => onChange({ pagination: { ...pg, ...patch } })
  return (
    <SubSection title="分页设置（预留：下一页跟随 / URL 模板区间）" defaultOpen={false}>
      <div className="flex items-center gap-2">
        <Switch checked={!!pg.enabled} onCheckedChange={(v) => setPg({ enabled: v })} />
        <span className="text-sm">启用分页</span>
      </div>
      {!!pg.enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">分页方式</Label>
              <Select value={String(pg.mode ?? 'nextLink')} onValueChange={(v) => setPg({ mode: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nextLink">跟随下一页链接</SelectItem>
                  <SelectItem value="template">URL 模板 {'{page}'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">最大页数</Label>
              <Input className="h-8 text-xs" type="number" min={1} value={Number(pg.maxPages ?? 10)}
                onChange={(e) => setPg({ maxPages: Number(e.target.value) })} />
            </div>
          </div>
          {pg.mode === 'template' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-3 space-y-1">
                <Label className="text-xs">URL 模板（含 {'{page}'} 占位）</Label>
                <Input className="h-8 font-mono text-xs" value={String(pg.urlTemplate ?? '')}
                  onChange={(e) => setPg({ urlTemplate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">起始页</Label>
                <Input className="h-8 text-xs" type="number" value={Number(pg.startPage ?? 1)}
                  onChange={(e) => setPg({ startPage: Number(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">结束页</Label>
                <Input className="h-8 text-xs" type="number" value={Number(pg.endPage ?? 5)}
                  onChange={(e) => setPg({ endPage: Number(e.target.value) })} />
              </div>
            </div>
          )}
        </>
      )}
    </SubSection>
  )
}

// ---------------- 测试面板 ----------------
interface TestResult {
  ok: boolean
  message: string
  elapsedMs?: number
  data?: Record<string, unknown>
}

function TestPanel({ type, config }: { type: RuleType; config: Record<string, unknown> }) {
  const [url, setUrl] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const run = async () => {
    if (!url.trim()) return
    setRunning(true)
    setResult(null)
    try {
      const r = await api<TestResult>('/api/rules/test', {
        method: 'POST',
        body: JSON.stringify({ type, config, url: url.trim() }),
      })
      setResult(r)
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  const sample = (result?.data?.sample ?? result?.data?.fields) as unknown
  const preview = String(result?.data?.preview ?? '')

  return (
    <SubSection title="规则测试（保存前即可验证）">
      <div className="flex gap-2">
        <Input className="h-8 flex-1 font-mono text-xs" placeholder="输入目标页 URL 进行测试"
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button size="sm" className="h-8" disabled={running || !url.trim()} onClick={() => void run()}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          测试
        </Button>
      </div>
      {result && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
          <div className="flex items-center gap-2">
            <Badge variant={result.ok ? 'secondary' : 'destructive'}>{result.ok ? '成功' : '失败'}</Badge>
            <span className="text-xs">{result.message}</span>
            {result.elapsedMs !== undefined && <span className="ml-auto text-[10px] text-muted-foreground">{result.elapsedMs}ms</span>}
          </div>
          {Array.isArray(sample) && sample.length > 0 && (
            <ScrollArea className="max-h-44 rounded border bg-background">
              <div className="space-y-1 p-2 font-mono text-[11px] leading-relaxed">
                {(sample as unknown[]).slice(0, 30).map((item, i) => (
                  <div key={i} className="truncate border-b border-dashed pb-1 last:border-0">
                    {typeof item === 'object' && item !== null
                      ? Object.entries(item as Record<string, unknown>)
                          .filter(([, v]) => v !== '' && v !== undefined)
                          .map(([k, v]) => `${k}: ${String(v).slice(0, 90)}`)
                          .join(' ｜ ')
                      : String(item).slice(0, 120)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {!!sample && !Array.isArray(sample) && (
            <ScrollArea className="max-h-44 rounded border bg-background">
              <div className="space-y-1 p-2 font-mono text-[11px]">
                {Object.entries(sample as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex gap-2 border-b border-dashed pb-1 last:border-0">
                    <span className="shrink-0 font-medium">{k}:</span>
                    <span className="break-all">{String(v).slice(0, 200)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          {preview && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-background p-2 text-[11px] leading-relaxed">{preview}</pre>
          )}
          {!!(result.data && (result.data.smartCategory || result.data.smartCompletion)) && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {result.data.smartCategory !== undefined && (
                <Badge variant="outline">
                  智能分类：{String((result.data.smartCategory as Record<string, unknown>).category)}
                  （置信度 {Number((result.data.smartCategory as Record<string, unknown>).score).toFixed(2)}）
                </Badge>
              )}
              {result.data.smartCompletion !== undefined && (
                <Badge variant="outline">
                  完结判断：{String((result.data.smartCompletion as Record<string, unknown>).status)}
                  （置信度 {Number((result.data.smartCompletion as Record<string, unknown>).confidence).toFixed(2)}）
                </Badge>
              )}
            </div>
          )}
        </div>
      )}
    </SubSection>
  )
}

// ---------------- 规则编辑器 ----------------
function RuleEditor({
  type, ruleId, name, config, onNameChange, onConfigChange,
}: {
  type: RuleType
  ruleId: string | null
  name: string
  config: Record<string, unknown>
  onNameChange: (v: string) => void
  onConfigChange: (c: Record<string, unknown>) => void
}) {
  const patch = (p: Record<string, unknown>) => onConfigChange({ ...config, ...p })
  const setSel = (path: (string | number)[], sel: FieldSelector) => {
    const clone = structuredClone(config) as Record<string, unknown>
    let node: Record<string, unknown> = clone
    for (let i = 0; i < path.length - 1; i++) {
      node = node[path[i]] as Record<string, unknown>
    }
    node[path[path.length - 1]] = sel
    onConfigChange(clone)
  }

  const items = (config.items ?? {}) as Record<string, FieldSelector>
  const fields = (config.fields ?? {}) as Record<string, FieldSelector>

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">规则名称</Label>
        <Input className="h-8" value={name} onChange={(e) => onNameChange(e.target.value)}
          placeholder={`${TYPE_META[type].label}规则`} />
      </div>

      <FetchFields cfg={config} onChange={patch} />

      {type === 'list' && (
        <SubSection title="列表项解析">
          <SelectorRow label="列表项（每本书的容器）" value={items.item ?? emptySelector()} onChange={(s) => setSel(['items', 'item'], s)} />
          <SelectorRow label="书名" value={items.title ?? emptySelector()} onChange={(s) => setSel(['items', 'title'], s)} />
          <SelectorRow label="链接" value={items.link ?? emptySelector()} onChange={(s) => setSel(['items', 'link'], s)} hint="相对列表项" />
          <SelectorRow label="简介（可选）" value={items.intro ?? emptySelector()} onChange={(s) => setSel(['items', 'intro'], s)} />
          <SelectorRow label="封面（可选）" value={items.cover ?? emptySelector()} onChange={(s) => setSel(['items', 'cover'], s)} />
        </SubSection>
      )}

      {type === 'book' && (
        <SubSection title="书籍字段解析">
          <SelectorRow label="书名（必填）" value={fields.title ?? emptySelector()} onChange={(s) => setSel(['fields', 'title'], s)} />
          <SelectorRow label="作者" value={fields.author ?? emptySelector()} onChange={(s) => setSel(['fields', 'author'], s)} />
          <SelectorRow label="分类" value={fields.category ?? emptySelector()} onChange={(s) => setSel(['fields', 'category'], s)} hint="留空则智能匹配" />
          <SelectorRow label="关键词" value={fields.keywords ?? emptySelector()} onChange={(s) => setSel(['fields', 'keywords'], s)} />
          <SelectorRow label="简介" value={fields.intro ?? emptySelector()} onChange={(s) => setSel(['fields', 'intro'], s)} />
          <SelectorRow label="封面图" value={fields.cover ?? emptySelector()} onChange={(s) => setSel(['fields', 'cover'], s)} />
          <SelectorRow label="状态（连载/完结）" value={fields.status ?? emptySelector()} onChange={(s) => setSel(['fields', 'status'], s)} />
          <SelectorRow label="最新章节" value={fields.latestChapter ?? emptySelector()} onChange={(s) => setSel(['fields', 'latestChapter'], s)} />
          <SelectorRow label="目录页链接（可选）" value={fields.tocLink ?? emptySelector()} onChange={(s) => setSel(['fields', 'tocLink'], s)} hint="默认用当前页" />
        </SubSection>
      )}

      {(type === 'list' || type === 'toc') && <PaginationFields cfg={config} onChange={patch} />}

      {type === 'toc' && (
        <>
          <SubSection title="章节列表解析">
            <SelectorRow label="章节项容器" value={items.item ?? emptySelector()} onChange={(s) => setSel(['items', 'item'], s)} />
            <SelectorRow label="章节标题" value={items.title ?? emptySelector()} onChange={(s) => setSel(['items', 'title'], s)} />
            <SelectorRow label="章节链接" value={items.link ?? emptySelector()} onChange={(s) => setSel(['items', 'link'], s)} />
          </SubSection>
          <SubSection title="乱序重排 / 去重">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div>
                  <p className="text-sm font-medium">乱序重排</p>
                  <p className="text-[11px] text-muted-foreground">按章节序号重排目录</p>
                </div>
                <Switch
                  checked={!!(config.reorder as Record<string, unknown> | undefined)?.enabled}
                  onCheckedChange={(v) => patch({ reorder: { ...(config.reorder as Record<string, unknown>), enabled: v } })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div>
                  <p className="text-sm font-medium">按章节名去重</p>
                  <p className="text-[11px] text-muted-foreground">URL 去重始终开启</p>
                </div>
                <Switch
                  checked={!!(config.dedup as Record<string, unknown> | undefined)?.byTitle}
                  onCheckedChange={(v) => patch({ dedup: { ...(config.dedup as Record<string, unknown>), byTitle: v } })}
                />
              </div>
            </div>
            <Input className="h-8 font-mono text-xs" placeholder="章节序号正则（可选，默认支持中文数字）"
              value={String((config.reorder as Record<string, unknown> | undefined)?.numberPattern ?? '')}
              onChange={(e) => patch({ reorder: { ...(config.reorder as Record<string, unknown>), numberPattern: e.target.value } })} />
          </SubSection>
        </>
      )}

      {type === 'content' && (
        <>
          <SubSection title="正文解析">
            <SelectorRow label="正文选择器" value={(config.content as FieldSelector) ?? emptySelector()}
              onChange={(s) => patch({ content: s })} hint="建议取 html" />
          </SubSection>
          <PaginationFields cfg={config} onChange={patch} />
          <SubSection title="附加广告清洗（正则，每行一条）" defaultOpen={false}>
            <Textarea className="h-20 font-mono text-xs"
              value={Array.isArray(config.extraAdPatterns) ? (config.extraAdPatterns as string[]).join('\n') : ''}
              onChange={(e) => patch({ extraAdPatterns: e.target.value.split('\n').filter(Boolean) })} />
          </SubSection>
        </>
      )}

      {type === 'book' && (
        <SubSection title="智能增强">
          <div className="grid gap-2 md:grid-cols-2">
            {([
              ['smartCategory', '智能匹配分类', '按字典特征自动归类'],
              ['smartCompletion', '智能判断完结', '状态字段+最新章节特征'],
              ['fetchSuggest', '抓取搜索引擎下拉词', '百度/必应/360 等（较慢）'],
              ['downloadCover', '下载封面为 webp', '本地化封面存储'],
            ] as const).map(([key, label, desc]) => (
              <div key={key} className="flex items-center justify-between rounded-md border p-2.5">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[11px] text-muted-foreground">{desc}</p>
                </div>
                <Switch checked={!!config[key]} onCheckedChange={(v) => patch({ [key]: v })} />
              </div>
            ))}
          </div>
        </SubSection>
      )}

      <TestPanel type={type} config={config} />
    </div>
  )
}

// ---------------- 主页面 ----------------
export function RulesPage() {
  const { toast } = useToast()
  const [rules, setRules] = useState<RuleRow[]>([])
  const [tab, setTab] = useState<RuleType>('list')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api<{ rules: RuleRow[] }>('/api/rules')
      setRules(r.rules)
    } catch (e) {
      toast({ title: '加载失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const rulesOfType = useMemo(() => rules.filter((r) => r.type === tab), [rules, tab])

  const openCreate = () => {
    setEditingId(null)
    setName('')
    setConfig(presetConfig(tab))
    setDialogOpen(true)
  }

  const openEdit = (rule: RuleRow) => {
    setEditingId(rule.id)
    setName(rule.name)
    try {
      setConfig({ ...defaultConfig(rule.type), ...(JSON.parse(rule.config) as Record<string, unknown>) })
    } catch {
      setConfig(defaultConfig(rule.type))
    }
    setDialogOpen(true)
  }

  const save = async () => {
    if (!name.trim()) {
      toast({ title: '请填写规则名称', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await api(`/api/rules/${editingId}`, { method: 'PUT', body: JSON.stringify({ name, config }) })
      } else {
        await api('/api/rules', { method: 'POST', body: JSON.stringify({ name, type: tab, config }) })
      }
      toast({ title: editingId ? '规则已更新' : '规则已创建' })
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast({ title: '保存失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rule: RuleRow) => {
    if (!confirm(`确定删除规则「${rule.name}」？`)) return
    try {
      await api(`/api/rules/${rule.id}`, { method: 'DELETE' })
      toast({ title: '已删除' })
      await load()
    } catch (e) {
      toast({ title: '删除失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as RuleType)}>
          <TabsList>
            {(Object.keys(TYPE_META) as RuleType[]).map((t) => {
              const Icon = TYPE_META[t].icon
              return (
                <TabsTrigger key={t} value={t} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {TYPE_META[t].label}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4" /> 新建{TYPE_META[tab].label}规则
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{TYPE_META[tab].desc} —— 支持 CSS / 正则 / XPath 三种模式混用，每个规则均内置测试。</p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rulesOfType.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Wand2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">暂无{TYPE_META[tab].label}规则，点击右上角「新建」（已预填示例结构，可直接改表达式）</p>
            </CardContent>
          </Card>
        )}
        {rulesOfType.map((rule) => (
          <Card key={rule.id}>
            <CardContent className="space-y-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{rule.name}</p>
                  <p className="text-[11px] text-muted-foreground">更新于 {new Date(rule.updatedAt).toLocaleString('zh-CN', { hour12: false })}</p>
                </div>
                <Badge variant={rule.enabled ? 'secondary' : 'outline'}>{rule.enabled ? '启用' : '停用'}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(rule)}>
                  <Pencil className="h-3.5 w-3.5" /> 编辑
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => void remove(rule)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑' : '新建'}{TYPE_META[tab].label}规则</DialogTitle>
            <DialogDescription>三种选择器模式可混用；CSS 取属性需选择 attr；正则建议使用捕获组。</DialogDescription>
          </DialogHeader>
          <Separator />
          <RuleEditor
            type={tab}
            ruleId={editingId}
            name={name}
            config={config}
            onNameChange={setName}
            onConfigChange={setConfig}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfig(presetConfig(tab))}>
              <Beaker className="h-4 w-4" /> 重置为示例
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} 保存规则
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
