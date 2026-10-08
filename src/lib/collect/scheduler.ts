/**
 * 循环采集调度器（进程内单例）：按 CollectSchedule 配置的分钟间隔自动创建并启动 CollectTask。
 * 由 src/instrumentation.ts 在服务器启动时拉起；globalThis 守卫防 dev 热重载重复实例。
 *
 * 触发语义：
 * - 每 60s 检查 enabled 调度，lastRunAt 距今 ≥ intervalMin（下限 5 分钟）即触发；
 * - 上一轮触发的任务仍处 running/paused → 本轮跳过（防同站并发采集）；
 *   运行时缺失的活动态任务视为服务重启残留，标记中断后照常触发（自愈）；
 * - 触发即创建新 CollectTask（名称 = 调度名 + 时间戳，模板与手动建任务同一套规范化），
 *   lastRunAt 在创建时点写入：启动失败也按整间隔重试，不热循环。
 */
import { db } from '@/lib/db'
import type { CollectSchedule } from '@prisma/client'
import { launchTask } from './task-launch'
import { taskManager } from './task-manager'
import { normalizeTaskInput, taskCreateData } from './task-input'

const TICK_MS = 60_000
const MIN_INTERVAL_MIN = 5
/** 运行时缺失时视为「服务重启残留」的活动态集合（与 _lib/http.ts ACTIVE_TASK_STATUSES 同值） */
const ACTIVE_STATUSES = ['running', 'paused']

interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null
  firing: Set<string>
}

const g = globalThis as unknown as { __collectScheduler?: SchedulerState }

export function startScheduler(): void {
  if (g.__collectScheduler) return
  const state: SchedulerState = { timer: null, firing: new Set() }
  state.timer = setInterval(() => void tick(state.firing), TICK_MS)
  g.__collectScheduler = state
  console.log('[scheduler] 循环采集调度器已启动（每 60s 检查到期任务）')
  // 启动后 20s 做首次检查：错开服务器启动高峰（DB 连接/Prisma 引擎初始化），也不阻塞 boot
  setTimeout(() => void tick(state.firing), 20_000)
}

/** 手动立即触发（UI「立即执行」按钮）：绕过间隔判断，但保留「上轮未跑完不重复触发」守卫 */
export async function triggerSchedule(id: string): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  const s = await db.collectSchedule.findUnique({ where: { id } })
  if (!s) return { ok: false, error: '循环任务不存在' }
  if (g.__collectScheduler?.firing.has(id)) return { ok: false, error: '该循环任务正在触发中' }
  g.__collectScheduler?.firing.add(id)
  try {
    return await fireCore(s)
  } finally {
    g.__collectScheduler?.firing.delete(id)
  }
}

async function tick(firing: Set<string>): Promise<void> {
  let schedules: CollectSchedule[]
  try {
    schedules = await db.collectSchedule.findMany({ where: { enabled: true } })
  } catch (e) {
    console.error('[scheduler] 读取循环任务失败:', e)
    return
  }
  for (const s of schedules) {
    // 顺手同步上次任务状态快照：fire 时写 running，任务终态由 tick 回写（UI 免等下轮触发才刷新）
    const SETTLED = ['done', 'failed', 'template-error']
    if (s.lastTaskId && s.lastStatus && !SETTLED.includes(s.lastStatus)) {
      const last = await db.collectTask
        .findUnique({ where: { id: s.lastTaskId }, select: { status: true } })
        .catch(() => null)
      if (last && last.status !== s.lastStatus) {
        await db.collectSchedule.update({ where: { id: s.id }, data: { lastStatus: last.status } }).catch(() => undefined)
      }
    }
    if (firing.has(s.id)) continue
    const gap = Math.max(MIN_INTERVAL_MIN, s.intervalMin) * 60_000
    if (s.lastRunAt && Date.now() - s.lastRunAt.getTime() < gap) continue
    firing.add(s.id)
    void fire(s, firing)
  }
}

async function fire(s: CollectSchedule, firing: Set<string>): Promise<void> {
  try {
    await fireCore(s)
  } catch (e) {
    console.error(`[scheduler] 循环任务「${s.name}」触发异常:`, e)
  } finally {
    firing.delete(s.id)
  }
}

/** 触发核心：守卫检查 → 建任务 → 启动 → 回写调度状态（firing 标记由调用方管理） */
async function fireCore(s: CollectSchedule): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  // 上一轮任务仍在运行 → 跳过本轮（间隔由 lastRunAt 保证下轮再查）
  if (s.lastTaskId) {
    const last = await db.collectTask.findUnique({ where: { id: s.lastTaskId } }).catch(() => null)
    if (last && ACTIVE_STATUSES.includes(last.status)) {
      if (taskManager.has(last.id)) {
        // 运行时确在本进程内 → 真在跑，等下一轮
        await db.collectSchedule
          .update({ where: { id: s.id }, data: { lastStatus: last.status } })
          .catch(() => undefined)
        return { ok: false, error: '上一轮任务仍在运行' }
      }
      // 运行时缺失（服务重启残留）→ 标记中断并继续本轮触发（自愈）
      await db.collectTask
        .updateMany({
          where: { id: last.id, status: { in: ACTIVE_STATUSES } },
          data: { status: 'stopped', stage: '已中断（服务重启）' },
        })
        .catch(() => undefined)
    }
  }

  // 模板规范化（与手动建任务同一套校验，杜绝调度路径产生畸形任务）
  let raw: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(s.taskTemplate || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>
  } catch {
    await db.collectSchedule.update({ where: { id: s.id }, data: { lastStatus: 'template-error' } })
    return { ok: false, error: '任务模板 JSON 非法' }
  }
  const norm = normalizeTaskInput(raw, { defaultName: s.name })
  if (!norm.ok) {
    await db.collectSchedule.update({ where: { id: s.id }, data: { lastStatus: 'template-error' } })
    return { ok: false, error: norm.error }
  }
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
  const task = await db.collectTask.create({ data: taskCreateData({ ...norm.data, name: `${s.name} ${stamp}` }) })
  await db.collectSchedule.update({
    where: { id: s.id },
    data: { lastRunAt: new Date(), lastTaskId: task.id, lastStatus: 'running', runCount: { increment: 1 } },
  })

  const r = await launchTask(task.id)
  if (!r.ok) {
    await db.collectTask
      .update({ where: { id: task.id }, data: { status: 'failed', stage: `启动失败：${r.error}` } })
      .catch(() => undefined)
    await db.collectSchedule.update({ where: { id: s.id }, data: { lastStatus: 'failed' } }).catch(() => undefined)
    console.error(`[scheduler] 循环任务「${s.name}」启动失败: ${r.error}`)
    return { ok: false, error: r.error, taskId: task.id }
  }
  console.log(`[scheduler] 循环任务「${s.name}」已触发 → 任务 ${task.id}（${norm.data.targetType} 模式）`)
  return { ok: true, taskId: task.id }
}
