import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 书籍列表（搜索 / 分类筛选 / 分页） */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const category = req.nextUrl.searchParams.get('category') ?? ''
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') ?? 1))
  const pageSize = Math.min(60, Math.max(6, Number(req.nextUrl.searchParams.get('pageSize') ?? 12)))

  const where = {
    ...(q ? { OR: [{ title: { contains: q } }, { author: { contains: q } }, { keywords: { contains: q } }] } : {}),
    ...(category ? { category } : {}),
  }
  const [books, total] = await Promise.all([
    db.book.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.book.count({ where }),
  ])
  return NextResponse.json({ books, total, page, pageSize })
}
