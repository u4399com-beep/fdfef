import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { taskManager, taskLog } from '@/lib/collect/task-manager'
import { executeTask } from '@/lib/collect/pipeline'
import { json, badRequest, readJson, RouteCtx, ACTIVE_TASK_STATUSES } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 终态集合：停止指令不得回写覆盖已完成的最终状态（done/failed 由 pipeline 写入） */
const TERMINAL_STATUSES = ['done', 'failed', 'stopped']

/** 任务控制：start 立即执行 / pause 暂停 / resume 继续 / stop 停止 */
export async function POST(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const { action } = body as { action?: string }
  const task = await db.collectTask.findUnique({ where: { id } })
  if (!task) return json({ error: '任务不存在' }, { status: 404 })

  switch (action) {
    case 'start': {
      if (taskManager.has(id)) {
        if (ACTIVE_TASK_STATUSES.includes(task.status)) {
          return json({ error: '任务已在运行中' }, { status: 400 })
        }
        // 内存残留运行时但 DB 已非活动：停止强清前的兜底窗口残留或热重载僵尸
        // （执行体已丢失的条目会永久挡住启动）→ 清理后放行重新启动
        taskManager.remove(id)
      }
      // DB 原子占位：仅当状态仍非活动才置 running（条件写闭合「检查-执行」竞态，
      // 并发双 start 只有一个能成功；DB 停留在 running/paused 的残留态同样在此被拒）
      const claim = await db.collectTask.updateMany({
        where: { id, status: { notIn: ACTIVE_TASK_STATUSES } },
        data: { status: 'running' },
      })
      if (claim.count === 0) {
        return json({ error: '任务正在运行，请先停止后再启动' }, { status: 400 })
      }
      // 同步占位运行时（has 判断与 create 之间无 await，天然防并发双开；
      // executeTask 内部 ensure 幂等复用；若任务恰好此刻被删除则残留一条死 id 记录，无副作用）
      const rt = taskManager.create(id)
      void executeTask(id).catch((e) => {
        // executeTask 在进入自身 try 前抛错（如任务查询失败）时不会走到其 finally 清理，
        // 上方占位 runtime 将永驻内存且任务永久卡在「已在运行中」→ 此处兜底移除
        // （带代际：若 entry 已被新一轮启动覆盖则不动；正常完成路径其 finally 已 remove，此处幂等无害）
        taskManager.remove(id, rt.epoch)
        console.error(`[tasks/control] 任务 ${id} 执行启动失败:`, e)
      })
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
