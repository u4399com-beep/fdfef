import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, badRequest, readJson, toInt } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 站群列表 */
export async function GET() {
  const sites = await db.siteConfig.findMany({ orderBy: { createdAt: 'asc' } })
  return json({ sites })
}

/** 新建站点（站群：一套后台/数据库/文件，多站派生） */
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const siteName = String(body.siteName ?? '').trim()
  if (!siteName) return json({ error: '站点名称必填' }, { status: 400 })
  const site = await db.siteConfig.create({
    data: {
      siteName,
      domain: String(body.domain ?? '').trim(),
      themeId: String(body.themeId ?? 'classic'),
      title: String(body.title ?? ''),
      description: String(body.description ?? ''),
      keywords: String(body.keywords ?? ''),
      offset: toInt(body.offset, 0, 0),
      mainBookId: String(body.mainBookId ?? ''),
      footerText: String(body.footerText ?? ''),
    },
  })
  return json({ site })
}
