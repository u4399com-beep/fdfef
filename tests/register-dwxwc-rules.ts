/**
 * dwxwc.com（大文学无错）四类规则注册 —— 2026-10 站点改版适配
 *
 * 旧结构（yckceo 书源 7928 转换，.bookbox/.booktitle/#list-chapterAll）已随站方模板
 * 重构失效（列表 0 项/书名解析为空），新结构实探结论：
 *   - 分类列表页 /sort/{cat}/{page}/：推荐位(.layout dl) + 文本行 ul.txt-list li
 *     （span.s1 分类 / span.s2 书名+书籍链接 /index/N/ / span.s3 最新章 / span.s4 作者）
 *   - 书目页 /index/N/：杰奇系 og:novel meta 全套（与 101kks 同族），目录内嵌于本页
 *     两个 ul.section-list（「最新章节」12 条 + 「正文」50 条/页），正文区
 *     #indexselect 原生 select 分页（/index/N/ = 1-50章，/index/N/2/ = 51-72章）
 *   - 章节页 /read/{book}/{ch}.html：div#content 不变，仍走旧选择器
 * 去重：站点自身存在共享 URL 数据缺陷（如第4/5章同指一个 URL，实测该 URL 仅服务
 *   第4章内容），byUrl 去重忠实保留 62 个可读章节、不存重复正文。
 * 反反爬：GoEdge 系 WAF（R20 HTTP 求解通道）+ IP 硬 403 冷却；固定 UA +
 *   throttleGap=2500 宽限流 + iv8Cookies 通道声明。
 */
import { db } from '../src/lib/db'

const FIXED_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const COMMON = {
  strategy: 'http',
  timeout: 30000,
  rotateUA: false,
  throttleGap: 2500,
  iv8Cookies: true,
  headers: { 'User-Agent': FIXED_UA },
}

const RULES: { name: string; type: string; config: Record<string, unknown> }[] = [
  {
    name: '大文学无错-列表页',
    type: 'list',
    config: {
      ...COMMON,
      items: {
        item: { mode: 'css', expr: 'ul.txt-list li' },
        title: { mode: 'css', expr: '.s2 a', attr: 'text' },
        link: { mode: 'css', expr: '.s2 a', attr: 'href' },
        author: { mode: 'css', expr: '.s4', attr: 'text' },
        category: { mode: 'css', expr: '.s1 a', attr: 'text' },
        latestChapter: { mode: 'css', expr: '.s3 a', attr: 'text' },
      },
      pagination: {
        enabled: true,
        mode: 'template',
        urlTemplate: 'https://www.dwxwc.com/sort/1/{page}/',
        startPage: 1,
        endPage: 5,
        maxPages: 50,
      },
    },
  },
  {
    name: '大文学无错-书籍信息页',
    type: 'book',
    config: {
      ...COMMON,
      fields: {
        title: { mode: 'css', expr: "meta[property='og:novel:book_name']", attr: 'content' },
        author: { mode: 'css', expr: "meta[property='og:novel:author']", attr: 'content' },
        category: { mode: 'css', expr: "meta[property='og:novel:category']", attr: 'content' },
        status: { mode: 'css', expr: "meta[property='og:novel:status']", attr: 'content' },
        latestChapter: { mode: 'css', expr: "meta[property='og:novel:lastest_chapter_name']", attr: 'content' },
        cover: { mode: 'css', expr: "meta[property='og:image']", attr: 'content' },
        intro: { mode: 'css', expr: "meta[property='og:description']", attr: 'content' },
        tocLink: { mode: 'css', expr: "meta[property='og:novel:read_url']", attr: 'content' },
      },
      smartCategory: true,
      smartCompletion: true,
      fetchSuggest: true,
      downloadCover: true,
    },
  },
  {
    name: '大文学无错-章节目录页',
    type: 'toc',
    config: {
      ...COMMON,
      // 书目页即目录页：两个 section-list（最新章节+正文）一并捕获，
      // select 模式枚举 #indexselect option（第 1 页 option 与起始页相同被跳过）
      items: { item: { mode: 'css', expr: 'ul.section-list li a' } },
      pagination: {
        enabled: true,
        mode: 'select',
        nextLink: { mode: 'css', expr: '#indexselect option', attr: 'value' },
        maxPages: 5,
      },
      dedup: { byUrl: true, byTitle: false },
      reorder: { enabled: true },
    },
  },
  {
    name: '大文学无错-章节内容页',
    type: 'content',
    config: {
      ...COMMON,
      content: { mode: 'css', expr: '#content', attr: 'html' },
      extraAdPatterns: [
        '大文学无错[^\\n]{0,60}',
        'www\\.dwxwc\\.com[^\\n]{0,40}',
        '请记住本书首发域名[^\\n]{0,40}',
        '最新章节.{0,20}网址[^\\n]{0,40}',
        '[a-zA-Z0-9-]{2,30}\\.(com|net|cc|la|org|top|xyz)\\s*$',
      ],
    },
  },
]

async function main() {
  for (const r of RULES) {
    const existing = await db.collectRule.findFirst({ where: { name: r.name, type: r.type } })
    if (existing) {
      await db.collectRule.update({ where: { id: existing.id }, data: { config: JSON.stringify(r.config) } })
      console.log(`updated: ${r.type} / ${r.name} (${existing.id})`)
    } else {
      const created = await db.collectRule.create({
        data: { name: r.name, type: r.type, config: JSON.stringify(r.config) },
      })
      console.log(`created: ${r.type} / ${r.name} (${created.id})`)
    }
  }
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
