/**
 * 章节采集提速 A/B 基准（通用版）：同一本书，polite（=旧版固定间隔行为）vs fast（自适应巡航 0.3× 下限）
 * 两档全量重采计时对比。档位同时写 SystemConfig.collect（防 15s 惰性刷新回切）+ 进程内直切。
 *
 * 用法：bun tests/bench-collect-speed.ts <规则前缀> <列表页URL> <polite|fast> [bookUrl]
 * 例：  bun tests/bench-collect-speed.ts 存书啦 "https://www.cunshu.la/library.php?sort=latest&page=1" polite
 */
import { PrismaClient } from '@prisma/client'
import { testRule } from '../src/lib/collect/testing'
import { executeTask } from '../src/lib/collect/pipeline'
import { applyCollectSpeed } from '../src/lib/collect/fetcher'
import { invalidateCollectSpeedCache } from '../src/lib/collect/system-config'
import { removeChapterTxt } from '../src/lib/collect/storage'

const db = new PrismaClient({ log: ['warn', 'error'] })

const [prefix, listUrl, tierArg, explicitBook] = process.argv.slice(2)
if (!prefix || !listUrl || (tierArg !== 'polite' && tierArg !== 'fast')) {
  console.error('用法: bun tests/bench-collect-speed.ts <规则前缀> <列表页URL> <polite|fast> [bookUrl]')
  process.exit(1)
}
const tier = tierArg as 'polite' | 'fast'

async function pickBookUrl(): Promise<string> {
  if (explicitBook) return explicitBook
  const listRule = await db.collectRule.findFirst({ where: { name: { startsWith: prefix }, type: 'list' } })
  if (!listRule) throw new Error(`未找到 ${prefix} 列表规则`)
  const r = await testRule('list', JSON.parse(listRule.config), listUrl)
  const urls = ((r.data?.sample ?? []) as { url?: string }[])
    .map((s) => s.url)
    .filter((u): u is string => !!u && /^https?:\/\//.test(u))
  if (urls.length === 0) throw new Error('列表未解析出书籍 URL')
  console.log(`候选 ${urls.length} 本，取第 2 本: ${urls[1] ?? urls[0]}`)
  return urls[1] ?? urls[0]
}

async function resetBook(bookUrl: string): Promise<void> {
  const book = await db.book.findFirst({ where: { sourceUrl: bookUrl } })
  if (!book) return
  const chapters = await db.chapter.findMany({ where: { bookId: book.id }, select: { contentLocal: true } })
  for (const c of chapters) if (c.contentLocal) await removeChapterTxt(c.contentLocal)
  await db.chapter.deleteMany({ where: { bookId: book.id } })
  await db.book.delete({ where: { id: book.id } })
  console.log(`已清理旧数据：《${book.title}》(${chapters.length} 章)`)
}

async function runTier(bookUrl: string, ruleIds: { book: string; toc: string; content: string }): Promise<void> {
  await resetBook(bookUrl)
  await db.systemConfig.upsert({
    where: { id: 'main' },
    create: { id: 'main', collect: JSON.stringify({ speed: tier }) },
    update: { collect: JSON.stringify({ speed: tier }) },
  })
  applyCollectSpeed(tier)
  invalidateCollectSpeedCache()
  const t0 = Date.now()
  const task = await db.collectTask.create({
    data: {
      name: `提速基准-${prefix}-${tier}`,
      targetType: 'single',
      targetUrls: JSON.stringify([bookUrl]),
      bookRuleId: ruleIds.book,
      tocRuleId: ruleIds.toc,
      contentRuleId: ruleIds.content,
      mode: 'full',
      storageMode: 'db',
      threadMin: 3,
      threadMax: 3,
      intervalMin: 500,
      intervalMax: 2000,
      status: 'running',
    },
  })
  await executeTask(task.id)
  const ms = Date.now() - t0
  const done = await db.collectTask.findUnique({ where: { id: task.id } })
  const stats = JSON.parse((done?.stats ?? '{}') as string) as { contents?: number; errors?: number }
  const book = await db.book.findFirst({ where: { sourceUrl: bookUrl } })
  const chapters = book?.totalChapters ?? stats.contents ?? 0
  console.log(
    `\n【${prefix} / ${tier}】耗时 ${(ms / 1000).toFixed(1)}s，章节 ${chapters}，正文 ${stats.contents ?? 0}，错误 ${stats.errors ?? 0}，均章 ${(ms / Math.max(1, chapters) / 1000).toFixed(2)}s`
  )
  await db.collectTask.delete({ where: { id: task.id } })
}

async function main() {
  const bookUrl = await pickBookUrl()
  const pick = async (type: string) => {
    const r = await db.collectRule.findFirst({ where: { name: { startsWith: prefix }, type } })
    if (!r) throw new Error(`未找到 ${prefix}-${type} 规则`)
    return r.id
  }
  const ruleIds = { book: await pick('book'), toc: await pick('toc'), content: await pick('content') }
  await runTier(bookUrl, ruleIds)
  console.log(`\n（基准单档完成：${prefix} ${tier}。与另一档输出对比即得提速比。）`)
  process.exit(0)
}

void main()
