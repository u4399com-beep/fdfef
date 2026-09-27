import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 站群列表 */
export async function GET() {
  const sites = await db.siteConfig.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ sites })
}

/** 新建站点（站群：一套后台/数据库/文件，多站派生） */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>
  const siteName = String(body.siteName ?? '').trim()
  if (!siteName) return NextResponse.json({ error: '站点名称必填' }, { status: 400 })
  const site = await db.siteConfig.create({
    data: {
      siteName,
      domain: String(body.domain ?? '').trim(),
      themeId: String(body.themeId ?? 'classic'),
      title: String(body.title ?? ''),
      description: String(body.description ?? ''),
      keywords: String(body.keywords ?? ''),
      offset: Math.max(0, Number(body.offset ?? 0)),
      mainBookId: String(body.mainBookId ?? ''),
      footerText: String(body.footerText ?? ''),
    },
  })
  return NextResponse.json({ site })
}
