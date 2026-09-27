/**
 * kelexs.com（可乐小说）采集规则注册：
 * 1. 列表页  2. 书籍信息页（og:novel 元数据）  3. 章节目录页（playwright + JS 下拉翻页）
 * 4. 章节内容页（多页合并 + 广告清洗）
 */
import { Pool } from 'pg'

const BASE = 'http://localhost:3000'

const RULES: { name: string; type: string; config: object }[] = [
  {
    name: '可乐小说-列表页',
    type: 'list',
    config: {
      strategy: 'http',
      timeout: 25000,
      items: {
        item: { mode: 'css', expr: '.dList ul li' },
        title: { mode: 'css', expr: '.name a', attr: 'text' },
        link: { mode: 'css', expr: '.name a', attr: 'href' },
        author: { mode: 'css', expr: '.dlS dd a', attr: 'text' },
        cover: { mode: 'css', expr: '.pic img', attr: 'src' },
      },
      pagination: {
        enabled: true,
        mode: 'nextLink',
        nextLink: { mode: 'regex', expr: 'href="(/list-\\d+-\\d+/)"[^>]*>\\s*\\d+' },
        maxPages: 30,
      },
    },
  },
  {
    name: '可乐小说-书籍信息页',
    type: 'book',
    config: {
      strategy: 'http',
      timeout: 25000,
      fields: {
        title: { mode: 'css', expr: "meta[property='og:novel:book_name']", attr: 'content' },
        author: { mode: 'css', expr: "meta[property='og:novel:author']", attr: 'content' },
        category: { mode: 'css', expr: "meta[property='og:novel:category']", attr: 'content' },
        keywords: { mode: 'css', expr: "meta[name='keywords']", attr: 'content' },
        intro: { mode: 'css', expr: 'div.intro', attr: 'text' },
        cover: { mode: 'css', expr: "meta[property='og:image']", attr: 'content' },
        status: { mode: 'css', expr: "meta[property='og:novel:status']", attr: 'content' },
        latestChapter: { mode: 'css', expr: "meta[property='og:novel:latest_chapter_name']", attr: 'content' },
        tocLink: {
          mode: 'regex',
          expr: 'href="(/chapter/[A-Za-z0-9]+\\.html)"[^>]*>\\s*章节目录',
          group: 1,
        },
      },
      smartCategory: true,
      smartCompletion: true,
      fetchSuggest: true,
      downloadCover: true,
    },
  },
  {
    name: '可乐小说-章节目录页',
    type: 'toc',
    config: {
      strategy: 'playwright',
      timeout: 60000,
      jsPages: {
        enabled: true,
        itemsSelector: '.dropDown li[data-p]',
        triggerSelector: '.selBox .btn',
        skipFirst: true,
        waitAfterClick: 1500,
        maxPages: 30,
      },
      items: {
        item: { mode: 'css', expr: '.chapListBody li' },
        title: { mode: 'css', expr: 'a', attr: 'text' },
        link: { mode: 'css', expr: 'a', attr: 'href' },
      },
      reorder: { enabled: true },
      dedup: { byUrl: true, byTitle: false },
    },
  },
  {
    name: '可乐小说-章节内容页',
    type: 'content',
    config: {
      strategy: 'http',
      timeout: 25000,
      content: { mode: 'css', expr: 'div.content', attr: 'text' },
      pagination: {
        enabled: true,
        mode: 'nextLink',
        nextLink: { mode: 'regex', expr: 'href="(/book/[A-Za-z0-9]+-\\d+-\\d+\\.html)"[^>]*>\\s*下一页' },
        maxConcat: 10,
      },
      extraAdPatterns: ['高能章节[^\\n]{0,90}', '立即阅读[^\\n]{0,90}', '点此报错[^\\n]{0,40}', 'function\\(\\)[^\\n]{0,40}'],
    },
  },
]

async function main() {
  // 1) 拉取现有规则，避免重复注册
  const existing = (await (await fetch(`${BASE}/api/rules`)).json()) as { rules: { id: string; name: string; type: string }[] }
  for (const rule of RULES) {
    const dup = existing.rules.find((r) => r.name === rule.name)
    const res = await fetch(dup ? `${BASE}/api/rules/${dup.id}` : `${BASE}/api/rules`, {
      method: dup ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dup ? { name: rule.name, config: rule.config } : { name: rule.name, type: rule.type, config: rule.config }),
    })
    const body = (await res.json()) as { rule?: { id: string }; error?: string }
    console.log(`${dup ? 'UPDATE' : 'CREATE'} ${rule.name}:`, res.ok ? `OK id=${body.rule?.id}` : body.error)
  }
}
void main()
