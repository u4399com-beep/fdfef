import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const book = await db.book.findUnique({ where: { id } })
  if (!book) return NextResponse.json({ error: '书籍不存在' }, { status: 404 })
  return NextResponse.json({ book })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const usedBy = await db.siteConfig.findFirst({ where: { mainBookId: id } })
  if (usedBy) {
    await db.siteConfig.update({ where: { id: usedBy.id }, data: { mainBookId: '' } })
  }
  await db.book.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
