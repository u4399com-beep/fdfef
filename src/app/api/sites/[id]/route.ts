import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, badRequest, readJson, RouteCtx, toInt, prismaErrorToResponse } from '../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** seoConfig 透传校验：非法 JSON 一律回退 {}（与新建站点同语义） */
function seoConfigOr(body: unknown): string {
  if (body === undefined) return '{}'
  const s = typeof body === 'string' ? body : JSON.stringify(body)
  try {
    JSON.parse(s)
    return s
  } catch {
    return '{}'
  }
}

export async function PUT(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
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
        ...(body.seoConfig !== undefined ? { seoConfig: seoConfigOr(body.seoConfig) } : {}),
      },
    })
    return json({ site })
  } catch (e) {
    return prismaErrorToResponse('站点', e)
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(_req)
  if (denied) return denied
  const { id } = await params
  try {
    await db.siteConfig.delete({ where: { id } })
    return json({ ok: true })
  } catch (e) {
    return prismaErrorToResponse('站点', e)
  }
}
