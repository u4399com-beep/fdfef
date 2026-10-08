import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { taskManager, taskLog } from '@/lib/collect/task-manager'
import { launchTask } from '@/lib/collect/task-launch'
import { json, badRequest, readJson, RouteCtx, ACTIVE_TASK_STATUSES } from '../../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 终态集合：停止指令不得回写覆盖已完成的最终状态（done/failed 由 pipeline 写入） */
const TERMINAL_STATUSES = ['done', 'failed', 'stopped']

/** 任务控制：start 立即执行 / pause 暂停 / resume 继续 / stop 停止 */
export async function POST(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const { action } = body as { action?: string }
  const task = await db.collectTask.findUnique({ where: { id } })
  if (!task) return json({ error: '任务不存在' }, { status: 404 })

  switch (action) {
    case 'start': {
      // 与循环任务调度器共用启动逻辑（原子占位→运行时→异步执行，防并发双开）
      const r = await launchTask(id)
      if (!r.ok) return json({ error: r.error ?? '启动失败' }, { status: r.notFound ? 404 : 400 })
      await taskLog(id, 'info', '收到执行指令')
      return json({ ok: true, status: 'running' })
    }
    case 'pause': {
      const ok = taskManager.pause(id)
      if (!ok) return json({ error: '仅运行中的任务可暂停' }, { status: 400 })
      await db.collectTask.update({ where: { id }, data: { status: 'paused', stage: '已暂停' } })
      await taskLog(id, 'warn', '任务已暂停')
      return json({ ok: true, status: 'paused' })
    }
    case 'resume': {
      const ok = taskManager.resume(id)
      if (!ok) return json({ error: '仅暂停中的任务可继续' }, { status: 400 })
      await db.collectTask.update({ where: { id }, data: { status: 'running', stage: '继续执行' } })
      await taskLog(id, 'info', '任务继续执行')
      return json({ ok: true, status: 'running' })
    }
    case 'stop': {
      const rt = taskManager.get(id)
      if (!rt) {
        // 无运行时：仅当 DB 仍处于非终态（如服务重启残留的 running/paused）才纠正为 stopped
        if (!TERMINAL_STATUSES.includes(task.status)) {
          await db.collectTask.update({
            where: { id },
            data: { status: 'stopped', stage: '已停止' },
          })
        }
        return json({ ok: true, status: 'stopped' })
      }
      taskManager.stop(id)
      await taskLog(id, 'warn', '收到停止指令，正在终止…')
      // 等待运行时退出（最多 8 秒）
      for (let i = 0; i < 16; i++) {
        if (!taskManager.has(id)) break
        await new Promise((r) => setTimeout(r, 500))
      }
      // 8 秒后条目仍在：协程卡在不可打断的深处（如 WAF 解题链路，稍后仍会经闭包 rt
      // 感知 stopping 并退出）或已成僵尸（热重载丢失执行体）。强制清理释放启动通道：
      // 活协程的退出路径不依赖条目存在（shouldStop 回退闭包 rt），其 finally remove 带代际，
      // 不会误删强制清理后用户立即重启的新一轮运行时
      if (taskManager.has(id)) {
        console.error(`[tasks/control] 任务 ${id} 停止 8s 后运行时仍未退出，强制清理`)
        taskManager.remove(id)
      }
      // 运行时已退出时 pipeline 会自行写入最终状态（done/failed/stopped），
      // 仅当任务仍卡在非终态（如 8 秒超时仍在收尾）才兜底写 stopped，避免覆盖 completed 结果
      try {
        const cur = await db.collectTask.findUnique({ where: { id }, select: { status: true } })
        if (cur && !TERMINAL_STATUSES.includes(cur.status)) {
          await db.collectTask.update({
            where: { id },
            data: { status: 'stopped', stage: '已停止' },
          })
        }
      } catch {
        /* 任务可能已被并发删除 */
      }
      await taskLog(id, 'warn', '任务已停止')
      return json({ ok: true, status: 'stopped' })
    }
    default:
      return json({ error: '未知操作' }, { status: 400 })
  }
}
