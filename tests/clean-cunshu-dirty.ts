/**
 * 存量脏数据清理（可复用维护脚本）：cunshu（存书啦）来源书籍。
 * 背景（R6-iter-a）：存量数据 title 带脏后缀（「 作者：xxx」/「1-202」式章节范围）、
 * author 错抓上传者名（规则 author 选择器曾指向 a.ph-uploader-link）。
 *
 * 动作：
 *  1. 列出全部 cunshu 来源书（sourceName 含 cunshu 或 sourceUrl 含 cunshu）
 *  2. 逐本跑 normalizeBookMeta（src/lib/collect-types.ts，与采集管线同款保守规整），
 *     有变化则更新 title/author
 *  3. 【唯一键冲突】Book 有 @@unique([sourceUrl, title])：规整后若与现存记录撞键
 *    （如重采已建干净记录）——干净记录章节更少则把脏记录章节迁移过去（按 url 去重），
 *     否则直接删除脏记录及其章节；删除计划全部打印并写入脚本日志
 *  4. （可选 --blank-uploader-authors）作者名甄别：同一 author 值出现在 ≥2 本 cunshu 书
 *     → 判定为上传者而非作者（真作者不会横跨多本无关书），置空 author
 *
 * 用法: bun tests/clean-cunshu-dirty.ts [--dry-run] [--blank-uploader-authors]
 * 真跑前请先备份数据库（cp db/custom.db db/custom.backup-<tag>.db）。
 * 全程 Prisma 写库，不直接执行 SQL UPDATE；txt 文件删除带路径安全守卫（限 storage/novels 内 .txt）。
 */
import fs from 'fs/promises'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { normalizeBookMeta } from '../src/lib/collect-types'
import { NOVELS_DIR } from '../src/lib/collect/storage'

const db = new PrismaClient() // 不开 query 日志，保持计划输出可读
const DRY = process.argv.includes('--dry-run')
const BLANK = process.argv.includes('--blank-uploader-authors')
const LOG_FILE = path.join('tests', 'clean-cunshu-dirty.log')

let logBuf: string[] = []
function out(msg: string) {
  console.log(msg)
  logBuf.push(msg)
}
async function flushLog() {
  await fs.appendFile(LOG_FILE, logBuf.join('\n') + '\n', 'utf-8')
  logBuf = []
}

/** 尽力删除章节 txt（相对 storage/novels），路径安全守卫与 readChapterTxt 同款 */
async function unlinkTxt(rel: string) {
  if (!rel) return
  const full = path.resolve(NOVELS_DIR, rel)
  if (!full.startsWith(NOVELS_DIR + path.sep) || !full.endsWith('.txt')) return
  try {
    await fs.unlink(full)
    out(`    · [file] 已删除 ${rel}`)
  } catch {
    /* 文件不存在/被占用 → 静默跳过 */
  }
}

/** 删除书行：先清空站群主书籍引用，再删章节与书（文件由调用方负责） */
async function removeBookRow(id: string) {
  await db.siteConfig.updateMany({ where: { mainBookId: id }, data: { mainBookId: '' } })
  await db.chapter.deleteMany({ where: { bookId: id } })
  await db.book.delete({ where: { id } })
}

async function main() {
  out(`=== cunshu 存量脏数据清理 ${DRY ? '[DRY-RUN 预览，不写库]' : '[REAL RUN]'} ${new Date().toISOString()} ===`)
  if (!DRY) out('（提示：真跑前应已备份数据库，如 cp db/custom.db db/custom.backup-r7a.db）')

  // 1) 全量列出 cunshu 来源书
  const books = await db.book.findMany({
    where: { OR: [{ sourceName: { contains: 'cunshu' } }, { sourceUrl: { contains: 'cunshu' } }] },
    include: { _count: { select: { chapters: true } } },
    orderBy: { createdAt: 'asc' },
  })
  out(`\n① cunshu 来源书籍共 ${books.length} 本：`)
  for (const b of books) {
    out(`  - [${b.id}] 《${b.title}》 author=${JSON.stringify(b.author)} chapters=${b._count.chapters} ${b.sourceUrl}`)
  }

  // 2) normalizeBookMeta 规整计划（与采集管线 collectBookInfo 同款调用：默认全开配置）
  const plans: { book: (typeof books)[number]; norm: ReturnType<typeof normalizeBookMeta> }[] = []
  const untouched: (typeof books)[number][] = []
  for (const b of books) {
    const norm = normalizeBookMeta(b.title, b.author)
    if (norm.changed) plans.push({ book: b, norm })
    else untouched.push(b)
  }
  out(`\n② 标题/作者规整命中 ${plans.length} 本（其余 ${untouched.length} 本 normalizeBookMeta 无变化）：`)
  for (const { book, norm } of plans) {
    out(
      `  - 《${book.title}》 author=${JSON.stringify(book.author)} → 《${norm.title}》 author=${JSON.stringify(norm.author)}` +
        `${norm.authorFromTitle ? '（作者由标题署名回填）' : ''}`
    )
  }

  // 3) 上传者作者甄别（opt-in）：仅对规整未触及的书；同一 author 值 ≥2 本 → 上传者
  let blankPlan: { id: string; title: string; author: string }[] = []
  if (BLANK) {
    const byAuthor = new Map<string, (typeof books)[number][]>()
    for (const b of untouched) {
      const a = b.author.trim()
      if (!a) continue
      const arr = byAuthor.get(a) ?? []
      arr.push(b)
      byAuthor.set(a, arr)
    }
    blankPlan = [...byAuthor.values()]
      .filter((arr) => arr.length >= 2)
      .flat()
      .map((b) => ({ id: b.id, title: b.title, author: b.author.trim() }))
    out(`\n③ 上传者作者置空（--blank-uploader-authors）：同一 author 出现在 ≥2 本 cunshu 书 → 判定为上传者名，置空（${blankPlan.length} 本）：`)
    for (const x of blankPlan) out(`  - 《${x.title}》 author=${JSON.stringify(x.author)} → ""`)
  }

  // 4) 执行规整（含唯一键冲突处理）
  out(`\n④ 执行规整（撞键检查按 @@unique([sourceUrl, title])）：`)
  let updated = 0
  let migrated = 0
  let deletedBooks = 0
  for (const { book, norm } of plans) {
    const clash = await db.book.findUnique({
      where: { sourceUrl_title: { sourceUrl: book.sourceUrl, title: norm.title } },
    })
    if (!clash) {
      out(`  - [update] [${book.id}] 《${book.title}》→《${norm.title}》，author ${JSON.stringify(book.author)}→${JSON.stringify(norm.author)}`)
      if (!DRY) await db.book.update({ where: { id: book.id }, data: { title: norm.title, author: norm.author } })
      updated++
      continue
    }
    // 撞键：规整后与现存记录（通常为重采建立的干净记录）重名
    const dirtyChapters = await db.chapter.findMany({ where: { bookId: book.id }, orderBy: { order: 'asc' } })
    const cleanCount = await db.chapter.count({ where: { bookId: clash.id } })
    out(
      `  - [撞键] [${book.id}]《${book.title}》规整后与现存记录 [${clash.id}]《${clash.title}》撞唯一键` +
        `（现存 ${cleanCount} 章 / 脏记录 ${dirtyChapters.length} 章）`
    )
    if (cleanCount < dirtyChapters.length) {
      // 干净记录章节更少 → 迁移脏记录章节（按 url 去重）
      const cleanUrls = new Set(
        (await db.chapter.findMany({ where: { bookId: clash.id }, select: { url: true } })).map((c) => c.url)
      )
      let moved = 0
      let dup = 0
      for (const ch of dirtyChapters) {
        if (cleanUrls.has(ch.url)) {
          out(`    · 重复章节删除（现存记录已有同 url）：${ch.title}（${ch.url || 'no url'}）`)
          if (!DRY) {
            await db.chapter.delete({ where: { id: ch.id } })
            await unlinkTxt(ch.contentLocal)
          }
          dup++
          continue
        }
        cleanUrls.add(ch.url)
        if (!DRY) {
          try {
            await db.chapter.update({ where: { id: ch.id }, data: { bookId: clash.id } })
          } catch {
            // P2002 兜底：并发撞键时删重复行
            await db.chapter.delete({ where: { id: ch.id } }).catch(() => {})
            await unlinkTxt(ch.contentLocal)
            dup++
            continue
          }
        }
        moved++
      }
      out(`    · 章节迁移 ${moved} 章 → [${clash.id}]，重复删除 ${dup} 章，现存记录 totalChapters 重算 → ${cleanCount + moved}`)
      if (!DRY) {
        await db.book.update({ where: { id: clash.id }, data: { totalChapters: cleanCount + moved } })
        await removeBookRow(book.id)
      }
      migrated++
    } else {
      out(`    · 现存记录章节不少于脏记录 → 直接删除脏记录及其 ${dirtyChapters.length} 章（txt 一并清理）`)
      if (!DRY) {
        for (const ch of dirtyChapters) await unlinkTxt(ch.contentLocal)
        await removeBookRow(book.id)
      }
      deletedBooks++
    }
  }

  // 5) 执行上传者作者置空
  if (BLANK && blankPlan.length) {
    out(`\n⑤ 执行上传者作者置空：`)
    for (const x of blankPlan) {
      out(`  - [blank] [${x.id}] 《${x.title}》 author ${JSON.stringify(x.author)} → ""`)
      if (!DRY) await db.book.update({ where: { id: x.id }, data: { author: '' } })
    }
  }

  out(
    `\n完成：规整更新 ${updated} 本、撞键迁移 ${migrated} 本、撞键删除 ${deletedBooks} 本` +
      `${BLANK ? `、作者置空 ${blankPlan.length} 本` : ''}${DRY ? '（DRY-RUN：以上仅为计划，未写库）' : ''}`
  )
  await flushLog()
  await db.$disconnect()
}

void main().catch(async (e) => {
  console.error('清理脚本失败:', e)
  await flushLog().catch(() => {})
  await db.$disconnect()
  process.exitCode = 1
})

export {}
