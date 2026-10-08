'use client'

/**
 * 循环采集任务面板：按分钟间隔自动创建并启动采集任务的定时调度管理。
 * 挂载于任务页顶部；创建时支持「从现有任务生成模板」（复用其规则/URL/并发配置）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api, formatDate } from '@/lib/client-api'
import { CalendarClock, Loader2, Plus, Trash2, Zap } from 'lucide-react'

interface ScheduleRow {
  id: string
  name: string
  enabled: boolean
  intervalMin: number
  taskTemplate: string
  lastRunAt: string | null
  lastTaskId: string
  lastStatus: string
  runCount: number
  updatedAt: string
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  running: { label: '运行中', cls: 'bg-sky-100 text-sky-700' },
  paused: { label: '已暂停', cls: 'bg-amber-100 text-amber-700' },
  done: { label: '已完成', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: '失败', cls: 'bg-red-100 text-red-700' },
  stopped: { label: '已停止', cls: 'bg-zinc-100 text-zinc-600' },
  'template-error': { label: '模板错误', cls: 'bg-red-100 text-red-700' },
}

export function SchedulesPanel() {
  const { toast } = useToast()
  const [schedules, setSchedules] = useState<ScheduleRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tasks, setTasks] = useState<(Record<string, unknown> & { id: string; name: string })[]>([])
  const [form, setForm] = useState({ name: '', intervalMin: 120, fromTaskId: '', template: '' })

  const load = useCallback(async () => {
    try {
      const r = await api<{ schedules: ScheduleRow[] }>('/api/schedules')
      setSchedules(r.schedules)
    } catch {
      /* 面板轮询静默（任务页主轮询已负责首次失败提示） */
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 5000)
    return () => clearInterval(t)
  }, [load])

  const openCreate = async () => {
    setForm({ name: '', intervalMin: 120, fromTaskId: '', template: '' })
    setCreateOpen(true)
    try {
      const r = await api<{ tasks: (Record<string, unknown> & { id: string; name: string })[] }>('/api/tasks')
      setTasks(r.tasks)
    } catch {
      /* 下拉留空，模板可手填 */
    }
  }

  const pickFromTask = (taskId: string) => {
    const t = tasks.find((x) => x.id === taskId)
    if (!t) return
    setForm((f) => ({ ...f, fromTaskId: taskId, name: f.name || `${t.name}·循环` }))
    // 从任务行提取模板（剥离运行态字段），填充 JSON 编辑区
    const tpl: Record<string, unknown> = { ...t }
    for (const k of ['id', 'name', 'status', 'stage', 'progress', 'total', 'stats', 'createdAt', 'updatedAt']) delete tpl[k]
    setForm((f) => ({ ...f, template: JSON.stringify(tpl, null, 1) }))
  }

  const create = async () => {
    if (!form.name.trim()) {
      toast({ title: '请填写循环任务名称', variant: 'destructive' })
      return
    }
    const interval = Math.round(Number(form.intervalMin))
    if (!Number.isFinite(interval) || interval < 5) {
      toast({ title: '执行间隔最短 5 分钟', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await api('/api/schedules', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          intervalMin: interval,
          taskTemplate: form.template || undefined,
        }),
      })
      toast({ title: '循环任务已创建' })
      setCreateOpen(false)
      void load()
    } catch (e) {
      toast({ title: '创建失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const control = async (s: ScheduleRow, action: 'runNow' | 'enable' | 'disable') => {
    setBusyId(s.id)
    try {
      await api(`/api/schedules/${s.id}/control`, { method: 'POST', body: JSON.stringify({ action }) })
      if (action === 'runNow') toast({ title: '已触发执行', description: `「${s.name}」已创建并启动本轮采集任务` })
      void load()
    } catch (e) {
      toast({ title: action === 'runNow' ? '触发失败' : '操作失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (s: ScheduleRow) => {
    if (!window.confirm(`删除循环任务「${s.name}」？（已触发的历史任务记录不受影响）`)) return
    setBusyId(s.id)
    try {
      await api(`/api/schedules/${s.id}`, { method: 'DELETE' })
      toast({ title: '已删除' })
      void load()
    } catch (e) {
      toast({ title: '删除失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" /> 循环任务
              <Badge variant="outline" className="font-normal">定时自动采集</Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              按固定间隔自动创建并启动采集任务（增量模式只补新章节）；上一轮未跑完不会重复触发。
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => void openCreate()}>
            <Plus className="h-4 w-4" /> 新建循环任务
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {schedules.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            暂无循环任务。可从现有采集任务一键生成定时循环。
          </p>
        )}
        {schedules.map((s) => {
          const st = STATUS_META[s.lastStatus] ?? { label: s.lastStatus || '未运行', cls: 'bg-zinc-100 text-zinc-600' }
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <Badge variant="outline" className="font-normal">每 {s.intervalMin} 分钟</Badge>
                  <Badge className={`font-normal ${st.cls}`}>{st.label}</Badge>
                  {s.runCount > 0 && <Badge variant="outline" className="font-normal">已执行 {s.runCount} 次</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.enabled ? `上次触发：${formatDate(s.lastRunAt)}` : '已停用（不参与调度）'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(v) => void control(s, v ? 'enable' : 'disable')}
                  disabled={busyId === s.id}
                  aria-label={`切换循环任务「${s.name}」启用状态`}
                />
                <Button size="sm" variant="outline" disabled={busyId === s.id || !s.enabled} onClick={() => void control(s, 'runNow')}>
                  {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-4 w-4" />}
                  立即执行
                </Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={busyId === s.id} onClick={() => void remove(s)} aria-label={`删除循环任务「${s.name}」`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>新建循环任务</DialogTitle>
            <DialogDescription>
              选择一个现有采集任务作为模板（复用其规则、目标与并发配置），到达间隔后自动创建并执行一次增量采集。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sch-name">循环任务名称</Label>
              <Input
                id="sch-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="如：dwxwc 最新更新循环采集"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sch-interval">执行间隔（分钟，最短 5）</Label>
              <Input
                id="sch-interval"
                type="number"
                min={5}
                value={form.intervalMin}
                onChange={(e) => setForm((f) => ({ ...f, intervalMin: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>从现有任务生成模板（可选）</Label>
              <Select value={form.fromTaskId || undefined} onValueChange={pickFromTask}>
                <SelectTrigger aria-label="选择参考任务">
                  <SelectValue placeholder="选择一个采集任务" />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sch-tpl">任务模板 JSON（targetType / 规则 id / urlTemplate 等）</Label>
              <Textarea
                id="sch-tpl"
                rows={7}
                className="max-h-64 overflow-y-auto font-mono text-xs"
                value={form.template}
                onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
                placeholder='{"targetType":"range","listRuleId":"…","bookRuleId":"…","tocRuleId":"…","contentRuleId":"…","urlTemplate":"https://…/{page}/","pageStart":1,"pageEnd":2,"mode":"incremental"}'
              />
              <p className="text-xs text-muted-foreground">name 无需填写——每次触发自动按「循环任务名 + 时间戳」生成。</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={() => void create()} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} 创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
