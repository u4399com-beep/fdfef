import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, badRequest, readJson, RouteCtx, toBoolOrNull, prismaErrorToResponse } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const rule = await db.collectRule.findUnique({ where: { id } })
  if (!rule) return json({ error: '规则不存在' }, { status: 404 })
  return json({ rule })
}

export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  // ?? '' 防 JSON null 被 String() 归一成字面量 "null" 落库
  if (body.name !== undefined && !String(body.name ?? '').trim()) {
    return badRequest('规则名称不能为空')
  }
  if (body.enabled !== undefined && toBoolOrNull(body.enabled) === null) {
    return badRequest('enabled 必须为布尔值')
  }
  try {
    const rule = await db.collectRule.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name ?? '').trim() } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled as boolean } : {}),
        ...(body.config !== undefined
          ? { config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config) }
          : {}),
      },
    })
    return json({ rule })
  } catch (e) {
    // 不存在的 id 更新会抛 Prisma P2025，统一按 404 处理
    return prismaErrorToResponse('规则', e)
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const ref = await db.collectTask.findFirst({
    where: { OR: [{ listRuleId: id }, { bookRuleId: id }, { tocRuleId: id }, { contentRuleId: id }] },
  })
  if (ref) {
    return json({ error: `规则被任务「${ref.name}」引用，请先删除或修改该任务` }, { status: 400 })
  }
  try {
    await db.collectRule.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) {
    return prismaErrorToResponse('规则', e)
  }
}
