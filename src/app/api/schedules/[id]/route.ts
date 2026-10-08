import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { normalizeTaskInput, taskTemplateToStore } from '@/lib/collect/task-input'
import { json, badRequest, readJson, toInt, prismaErrorToResponse, RouteCtx } from '../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCHEDULE_INTERVAL_MIN = 5
const SCHEDULE_INTERVAL_MAX = 60 * 24 * 30

/** 更新循环任务：name / intervalMin / enabled / taskTemplate 任意子集 */
export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')

  const existing = await db.collectSchedule.findUnique({ where: { id } })
  if (!existing) return json({ error: '循环任务不存在' }, { status: 404 })

  const data: { name?: string; intervalMin?: number; enabled?: boolean; taskTemplate?: string } = {}
  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) return badRequest('循环任务名称必填')
    data.name = name
  }
  if (body.intervalMin !== undefined) {
    data.intervalMin = toInt(body.intervalMin, 120, SCHEDULE_INTERVAL_MIN, SCHEDULE_INTERVAL_MAX)
  }
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled)
  if (body.taskTemplate !== undefined) {
    let template: Record<string, unknown> = {}
    const raw = body.taskTemplate
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) template = parsed as Record<string, unknown>
      } catch {
        return badRequest('任务模板必须为合法 JSON 对象')
      }
    } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      template = raw as Record<string, unknown>
    } else {
      return badRequest('任务模板必须为 JSON 对象')
    }
    // 更新模板时以现有调度名为默认名做规范化（模板内 name 不入库，触发时自动生成）
    const norm = normalizeTaskInput(template, { defaultName: data.name ?? existing.name })
    if (!norm.ok) return badRequest(`任务模板无效：${norm.error}`)
    data.taskTemplate = taskTemplateToStore(norm.data)
  }

  try {
    const schedule = await db.collectSchedule.update({ where: { id }, data })
    return json({ schedule })
  } catch (e) {
    return prismaErrorToResponse('循环任务', e)
  }
}

/** 删除循环任务（不影响已触发的历史任务记录） */
export async function DELETE(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
  const { id } = await params
  try {
    await db.collectSchedule.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) {
    return prismaErrorToResponse('循环任务', e)
  }
}
