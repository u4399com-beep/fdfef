import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 任务列表（带实时状态修正：重启后残留的 running 标记改为 stopped） */
export async function GET() {
  const tasks = await db.collectTask.findMany({ orderBy: { updatedAt: 'desc' } })
  const stale = tasks.filter((t) => t.status === 'running' || t.status === 'paused')
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
  const body = (await req.json()) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: '任务名称必填' }, { status: 400 })

  const task = await db.collectTask.create({
    data: {
      name,
      targetType: body.targetType === 'range' ? 'range' : 'single',
      listRuleId: (body.listRuleId as string) || null,
      bookRuleId: (body.bookRuleId as string) || null,
      tocRuleId: (body.tocRuleId as string) || null,
      contentRuleId: (body.contentRuleId as string) || null,
      targetUrls: JSON.stringify(Array.isArray(body.targetUrls) ? body.targetUrls : []),
      urlTemplate: String(body.urlTemplate ?? ''),
      pageStart: Number(body.pageStart ?? 1),
      pageEnd: Number(body.pageEnd ?? 1),
      mode: body.mode === 'full' ? 'full' : 'incremental',
      storageMode: ['db', 'txt', 'both'].includes(String(body.storageMode)) ? String(body.storageMode) : 'db',
      threadMin: Math.max(1, Number(body.threadMin ?? 1)),
      threadMax: Math.max(1, Number(body.threadMax ?? 3)),
      intervalMin: Math.max(0, Number(body.intervalMin ?? 500)),
      intervalMax: Math.max(0, Number(body.intervalMax ?? 2000)),
    },
  })
  return NextResponse.json({ task })
}
