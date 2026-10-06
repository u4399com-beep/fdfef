import * as cheerio from 'cheerio'
import type { CleaningConfig } from '../collect-types'

// ============================================================
// 内容清洗系统：
//  1. HTML 规范化（去 script/style、块级转行）+ 实体解码
//  2. 不可见字符剥离（零宽/方向控制/BOM 反爬水印）
//  3. 广告正则清洗（内置高置信层 + 全局自定义 + 站点方言，整行/行内）
//  4. 行内 URL/裸域名剥离（正文行中的链接与域名 token 均视为推广）
//  5. 章首结构性垃圾（内容选择器范围过大混入的书名/作者行/「简介：」/纯序号标题）
//  6. 章内重复推广行（同行重复≥2 次且含群号/域名等强特征词）
//  7. 段落规范化（缩进、空行合并）+ 清洗统计与移除样本报告
// ============================================================

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  copy: '©', reg: '®', mdash: '—', ndash: '–', hellip: '…',
  ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019', middot: '·',
}

function codePointToChar(cp: number): string {
  // 边界：0x10FFFF 是合法码点（含）；代理区 → U+FFFD（HTML 规范行为，
  // 孤立代理会污染 UTF-16 字符串，后续 encodeURIComponent/写文件会抛错或产生乱码）
  if (cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) return String.fromCodePoint(cp)
  return cp >= 0xd800 && cp <= 0xdfff ? '\uFFFD' : ' '
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => codePointToChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => codePointToChar(parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name: string) => ENTITY_MAP[name] ?? m)
}

/** 清洗上下文：用于章首结构性垃圾识别（书名/章节标题行混入正文） */
export interface CleanContext {
  bookTitle?: string
  chapterTitle?: string
}

/** 各机制移除统计（行数口径；invisibleChars 为字符数口径） */
export interface CleanStats {
  adPattern: number // 广告正则命中行
  inlineUrl: number // 行内 URL/域名剥离行
  headerJunk: number // 章首结构性垃圾行
  promoRepeat: number // 重复推广行
  punctuation: number // 纯标点/符号行
  tooShort: number // 过短段落行
  invisibleChars: number // 不可见字符数
}

export interface CleanResult {
  text: string // 规范化纯文本（段落 \n 分隔）
  wordCount: number
  removedLines: number
  stats: CleanStats
  /** 被移除行样本（最多 12 条，每条截断 80 字符，去重）——供清洗测试/审计确认误杀率 */
  removedSamples: string[]
}

/**
 * 高置信内置噪声模式（独立于用户可编辑的 adPatterns，始终应用）。
 * 独立成层的原因：SystemConfig.cleaning 整存整取旧版模式列表，已部署实例的存量配置
 * 不会自动获得 DEFAULT_CLEANING 新增模式；内置层保证升级即生效。
 * 全部为「正文出现即噪声」的高置信模式：
 * - QQ 群号（正文不可能合法出现群号）
 * - 推广工具/合集话术（搜书神器、更新合集链接、收藏本站、首发于、无弹窗）
 * - 孤协议行（URL 剥离后的残壳）
 * - 行尾粘连推广残留壳（「…每日 推文 :」→ URL 被剥离后余下的话术+冒号）
 */
export const BUILTIN_NOISE_PATTERNS: string[] = [
  // 顺序敏感：整行话术模式优先于 token 模式（若「qq群+群号」先剥，「每日更新qq群962827651」会残剩「每日更新」行）
  '(?:每[曰日]|每天)(?:更新)?[qQ][qQ][群裙][^ \\n]{0,16}',
  // 混淆变形推广（token 插入正文/群号转中文谐音）：备用qq群/中转qq群/小说qq群+变形群号。
  // 「qq群」token 后的 ≤16 字符按变形群号处理——正文被广告切断的部分无法恢复，剥 token 是最优解。
  // 混淆前缀必选：裸「qq群」（正文可能合法提及，如都市文聊群场景）仍按纯数字群号的兜底模式保守处理
  '(?:备用|中转|资源|交流|书友|小说|读者|本文)[qQ][qQ][群裙][:：]?.{0,16}',
  // 兜底：裸 qq群 + 纯数字群号（正文不可能合法出现群号）
  '[qQ][qQ][群裙][:：]?\\s*[0-9０-９]{4,12}',
  // 剥离残壳行：广告主体被上游模式剥离后余下的话术残段（如「每日更新」）
  '^(?:每[曰日]|每天)(?:更新|一更)$',
  '^https?:\\/\\/$',
  '搜书神器',
  '(?:每天|每日)[\\u4e00-\\u9fa5]{0,4}更新合集链接\\s*[:：]?',
  '收藏本站[^ \\n]{0,20}',
  '首发于[^ \\n]{0,25}',
  '无弹窗(?:全文免费)?(?:在线)?(?:阅读)?',
  '(?:每日|每天|精彩|今日|本站)?\\s*(?:推文|推荐阅读|发布页|直达|阅读原文|阅读地址|入口)\\s*[:：]\\s*$',
]

/**
 * 行内 URL/裸域名剥离（stripInlineUrls）：
 * 1. 完整 URL：http(s)://… 与 www.…（止于空白/常见中文标点/引号括号）
 * 2. 裸域名 token：x.y(<TLD 表>)（可带路径）。覆盖「9lnk.io/xxx」无协议短链、
 *    「kdocs.cn/l/xxx」云盘链等广告形态；TLD 表为广告域常见后缀，
 *    中文正文出现「英文串.常见TLD」的概率≈0，误伤可忽略。
 * TLD 后向否定断言防止「xxx.company」被剥成「pany」残留。
 */
const INLINE_URL_RE =
  /(?:https?:\/\/|www\.)[^\s\u3000\uff0c\u3002\uff1b\uff1a\uff1f\uff01\u3001\u201d\u2019\u300b\u3009\uff09\uff08"'）(）]+/g
const BARE_DOMAIN_RE =
  /(?<![a-zA-Z0-9.\-])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|net|cc|org|info|la|me|top|xyz|vip|site|book|io|cn|app|tv|biz|club|fun|live|shop|link|icu|online|store|art|pw)(?![a-zA-Z0-9-])(?:\/[^\s]*)?/gi

/**
 * 章首结构性垃圾模式（removeHeaderJunk，仅章首 8 行内生效）：
 * - 纯序号标题行（「第1段」）：章节标题冗余混入（Chapter.title 已存标题，正文行删除无损）
 * - 「小说」「简介：」「正文：」独立行：站点模板残留
 * - 「作者：xxx」行：书籍元信息混入
 * - 纯数字行：页码/序号垃圾
 */
const HEADER_JUNK_RES: RegExp[] = [
  /^第[0-9０-９一二两三四五六七八九十百千零〇]{1,7}段$/,
  /^小说$/,
  /^(简介|正文|书页|章节目录)[:：]?$/,
  /^作者[:：][^\s。！？]{1,25}$/,
  /^[0-9０-９]{1,7}$/,
]

/**
 * 重复推广行强特征词（removePromoRepeats）：
 * 行重复≥2 次本身不足以判定（正文对话重复常见），须叠加推广强特征：
 * 群号/域名/URL/无弹窗/首发/下载/推文等。行长度限 60 内（推广行短，正文重复长段落不适用）。
 */
const PROMO_FEATURE_RE =
  /qq[群裙]|微信群|群号|公众号|http|www\.|\.(?:com|cn|net|cc|la|io|info|top|xyz|vip|me)|无弹窗|首发|txt下载|app下载|下载app|请记住|收藏本站|域名|网址|推文|小说网|章节网/i

/** 重复行规范化 key：去空白与常见标点（同句不同标点形态归一） */
function promoKey(line: string): string {
  return line.replace(/[\s。，、；：？！…—·""''()（）\[\]【】！!？?，,。.～~]/g, '')
}

/** 判断一行是否像正文段落（以中文/字母开头，非纯符号） */
function isContentLine(line: string): boolean {
  if (!line) return false
  const stripped = line.replace(/[\s。，、；：？！…—·《》""''()（）\[\]【】-]/g, '')
  return stripped.length > 0
}

/**
 * 清洗正则长度兜底：超长自定义模式（误粘贴文档进配置）拒绝编译，
 * 防编译/回溯耗时失控（默认 27 条最长 ≈100 字符，2000 为宽裕上限）。
 * 注：不能根治灾难性回溯，仅拦截超长输入这一类失控源（行级处理天然限长已记录在案）。
 */
const MAX_PATTERN_LEN = 2000

/** 配置数组类型收敛：DB JSON 中字段类型不设防（settings/rules 接口仅校验最外层对象），
 * 非数组/含非字符串元素会在展开/迭代时抛 TypeError（整章清洗失败→整本书采集失败）*/
function asPatternList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    : []
}

function safeRegex(pattern: string): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LEN) return null
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/** 移除样本收集：最多 12 条、每条截 80 字符、去重 */
function collectSample(samples: string[], line: string): void {
  if (samples.length >= 12) return
  const s = line.length > 80 ? line.slice(0, 77) + '…' : line
  if (!samples.includes(s)) samples.push(s)
}

/**
 * 清洗章节正文/简介 HTML：
 * 1. 移除 script/style/iframe 等标签  2. 不可见字符剥离
 * 3. 广告正则清洗（内置层+自定义+站点方言）  4. 行内 URL/裸域名剥离
 * 5. 章首结构性垃圾  6. 重复推广行  7. 纯符号/短行过滤
 * 8. 实体解码  9. 段落规范化（缩进、空行合并）
 */
export function cleanContent(
  rawHtml: string,
  cfg: CleaningConfig,
  extraAdPatterns: string[] = [],
  context: CleanContext = {}
): CleanResult {
  const $ = cheerio.load(rawHtml)
  // 逐个容错：自定义规则里的非法 CSS 选择器不应中止整章清洗
  for (const tag of asPatternList(cfg.removeTags)) {
    try {
      $(tag).remove()
    } catch {
      /* 非法选择器，跳过 */
    }
  }

  // 块级结构 → 换行（前后都断开，避免块前游离文本与块内文本粘连）
  const $clone = $.root().clone()
  $clone.find('br').replaceWith('\n')
  $clone.find('p, div, li, dd, dt, section, article').before('\n')
  $clone.find('p, div, li, dd, dt, section, article').after('\n')

  let raw = $clone.text()
  raw = decodeEntities(raw)
  // 实体解码可能产生 CR（&#13;），统一归一为 \n 再按行处理
  raw = raw.replace(/\r\n?/g, '\n')

  // 不可见字符剥离（零宽字符/方向控制符/BOM：反爬水印或复制垃圾，正文不可能合法出现；
  // 与下载系统的零宽混淆无冲突——混淆在导出时后置，不经过清洗）
  let invisibleChars = 0
  if (cfg.stripInvisibleChars) {
    raw = raw.replace(/[\u200b-\u200f\u2060\ufeff]/g, (m) => {
      invisibleChars++
      return ''
    })
  }

  // 广告正则：内置高置信层 + 全局自定义 + 站点方言，预编译全局版
  // （避免逐行替换时每行×每规则重复编译正则：千行章节×15规则曾达3万次/章）
  const adRegexSources = [
    ...BUILTIN_NOISE_PATTERNS,
    ...asPatternList(cfg.adPatterns),
    ...asPatternList(extraAdPatterns),
  ]
    .map(safeRegex)
    .filter((r): r is RegExp => r !== null)
    .map((re) => ({
      test: re,
      global: new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'),
    }))

  const stripUrls = cfg.stripInlineUrls !== false
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)

  // 重复推广行预统计：规范化后计数（章级无状态，仅同章内判定）
  const freq = new Map<string, number>()
  if (cfg.removePromoRepeats !== false) {
    for (const l of lines) {
      if (l.length > 60) continue
      const key = promoKey(l)
      if (key.length < 6) continue // 过短 key（如「哈哈」）不参与，防对话误伤
      freq.set(key, (freq.get(key) ?? 0) + 1)
    }
  }

  const stats: CleanStats = {
    adPattern: 0, inlineUrl: 0, headerJunk: 0, promoRepeat: 0,
    punctuation: 0, tooShort: 0, invisibleChars,
  }
  const removedSamples: string[] = []
  let removed = 0
  const kept: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 1) 行内 URL/裸域名剥离（正文行中任何链接/域名 token 均视为推广）。
    //    先剥 URL 再跑话术正则：URL 剥离后残留的「每日 推文 :」壳由行尾话术模式兜底
    let cleaned = line
    let urlStripped = false
    if (stripUrls && cleaned) {
      const before = cleaned
      cleaned = cleaned
        .replace(INLINE_URL_RE, '')
        .replace(BARE_DOMAIN_RE, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
      urlStripped = cleaned !== before
    }

    // 2) 广告清洗：循环应用全部命中规则（URL 残壳话术、站点推广语，直至整行清除）
    let matched = false
    for (const { test, global } of adRegexSources) {
      if (test.test(cleaned)) {
        cleaned = cleaned.replace(global, '').trim()
        matched = true
      }
    }

    const touched = matched || urlStripped
    if (matched) stats.adPattern++
    if (urlStripped) stats.inlineUrl++

    // 有清洗动作的行：剔除后剩余内容仍像正文则保留（部分剥离），否则整行丢弃
    if (touched) {
      if (isContentLine(cleaned) && cleaned.length >= 4) {
        kept.push(cleaned)
      } else {
        removed++
        collectSample(removedSamples, line)
      }
      continue
    }

    // 3) 章首结构性垃圾（仅前 8 行：书名/作者/简介标记/纯序号标题/纯数字行）
    if (cfg.removeHeaderJunk !== false && i < 8) {
      const ctxHit =
        (context.bookTitle && cleaned === context.bookTitle.trim()) ||
        (context.chapterTitle && cleaned === context.chapterTitle.trim())
      if (ctxHit || HEADER_JUNK_RES.some((re) => re.test(cleaned))) {
        stats.headerJunk++
        removed++
        collectSample(removedSamples, cleaned)
        continue
      }
    }

    // 4) 章内重复推广行（重复≥2 且含强特征词，行长≤60）
    if (cfg.removePromoRepeats !== false && cleaned.length <= 60) {
      const key = promoKey(cleaned)
      if (key.length >= 6 && (freq.get(key) ?? 0) >= 2 && PROMO_FEATURE_RE.test(cleaned)) {
        stats.promoRepeat++
        removed++
        collectSample(removedSamples, cleaned)
        continue
      }
    }

    // 5) 纯标点/符号行（如“，”“……”分隔噪声）直接丢弃
    if (!isContentLine(cleaned)) {
      stats.punctuation++
      removed++
      collectSample(removedSamples, cleaned)
      continue
    }
    if (cfg.minParagraphLength > 0 && cleaned.length < cfg.minParagraphLength) {
      stats.tooShort++
      removed++
      collectSample(removedSamples, cleaned)
      continue
    }
    kept.push(cleaned)
  }

  let text = kept.join('\n')
  if (cfg.normalizeParagraphs) {
    text = text.replace(/\n{3,}/g, '\n\n').trim()
  }
  return { text, wordCount: text.replace(/\s/g, '').length, removedLines: removed, stats, removedSamples }
}

/** 简介清洗（保留换行，宽松清洗；extraAdPatterns 用于站点方言：转义残留、推广句等） */
export function cleanIntro(rawHtml: string, cfg: CleaningConfig, extraAdPatterns: string[] = []): string {
  // 模板转义残留（如 17mb 系简介字段把换行写成字面 \r\n）：还原为真实换行再按行清洗
  const normalized = rawHtml.replace(/\\r\\n|\\n|\\r/g, '\n')
  const result = cleanContent(normalized, { ...cfg, minParagraphLength: 0 }, extraAdPatterns)
  // 按码点截断，避免把增补平面字符切成孤立代理项进入 JSON 响应
  return Array.from(result.text).slice(0, 3000).join('')
}
