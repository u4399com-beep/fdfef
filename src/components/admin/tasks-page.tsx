'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api, formatDate } from '@/lib/client-api'
import type { RuleType } from '@/lib/collect-types'
import {
  CirclePause, CirclePlay, CircleStop, FileDown, ListChecks, Loader2, Pencil,
  Plus, RefreshCw, ScrollText, SquarePen, Trash2,
} from 'lucide-react'

interface TaskRow {
  id: string
  name: string
  targetType: string
  listRuleId: string | null
  bookRuleId: string | null
  tocRuleId: string | null
  contentRuleId: string | null
  targetUrls: string
  urlTemplate: string
  pageStart: number
  pageEnd: number
  mode: string
  storageMode: string
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
  status: string
  stage: string
  progress: number
  total: number
  stats: string
  updatedAt: string
}

interface LogRow {
  id: string
  level: string
  message: string
  createdAt: string
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  running: { label: '运行中', cls: 'bg-emerald-600' },
  paused: { label: '已暂停', cls: 'bg-amber-600' },
  pending: { label: '待执行', cls: 'bg-stone-400' },
  stopping: { label: '停止中', cls: 'bg-orange-500' },
  stopped: { label: '已停止', cls: 'bg-stone-500' },
  done: { label: '已完成', cls: 'bg-teal-600' },
  failed: { label: '失败', cls: 'bg-red-600' },
}

const LOG_COLOR: Record<string, string> = {
  info: 'text-zinc-200',
  success: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
}

function parseUrls(raw: string): string[] {
  try {
    const arr = JSON.parse(raw) as unknown
    return Array.isArray(arr) ? arr.map(String) : []
  } catch {
    return []
  }
}

function parseStats(raw: string): Record<string, number> {
  try {
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

export function TasksPage() {
  const { toast } = useToast()
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [rules, setRules] = useState<{ id: string; name: string; type: string }[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [logsFor, setLogsFor] = useState<TaskRow | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const logsRef = useRef<HTMLDivElement>(null)
  const lastLogAt = useRef<string>('')

  // 编辑器表单
  const [form, setForm] = useState({
    name: '',
    targetType: 'single',
    listRuleId: '', bookRuleId: '', tocRuleId: '', contentRuleId: '',
    urlsText: '',
    urlTemplate: '', pageStart: 1, pageEnd: 3,
    mode: 'incremental', storageMode: 'db',
    threadMin: 1, threadMax: 3, intervalMin: 500, intervalMax: 2000,
  })

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        api<{ tasks: TaskRow[] }>('/api/tasks'),
        api<{ rules: { id: string; name: string; type: string }[] }>('/api/rules'),
      ])
      setTasks(t.tasks)
      setRules(r.rules)
    } catch { /* polling errors ignored */ }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const t = setInterval(() => void load(), 2500)
    return () => clearInterval(t)
  }, [load])

  const rulesByType = useMemo(() => {
    const map: Record<string, { id: string; name: string }[]> = { list: [], book: [], toc: [], content: [] }
    for (const r of rules) (map[r.type as RuleType] ?? map.book).push({ id: r.id, name: r.name })
    return map
  }, [rules])

  const openCreate = () => {
    setEditingId(null)
    setForm({
      name: '', targetType: 'single',
      listRuleId: rulesByType.list[0]?.id ?? '', bookRuleId: rulesByType.book[0]?.id ?? '',
      tocRuleId: rulesByType.toc[0]?.id ?? '', contentRuleId: rulesByType.content[0]?.id ?? '',
      urlsText: '', urlTemplate: '', pageStart: 1, pageEnd: 3,
      mode: 'incremental', storageMode: 'db',
      threadMin: 1, threadMax: 3, intervalMin: 500, intervalMax: 2000,
    })
    setDialogOpen(true)
  }

  const openEdit = (task: TaskRow) => {
    setEditingId(task.id)
    setForm({
      name: task.name,
      targetType: task.targetType,
      listRuleId: task.listRuleId ?? '', bookRuleId: task.bookRuleId ?? '',
      tocRuleId: task.tocRuleId ?? '', contentRuleId: task.contentRuleId ?? '',
      urlsText: parseUrls(task.targetUrls).join('\n'),
      urlTemplate: task.urlTemplate, pageStart: task.pageStart, pageEnd: task.pageEnd,
      mode: task.mode, storageMode: task.storageMode,
      threadMin: task.threadMin, threadMax: task.threadMax,
      intervalMin: task.intervalMin, intervalMax: task.intervalMax,
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast({ title: '请填写任务名称', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        targetType: form.targetType,
        listRuleId: form.listRuleId || null,
        bookRuleId: form.bookRuleId || null,
        tocRuleId: form.tocRuleId || null,
        contentRuleId: form.contentRuleId || null,
        targetUrls: form.urlsText.split('\n').map((s) => s.trim()).filter(Boolean),
        urlTemplate: form.urlTemplate,
        pageStart: form.pageStart, pageEnd: form.pageEnd,
        mode: form.mode, storageMode: form.storageMode,
        threadMin: form.threadMin, threadMax: form.threadMax,
        intervalMin: form.intervalMin, intervalMax: form.intervalMax,
      }
      if (editingId) {
        await api(`/api/tasks/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify(payload) })
      }
      toast({ title: editingId ? '任务已更新' : '任务已创建' })
      setDialogOpen(false)
      await load()
    } catch (e) {
      toast({ title: '保存失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const control = async (task: TaskRow, action: 'start' | 'pause' | 'resume' | 'stop') => {
    setBusyId(task.id)
    try {
      await api(`/api/tasks/${task.id}/control`, { method: 'POST', body: JSON.stringify({ action }) })
      toast({ title: `已${{ start: '执行', pause: '暂停', resume: '继续', stop: '停止' }[action]}「${task.name}」` })
      await load()
    } catch (e) {
      toast({ title: '操作失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (task: TaskRow) => {
    if (!confirm(`确定删除任务「${task.name}」？`)) return
    try {
      await api(`/api/tasks/${task.id}`, { method: 'DELETE' })
      toast({ title: '已删除' })
      await load()
    } catch (e) {
      toast({ title: '删除失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }

  // 日志轮询
  useEffect(() => {
    if (!logsFor) return
    let alive = true
    lastLogAt.current = ''
    const pull = async () => {
      try {
        const qs = lastLogAt.current ? `?after=${encodeURIComponent(lastLogAt.current)}` : ''
        const r = await api<{ logs: LogRow[] }>(`/api/tasks/${logsFor.id}/logs${qs}`)
        if (!alive) return
        if (r.logs.length > 0) {
          lastLogAt.current = r.logs[r.logs.length - 1].createdAt
          setLogs((prev) => [...prev, ...r.logs].slice(-500))
        }
      } catch { /* ignore */ }
    }
    void pull()
    const t = setInterval(pull, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [logsFor])

  useEffect(() => {
    logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight })
  }, [logs])

  const runningCount = tasks.filter((t) => t.status === 'running' || t.status === 'paused').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ListChecks className="h-4 w-4" />
          共 {tasks.length} 个任务{runningCount > 0 && `，${runningCount} 个进行中`}（每 2.5s 自动刷新）
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> 刷新
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> 新建任务
          </Button>
        </div>
      </div>

      {tasks.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            暂无采集任务。先在「采集规则」中创建规则，再在此新建任务（单本 / 范围均支持）。
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {tasks.map((task) => {
          const st = STATUS_META[task.status] ?? STATUS_META.pending
          const stats = parseStats(task.stats)
          const active = task.status === 'running' || task.status === 'paused'
          return (
            <Card key={task.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {task.name}
                    <Badge className={st.cls}>{st.label}</Badge>
                    <Badge variant="outline">{task.mode === 'full' ? '完全重采集' : '增量更新'}</Badge>
                    <Badge variant="outline">
                      {{ db: '写数据库', txt: '存 txt 文件', both: '库+文件' }[task.storageMode] ?? task.storageMode}
                    </Badge>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {task.status !== 'running' && !active && (
                      <Button size="sm" disabled={busyId === task.id} onClick={() => void control(task, 'start')}>
                        {busyId === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CirclePlay className="h-4 w-4" />}
                        立即执行
                      </Button>
                    )}
                    {task.status === 'running' && (
                      <Button size="sm" variant="outline" disabled={busyId === task.id} onClick={() => void control(task, 'pause')}>
                        <CirclePause className="h-4 w-4" /> 暂停
                      </Button>
                    )}
                    {task.status === 'paused' && (
                      <Button size="sm" variant="outline" disabled={busyId === task.id} onClick={() => void control(task, 'resume')}>
                        <CirclePlay className="h-4 w-4" /> 继续
                      </Button>
                    )}
                    {active && (
                      <Button size="sm" variant="outline" disabled={busyId === task.id} onClick={() => void control(task, 'stop')}>
                        <CircleStop className="h-4 w-4" /> 停止
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={active} onClick={() => openEdit(task)}>
                      <SquarePen className="h-4 w-4" /> 编辑
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setLogs([]); setLogsFor(task) }}>
                      <ScrollText className="h-4 w-4" /> 日志
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={active} onClick={() => void remove(task)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-3">
                  <Progress value={task.progress} className="h-2 flex-1" />
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{task.progress}%</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{task.stage || (task.targetType === 'range' ? `范围：第 ${task.pageStart}~${task.pageEnd} 页` : '单本采集')}</span>
                  <span>线程 {task.threadMin}~{task.threadMax}（随机）</span>
                  <span>间隔 {task.intervalMin}~{task.intervalMax}ms（随机）</span>
                  {stats.books !== undefined && <span>书籍 {stats.books}（新增 {stats.booksNew ?? 0}）</span>}
                  {stats.contents !== undefined && <span>正文 {stats.contents} 篇</span>}
                  {stats.errors !== undefined && stats.errors > 0 && <span className="text-red-500">错误 {stats.errors}</span>}
                  <span className="ml-auto">{formatDate(task.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '编辑任务' : '新建采集任务'}</DialogTitle>
            <DialogDescription>线程数与间隔时间在任务运行中按范围随机取值，避免固定节奏。</DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">任务名称</Label>
              <Input className="h-8" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：笔趣阁玄幻区范围采集" />
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {([['bookRuleId', '书籍信息页规则（必选）'], ['tocRuleId', '章节目录页规则（必选）'], ['contentRuleId', '章节内容页规则（必选）'], ['listRuleId', '列表页规则（范围采集必选）']] as const).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{label}</Label>
                  <Select value={form[key]} onValueChange={(v) => setForm({ ...form, [key]: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="选择规则" /></SelectTrigger>
                    <SelectContent>
                      {(key === 'listRuleId' ? rulesByType.list : rulesByType[key.replace('RuleId', '')]).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">采集方式</Label>
              <RadioGroup value={form.targetType} onValueChange={(v) => setForm({ ...form, targetType: v })} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="single" /> 单本（书籍 URL）
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="range" /> 范围（列表分页区间）
                </label>
              </RadioGroup>
            </div>

            {form.targetType === 'single' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">书籍信息页 URL（每行一个）</Label>
                <Textarea className="h-20 font-mono text-xs" value={form.urlsText}
                  onChange={(e) => setForm({ ...form, urlsText: e.target.value })}
                  placeholder={'https://example.com/book/1.html\nhttps://example.com/book/2.html'} />
              </div>
            ) : (
              <div className="grid gap-2 md:grid-cols-3">
                <div className="md:col-span-3 space-y-1.5">
                  <Label className="text-xs">列表页 URL 模板（{'{page}'} 占位）</Label>
                  <Input className="h-8 font-mono text-xs" value={form.urlTemplate}
                    onChange={(e) => setForm({ ...form, urlTemplate: e.target.value })}
                    placeholder="https://example.com/sort/1/{page}.html" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">起始页</Label>
                  <Input className="h-8" type="number" min={1} value={form.pageStart}
                    onChange={(e) => setForm({ ...form, pageStart: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">结束页</Label>
                  <Input className="h-8" type="number" min={1} value={form.pageEnd}
                    onChange={(e) => setForm({ ...form, pageEnd: Number(e.target.value) })} />
                </div>
              </div>
            )}

            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">采集模式</Label>
                <RadioGroup value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })} className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="incremental" /> 增量更新
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="full" /> 完全覆盖重采集
                  </label>
                </RadioGroup>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">章节内容存储</Label>
                <RadioGroup value={form.storageMode} onValueChange={(v) => setForm({ ...form, storageMode: v })} className="flex flex-wrap gap-x-3">
                  {([['db', '写数据库'], ['txt', 'txt 文件'], ['both', '库+文件']] as const).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5 text-sm">
                      <RadioGroupItem value={v} /> {l}
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">线程数范围（随机）</Label>
                <div className="flex items-center gap-2">
                  <Input className="h-8" type="number" min={1} max={32} value={form.threadMin}
                    onChange={(e) => setForm({ ...form, threadMin: Number(e.target.value) })} />
                  <span className="text-muted-foreground">~</span>
                  <Input className="h-8" type="number" min={1} max={32} value={form.threadMax}
                    onChange={(e) => setForm({ ...form, threadMax: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">间隔时间范围 ms（随机）</Label>
                <div className="flex items-center gap-2">
                  <Input className="h-8" type="number" min={0} value={form.intervalMin}
                    onChange={(e) => setForm({ ...form, intervalMin: Number(e.target.value) })} />
                  <span className="text-muted-foreground">~</span>
                  <Input className="h-8" type="number" min={0} value={form.intervalMax}
                    onChange={(e) => setForm({ ...form, intervalMax: Number(e.target.value) })} />
                </div>
              </div>
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

      {/* 日志抽屉 */}
      <Dialog open={!!logsFor} onOpenChange={(open) => !open && setLogsFor(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> 任务日志：{logsFor?.name}
              {logsFor && <Badge className={STATUS_META[logsFor.status]?.cls}>{STATUS_META[logsFor.status]?.label}</Badge>}
            </DialogTitle>
            <DialogDescription>实时滚动（每 2 秒增量拉取），最多保留最近 500 条。</DialogDescription>
          </DialogHeader>
          <div ref={logsRef} className="max-h-[52vh] min-h-[240px] overflow-y-auto rounded-md border bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed" data-testid="task-logs">
            {logs.length === 0 && <p className="text-zinc-500">暂无日志…</p>}
            {logs.map((log) => (
              <div key={log.id} className={`flex gap-2 py-0.5 ${LOG_COLOR[log.level] ?? ''}`}>
                <span className="shrink-0 text-zinc-500">{new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <span className="break-all">{log.message}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileDown className="h-3.5 w-3.5" /> 完整日志可在数据库 task_logs 表中查询
            </span>
            <Button size="sm" variant="outline" onClick={() => setLogs([])}>
              <Pencil className="hidden" /> 清屏
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
