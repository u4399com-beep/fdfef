import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { taskManager } from '@/lib/collect/task-manager'
import { normalizeTaskInput, taskCreateData } from '@/lib/collect/task-input'
import { json, badRequest, readJson, ACTIVE_TASK_STATUSES } from '../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 任务列表（带实时状态修正：仅当运行时不存在时才将残留的 running 标记改为 stopped，避免误杀正在执行的任务） */
export async function GET(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const tasks = await db.collectTask.findMany({ orderBy: { updatedAt: 'desc' } })
  const stale = tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status) && !taskManager.has(t.id))
  for (const t of stale) {
    // 条件更新：findMany 与写库之间该任务可能刚被 start 拉起（runtime 已建、DB 已回写 running），
    // 无条件 update 会把活任务覆盖成 stopped（此后 stale 检测因 runtime 存在不再纠正）；
    // 仅当 DB 仍处活动态才改写，count=0 说明状态已被并发变更，响应保持读取时的真实值
    const res = await db.collectTask.updateMany({
      where: { id: t.id, status: { in: ACTIVE_TASK_STATUSES } },
      data: { status: 'stopped', stage: '已中断（服务重启）' },
    })
    if (res.count > 0) {
      t.status = 'stopped'
      t.stage = '已中断（服务重启）'
    }
  }
  return json({ tasks })
}

/** 新建任务（与循环任务模板共用 normalizeTaskInput 规范化，防两路校验漂移） */
export async function POST(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const norm = normalizeTaskInput(body)
  if (!norm.ok) return badRequest(norm.error)

  const task = await db.collectTask.create({ data: taskCreateData(norm.data) })
  return json({ task })
}
