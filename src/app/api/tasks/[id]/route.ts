import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { taskManager } from '@/lib/collect/task-manager'
import { badRequest, readJson, toInt } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const task = await db.collectTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  const rt = taskManager.get(id)
  return NextResponse.json({ task, runtime: rt?.status ?? null })
}

/** 编辑任务（运行中禁止编辑） */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const existing = await db.collectTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (existing.status === 'running' || existing.status === 'paused') {
    return NextResponse.json({ error: '任务正在运行，请先暂停或停止后再编辑' }, { status: 400 })
  }
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  if (body.name !== undefined && !String(body.name).trim()) {
    return badRequest('任务名称不能为空')
  }
  const task = await db.collectTask.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.targetType !== undefined ? { targetType: body.targetType === 'range' ? 'range' : 'single' } : {}),
      ...(body.listRuleId !== undefined
        ? { listRuleId: typeof body.listRuleId === 'string' && body.listRuleId ? body.listRuleId : null }
        : {}),
      ...(body.bookRuleId !== undefined
        ? { bookRuleId: typeof body.bookRuleId === 'string' && body.bookRuleId ? body.bookRuleId : null }
        : {}),
      ...(body.tocRuleId !== undefined
        ? { tocRuleId: typeof body.tocRuleId === 'string' && body.tocRuleId ? body.tocRuleId : null }
        : {}),
      ...(body.contentRuleId !== undefined
        ? { contentRuleId: typeof body.contentRuleId === 'string' && body.contentRuleId ? body.contentRuleId : null }
        : {}),
      ...(body.targetUrls !== undefined
        ? {
            targetUrls: JSON.stringify(
              Array.isArray(body.targetUrls) ? body.targetUrls.filter((u): u is string => typeof u === 'string') : []
            ),
          }
        : {}),
      ...(body.urlTemplate !== undefined ? { urlTemplate: String(body.urlTemplate) } : {}),
      ...(body.pageStart !== undefined ? { pageStart: toInt(body.pageStart, 1, 1) } : {}),
      ...(body.pageEnd !== undefined ? { pageEnd: toInt(body.pageEnd, 1, 1) } : {}),
      ...(body.mode !== undefined ? { mode: body.mode === 'full' ? 'full' : 'incremental' } : {}),
      ...(body.storageMode !== undefined && ['db', 'txt', 'both'].includes(String(body.storageMode))
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

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const existing = await db.collectTask.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: '任务不存在' }, { status: 404 })
  if (existing.status === 'running' || existing.status === 'paused') {
    taskManager.stop(id)
    return NextResponse.json({ error: '任务正在运行，请先停止后再删除' }, { status: 400 })
  }
  await db.taskLog.deleteMany({ where: { taskId: id } })
  await db.collectTask.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
