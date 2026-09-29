import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parsePagination } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 书籍列表（搜索 / 分类筛选 / 分页） */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const category = req.nextUrl.searchParams.get('category') ?? ''
  // parsePagination 内部用 toInt 防 NaN/Infinity 注入（page=1e999 → skip=Infinity → Prisma 500）
  const { page, pageSize, skip } = parsePagination(req.nextUrl.searchParams, 12, 6, 60)

  const where = {
    ...(q ? { OR: [{ title: { contains: q } }, { author: { contains: q } }, { keywords: { contains: q } }] } : {}),
    ...(category ? { category } : {}),
  }
  const [books, total] = await Promise.all([
    db.book.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.book.count({ where }),
  ])
  return NextResponse.json({ books, total, page, pageSize })
}
