import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const rule = await db.collectRule.findUnique({ where: { id } })
  if (!rule) return NextResponse.json({ error: '规则不存在' }, { status: 404 })
  return NextResponse.json({ rule })
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = (await req.json()) as { name?: string; enabled?: boolean; config?: unknown }
  const rule = await db.collectRule.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.config !== undefined
        ? { config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config) }
        : {}),
    },
  })
  return NextResponse.json({ rule })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const ref = await db.collectTask.findFirst({
    where: { OR: [{ listRuleId: id }, { bookRuleId: id }, { tocRuleId: id }, { contentRuleId: id }] },
  })
  if (ref) {
    return NextResponse.json({ error: `规则被任务「${ref.name}」引用，请先删除或修改该任务` }, { status: 400 })
  }
  await db.collectRule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
