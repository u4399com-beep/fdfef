import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_CLEANING, DEFAULT_DOWNLOAD } from '@/lib/collect-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 读取系统配置（清洗规则 + 下载注入） */
export async function GET() {
  const row = await db.systemConfig.findUnique({ where: { id: 'main' } })
  let cleaning = { ...DEFAULT_CLEANING }
  let download = { ...DEFAULT_DOWNLOAD }
  try {
    if (row?.cleaning) cleaning = { ...cleaning, ...JSON.parse(row.cleaning) }
  } catch { /* keep defaults */ }
  try {
    if (row?.download) download = { ...download, ...JSON.parse(row.download) }
  } catch { /* keep defaults */ }
  return NextResponse.json({ cleaning, download })
}

/** 保存系统配置 */
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as { cleaning?: unknown; download?: unknown }
  const data = {
    ...(body.cleaning !== undefined ? { cleaning: JSON.stringify(body.cleaning) } : {}),
    ...(body.download !== undefined ? { download: JSON.stringify(body.download) } : {}),
  }
  await db.systemConfig.upsert({
    where: { id: 'main' },
    create: { id: 'main', ...data },
    update: data,
  })
  return NextResponse.json({ ok: true })
}
