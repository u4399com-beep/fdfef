import type { BookRuleConfig, ContentRuleConfig, FieldSelector, ListRuleConfig, RuleType, TocRuleConfig } from '../collect-types'
import { mergeCleaning, normalizeBookMeta } from '../collect-types'
import { fetchPage } from './fetcher'
import { parseFields, parseListEntries, resolveUrl, selectValue } from './parser'
import { cleanIntro } from './cleaner'
import { detectCompletion, extractChapterNumber, smartMatchCategory } from './matcher'

// ============================================================
// 规则测试引擎：每个规则编写页面均带测试能力
// ============================================================

export interface TestResponse {
  ok: boolean
  message: string
  data?: Record<string, unknown>
  elapsedMs?: number
}

export async function testRule(type: RuleType, config: unknown, url: string): Promise<TestResponse> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, message: '请输入合法的测试 URL（http/https）' }
  }
  const started = Date.now()
  try {
    switch (type) {
      case 'list':
        return await testList(config as ListRuleConfig, url, started)
      case 'book':
        return await testBook(config as BookRuleConfig, url, started)
      case 'toc':
        return await testToc(config as TocRuleConfig, url, started)
      case 'content':
        return await testContent(config as ContentRuleConfig, url, started)
      default:
        return { ok: false, message: '未知规则类型' }
    }
  } catch (e) {
    return {
      ok: false,
      message: `测试失败：${e instanceof Error ? e.message : String(e)}`,
      elapsedMs: Date.now() - started,
    }
  }
}

async function testList(cfg: ListRuleConfig, url: string, started: number): Promise<TestResponse> {
  if (!cfg?.items?.item?.expr) return { ok: false, message: '列表项选择器不能为空' }
  const res = await fetchPage(url, cfg)
  const entries = parseListEntries(res.html, cfg.items, res.finalUrl)
  let nextUrl: string | undefined
  if (cfg.pagination?.enabled && cfg.pagination.nextLink?.expr) {
    nextUrl = String(selectValue(res.html, { ...cfg.pagination.nextLink, multiple: false }, { baseUrl: res.finalUrl }) || '') || undefined
    if (nextUrl === res.finalUrl) nextUrl = undefined
  }
  return {
    ok: true,
    message: `解析成功：共 ${entries.length} 个列表项${cfg.pagination?.enabled ? '（含分页配置）' : ''}`,
    elapsedMs: Date.now() - started,
    data: {
      strategy: res.strategy,
      finalUrl: res.finalUrl,
      total: entries.length,
      sample: entries.slice(0, 15),
      nextUrl,
    },
  }
}

async function testBook(cfg: BookRuleConfig, url: string, started: number): Promise<TestResponse> {
  if (!cfg?.fields?.title?.expr) return { ok: false, message: '书名选择器不能为空' }
  const res = await fetchPage(url, cfg)
  const parsed = parseFields(res.html, cfg.fields as Record<string, FieldSelector | undefined>, res.finalUrl)
  const parsedTitle = parsed.title?.trim()
  if (!parsedTitle) return { ok: false, message: '书名解析为空，请检查书名选择器', elapsedMs: Date.now() - started }

  // 与采集管线 collectBookInfo 同规则：标题规整（作者后缀回填/章节范围剥离），保证测试预览即入库结果
  const norm = normalizeBookMeta(parsedTitle, (parsed.author ?? '').trim(), cfg.titleNormalize)
  const title = norm.title

  const intro = parsed.intro ? cleanIntro(parsed.intro, mergeCleaning(), cfg.extraAdPatterns ?? []) : ''
  const keywords = (parsed.keywords ?? '')
    .split(/[,，、|\s]+/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(',')
  const match = smartMatchCategory({
    title,
    intro,
    keywords: keywords.split(',').filter(Boolean),
    sourceCategory: parsed.category,
  })
  const completion = detectCompletion({ status: parsed.status, latestChapter: parsed.latestChapter, intro })
  let coverResolved = parsed.cover ?? ''
  if (coverResolved) coverResolved = resolveUrl(coverResolved, res.finalUrl)

  // 目录页地址（与采集管线 collectBookInfo 同逻辑，供测试面板直观展示目录入口）
  let tocUrl = res.finalUrl
  const tocLinkSel = cfg.fields?.tocLink
  if (tocLinkSel?.expr) {
    const toc = String(selectValue(res.html, { ...tocLinkSel, multiple: false }, { baseUrl: res.finalUrl }) || '')
    if (toc) tocUrl = resolveUrl(toc, res.finalUrl)
  }

  return {
    ok: true,
    message: '书籍信息解析成功',
    elapsedMs: Date.now() - started,
    data: {
      strategy: res.strategy,
      finalUrl: res.finalUrl,
      tocUrl,
      fields: {
        书名: title,
        作者: norm.author,
        分类: parsed.category ?? '',
        关键词: keywords,
        状态: parsed.status ?? '',
        最新章节: parsed.latestChapter ?? '',
        封面: coverResolved,
        简介: intro.slice(0, 300),
      },
      smartCategory: { category: match.category, score: match.score, source: match.source },
      smartCompletion: { status: completion.status, confidence: completion.confidence, source: completion.source },
    },
  }
}

async function testToc(cfg: TocRuleConfig, url: string, started: number): Promise<TestResponse> {
  if (!cfg?.items?.item?.expr) return { ok: false, message: '章节列表项选择器不能为空' }
  const { fetchPaginated } = await import('./paginated')
  const pages = await fetchPaginated(url, cfg, cfg.pagination, 3)
  const all: { title: string; url: string; no: number }[] = []
  for (const page of pages) {
    for (const e of parseListEntries(page.html, cfg.items, page.url)) {
      if (!e.title && !e.url) continue
      all.push({ title: e.title || e.url, url: e.url, no: extractChapterNumber(e.title, cfg.reorder?.numberPattern) })
    }
  }
  const numbers = all.map((e) => e.no).filter((n) => n >= 0)
  let disorderCount = 0
  for (let i = 1; i < numbers.length; i++) if (numbers[i] < numbers[i - 1]) disorderCount++
  // 与管线 collectTocEntries 同判定：序号样本 < 5 不判乱序（小样本误报率高）
  const scrambled = numbers.length >= 5 && disorderCount >= 2

  let ordered: { title: string; url: string }[] = all.map((e) => ({ title: e.title, url: e.url }))
  // 与管线对齐：reorder.enabled 即重排（编号升序 + 无编号条目移至尾部），不依赖 scrambled 判定
  if (cfg.reorder?.enabled) {
    ordered = [...all].sort((a, b) => (a.no >= 0 ? a.no : 1e9) - (b.no >= 0 ? b.no : 1e9)).map((e) => ({ title: e.title, url: e.url }))
  }
  const before = ordered.length
  if (cfg.dedup?.byUrl !== false) {
    const seen = new Set<string>()
    ordered = ordered.filter((e) => {
      // 与管线 collectTocEntries 同键规则：无 url 章节按标题派生键（local:hash(title)）参与去重
      const k = e.url ? normalizeTocUrlKey(e.url) : `local:${e.title}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  if (cfg.dedup?.byTitle) {
    const seen = new Set<string>()
    ordered = ordered.filter((e) => {
      if (seen.has(e.title)) return false
      seen.add(e.title)
      return true
    })
  }
  return {
    ok: true,
    message: `解析成功：共 ${all.length} 章${scrambled ? `（检测到乱序 ${disorderCount} 处${cfg.reorder?.enabled ? '，已重排' : '，建议开启乱序重排'}）` : ''}，去重后 ${ordered.length} 章`,
    elapsedMs: Date.now() - started,
    data: {
      firstPageUrl: firstPageUrl(pages),
      pagesFetched: pages.length,
      total: all.length,
      dupRemoved: before - ordered.length,
      scrambled,
      disorderCount,
      sample: ordered.slice(0, 30),
      tail: ordered.slice(-5),
    },
  }
}

function firstPageUrl(pages: { url: string }[]): string {
  return pages[0]?.url ?? ''
}

/** 与管线 normalizeTocUrlKey 同规则（忽略 hash/默认端口/尾斜杠）：保证测试面板去重数与管线一致 */
function normalizeTocUrlKey(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    u.hash = ''
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = ''
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    return u.href
  } catch {
    return url
  }
}

async function testContent(cfg: ContentRuleConfig, url: string, started: number): Promise<TestResponse> {
  if (!cfg?.content?.expr) return { ok: false, message: '正文选择器不能为空' }
  const cleaning = mergeCleaning()
  const { fetchCleanedContent } = await import('./paginated')
  const { text, pages } = await fetchCleanedContent(url, cfg, cleaning)
  if (!text) return { ok: false, message: '正文解析为空，请检查正文选择器', elapsedMs: Date.now() - started }
  return {
    ok: true,
    message: `正文解析成功：${text.replace(/\s/g, '').length} 字，共 ${pages} 页`,
    elapsedMs: Date.now() - started,
    data: {
      pagesFetched: pages,
      wordCount: text.replace(/\s/g, '').length,
      paragraphCount: text.split('\n').filter(Boolean).length,
      preview: text.slice(0, 500),
    },
  }
}
