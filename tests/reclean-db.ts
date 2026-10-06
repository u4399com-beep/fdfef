/**
 * 存量章节再清洗：清洗规则升级后（内置噪声层/行内URL剥离/章首垃圾/重复推广行），
 * 对已入库正文按其来源站的 extraAdPatterns 重新清洗并回写（db + txt）。
 * 幂等：已干净的章节 removedLines=0 不回写。
 * 用法: bun tests/reclean-db.ts [domain-filter，如 rqwb.com]
 */
import { db } from '../src/lib/db'
import { mergeCleaning } from '../src/lib/collect-types'
import { cleanContent } from '../src/lib/collect/cleaner'
import { saveChapterTxt } from '../src/lib/collect/storage'
import { readFile } from 'fs/promises'

async function main() {
  const domainFilter = process.argv[2] ?? ''
  const rules = await db.collectRule.findMany({ where: { type: 'content' } })
  const ruleByDomain: { match: string; patterns: string[] }[] = []
  for (const r of rules) {
    try {
      const cfg = JSON.parse(r.config) as { extraAdPatterns?: string[] }
      // 以规则名前缀粗略关联：从配置里拿不到域名，用书源 URL 匹配站点名关键字
      const keyword =
        r.name.includes('存书啦') ? 'cunshu' : r.name.includes('人气完本') ? 'rqwb' : r.name.includes('可乐') ? 'kelexs' : r.name.includes('笔趣阁') ? 'biqutu' : ''
      if (keyword) ruleByDomain.push({ match: keyword, patterns: cfg.extraAdPatterns ?? [] })
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
  const sampleAgg = new Map<string, number>()
  for (const book of books) {
    const keyword =
      book.sourceUrl.includes('cunshu') ? 'cunshu' : book.sourceUrl.includes('rqwb') ? 'rqwb' : book.sourceUrl.includes('kelexs') ? 'kelexs' : book.sourceUrl.includes('biqutu') ? 'biqutu' : ''
    const extra = ruleByDomain.find((r) => r.match === keyword)?.patterns ?? []
    let bookChanged = 0
    for (const ch of book.chapters) {
      const src = ch.content || (ch.contentLocal ? await readFile(`storage/novels/${ch.contentLocal}`, 'utf-8').catch(() => '') : '')
      if (!src) continue
      // 循环收敛：章首垃圾移除后行位前移可能暴露新命中（第 2+ 轮），最多 4 轮直至本轮无实质变化。
      // 判断用「去空白后文本比较」而非 removedLines：行内部分剥离（token 剥除行保留）removedLines=0 但文本已变
      let text = src
      let round = 0
      let totalRemoved = 0
      const samples: string[] = []
      let prevNorm = src.replace(/\s/g, '')
      for (;;) {
        const result = cleanContent(text, cleaning, extra, { bookTitle: book.title, chapterTitle: ch.title })
        const nextNorm = result.text.replace(/\s/g, '')
        const changed = nextNorm !== prevNorm
        if (changed) {
          text = result.text
          totalRemoved += result.removedLines
          for (const s of result.removedSamples) samples.push(s)
          prevNorm = nextNorm
        }
        if (!changed || ++round >= 4) break
      }
      if (text !== src) {
        const data: { content?: string; contentLocal?: string; wordCount: number } = {
          wordCount: text.replace(/\s/g, '').length,
        }
        if (ch.content) data.content = text
        if (ch.contentLocal) {
          data.contentLocal = await saveChapterTxt(book.title, { title: ch.title, order: ch.order, content: text })
        }
        await db.chapter.update({ where: { id: ch.id }, data })
        bookChanged++
        totalLines += totalRemoved
        for (const s of samples) sampleAgg.set(s, (sampleAgg.get(s) ?? 0) + 1)
      }
    }
    if (bookChanged) {
      console.log(`《${book.title}》再清洗 ${bookChanged}/${book.chapters.length} 章`)
      totalCleaned += bookChanged
    }
  }
  console.log(`完成：共再清洗 ${totalCleaned} 章，移除 ${totalLines} 行广告/噪声`)
  if (sampleAgg.size) {
    const top = [...sampleAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    console.log('移除样本 TOP15（行 × 次数）:')
    for (const [s, n] of top) console.log(`  ${String(n).padStart(4)}× ${s}`)
  }
  await db.$disconnect()
}
void main()

export {}
