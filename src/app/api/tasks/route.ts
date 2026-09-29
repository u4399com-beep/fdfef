import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { taskManager } from '@/lib/collect/task-manager'
import { badRequest, readJson, strId, ACTIVE_TASK_STATUSES, STORAGE_MODES, stringArray, toInt } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 任务列表（带实时状态修正：仅当运行时不存在时才将残留的 running 标记改为 stopped，避免误杀正在执行的任务） */
export async function GET() {
  const tasks = await db.collectTask.findMany({ orderBy: { updatedAt: 'desc' } })
  const stale = tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status) && !taskManager.has(t.id))
  for (const t of stale) {
    await db.collectTask.update({
      where: { id: t.id },
      data: { status: 'stopped', stage: '已中断（服务重启）' },
    })
    t.status = 'stopped'
    t.stage = '已中断（服务重启）'
  }
  return NextResponse.json({ tasks })
}

/** 新建任务 */
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '任务名称必填' }, { status: 400 })

  const task = await db.collectTask.create({
    data: {
      name,
      targetType: body.targetType === 'range' ? 'range' : 'single',
      listRuleId: strId(body.listRuleId),
      bookRuleId: strId(body.bookRuleId),
      tocRuleId: strId(body.tocRuleId),
      contentRuleId: strId(body.contentRuleId),
      targetUrls: JSON.stringify(stringArray(body.targetUrls)),
      urlTemplate: String(body.urlTemplate ?? ''),
      pageStart: toInt(body.pageStart, 1, 1),
      pageEnd: toInt(body.pageEnd, 1, 1),
      mode: body.mode === 'full' ? 'full' : 'incremental',
      storageMode: STORAGE_MODES.includes(String(body.storageMode)) ? String(body.storageMode) : 'db',
      threadMin: toInt(body.threadMin, 1, 1),
      threadMax: toInt(body.threadMax, 3, 1),
      intervalMin: toInt(body.intervalMin, 500, 0),
      intervalMax: toInt(body.intervalMax, 2000, 0),
    },
  })
  return NextResponse.json({ task })
}
