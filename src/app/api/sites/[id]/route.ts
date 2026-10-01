import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, badRequest, readJson, RouteCtx, toInt } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  // ?? '' 防 JSON null 被 String() 归一成字面量 "null" 落库（下同）
  if (body.siteName !== undefined && !String(body.siteName ?? '').trim()) {
    return badRequest('站点名称不能为空')
  }
  try {
    const site = await db.siteConfig.update({
      where: { id },
      data: {
        ...(body.siteName !== undefined ? { siteName: String(body.siteName ?? '').trim() } : {}),
        ...(body.domain !== undefined ? { domain: String(body.domain ?? '').trim() } : {}),
        ...(body.themeId !== undefined ? { themeId: String(body.themeId ?? 'classic') } : {}),
        ...(body.title !== undefined ? { title: String(body.title ?? '') } : {}),
        ...(body.description !== undefined ? { description: String(body.description ?? '') } : {}),
        ...(body.keywords !== undefined ? { keywords: String(body.keywords ?? '') } : {}),
        ...(body.offset !== undefined ? { offset: toInt(body.offset, 0, 0) } : {}),
        ...(body.mainBookId !== undefined ? { mainBookId: String(body.mainBookId ?? '') } : {}),
        ...(body.footerText !== undefined ? { footerText: String(body.footerText ?? '') } : {}),
      },
    })
    return json({ site })
  } catch {
    return json({ error: '站点不存在' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  try {
    await db.siteConfig.delete({ where: { id } })
    return json({ ok: true })
  } catch {
    return json({ error: '站点不存在' }, { status: 404 })
  }
}
