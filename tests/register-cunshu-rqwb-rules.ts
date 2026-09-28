/**
 * cunshu.la（存书啦）+ rqwb.com（人气完本）采集规则注册：
 * 两站均为 GoEdge WAF（通行 cookie 与 UA 绑定 → rotateUA=false + 显式 cookies）。
 *
 * cunshu.la：TXT 资源站，章节为“第N段”；
 *   反爬彩蛋：kw-protect 藏字（data-cp 十六进制码点）→ 解析器 decodeProtectedChars 已支持。
 * rqwb.com：传统小说站（og 元数据无，但 DOM 结构规整）。
 */
const BASE = 'http://localhost:3000'

const CUNSHU_COOKIES =
  'PHPSESSID=p23tes3u7mq5uqshe3hh8jp02o; ge_wc_20=Lze53XA3nC9iDBZY1FQ+lCR2Mg=='
const RQWB_COOKIES = 'ge_wc_20=Lze53XA3nC9iDBZY1FQ+oSR2Mg=='

// 存书啦方言补充：备用群插入、资源群插字、网盘链接、CJK间数字串
const CUNSHU_EXTRA = [
  '备用2[群峮][0-9.]{0,8}',
  '(小说)?资源群',
  '（(?=[，。）])',
  '(?<=[\\u4e00-\\u9fa5、])[0-9]{4,6}(?![年月日章回节个天次名位人块元斤米秒分时点号层倍万千百十积多回合张件艘座条只颗枚道阶环关楼辆架门届山洞府星系域界盟会派村镇城国州省县])(?=[\\u4e00-\\u9fa5])',
  'https?://[^\\s]{0,60}ctfile[^\\n]{0,50}',
  '访问密码[:：]?\\s*\\d+',
]

const CUNSHU_SPAM =
  "(?=[^\\u3000]*(?:交流裙|资源群|中转群|备用|若曦))[每天更新一百多本若曦交流裙水资源群备用中转0-9０-９a-zA-Z!.,:;?'\"()\\[\\]{}\\-~@#$%^&*_+=<>|\\\\/]{12,}"

const RULES: { name: string; type: string; config: object }[] = [
  // ==================== cunshu.la ====================
  {
    name: '存书啦-列表页',
    type: 'list',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: CUNSHU_COOKIES,
      throttleGap: 1500,
      items: {
        item: { mode: 'css', expr: 'a.resource-card' },
        title: { mode: 'css', expr: 'h3.rc-name', attr: 'text' },
      },
      pagination: {
        enabled: true,
        mode: 'template',
        urlTemplate: 'https://www.cunshu.la/library.php?sort=latest&page={page}',
        startPage: 1,
        endPage: 1,
        maxPages: 50,
      },
    },
  },
  {
    name: '存书啦-书籍信息页',
    type: 'book',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: CUNSHU_COOKIES,
      throttleGap: 1500,
      fields: {
        title: { mode: 'css', expr: 'h1.ph-name', attr: 'text' },
        author: { mode: 'css', expr: 'a.ph-uploader-link', attr: 'text' },
        latestChapter: { mode: 'css', expr: 'div.chapter-overlay-grid a.chapter-chip:last-of-type', attr: 'text' },
      },
      smartCategory: true,
      smartCompletion: true,
      fetchSuggest: true,
      downloadCover: false,
    },
  },
  {
    name: '存书啦-章节目录页',
    type: 'toc',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: CUNSHU_COOKIES,
      throttleGap: 1500,
      items: {
        item: { mode: 'css', expr: 'a.chapter-chip' },
      },
      dedup: { byUrl: true, byTitle: false },
    },
  },
  {
    name: '存书啦-章节内容页',
    type: 'content',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: CUNSHU_COOKIES,
      throttleGap: 1500,
      content: { mode: 'css', expr: 'div.chapter-text' },
      extraAdPatterns: [CUNSHU_SPAM, ...CUNSHU_EXTRA],
    },
  },
  // ==================== rqwb.com ====================
  {
    name: '人气完本-列表页',
    type: 'list',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: RQWB_COOKIES,
      throttleGap: 1500,
      items: {
        item: { mode: 'css', expr: '.side_commend ul.flex li' },
        title: { mode: 'css', expr: 'h2', attr: 'text' },
        link: { mode: 'css', expr: 'div.img_span a', attr: 'href' },
        author: { mode: 'css', expr: '.li_bottom a i', attr: 'text' },
        cover: { mode: 'css', expr: 'div.img_span img', attr: 'src' },
      },
    },
  },
  {
    name: '人气完本-书籍信息页',
    type: 'book',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: RQWB_COOKIES,
      throttleGap: 1500,
      fields: {
        title: { mode: 'css', expr: '.novel_info_title h1', attr: 'text' },
        author: { mode: 'css', expr: '.novel_info_title i a', attr: 'text' },
        category: { mode: 'css', expr: '.novel_info_title p span', attr: 'text' },
        status: { mode: 'css', expr: '.novel_info_title p span:nth-of-type(3)', attr: 'text' },
        latestChapter: { mode: 'css', expr: '.novel_info_title .to100 a', attr: 'text' },
        cover: { mode: 'css', expr: '.novel_info_main img', attr: 'src' },
        intro: { mode: 'css', expr: '#info .intro p:nth-of-type(2)', attr: 'text' },
      },
      smartCategory: true,
      smartCompletion: true,
      fetchSuggest: true,
      downloadCover: true,
    },
  },
  {
    name: '人气完本-章节目录页',
    type: 'toc',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: RQWB_COOKIES,
      throttleGap: 1500,
      items: {
        item: { mode: 'css', expr: '#catalog ul#ul_all_chapters li a' },
      },
      reorder: { enabled: false },
      dedup: { byUrl: true, byTitle: false },
    },
  },
  {
    name: '人气完本-章节内容页',
    type: 'content',
    config: {
      strategy: 'http',
      timeout: 25000,
      rotateUA: false,
      cookies: RQWB_COOKIES,
      throttleGap: 1500,
      content: { mode: 'css', expr: 'article#article' },
      extraAdPatterns: [
        "^[a-zA-Z0-9-]+\\.(com|net|cc|org|info|la|me|top|xyz|vip)\\s*$",
        '人气完本[^\\n]{0,60}',
        '将[a-zA-Z0-9.-]+\\.(com|net|cc|la|org|top|xyz)设为首页.{0,60}',
        '每日必访.{0,50}',
        '阅读盛宴.{0,50}',
        '每天第一时间获取.{0,50}',
        '[a-zA-Z0-9-]{2,30}\\.(com|net|cc|la|org|top|xyz)，读《[^》]{0,50}》[^。\\n]{0,40}。',
      ],
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
}
void main()
