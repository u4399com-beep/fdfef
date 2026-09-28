/**
 * biqutu.info（笔趣阁 · 17mb 模板家族）采集规则注册：
 *  - 站点结构参照同模板家族实活站点 bqg70.com 的真实 HTML 逆向得出
 *    （biqutu.info 本站在本环境全部出口均超时，疑似宕机/封锁，规则就绪待站点可达）。
 *  - 列表页：首页「最近更新小说列表」面板；该面板 li 独有 s3(最新章节)+s4(作者) 两个 span，
 *    以此与「最新入库」（仅 s1+s2+s5）区分，正则锚定防误抓其它面板。
 *  - 书籍页：og:novel:* 元数据全家桶（书名/作者/分类/状态/最新章节），封面 #fmimg data-original。
 *  - 目录页：#list a[rel=chapter] + select 分页（index_N.html），nextLink 限定 _N.html 模式
 *    ——末页「下一页」指向书页（无 _N 模式）自然终止。
 *  - 内容页：17mb 家族 JS 段落加密 document.writeln(随机名.随机名('base64'))，
 *    正则结构通配捕获 + transform:'base64' 解码为 <p>段落</p> 再交清洗器
 *    （实测混淆函数名每次请求随机轮换：llps.rbsz / wvx.jbyhxat ...，不可绑定固定名）。
 */
const BASE = 'http://localhost:3000'

const SITE = 'http://www.biqutu.info'

// 17mb 模板家族简介方言：行首游离 p、行尾 /p... 转义残留、《书名》是XX精心创作的XX类小说。推广句
const BIQUTU_INTRO_ADS = [
  '^p(?=[\\u4e00-\\u9fa5【\\u201c（])',
  '/?p\\.{2,}$',
  '《[^》]{1,40}》是[^。《》]{1,24}精心创作的[^。]{0,24}类小说。',
]

// 内容页方言：本站域名话术（默认清洗已含通用域名/笔趣阁模式，这里补 info 域与家族变体）
const BIQUTU_CONTENT_ADS = [
  '[a-zA-Z0-9-]{2,30}\\.info[^\\n]{0,30}',
  '请记住本书首发域名[^\\n]{0,40}',
]

const RULES: { name: string; type: string; config: object }[] = [
  {
    name: '笔趣阁biqutu-列表页',
    type: 'list',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: true,
      throttleGap: 1200,
      items: {
        // 仅命中「最近更新小说列表」行（s3 最新章节 + s4 作者 为该面板独有）
        item: {
          mode: 'regex',
          expr:
            '<li><span class="s1">[^<]*</span><span class="s2"><a href="([^"]+)"[^>]*>([^<]+)</a></span><span class="s3">[\\s\\S]*?</span><span class="s4">[^<]*</span><span class="s5">[^<]*</span></li>',
        },
        title: { mode: 'regex', expr: 'class="s2"><a[^>]*>([^<]+)</a>', group: 1 },
        link: { mode: 'regex', expr: 'class="s2"><a href="([^"]+)"', group: 1 },
      },
    },
  },
  {
    name: '笔趣阁biqutu-书籍信息页',
    type: 'book',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: true,
      throttleGap: 1200,
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
        cover: { mode: 'css', expr: '#fmimg img', attr: 'data-original' },
        intro: { mode: 'css', expr: '#intro', attr: 'html' },
        tocLink: { mode: 'css', expr: 'a.chapterlist', attr: 'href' },
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
      strategy: 'http',
      timeout: 25000,
      rotateUA: true,
      throttleGap: 1200,
      items: {
        item: { mode: 'css', expr: '#list a[rel="chapter"]' },
      },
      pagination: {
        enabled: true,
        mode: 'nextLink',
        nextLink: { mode: 'regex', expr: 'href="([^"]*_\\d+\\.html)"[^>]*>\\s*下一页', group: 1 },
        maxPages: 30,
      },
      reorder: { enabled: true },
      dedup: { byUrl: true, byTitle: true },
    },
  },
  {
    name: '笔趣阁biqutu-章节内容页',
    type: 'content',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: true,
      throttleGap: 1200,
      content: {
        // 17mb 家族 JS 段落加密：document.writeln(随机名.随机名('base64')) → 解码出 <p>段落</p>
        // 注意：混淆函数名（如 llps.rbsz / wvx.jbyhxat）每次请求随机轮换，只能按结构通配
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
  const existing = (await (await fetch(`${BASE}/api/rules`)).json()) as {
    rules: { id: string; name: string; type: string }[]
  }
  for (const rule of RULES) {
    const dup = existing.rules.find((r) => r.name === rule.name)
    const res = await fetch(dup ? `${BASE}/api/rules/${dup.id}` : `${BASE}/api/rules`, {
      method: dup ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        dup ? { name: rule.name, config: rule.config } : { name: rule.name, type: rule.type, config: rule.config }
      ),
    })
    const body = (await res.json()) as { rule?: { id: string }; error?: string }
    console.log(`${dup ? 'UPDATE' : 'CREATE'} ${rule.name}:`, res.ok ? `OK id=${body.rule?.id}` : body.error)
  }
  console.log(`\n站点基准 URL：${SITE}（规则内均为相对解析，列表链接将自动拼接站点域名）`)
}

void main()

export {}
