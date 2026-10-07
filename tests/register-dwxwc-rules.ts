/**
 * dwxwc.com（大文学无错）四类规则注册
 * 来源：yckceo 书源 7928 https://www.yckceo.com/yuedu/shuyuan/json/id/7928.json
 * 转换：Legado(jsoup 简写) → 本系统 CollectRule.config（css/regex/xpath 三合一 JSON）
 *   class.bookbox            → .bookbox
 *   class.bookname@tag.a@text → .bookname a / text
 *   id.list-chapterAll@tag.dd@tag.a → #list-chapterAll dd a
 *   ##作者： 前缀剥离 → pipeline 作者字段规整（系统性支持，无需规则层处理）
 * 注：原 JSON 含 U+2011 非断行连字符（User‑Agent/list‑chapterAll），已归一化为 ASCII '-'。
 * 反反爬配置：站点为 GoEdge 系 WAF（实测 307→验证码挑战，R20 HTTP 求解通道可直接复用）；
 *   rotateUA=false 固定 UA（通行 cookie 与 UA 绑定）+ throttleGap=2500 宽限流
 *   （实测 0.8s 间隔连发触发 IP 硬 403）+ iv8Cookies 通道声明。
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
        item: { mode: 'css', expr: '.bookbox' },
        title: { mode: 'css', expr: '.bookname a', attr: 'text' },
        link: { mode: 'css', expr: '.bookname a', attr: 'href' },
        author: { mode: 'css', expr: '.author', attr: 'text' },
        cover: { mode: 'css', expr: '.bookbox img', attr: 'src' },
        latestChapter: { mode: 'css', expr: '.cat a', attr: 'text' },
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
        title: { mode: 'css', expr: '.booktitle', attr: 'text' },
        author: { mode: 'css', expr: '.booktag a', attr: 'text' },
        category: { mode: 'css', expr: '.booktag span', attr: 'text' },
        cover: { mode: 'css', expr: '.bookcover img', attr: 'src' },
        intro: { mode: 'css', expr: '.bookintro', attr: 'html' },
        latestChapter: { mode: 'css', expr: '.bookchapter', attr: 'text' },
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
      items: { item: { mode: 'css', expr: '#list-chapterAll dd a' } },
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
