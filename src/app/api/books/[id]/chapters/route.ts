import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parsePagination, RouteCtx } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 章节列表（含正文摘要选项） */
export async function GET(req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const { id } = await params
  const withContent = req.nextUrl.searchParams.get('content') === '1'
  // parsePagination 内部用 toInt 防 NaN/Infinity 注入（page=1e999 → skip=Infinity → Prisma 500）
  const { page, pageSize, skip } = parsePagination(req.nextUrl.searchParams, 100, 10, 500)
  const [chapters, total] = await Promise.all([
    db.chapter.findMany({
      where: { bookId: id },
      orderBy: { order: 'asc' },
      skip,
      take: pageSize,
      select: {
        id: true, title: true, order: true, url: true, wordCount: true, collected: true,
        ...(withContent ? { content: true } : {}),
      },
    }),
    db.chapter.count({ where: { bookId: id } }),
  ])
  return NextResponse.json({ chapters, total, page, pageSize })
}
