import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { taskManager } from '@/lib/collect/task-manager'
import { badRequest, readJson, RouteCtx, strId, ACTIVE_TASK_STATUSES, STORAGE_MODES, stringArray, toInt } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const task = await db.collectTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  const rt = taskManager.get(id)
  return NextResponse.json({ task, runtime: rt?.status ?? null })
}

/** 编辑任务（运行中禁止编辑） */
export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const existing = await db.collectTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (ACTIVE_TASK_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: '任务正在运行，请先暂停或停止后再编辑' }, { status: 400 })
  }
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  // ?? '' 防 JSON null 被 String() 归一成字面量 "null" 落库（下同）
  if (body.name !== undefined && !String(body.name ?? '').trim()) {
    return badRequest('任务名称不能为空')
  }
  const task = await db.collectTask.update({
    where: { id },
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
  return NextResponse.json({ task })
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const existing = await db.collectTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (ACTIVE_TASK_STATUSES.includes(existing.status)) {
    taskManager.stop(id)
    return NextResponse.json({ error: '任务正在运行，请先停止后再删除' }, { status: 400 })
  }
  await db.taskLog.deleteMany({ where: { taskId: id } })
  await db.collectTask.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
