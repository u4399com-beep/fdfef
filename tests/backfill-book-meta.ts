/**
 * 存量书籍元数据回填：修复 cunshu 等站点历史脏数据
 * - 书名垃圾后缀（" 作者：xxx"、尾部章节范围）→ 规整并回填 author
 * - intro 为空 → 用书籍信息规则重抓回填（不碰章节）
 * 用法: bun tests/backfill-book-meta.ts [--dry]
 */
import { db } from '../src/lib/db'
import { normalizeBookMeta, mergeCleaning } from '../src/lib/collect-types'
import { parseFields } from '../src/lib/collect/parser'
import { fetchPage } from '../src/lib/collect/fetcher'
import { cleanIntro } from '../src/lib/collect/cleaner'

async function main() {
  const dry = process.argv.includes('--dry')
  const books = await db.book.findMany({
    where: { sourceName: 'www.cunshu.la' },
    select: { id: true, title: true, author: true, intro: true, sourceUrl: true },
  })
  console.log(`cunshu 存量书籍: ${books.length} 本`)

  const bookRule = await db.collectRule.findUnique({ where: { id: 'cmul1m04f000fp1vjle888704' } })
  if (!bookRule) throw new Error('书籍规则不存在')
  const cfg = JSON.parse(bookRule.config as string)
  const cleaning = mergeCleaning(null)

  let fixed = 0
  for (const b of books) {
    const dirtyTitle = /作者：/.test(b.title) || /\d-\d{2,4}$/.test(b.title)
    const needIntro = !b.intro || b.intro.trim() === ''
    if (!dirtyTitle && !needIntro) continue

    // 1) 本地规整（不联网即可修 title/author）
    const norm = normalizeBookMeta(b.title, b.author)
    const updates: Record<string, string> = {}
    if (norm.changed) {
      updates.title = norm.title
      updates.author = norm.author
    }

    // 2) intro 缺失 → 联网重抓（尊重 180s 锁定期：403 后冷却 190s，最多 3 次）
    if (needIntro && b.sourceUrl) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // rotateUA:false + 固定 UA：WAF 通行 cookie 与 UA 绑定，随机 UA 必 403
          const res = await fetchPage(b.sourceUrl, { strategy: 'http', cookies: cfg.cookies, timeout: 25000, rotateUA: false })
          const parsed = parseFields(res.html, cfg.fields, res.finalUrl)
          if (parsed.intro) {
            updates.intro = cleanIntro(parsed.intro, cleaning)
          }
          break
        } catch (e) {
          const msg = (e as Error).message
          // 403（IP 临时封禁/域名锁定期）：冷却 190s 后重试（超过 domainThrottle 的 180s）
          if (attempt < 3 && /403/.test(msg)) {
            console.log(`  ⏳ 403 封禁，冷却 190s 后重试（第${attempt}/3次）《${b.title.slice(0, 14)}》`)
            await new Promise((r) => setTimeout(r, 190_000))
            continue
          }
          console.log(`  ⚠ 《${b.title.slice(0, 16)}》重抓失败: ${msg.slice(0, 60)}`)
        }
      }
      await new Promise((r) => setTimeout(r, 9000))
    }

    if (Object.keys(updates).length === 0) continue
    if (dry) {
      console.log(`[dry] 《${b.title.slice(0, 22)}》→ 《${(updates.title ?? b.title).slice(0, 22)}》 作者:${updates.author ?? b.author} intro:${updates.intro ? '补' + updates.intro.length + '字' : '无'}`)
    } else {
      await db.book.update({ where: { id: b.id }, data: updates })
      console.log(`✓ 《${(updates.title ?? b.title).slice(0, 22)}》 作者:${updates.author ?? b.author}${updates.intro ? ` intro ${updates.intro.length}字` : ''}`)
    }
    fixed++
  }
  console.log(`完成: ${fixed} 本需要修复`)
  await db.$disconnect()
}

main()
