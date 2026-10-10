/**
 * biqutu.info → bqgbe.com（笔趣阁镜像）四类规则注册 —— 2026-10 第二次改版适配
 *
 * 首改（10月初）：biqutu.info 302 → bqgbe.com biquge/pc 主题（ul.list_l1 li / a.btn-mulu / yanqing_list）。
 * 二改（本轮实测探明）：镜像切换为杰奇系 mobile 模板（与 dwxwc 同族）——
 *   - 分类列表页 /fenlei/lastupdate_{cat}_0_0_{page}.html（旧 /fenlei/{cat}/{page}.html 仍 200 兼容）：
 *     ul.sort_list li（span.s1 [分类] / span.s2>a 书名+链接 /slug六字缀/（title=最新章）/
 *     span.s4 作者 / span.s5 日期），下一页 a[href*=lastupdate]「下一页」→ XPath 精确匹配跟随。
 *   - 书籍页 /slug/：og:novel meta 全套不变（latest_chapter_name 正拼写）；目录链入口 a.btn-mulu 不变。
 *   - 目录链 /slug/ml{N}.html：容器 ul.yanqing_list → ul.chapter-list（100 章/窗、窗内乱序、
 *     窗间重叠、各页重复最新块特性不变）→ 纯 HTTP nextLink a.y「下一页」+ reorder + byUrl 吸收。
 *   - 章节页：17mb 家族 JS 段落加密不变（document.writeln(随机名.随机名('base64'))），原样兼容。
 */
import { db } from '../src/lib/db'

const SITE = 'https://www.bqgbe.com'

const COMMON = {
  strategy: 'http',
  timeout: 25000,
  rotateUA: true,
  throttleGap: 1200,
  mirrorUrls: [SITE],
}

// 17mb 家族简介方言：行首游离 p、行尾 /p... 转义残留、《书名》是XX精心创作的XX类小说。推广句
const BIQUTU_INTRO_ADS = [
  '^p(?=[\\u4e00-\\u9fa5【\\u201c（])',
  '/?p\\.{2,}$',
  '《[^》]{1,40}》是[^。《》]{1,24}精心创作的[^。]{0,24}类小说。',
]

// 内容页方言：本站域名话术（默认清洗已含通用域名/笔趣阁模式，这里补 info/com 域与家族变体）
const BIQUTU_CONTENT_ADS = [
  '[a-zA-Z0-9-]{2,30}\\.(info|com)[^\\n]{0,30}',
  '请记住本书首发域名[^\\n]{0,40}',
]

const RULES: { name: string; type: string; config: Record<string, unknown> }[] = [
  {
    name: '笔趣阁biqutu-列表页',
    type: 'list',
    config: {
      ...COMMON,
      items: {
        item: { mode: 'css', expr: 'ul.sort_list li' },
        title: { mode: 'css', expr: '.s2 a', attr: 'text' },
        link: { mode: 'css', expr: '.s2 a', attr: 'href' },
        author: { mode: 'css', expr: '.s4', attr: 'text' },
        category: { mode: 'css', expr: '.s1', attr: 'text' },
      },
      pagination: {
        enabled: true,
        mode: 'nextLink',
        // 「下一页」锚点 href 含 lastupdate（/fenlei/lastupdate_1_0_0_2.html），
        // 上一页/分类导航均不含该词组合 → 双条件 XPath 天然排除
        nextLink: {
          mode: 'xpath',
          expr: "//a[contains(@href,'lastupdate') and contains(text(),'下一页')]",
          attr: 'href',
        },
        maxPages: 3,
      },
    },
  },
  {
    name: '笔趣阁biqutu-书籍信息页',
    type: 'book',
    config: {
      ...COMMON,
      fields: {
        title: { mode: 'css', expr: 'meta[property="og:novel:book_name"]', attr: 'content' },
        author: { mode: 'css', expr: 'meta[property="og:novel:author"]', attr: 'content' },
        category: { mode: 'css', expr: 'meta[property="og:novel:category"]', attr: 'content' },
        status: { mode: 'css', expr: 'meta[property="og:novel:status"]', attr: 'content' },
        latestChapter: {
          mode: 'css',
          expr: 'meta[property="og:novel:latest_chapter_name"]',
          attr: 'content',
        },
        cover: { mode: 'css', expr: 'meta[property="og:image"]', attr: 'content' },
        intro: { mode: 'css', expr: 'meta[property="og:description"]', attr: 'content' },
        // 全量目录链入口（ml1 起链，纯 HTTP 跟随 a.y「下一页」）
        tocLink: { mode: 'css', expr: 'a.btn-mulu', attr: 'href' },
      },
      smartCategory: true,
      smartCompletion: true,
      fetchSuggest: true,
      downloadCover: true,
      extraAdPatterns: BIQUTU_INTRO_ADS,
    },
  },
  {
    name: '笔趣阁biqutu-章节目录页',
    type: 'toc',
    config: {
      ...COMMON,
      items: {
        item: { mode: 'css', expr: 'ul.chapter-list li a' },
      },
      pagination: {
        enabled: true,
        mode: 'nextLink',
        // 仅匹配 class="y" 且文本含「下一页」的锚点（上一页 class="z" 天然排除；
        // 末页无下一页按钮 → nextLink 为空自然终止，循环防护由 paginated visited 集兜底）
        nextLink: {
          mode: 'xpath',
          expr: "//a[@class='y' and contains(text(),'下一页')]",
          attr: 'href',
        },
        maxPages: 30,
      },
      reorder: { enabled: true },
      dedup: { byUrl: true, byTitle: false },
    },
  },
  {
    name: '笔趣阁biqutu-章节内容页',
    type: 'content',
    config: {
      ...COMMON,
      content: {
        // 17mb 家族 JS 段落加密：document.writeln(随机名.随机名('base64')) → 解码出 <p>段落</p>
        // 注意：混淆函数名（如 lymv.hro）每次请求随机轮换，只能按结构通配
        mode: 'regex',
        expr: "document\\.writeln\\(\\w+\\.\\w+\\(['\"]([A-Za-z0-9+/=]{8,})['\"]\\)\\)",
        group: 1,
        multiple: true,
        transform: 'base64',
      },
      pagination: {
        enabled: true,
        mode: 'nextLink',
        nextLink: { mode: 'regex', expr: 'href="([^"]*_\\d+\\.html)"[^>]*>\\s*下一页', group: 1 },
        maxPages: 10,
        maxConcat: 10,
      },
      extraAdPatterns: BIQUTU_CONTENT_ADS,
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
  console.log(`\n站点基准 URL：${SITE}（规则内均为相对解析，列表链接将自动拼接站点域名）`)
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
