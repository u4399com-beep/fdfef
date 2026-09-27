import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { taskManager } from '@/lib/collect/task-manager'

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
  const body = (await req.json()) as Record<string, unknown>
  const task = await db.collectTask.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.targetType !== undefined ? { targetType: body.targetType === 'range' ? 'range' : 'single' } : {}),
      ...(body.listRuleId !== undefined ? { listRuleId: (body.listRuleId as string) || null } : {}),
      ...(body.bookRuleId !== undefined ? { bookRuleId: (body.bookRuleId as string) || null } : {}),
      ...(body.tocRuleId !== undefined ? { tocRuleId: (body.tocRuleId as string) || null } : {}),
      ...(body.contentRuleId !== undefined ? { contentRuleId: (body.contentRuleId as string) || null } : {}),
      ...(body.targetUrls !== undefined
        ? { targetUrls: JSON.stringify(Array.isArray(body.targetUrls) ? body.targetUrls : []) }
        : {}),
      ...(body.urlTemplate !== undefined ? { urlTemplate: String(body.urlTemplate) } : {}),
      ...(body.pageStart !== undefined ? { pageStart: Number(body.pageStart) } : {}),
      ...(body.pageEnd !== undefined ? { pageEnd: Number(body.pageEnd) } : {}),
      ...(body.mode !== undefined ? { mode: body.mode === 'full' ? 'full' : 'incremental' } : {}),
      ...(body.storageMode !== undefined && ['db', 'txt', 'both'].includes(String(body.storageMode))
        ? { storageMode: String(body.storageMode) }
        : {}),
      ...(body.threadMin !== undefined ? { threadMin: Math.max(1, Number(body.threadMin)) } : {}),
      ...(body.threadMax !== undefined ? { threadMax: Math.max(1, Number(body.threadMax)) } : {}),
      ...(body.intervalMin !== undefined ? { intervalMin: Math.max(0, Number(body.intervalMin)) } : {}),
      ...(body.intervalMax !== undefined ? { intervalMax: Math.max(0, Number(body.intervalMax)) } : {}),
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
