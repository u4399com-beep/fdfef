import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { taskManager } from '@/lib/collect/task-manager'
import { json, badRequest, readJson, RouteCtx, strId, ACTIVE_TASK_STATUSES, STORAGE_MODES, stringArray, toInt } from '../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(_req)
  if (denied) return denied
  const { id } = await params
  const task = await db.collectTask.findUnique({ where: { id } })
  if (!task) return json({ error: '任务不存在' }, { status: 404 })
  const rt = taskManager.get(id)
  return json({ task, runtime: rt?.status ?? null })
}

/** 编辑任务（运行中禁止编辑） */
export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
  const { id } = await params
  const existing = await db.collectTask.findUnique({ where: { id } })
  if (!existing) return json({ error: '任务不存在' }, { status: 404 })
  if (ACTIVE_TASK_STATUSES.includes(existing.status)) {
    return json({ error: '任务正在运行，请先暂停或停止后再编辑' }, { status: 400 })
  }
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  // ?? '' 防 JSON null 被 String() 归一成字面量 "null" 落库（下同）
  if (body.name !== undefined && !String(body.name ?? '').trim()) {
    return badRequest('任务名称不能为空')
  }
  // 条件写闭合「检查-执行」竞态窗口：findUnique 与写入之间任务可能被 start 拉起，
  // 无条件 update 会把 running 覆盖回 pending（此后 runtime 在跑而 DB 显示 pending，
  // 直到任务终态才恢复）。updateMany 仅当状态仍非活动才写入，count=0 说明已被拉起。
  const res = await db.collectTask.updateMany({
    where: { id, status: { notIn: ACTIVE_TASK_STATUSES } },
    data: {
      ...(body.name !== undefined ? { name: String(body.name ?? '').trim() } : {}),
      ...(body.targetType !== undefined ? { targetType: body.targetType === 'range' ? 'range' : 'single' } : {}),
      ...(body.listRuleId !== undefined ? { listRuleId: strId(body.listRuleId) } : {}),
      ...(body.bookRuleId !== undefined ? { bookRuleId: strId(body.bookRuleId) } : {}),
      ...(body.tocRuleId !== undefined ? { tocRuleId: strId(body.tocRuleId) } : {}),
      ...(body.contentRuleId !== undefined ? { contentRuleId: strId(body.contentRuleId) } : {}),
      ...(body.targetUrls !== undefined ? { targetUrls: JSON.stringify(stringArray(body.targetUrls)) } : {}),
      ...(body.urlTemplate !== undefined ? { urlTemplate: String(body.urlTemplate ?? '') } : {}),
      ...(body.pageStart !== undefined ? { pageStart: toInt(body.pageStart, 1, 1) } : {}),
      ...(body.pageEnd !== undefined ? { pageEnd: toInt(body.pageEnd, 1, 1) } : {}),
      ...(body.mode !== undefined ? { mode: body.mode === 'full' ? 'full' : 'incremental' } : {}),
      ...(body.storageMode !== undefined && STORAGE_MODES.includes(String(body.storageMode))
        ? { storageMode: String(body.storageMode) }
        : {}),
      ...(body.threadMin !== undefined ? { threadMin: toInt(body.threadMin, 1, 1) } : {}),
      ...(body.threadMax !== undefined ? { threadMax: toInt(body.threadMax, 3, 1) } : {}),
      ...(body.intervalMin !== undefined ? { intervalMin: toInt(body.intervalMin, 500, 0) } : {}),
      ...(body.intervalMax !== undefined ? { intervalMax: toInt(body.intervalMax, 2000, 0) } : {}),
      status: 'pending',
      progress: 0,
      stage: '',
    },
  })
  if (res.count === 0) {
    return json({ error: '任务正在运行，请先暂停或停止后再编辑' }, { status: 400 })
  }
  const task = await db.collectTask.findUnique({ where: { id } })
  return json({ task })
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(_req)
  if (denied) return denied
  const { id } = await params
  const existing = await db.collectTask.findUnique({ where: { id } })
  if (!existing) return json({ error: '任务不存在' }, { status: 404 })
  if (ACTIVE_TASK_STATUSES.includes(existing.status)) {
    taskManager.stop(id)
    return json({ error: '任务正在运行，请先停止后再删除' }, { status: 400 })
  }
  // 条件删除闭合竞态：findUnique（非活动）与删除之间任务可能被 start 拉起，
  // 无条件 delete 会把活任务连同其运行状态一起删除。deleteMany 仅当状态仍非活动才删，
  // count=0 说明已被拉起（executeTask 开头 findUnique null 兜底自行退出，数据零误删）。
  const res = await db.collectTask.deleteMany({ where: { id, status: { notIn: ACTIVE_TASK_STATUSES } } })
  if (res.count === 0) {
    return json({ error: '任务正在运行，请先停止后再删除' }, { status: 400 })
  }
  await db.taskLog.deleteMany({ where: { taskId: id } })
  return json({ ok: true })
}
