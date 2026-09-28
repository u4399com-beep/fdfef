import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 任务日志（支持增量拉取；gte + 客户端按 id 去重，避免同毫秒日志被 gt 跳过丢失） */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const after = req.nextUrl.searchParams.get('after')
  const logs = await db.taskLog.findMany({
    where: { taskId: id, ...(after ? { createdAt: { gte: new Date(after) } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 300,
  })
  return NextResponse.json({ logs })
}
