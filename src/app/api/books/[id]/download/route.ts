import { NextRequest } from 'next/server'
import { buildBookTxt } from '@/lib/collect/download-builder'
import { json, RouteCtx } from '../../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** 小说文件下载（含站点信息/广告/混淆注入） */
export async function GET(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(req)
  if (denied) return denied
  const { id } = await params
  const siteName = req.nextUrl.searchParams.get('siteName') ?? undefined
  const domain = req.nextUrl.searchParams.get('domain') ?? undefined
  const built = await buildBookTxt(id, siteName, domain)
  if (!built) {
    return json({ error: '书籍不存在' }, { status: 404 })
  }
  return new Response(built.content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // RFC 5987 ext-value 中单引号是分隔符，需转义（encodeURIComponent 不会编码 '）
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(built.filename).replace(/'/g, '%27')}`,
    },
  })
}
