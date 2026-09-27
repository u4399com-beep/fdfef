import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 采集规则列表 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const rules = await db.collectRule.findMany({
    where: type ? { type } : undefined,
    orderBy: { updatedAt: 'desc' },
  })
  return NextResponse.json({ rules })
}

/** 新建规则 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: string; type?: string; config?: unknown }
  if (!body.name?.trim() || !body.type) {
    return NextResponse.json({ error: '名称与类型必填' }, { status: 400 })
  }
  if (!['list', 'book', 'toc', 'content'].includes(body.type)) {
    return NextResponse.json({ error: '规则类型不合法' }, { status: 400 })
  }
  const rule = await db.collectRule.create({
    data: {
      name: body.name.trim(),
      type: body.type,
      config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config ?? {}),
    },
  })
  return NextResponse.json({ rule })
}
