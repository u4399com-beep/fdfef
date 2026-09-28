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
  const existing = await db.book.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: '书籍不存在' }, { status: 404 })
  // 站群可能多处引用该书作为主书籍：全部清空 dangling 引用后再删除
  await db.siteConfig.updateMany({ where: { mainBookId: id }, data: { mainBookId: '' } })
  await db.chapter.deleteMany({ where: { bookId: id } })
  await db.book.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
