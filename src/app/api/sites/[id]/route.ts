import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = (await req.json()) as Record<string, unknown>
  const site = await db.siteConfig.update({
    where: { id },
    data: {
      ...(body.siteName !== undefined ? { siteName: String(body.siteName) } : {}),
      ...(body.domain !== undefined ? { domain: String(body.domain) } : {}),
      ...(body.themeId !== undefined ? { themeId: String(body.themeId) } : {}),
      ...(body.title !== undefined ? { title: String(body.title) } : {}),
      ...(body.description !== undefined ? { description: String(body.description) } : {}),
      ...(body.keywords !== undefined ? { keywords: String(body.keywords) } : {}),
      ...(body.offset !== undefined ? { offset: Math.max(0, Number(body.offset)) } : {}),
      ...(body.mainBookId !== undefined ? { mainBookId: String(body.mainBookId) } : {}),
      ...(body.footerText !== undefined ? { footerText: String(body.footerText) } : {}),
    },
  })
  return NextResponse.json({ site })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  await db.siteConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
