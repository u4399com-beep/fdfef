import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, readJson, RULE_TYPES } from '../_lib/http'

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
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || !body.type) {
    return NextResponse.json({ error: '名称与类型必填' }, { status: 400 })
  }
  if (!RULE_TYPES.includes(String(body.type))) {
    return NextResponse.json({ error: '规则类型不合法' }, { status: 400 })
  }
  const rule = await db.collectRule.create({
    data: {
      name,
      type: String(body.type),
      config: typeof body.config === 'string' ? body.config : JSON.stringify(body.config ?? {}),
    },
  })
  return NextResponse.json({ rule })
}
