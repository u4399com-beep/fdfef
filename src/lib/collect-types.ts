// ============================================================
// 采集规则配置类型定义（css / regex / xpath 三种选择器同时可用）
// ============================================================

export type SelectorMode = 'css' | 'regex' | 'xpath'
export type RuleType = 'list' | 'book' | 'toc' | 'content'
export type FetchStrategy = 'http' | 'playwright' | 'hyperbrowser'

/** 单字段选择器：所有字段统一抽象 */
export interface FieldSelector {
  mode: SelectorMode
  expr: string // css 选择器 / 正则表达式 / xpath 表达式
  attr?: string // css/xpath 取值：text | html | outerHtml | href | src | 自定义属性
  group?: number // regex 捕获组序号（0=整体匹配）
  multiple?: boolean // 返回全部匹配
  trim?: boolean // 默认 true
  /**
   * 值后处理（反反爬增强）：'base64' 将匹配值按 UTF-8 解码。
   * 适用于把正文段落 base64 加密进 <script> 的模板家族
   * （如 17mb 系笔趣阁：llps.rbsz('PHA+...')），解码产物 <p>段落</p>
   * 交由清洗器转行。无此需求的字段不填即无副作用。
   */
  transform?: 'base64'
}

/** 列表项内相对子选择器 */
export interface ListItemSelectors {
  item: FieldSelector // 定位列表项（css/xpath）或整体正则
  title?: FieldSelector // 相对于 item
  link?: FieldSelector // 相对于 item（默认取 a href）
  intro?: FieldSelector
  cover?: FieldSelector
  author?: FieldSelector
  category?: FieldSelector
}

/** 分页配置（目录页/内容页/列表页通用，预留） */
export interface PaginationConfig {
  enabled: boolean
  /**
   * nextLink 跟随下一页 | template URL 模板翻页 | select 下拉页码枚举
   * select：解析 <select><option value="..."> 各分页地址并逐页抓取
   * （常见于下拉选页站点；对末页"下一页"指向 honeypot 的站点也安全）
   */
  mode: 'nextLink' | 'template' | 'select'
  nextLink?: FieldSelector // 下一页链接（select 模式下为 option value 选择器，配 multiple:true）
  urlTemplate?: string // 含 {page} 占位符
  /**
   * select 模式专用：option value 为纯页码数字（非地址）时的查询参数名。
   * 配置后按 `<当前页URL>?<pageParam>=<N>` 构造各分页地址
   * （如 rqwb 家族：option value="2" → /book/X.html?page=2）。
   * 服务端若不按该参数分页而总返全量目录，多取页与首页重叠由 URL 去重自然吸收，无副作用。
   */
  pageParam?: string
  startPage?: number
  endPage?: number
  maxPages?: number // 安全上限
  maxConcat?: number // 内容页拼接上限（章节正文分页合并）
  /**
   * 内容分页防跨章保护（按 _N.html 后缀分页的站点）：
   * 仅跟随与当前页同 base（去除 _N 后缀后一致）的下一页链接，
   * 防止把"下一章"链接误当分页导致整本书正文合并成一章。
   */
  sameChapterOnly?: boolean
}

/** 通用请求配置（反反爬基础层） */
export interface FetchConfig {
  strategy?: FetchStrategy
  encoding?: 'auto' | 'utf-8' | 'gbk' | 'gb2312' | 'big5'
  headers?: Record<string, string>
  cookies?: string
  timeout?: number // ms
  rotateUA?: boolean // UA 轮换，默认 true
  referer?: string
  /** 同域请求最小间隔 ms（全局节流，默认 1200；0 = 不节流） */
  throttleGap?: number
  /**
   * 镜像域名列表（反失效增强）：主域名网络级不可达（DNS/连接失败）时，
   * 自动按序尝试镜像源（保留路径改写 origin），成功的镜像会被记忆，
   * 冷却期内后续请求直连镜像、到期复检主域。小说站频繁轮换域名的标准应对。
   */
  mirrorUrls?: string[]
  /**
   * JS 渲染翻页交互（仅 playwright 策略生效）：
   * 适用于分页参数加密/URL 不变的站点（如下拉页码、按钮翻页），
   * 逐项点击后抓取页面快照并以分隔符拼接
   */
  jsPages?: {
    enabled: boolean
    itemsSelector: string // 分页项选择器，每个元素对应一页（如 '.dropDown li[data-p]'）
    triggerSelector?: string // 每次选择分页项前先点击的展开控件（如下拉按钮 '.selBox .btn'）
    skipFirst?: boolean // 跳过第一项（首屏已是第一页），默认 false
    waitAfterClick?: number // 点击后等待渲染 ms，默认 1200
    maxPages?: number // 安全上限，默认 30
  }
}

/** 列表页规则 */
export interface ListRuleConfig extends FetchConfig {
  items: ListItemSelectors
  pagination?: PaginationConfig
}

/** 书籍信息页规则 */
export interface BookRuleConfig extends FetchConfig {
  fields: {
    title: FieldSelector
    author?: FieldSelector
    category?: FieldSelector
    keywords?: FieldSelector
    intro?: FieldSelector
    cover?: FieldSelector
    status?: FieldSelector
    latestChapter?: FieldSelector
    tocLink?: FieldSelector // 目录页链接（书籍页与目录页分离的站点配置；默认书籍页即目录页）
  }
  smartCategory?: boolean // 智能匹配分类
  smartCompletion?: boolean // 智能判断完结
  fetchSuggest?: boolean // 抓取多搜索引擎下拉词
  downloadCover?: boolean // 下载封面为 webp
  extraAdPatterns?: string[] // 简介附加广告正则（模板方言：转义残留、推广句等）
  /**
   * 标题规整（保守行尾剥离，默认开启）：部分站点把「作者：xxx」/章节范围
   * 拼进书名（如「快穿：万人迷宿主又美又撩 作者：甜姜茶」「书名1-202」），
   * 同时 author 字段错抓为上传者名。规整后标题用于唯一键/智能分类/下拉词，
   * 提取到的作者在 author 字段为空或可疑时回填。按规则置 enabled:false 可整体关闭。
   */
  titleNormalize?: TitleNormalizeConfig
}

/** 章节目录页规则 */
export interface TocRuleConfig extends FetchConfig {
  items: ListItemSelectors // 章节：title + link
  pagination?: PaginationConfig // 预留分页设置
  reorder?: {
    // 乱序重排
    enabled: boolean
    numberPattern?: string // 章节序号提取正则，默认支持中文数字
  }
  dedup?: {
    byUrl: boolean
    byTitle: boolean
  }
}

/** 章节内容页规则 */
export interface ContentRuleConfig extends FetchConfig {
  content: FieldSelector // 正文选择器（css/regex/xpath）
  pagination?: PaginationConfig // 预留分页设置（合并多页正文）
  extraAdPatterns?: string[] // 附加广告正则
}

// ---------- 运行时默认值 ----------

export const DEFAULT_CLEANING = {
  removeTags: ['script', 'style', 'iframe', 'ins', 'object', 'embed', 'noscript'],
  adPatterns: [
    '\\(本章完\\)',
    '\\(完\\)',
    '求收藏[，,]?求推荐票[！!～~]?',
    '求(月票|收藏|推荐|订阅|打赏)[^\\n]{0,20}',
    '最新章节.{0,30}',
    '一秒记住[^\\n]{0,40}',
    '天才一秒记住[^\\n]{0,40}',
    '笔趣阁[^\\n]{0,20}',
    'www\\.[a-zA-Z0-9-]+\\.(com|net|cc|org|info|la|me|top|xyz)[^\\s]{0,30}',
    // 裸域名（行尾形式：独立行或粘连在正文行尾，域名绝非正文内容）
    '[a-zA-Z0-9-]{2,30}\\.(com|net|cc|org|info|la|me|top|xyz|vip|site|book)\\s*$',
    // 裸域名（行首粘连正文：域名+空格+正文）
    '^[a-zA-Z0-9-]{2,30}\\.(com|net|cc|org|info|la|me|top|xyz|vip|site|book)\\s*',
    '记住(我们的)?域名[^\\n]{0,50}',
    '收藏[a-zA-Z0-9.-]+\\.(com|net|cc|org|info|la|me|top|xyz|vip)[^\\n]{0,60}',
    // 站群推广话术（句边界限定：只吞推广句本身，保留句后正文）
    '将[a-zA-Z0-9.-]+\\.(com|net|cc|la|org|top|xyz)设为首页[^。\\n]{0,80}。',
    '每日必访[^。\\n]{0,60}。',
    '记住这个名字[^。\\n]{0,60}。',
    '记住这个域名[^。\\n]{0,60}。',
    '专业的小说网站[^。\\n]{0,80}。',
    '提供最舒适的阅读体验[^。\\n]{0,60}。',
    '诚意奉献[^\\n]{0,60}',
    '更新发布！?书友们都去[^\\n]{0,50}',
    '独家首发[^\\n]{0,50}',
    '倾心之作[^\\n]{0,50}',
    '[a-zA-Z0-9-]{2,30}\\.(com|net|cc|la|org|top|xyz)[，,]读《[^》]{0,50}》[^。\\n]{0,40}[。！？]',
    '本站网址[^\\n]{0,40}',
    '请记住本书[^\\n]{0,50}',
    '章节错误[^\\n]{0,50}',
  ],
  keepTags: ['p', 'br'],
  decodeEntities: true,
  normalizeParagraphs: true, // 合并空行、规范段落缩进
  minParagraphLength: 0, // 过短段落过滤（0 = 不过滤）
  /** 行内 URL/裸域名剥离：正文行中任何链接/域名 token 均视为推广（小说正文不含合法链接） */
  stripInlineUrls: true,
  /** 章首结构性垃圾：内容选择器范围过大时混入的书名/作者行/「简介：」/纯序号标题行 */
  removeHeaderJunk: true,
  /** 章内重复推广行：同一行（规范化后）重复≥2 次且含群号/域名/推广强特征词 */
  removePromoRepeats: true,
  /** 不可见字符剥离：零宽字符/方向控制符/BOM（反爬水印或复制垃圾，正文不可能合法出现） */
  stripInvisibleChars: true,
}

export const DEFAULT_DOWNLOAD = {
  insertSiteInfo: true, // 插入站点信息
  siteInfoTemplate: '本书由 {siteName}（{domain}）整理提供\n更多精彩小说请访问：https://{domain}',
  insertAds: true, // 插入广告
  adTemplates: [
    '【本站广告】{siteName} —— 海量小说每日更新，海量全本免费读！',
    '【推广】访问 {domain} 阅读更多精彩内容，极速无广告！',
  ],
  adEveryNChapters: 10, // 每 N 章插入一条广告
  insertObfuscation: true, // 插入混淆
  obfuscationMode: 'zero-width', // zero-width 零宽字符 | lookalike 同形字 | junk-line 干扰行
  obfuscationRate: 0.02, // 混淆密度 0~1
}

export type CleaningConfig = typeof DEFAULT_CLEANING
export type DownloadConfig = typeof DEFAULT_DOWNLOAD

// ---------- 存储端配置类型收敛（引擎侧兑底） ----------
// settings/rules 接口仅校验最外层为对象，字段内部类型不设防；DB JSON 被手改坏后
// （如 adPatterns:null、normalizeParagraphs:"false"）会在引擎展开/迭代/比较时
// 崩溃或行为反转，这里在合并层统一收敛回默认语义（合法配置逐字段无损）。

/** 解析存储端 JSON：仅接受纯对象（数组/原始类型会被 spread 出索引键污染配置） */
function parseConfigObject(raw?: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const obj: unknown = JSON.parse(raw)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as Record<string, unknown>
  } catch {
    /* 损坏 JSON 回退默认 */
  }
  return {}
}

/** 字符串数组收敛：非数组回退默认；过滤非字符串/空白项（空字符串正则会 match-all 误伤全文） */
function asPatternArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback
  return v.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  // 存储端可能被写成字符串/数字（String(true)→"true"、0/1），按常见字面量收敛，其余回退默认
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'true' || s === '1') return true
    if (s === 'false' || s === '0') return false
  } else if (v === 1) return true
  else if (v === 0) return false
  return fallback
}

function asFiniteNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function mergeCleaning(raw?: string | null): CleaningConfig {
  const parsed = parseConfigObject(raw)
  return {
    removeTags: asPatternArray(parsed.removeTags, DEFAULT_CLEANING.removeTags),
    adPatterns: asPatternArray(parsed.adPatterns, DEFAULT_CLEANING.adPatterns),
    keepTags: asPatternArray(parsed.keepTags, DEFAULT_CLEANING.keepTags),
    decodeEntities: asBool(parsed.decodeEntities, DEFAULT_CLEANING.decodeEntities),
    normalizeParagraphs: asBool(parsed.normalizeParagraphs, DEFAULT_CLEANING.normalizeParagraphs),
    minParagraphLength: Math.max(0, asFiniteNumber(parsed.minParagraphLength, DEFAULT_CLEANING.minParagraphLength)),
    stripInlineUrls: asBool(parsed.stripInlineUrls, DEFAULT_CLEANING.stripInlineUrls),
    removeHeaderJunk: asBool(parsed.removeHeaderJunk, DEFAULT_CLEANING.removeHeaderJunk),
    removePromoRepeats: asBool(parsed.removePromoRepeats, DEFAULT_CLEANING.removePromoRepeats),
    stripInvisibleChars: asBool(parsed.stripInvisibleChars, DEFAULT_CLEANING.stripInvisibleChars),
  }
}

export function mergeDownload(raw?: string | null): DownloadConfig {
  const parsed = parseConfigObject(raw)
  return {
    insertSiteInfo: asBool(parsed.insertSiteInfo, DEFAULT_DOWNLOAD.insertSiteInfo),
    siteInfoTemplate:
      typeof parsed.siteInfoTemplate === 'string' ? parsed.siteInfoTemplate : DEFAULT_DOWNLOAD.siteInfoTemplate,
    insertAds: asBool(parsed.insertAds, DEFAULT_DOWNLOAD.insertAds),
    adTemplates: asPatternArray(parsed.adTemplates, DEFAULT_DOWNLOAD.adTemplates),
    adEveryNChapters: asFiniteNumber(parsed.adEveryNChapters, DEFAULT_DOWNLOAD.adEveryNChapters),
    insertObfuscation: asBool(parsed.insertObfuscation, DEFAULT_DOWNLOAD.insertObfuscation),
    obfuscationMode:
      typeof parsed.obfuscationMode === 'string' ? parsed.obfuscationMode : DEFAULT_DOWNLOAD.obfuscationMode,
    obfuscationRate: asFiniteNumber(parsed.obfuscationRate, DEFAULT_DOWNLOAD.obfuscationRate),
  }
}

// ---------- 书籍标题规整（采集管线 collectBookInfo 与规则测试引擎 testBook 共用） ----------

/**
 * 标题规整配置（挂在 BookRuleConfig，按规则可关）。
 * 全部规则均为「行尾强特征」保守剥离：不匹配时原样返回，绝不改动标题主体。
 */
export interface TitleNormalizeConfig {
  /** 总开关（默认 true） */
  enabled?: boolean
  /** 从标题末尾「作者：xxx」后缀提取作者并回填 author（默认 true） */
  extractAuthor?: boolean
  /** 剥离标题末尾章节范围数字，如「书名1-202」「书名 第1-202章」（默认 true） */
  trimChapterRange?: boolean
}

export interface NormalizedBookMeta {
  title: string
  author: string
  /** 作者是否由标题后缀回填而来（即原 author 字段被替换） */
  authorFromTitle: boolean
  /** 标题或作者是否被改动 */
  changed: boolean
}

/**
 * 「作者：xxx」仅允许出现在标题末尾，且其前必须是空白或收束符号
 * （防「网文作者：从写毒点开始」类把正文书名中的「作者：」误当后缀剥离）。
 * 捕获组 1 = 前置边界字符（收束符号需拼回保持《》配对，空白则丢弃），2 = 作者名。
 */
const TITLE_AUTHOR_SUFFIX_RE = /(?:^|([\s　》」』】）)]))作者[：:][ \t]*([^\s　]{1,20})[ \t]*$/
/**
 * 章节范围：第?A[分隔符]B(章|节)?，分隔符限 - ~ ～ — 至。
 * 守卫：A∈[1,99] 且 B>A（排除「2018-2020」式年份区间）、各限 4 位数字、剥离后标题 ≥2 字。
 */
const TITLE_CHAPTER_RANGE_RE = /第?[ \t　]*([0-9]{1,4})[ \t　]*[-~～—至][ \t　]*([0-9]{1,4})[ \t　]*(?:[章节][ \t　]*)?$/

/**
 * 书籍标题/作者规整：从标题末尾「作者：xxx」后缀提取作者并回填、剥离尾部章节范围数字。
 * 纯函数、无副作用；不匹配任何模式时原样返回（changed=false）。
 */
export function normalizeBookMeta(title: string, author: string, cfg?: TitleNormalizeConfig): NormalizedBookMeta {
  if (!title || cfg?.enabled === false) return { title, author, authorFromTitle: false, changed: false }
  let t = title
  let a = author
  let authorFromTitle = false

  if (cfg?.extractAuthor !== false) {
    const m = TITLE_AUTHOR_SUFFIX_RE.exec(t)
    if (m) {
      // 收束符号（如《书名》的「》」）拼回保持配对；空白边界随后 trim 丢弃
      const head = (t.slice(0, m.index) + (m[1] ?? '')).trim()
      const name = m[2]
      // 保守守卫：剥离后正文标题 ≥2 字；作者名非纯数字
      if (head.length >= 2 && !/^[0-9０-９]+$/.test(name)) {
        t = head
        if (name !== a) {
          a = name
          authorFromTitle = true
        }
      }
    }
  }

  if (cfg?.trimChapterRange !== false) {
    const m = TITLE_CHAPTER_RANGE_RE.exec(t)
    if (m) {
      const from = parseInt(m[1], 10)
      const to = parseInt(m[2], 10)
      const head = t.slice(0, m.index).trim()
      if (head.length >= 2 && from >= 1 && from <= 99 && to > from && to <= 9999) {
        t = head
      }
    }
  }

  return { title: t, author: a, authorFromTitle, changed: t !== title || a !== author }
}
