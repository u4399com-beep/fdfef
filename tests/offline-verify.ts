/** 离线验证 kelexs 选择器（使用已保存的真实页面 HTML） */
import { parseFields, parseListEntries, selectValue } from '../src/lib/collect/parser'
import fs from 'fs'
import { parseContentHtml } from '../src/lib/collect/parser'

const base = 'https://www.kelexs.com'

// ---- 书籍页 ----
const bookHtml = fs.readFileSync('/tmp/kx_book.html', 'utf-8')
const fields = {
  title: { mode: 'css' as const, expr: "meta[property='og:novel:book_name']", attr: 'content' },
  author: { mode: 'css' as const, expr: "meta[property='og:novel:author']", attr: 'content' },
  category: { mode: 'css' as const, expr: "meta[property='og:novel:category']", attr: 'content' },
  status: { mode: 'css' as const, expr: "meta[property='og:novel:status']", attr: 'content' },
  latestChapter: { mode: 'css' as const, expr: "meta[property='og:novel:latest_chapter_name']", attr: 'content' },
  cover: { mode: 'css' as const, expr: "meta[property='og:image']", attr: 'content' },
  intro: { mode: 'css' as const, expr: 'div.intro', attr: 'text' },
  tocLink: { mode: 'regex' as const, expr: 'href="(/chapter/[A-Za-z0-9]+\\.html)"[^>]*>\\s*章节目录', group: 1 },
}
const parsed = parseFields(bookHtml, fields, `${base}/book/G0AIH0.html`)
console.log('BOOK:', JSON.stringify({ ...parsed, intro: parsed.intro?.slice(0, 60) + '...' }, null, 1))

// ---- 目录页 ----
const tocHtml = fs.readFileSync('/tmp/kx_toc_all.html', 'utf-8')
const entries = parseListEntries(tocHtml, {
  item: { mode: 'css', expr: '.chapListBody li' },
  title: { mode: 'css', expr: 'a', attr: 'text' },
  link: { mode: 'css', expr: 'a', attr: 'href' },
}, `${base}/chapter/G0AIH0.html`)
console.log('TOC entries:', entries.length)
console.log('  first:', entries.slice(0, 2).map((e) => `${e.title} ${e.url}`).join(' | '))
console.log('  last:', entries.slice(-2).map((e) => `${e.title} ${e.url}`).join(' | '))
const urls = new Set(entries.map((e) => e.url))
console.log('  unique urls:', urls.size)

// ---- 列表页 ----
const listHtml = fs.readFileSync('/tmp/kx_list.html', 'utf-8')
const listEntries = parseListEntries(listHtml, {
  item: { mode: 'css', expr: '.dList ul li' },
  title: { mode: 'css', expr: '.name a', attr: 'text' },
  link: { mode: 'css', expr: '.name a', attr: 'href' },
  author: { mode: 'css', expr: '.dlS dd a', attr: 'text' },
}, `${base}/list-1/`)
console.log('LIST entries:', listEntries.length)
console.log('  sample:', listEntries.slice(0, 3).map((e) => `${e.title} → ${e.url}`).join(' | '))

// ---- 正文页 ----
const contentHtml = fs.readFileSync('/tmp/kx_content.html', 'utf-8')
const raw = parseContentHtml(contentHtml, { mode: 'css', expr: 'div.content', attr: 'text' })
console.log('CONTENT raw lines:', raw.split('\n').filter(Boolean).length, '| head:', raw.slice(0, 80).replace(/\n/g, ' '))
const next = selectValue(contentHtml, { mode: 'regex', expr: 'href="(/book/[A-Za-z0-9]+-\\d+-\\d+\\.html)"[^>]*>\\s*下一页', multiple: false }, { baseUrl: `${base}/book/G0AIH0-1.html` })
console.log('NEXT LINK:', next)

export {}
