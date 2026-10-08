import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { normalizeTaskInput, taskTemplateToStore } from '@/lib/collect/task-input'
import { json, badRequest, readJson, toInt, prismaErrorToResponse } from '../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCHEDULE_INTERVAL_MIN = 5
const SCHEDULE_INTERVAL_MAX = 60 * 24 * 30

/** 循环任务列表 */
export async function GET(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const schedules = await db.collectSchedule.findMany({ orderBy: { createdAt: 'asc' } })
  return json({ schedules })
}

/** 新建循环任务：name + intervalMin + taskTemplate（与 POST /api/tasks 请求体同构，name 可省略） */
export async function POST(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const name = String(body.name ?? '').trim()
  if (!name) return badRequest('循环任务名称必填')

  let template: Record<string, unknown> = {}
  const raw = body.taskTemplate
  if (raw !== undefined && raw !== null) {
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) template = parsed as Record<string, unknown>
      } catch {
        return badRequest('任务模板必须为合法 JSON 对象')
      }
    } else if (typeof raw === 'object' && !Array.isArray(raw)) {
      template = raw as Record<string, unknown>
    } else {
      return badRequest('任务模板必须为 JSON 对象')
    }
  }
  const norm = normalizeTaskInput(template, { defaultName: name })
  if (!norm.ok) return badRequest(`任务模板无效：${norm.error}`)

  try {
    const schedule = await db.collectSchedule.create({
      data: {
        name,
        enabled: body.enabled === false ? false : true,
        intervalMin: toInt(body.intervalMin, 120, SCHEDULE_INTERVAL_MIN, SCHEDULE_INTERVAL_MAX),
        taskTemplate: taskTemplateToStore(norm.data),
      },
    })
    return json({ schedule })
  } catch (e) {
    return prismaErrorToResponse('循环任务', e)
  }
}
