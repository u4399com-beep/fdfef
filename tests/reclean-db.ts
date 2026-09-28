/**
 * 存量章节再清洗：清洗规则升级后（裸域名行 / 站点话术 / 纯标点行），
 * 对已入库正文按其来源站的 extraAdPatterns 重新清洗并回写（db + txt）。
 * 用法: bun tests/reclean-db.ts [domain-filter，如 rqwb.com]
 */
import { db } from '../src/lib/db'
import { mergeCleaning } from '../src/lib/collect-types'
import { cleanContent } from '../src/lib/collect/cleaner'
import { saveChapterTxt } from '../src/lib/collect/storage'

async function main() {
  const domainFilter = process.argv[2] ?? ''
  const rules = await db.collectRule.findMany({ where: { type: 'content' } })
  const ruleByDomain: { match: string; patterns: string[] }[] = []
  for (const r of rules) {
    try {
      const cfg = JSON.parse(r.config) as { extraAdPatterns?: string[] }
      const m = r.name.match(/[\u4e00-\u9fa5a-zA-Z]+-/)
      // 以规则名前缀粗略关联：从配置里拿不到域名，用书源 URL 匹配站点名关键字
      const keyword =
        r.name.includes('存书啦') ? 'cunshu' : r.name.includes('人气完本') ? 'rqwb' : r.name.includes('可乐') ? 'kelexs' : ''
      if (keyword) ruleByDomain.push({ match: keyword, patterns: cfg.extraAdPatterns ?? [] })
      void m
    } catch {
      /* ignore */
    }
  }

  const cleaning = mergeCleaning()
  const books = await db.book.findMany({
    where: domainFilter ? { sourceUrl: { contains: domainFilter } } : undefined,
    include: { chapters: true },
  })
  let totalCleaned = 0
  let totalLines = 0
  for (const book of books) {
    const keyword =
      book.sourceUrl.includes('cunshu') ? 'cunshu' : book.sourceUrl.includes('rqwb') ? 'rqwb' : book.sourceUrl.includes('kelexs') ? 'kelexs' : ''
    const extra = ruleByDomain.find((r) => r.match === keyword)?.patterns ?? []
    let bookChanged = 0
    for (const ch of book.chapters) {
      const src = ch.content || (ch.contentLocal ? await import('fs/promises').then((f) => f.readFile(`storage/novels/${ch.contentLocal}`, 'utf-8').catch(() => '')) : '')
      if (!src) continue
      const before = src.replace(/\s/g, '').length
      const result = cleanContent(src, cleaning, extra)
      // 仅在确实移除了内容（行数或字符变化）时回写
      if (result.removedLines > 0) {
        const text = result.text
        const data: { content?: string; contentLocal?: string; wordCount: number } = {
          wordCount: text.replace(/\s/g, '').length,
        }
        if (ch.content) data.content = text
        if (ch.contentLocal) {
          data.contentLocal = await saveChapterTxt(book.title, { title: ch.title, order: ch.order, content: text })
        }
        await db.chapter.update({ where: { id: ch.id }, data })
        bookChanged++
        totalLines += result.removedLines
        void before
      }
    }
    if (bookChanged) {
      console.log(`《${book.title}》再清洗 ${bookChanged}/${book.chapters.length} 章`)
      totalCleaned += bookChanged
    }
  }
  console.log(`完成：共再清洗 ${totalCleaned} 章，移除 ${totalLines} 行广告/噪声`)
  await db.$disconnect()
}
void main()
