import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { badRequest, readJson, RouteCtx, toInt } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  try {
    const site = await db.siteConfig.update({
      where: { id },
      data: {
        ...(body.siteName !== undefined ? { siteName: String(body.siteName) } : {}),
        ...(body.domain !== undefined ? { domain: String(body.domain) } : {}),
        ...(body.themeId !== undefined ? { themeId: String(body.themeId) } : {}),
        ...(body.title !== undefined ? { title: String(body.title) } : {}),
        ...(body.description !== undefined ? { description: String(body.description) } : {}),
        ...(body.keywords !== undefined ? { keywords: String(body.keywords) } : {}),
        ...(body.offset !== undefined ? { offset: toInt(body.offset, 0, 0) } : {}),
        ...(body.mainBookId !== undefined ? { mainBookId: String(body.mainBookId) } : {}),
        ...(body.footerText !== undefined ? { footerText: String(body.footerText) } : {}),
      },
    })
    return NextResponse.json({ site })
  } catch {
    return NextResponse.json({ error: '站点不存在' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  try {
    await db.siteConfig.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '站点不存在' }, { status: 404 })
  }
}
