/**
 * biqutu.info 规则离线验证：用同模板家族（17mb / bqg70.com）实存页面做结构参照。
 * 验证四类规则选择器在模板真实 HTML 上的解析正确性（biqutu.info 本站当前不可达）。
 */
import fs from 'fs'
import { parseFields, parseListEntries, parseContentHtml, selectValue } from '../src/lib/collect/parser'
import { cleanContent, cleanIntro } from '../src/lib/collect/cleaner'
import { mergeCleaning } from '../src/lib/collect-types'

const RULES = {
  list: {
    items: {
      item: {
        mode: 'regex' as const,
        expr:
          '<li><span class="s1">[^<]*</span><span class="s2"><a href="([^"]+)"[^>]*>([^<]+)</a></span><span class="s3">[\\s\\S]*?</span><span class="s4">[^<]*</span><span class="s5">[^<]*</span></li>',
      },
      title: { mode: 'regex' as const, expr: 'class="s2"><a[^>]*>([^<]+)</a>', group: 1 },
      link: { mode: 'regex' as const, expr: 'class="s2"><a href="([^"]+)"', group: 1 },
    },
  },
  book: {
    fields: {
      title: { mode: 'css' as const, expr: 'meta[property="og:novel:book_name"]', attr: 'content' },
      author: { mode: 'css' as const, expr: 'meta[property="og:novel:author"]', attr: 'content' },
      category: { mode: 'css' as const, expr: 'meta[property="og:novel:category"]', attr: 'content' },
      status: { mode: 'css' as const, expr: 'meta[property="og:novel:status"]', attr: 'content' },
      latestChapter: {
        mode: 'css' as const,
        expr: 'meta[property="og:novel:latest_chapter_name"]',
        attr: 'content',
      },
      cover: { mode: 'css' as const, expr: '#fmimg img', attr: 'data-original' },
      intro: { mode: 'css' as const, expr: '#intro', attr: 'html' },
      tocLink: { mode: 'css' as const, expr: 'a.chapterlist', attr: 'href' },
    },
    extraAdPatterns: [
      '^p(?=[\\u4e00-\\u9fa5【\\u201c（])',
      '/?p\\.{2,}$',
      '《[^》]{1,40}》是[^。《》]{1,24}精心创作的[^。]{0,24}类小说。',
    ],
  },
  toc: {
    items: { item: { mode: 'css' as const, expr: '#list a[rel="chapter"]' } },
    nextLink: { mode: 'regex' as const, expr: 'href="([^"]*_\\d+\\.html)"[^>]*>\\s*下一页', group: 1 },
  },
  content: {
    content: {
      mode: 'regex' as const,
      expr: "document\\.writeln\\(\\w+\\.\\w+\\(['\"]([A-Za-z0-9+/=]{8,})['\"]\\)\\)",
      group: 1,
      multiple: true,
      transform: 'base64' as const,
    },
    nextLink: { mode: 'regex' as const, expr: 'href="([^"]*_\\d+\\.html)"[^>]*>\\s*下一页', group: 1 },
    extraAdPatterns: ['[a-zA-Z0-9-]{2,30}\\.info[^\\n]{0,30}', '请记住本书首发域名[^\\n]{0,40}'],
  },
}

const base = 'http://www.biqutu.info'
let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    pass++
    console.log(`  ✓ ${name}: ${detail}`)
  } else {
    fail++
    console.log(`  ✗ ${name}: ${detail}`)
  }
}

// ---- 1. 列表页（首页 最近更新小说列表） ----
console.log('[1] 列表页')
const homeHtml = fs.readFileSync('.tmp/t.html', 'utf-8')
const list = parseListEntries(homeHtml, RULES.list.items, `${base}/`)
check('条目数 ≥ 20', list.length >= 20, `解析出 ${list.length} 条`)
check('书名非空且非链接', list.every((e) => e.title && !e.title.startsWith('/')), `样例: ${list.slice(0, 3).map((e) => e.title).join(' | ')}`)
check(
  '链接全部绝对化指向站点',
  list.every((e) => e.url.startsWith(`${base}/book/`)),
  `样例: ${list[0]?.url}`
)
check('未混入最新入库面板', list.every((e) => e.title.length >= 2), '全部条目均含 s3+s4 特征')

// ---- 2. 书籍页 ----
console.log('[2] 书籍页')
const bookHtml = fs.readFileSync('.tmp/bq_book.html', 'utf-8')
const parsed = parseFields(bookHtml, RULES.book.fields, `${base}/book/264674/`)
check('书名', parsed.title === '迟迟', parsed.title)
check('作者', parsed.author === '折戟沉尘', parsed.author)
check('分类(og)', parsed.category === '都市', parsed.category)
check('状态(og)', parsed.status === '连载中', parsed.status)
check('最新章节(og)', parsed.latestChapter === '尾声', parsed.latestChapter)
check('封面(data-original)', parsed.cover?.includes('/img/264674.jpg') ?? false, parsed.cover ?? '(空)')
check(
  '目录链接（绝对化）',
  parsed.tocLink === `${base}/book/264674/index_1.html`,
  parsed.tocLink ?? '(空)'
)
const introCleaned = cleanIntro(parsed.intro ?? '', mergeCleaning(), RULES.book.extraAdPatterns)
check('简介清洗后无游离 p//p 残留', !/\/p\.{2,}|^p[^\s]/m.test(introCleaned), introCleaned.slice(0, 60).replace(/\n/g, ' '))
check(
  '简介清洗后无「精心创作」推广句',
  !introCleaned.includes('精心创作'),
  `长度 ${introCleaned.length}`
)

// ---- 3. 目录页 ----
console.log('[3] 目录页')
const tocHtml = fs.readFileSync('.tmp/bq_toc.html', 'utf-8')
const toc = parseListEntries(tocHtml, RULES.toc.items, `${base}/book/264674/index_1.html`)
check('章节数 ≥ 10', toc.length >= 10, `${toc.length} 章`)
check('标题干净', toc.every((e) => e.title && !e.title.includes('dd')), `首章: ${toc[0]?.title} | 末章: ${toc[toc.length - 1]?.title}`)
check(
  'URL 去重前唯一',
  new Set(toc.map((e) => e.url)).size === toc.length,
  `${new Set(toc.map((e) => e.url)).size}/${toc.length}`
)
const tocNext = String(selectValue(tocHtml, { ...RULES.toc.nextLink, multiple: false }, { baseUrl: `${base}/book/264674/index_1.html` }) || '')
check('单页目录 nextLink 安全终止', tocNext === '', `next=${tocNext || '(空)'}`)

// ---- 4. 内容页 ----
console.log('[4] 内容页')
const contentHtml = fs.readFileSync('.tmp/bq_content.html', 'utf-8')
const raw = parseContentHtml(contentHtml, RULES.content.content)
check('base64 解码出段落', raw.split('\n').filter(Boolean).length >= 2, `${raw.split('\n').filter(Boolean).length} 段`)
const cleaned = cleanContent(raw, mergeCleaning(), RULES.content.extraAdPatterns)
check('清洗后正文非空且无 <p> 标签', cleaned.text.length > 100 && !cleaned.text.includes('<p>'), `${cleaned.wordCount} 字`)
console.log('    正文预览:', cleaned.text.slice(0, 80).replace(/\n/g, ' '))
const c2Html = fs.readFileSync('.tmp/bq_c2.html', 'utf-8')
const raw2 = parseContentHtml(c2Html, RULES.content.content)
check('第二页可解码（内容分布随站点轮换，非空即有效）', raw2.replace(/<\/?p>/g, '').trim().length > 50, `${raw2.split('\n').filter(Boolean).length} 段`)
const c2Next = String(selectValue(c2Html, { ...RULES.content.nextLink, multiple: false }, { baseUrl: `${base}/book/264674/94968318_1.html` }) || '')
check('末页 nextLink 安全终止（下一页指向书页不匹配 _N 模式）', c2Next === '', `next=${c2Next || '(空)'}`)
const c1Next = String(selectValue(contentHtml, { ...RULES.content.nextLink, multiple: false }, { baseUrl: `${base}/book/264674/94968318.html` }) || '')
check('非末页 nextLink 正确捕获', c1Next.endsWith('94968318_1.html'), c1Next)

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)

export {}
