import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { triggerSchedule } from '@/lib/collect/scheduler'
import { taskLog } from '@/lib/collect/task-manager'
import { json, badRequest, readJson, RouteCtx } from '../../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 循环任务控制：runNow 立即触发 / enable 启用 / disable 停用 */
export async function POST(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const { action } = body as { action?: string }
  const schedule = await db.collectSchedule.findUnique({ where: { id } })
  if (!schedule) return json({ error: '循环任务不存在' }, { status: 404 })

  switch (action) {
    case 'runNow': {
      const r = await triggerSchedule(id)
      if (!r.ok) return json({ error: r.error ?? '触发失败' }, { status: 400 })
      if (r.taskId) await taskLog(r.taskId, 'info', `由循环任务「${schedule.name}」手动触发`)
      return json({ ok: true, taskId: r.taskId })
    }
    case 'enable': {
      const s = await db.collectSchedule.update({ where: { id }, data: { enabled: true } })
      return json({ ok: true, schedule: s })
    }
    case 'disable': {
      const s = await db.collectSchedule.update({ where: { id }, data: { enabled: false } })
      return json({ ok: true, schedule: s })
    }
    default:
      return badRequest('未知操作，支持 runNow / enable / disable')
  }
}
