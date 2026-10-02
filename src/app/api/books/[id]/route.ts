import { NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { db } from '@/lib/db'
import { COVERS_DIR, NOVELS_DIR } from '@/lib/collect/storage'
import { json, RouteCtx } from '../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(_req)
  if (denied) return denied
  const { id } = await params
  const book = await db.book.findUnique({ where: { id } })
  if (!book) return json({ error: '书籍不存在' }, { status: 404 })
  return json({ book })
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx<{ id: string }>) {
  const denied = requireAuth(_req)
  if (denied) return denied
  const { id } = await params
  const existing = await db.book.findUnique({
    where: { id },
    select: { id: true, coverLocal: true, chapters: { select: { contentLocal: true } } },
  })
  if (!existing) return json({ error: '书籍不存在' }, { status: 404 })
  // 站群可能多处引用该书作为主书籍：全部清空 dangling 引用后再删除
  await db.$transaction([
    db.siteConfig.updateMany({ where: { mainBookId: id }, data: { mainBookId: '' } }),
    db.chapter.deleteMany({ where: { bookId: id } }),
    db.book.delete({ where: { id } }),
  ])
  // 事务成功后尽力清理磁盘孤儿文件：章节 txt（storageMode=txt/both 的书）+ 封面 webp。
  // 文件不存在静默跳过；清理失败不回滚删除（主体已删成功），仅记 warn 不向调用方报 500
  await cleanupBookFiles(existing.chapters.map((c) => c.contentLocal), existing.coverLocal)
  return json({ ok: true })
}

/** 删除书籍后的磁盘清理（尽力而为）：章节 txt + 封面 webp + 清空后的书目录 */
async function cleanupBookFiles(contentLocals: string[], coverLocal: string) {
  try {
    const dirs = new Set<string>()
    for (const rel of contentLocals) {
      if (!rel) continue
      const full = path.resolve(NOVELS_DIR, rel)
      // 与 readChapterTxt 同款路径安全守卫：仅允许 novels 目录内的 .txt 文件
      if (!full.startsWith(NOVELS_DIR + path.sep) || !full.endsWith('.txt')) continue
      await fs.unlink(full).catch(() => {}) // 文件不存在（db 模式/已缺失）静默跳过
      dirs.add(path.dirname(full))
    }
    // 书目录清空后移除目录本身：rmdir 仅对空目录成功，同名书共享目录时不会误伤他人文件
    for (const dir of dirs) await fs.rmdir(dir).catch(() => {})
    if (coverLocal && /^[\w-]+\.webp$/.test(coverLocal)) {
      await fs.unlink(path.join(COVERS_DIR, coverLocal)).catch(() => {})
    }
  } catch (e) {
    console.warn('[books] 删除书籍后的文件清理失败（不影响删除结果）:', e)
  }
}
