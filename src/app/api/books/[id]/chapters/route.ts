import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toInt } from '../../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 章节列表（含正文摘要选项） */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const withContent = req.nextUrl.searchParams.get('content') === '1'
  const page = toInt(req.nextUrl.searchParams.get('page'), 1, 1)
  const pageSize = toInt(req.nextUrl.searchParams.get('pageSize'), 100, 10, 500)
  const [chapters, total] = await Promise.all([
    db.chapter.findMany({
      where: { bookId: id },
      orderBy: { order: 'asc' },
      skip: (page - 1) * pageSize,
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
