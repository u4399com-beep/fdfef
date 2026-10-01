import { NextRequest } from 'next/server'
import { Prisma, type Book } from '@prisma/client'
import { db } from '@/lib/db'
import { json, parsePagination } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * q 搜索的 LIKE 字面化：实测 Prisma 的 contains 对 SQLite 生成不带 ESCAPE 子句的
 * LIKE，用户输入里的 % _ 会被当通配符（搜「100%」等价于搜「100」）；
 * 而把输入预转义成 \% 后仍走 contains 也不成立（无 ESCAPE 时反斜杠按字面参与匹配，
 * 只会查空）。故带 q 的搜索改走参数化 raw SQL + ESCAPE '\'（R7-iter-a 探针实测：
 * 「100%」只命中含字面 100% 的书、「a_c」只命中含字面 a_c 的书，COUNT 聚合返回
 * BigInt 需 Number() 归一，SELECT * 的日期/整数列映射与 Prisma 模型一致）。
 */
function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (m) => '\\' + m)
}

/** 书籍列表（搜索 / 分类筛选 / 分页） */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const category = req.nextUrl.searchParams.get('category') ?? ''
  // parsePagination 内部用 toInt 防 NaN/Infinity 注入（page=1e999 → skip=Infinity → Prisma 500）
  const { page, pageSize, skip } = parsePagination(req.nextUrl.searchParams, 12, 6, 60)

  if (q) {
    const like = `%${escapeLike(q)}%`
    // ESCAPE 字符走绑定参数（SQLite 允许），避免模板字符串里的反斜杠转义歧义
    const bs = '\\'
    const likeCond = Prisma.sql`(title LIKE ${like} ESCAPE ${bs} OR author LIKE ${like} ESCAPE ${bs} OR keywords LIKE ${like} ESCAPE ${bs})`
    const cond = category ? Prisma.sql`${likeCond} AND (category = ${category})` : likeCond
    const [books, countRows] = await Promise.all([
      db.$queryRaw<Book[]>`SELECT * FROM Book WHERE ${cond} ORDER BY "updatedAt" DESC LIMIT ${pageSize} OFFSET ${skip}`,
      db.$queryRaw<[{ n: bigint }]>`SELECT COUNT(*) AS n FROM Book WHERE ${cond}`,
    ])
    const catRows = await db.$queryRaw<[{ category: string | null; n: bigint }]>`SELECT category, COUNT(*) AS n FROM Book GROUP BY category ORDER BY COUNT(*) DESC`
    return json({ books, total: Number(countRows[0]?.n ?? 0), page, pageSize, categories: catRows.map((r) => r.category || '其他') })
  }

  const where = {
    ...(category ? { category } : {}),
  }
  const [books, total, catRows] = await Promise.all([
    db.book.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip,
      take: pageSize,
    }),
    db.book.count({ where }),
    // 全量分类聚合（不受本页筛选影响）：分类筛选 chips 由此派生，而非仅当前页 12 本的局部分类
    db.$queryRaw<[{ category: string | null; n: bigint }]>`SELECT category, COUNT(*) AS n FROM Book GROUP BY category ORDER BY COUNT(*) DESC`,
  ])
  return json({ books, total, page, pageSize, categories: catRows.map((r) => r.category || '其他') })
}
