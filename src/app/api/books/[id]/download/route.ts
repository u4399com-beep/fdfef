import { NextRequest } from 'next/server'
import { buildBookTxt } from '@/lib/collect/download-builder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Ctx = { params: Promise<{ id: string }> }

/** 小说文件下载（含站点信息/广告/混淆注入） */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const siteName = req.nextUrl.searchParams.get('siteName') ?? undefined
  const domain = req.nextUrl.searchParams.get('domain') ?? undefined
  const built = await buildBookTxt(id, siteName, domain)
  if (!built) {
    return new Response(JSON.stringify({ error: '书籍不存在' }), { status: 404 })
  }
  return new Response(built.content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(built.filename)}`,
    },
  })
}
