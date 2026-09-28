import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 任务日志（支持增量拉取；gte + 客户端按 id 去重，避免同毫秒日志被 gt 跳过丢失） */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const after = req.nextUrl.searchParams.get('after')
  // 非法 after（非日期字符串）回退为全量拉取，而不是把 Invalid Date 直接丢给 Prisma 报 500
  const afterDate = after ? new Date(after) : null
  const validAfter = afterDate && !Number.isNaN(afterDate.valueOf()) ? afterDate : null
  const logs = await db.taskLog.findMany({
    where: { taskId: id, ...(validAfter ? { createdAt: { gte: validAfter } } : {}) },
    orderBy: { createdAt: 'asc' },
    take: 300,
  })
  return NextResponse.json({ logs })
}
