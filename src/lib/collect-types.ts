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
  mode: 'nextLink' | 'template' // 追加下一页 | URL 模板翻页
  nextLink?: FieldSelector // 下一页链接
  urlTemplate?: string // 含 {page} 占位符
  startPage?: number
  endPage?: number
  maxPages?: number // 安全上限
  maxConcat?: number // 内容页拼接上限（章节正文分页合并）
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
  }
  smartCategory?: boolean // 智能匹配分类
  smartCompletion?: boolean // 智能判断完结
  fetchSuggest?: boolean // 抓取多搜索引擎下拉词
  downloadCover?: boolean // 下载封面为 webp
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
    '本站网址[^\\n]{0,40}',
    '请记住本书[^\\n]{0,50}',
    '章节错误[^\\n]{0,50}',
  ],
  keepTags: ['p', 'br'],
  decodeEntities: true,
  normalizeParagraphs: true, // 合并空行、规范段落缩进
  minParagraphLength: 0, // 过短段落过滤（0 = 不过滤）
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

export function mergeCleaning(raw?: string | null): CleaningConfig {
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    return { ...DEFAULT_CLEANING, ...parsed }
  } catch {
    return { ...DEFAULT_CLEANING }
  }
}

export function mergeDownload(raw?: string | null): DownloadConfig {
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    return { ...DEFAULT_DOWNLOAD, ...parsed }
  } catch {
    return { ...DEFAULT_DOWNLOAD }
  }
}
