import type { BookRuleConfig, ContentRuleConfig, FieldSelector, ListRuleConfig, RuleType, TocRuleConfig } from '../collect-types'
import { mergeCleaning } from '../collect-types'
import { fetchPage } from './fetcher'
import { parseContentHtml, parseFields, parseListEntries } from './parser'
import { cleanContent } from './cleaner'
import { detectCompletion, extractChapterNumber, smartMatchCategory } from './matcher'
import { resolveUrl } from './parser'

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
    const { selectValue } = await import('./parser')
    nextUrl = String(selectValue(res.html, { ...cfg.pagination.nextLink, multiple: false }, { baseUrl: res.finalUrl }) || '') || undefined
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
  const title = parsed.title?.trim()
  if (!title) return { ok: false, message: '书名解析为空，请检查书名选择器', elapsedMs: Date.now() - started }

  const { cleanIntro } = await import('./cleaner')
  const intro = parsed.intro ? cleanIntro(parsed.intro, mergeCleaning()) : ''
  const keywords = (parsed.keywords ?? '').split(/[,，、|\s]+/).filter(Boolean).slice(0, 12).join(',')
  const match = smartMatchCategory({
    title,
    intro,
    keywords: keywords.split(',').filter(Boolean),
    sourceCategory: parsed.category,
  })
  const completion = detectCompletion({ status: parsed.status, latestChapter: parsed.latestChapter, intro })
  let coverResolved = parsed.cover ?? ''
  if (coverResolved) coverResolved = resolveUrl(coverResolved, res.finalUrl)

  return {
    ok: true,
    message: '书籍信息解析成功',
    elapsedMs: Date.now() - started,
    data: {
      strategy: res.strategy,
      finalUrl: res.finalUrl,
      fields: {
        书名: title,
        作者: parsed.author ?? '',
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
  const scrambled = disorderCount >= 2

  let ordered: { title: string; url: string }[] = all.map((e) => ({ title: e.title, url: e.url }))
  if (cfg.reorder?.enabled && scrambled) {
    ordered = [...all].sort((a, b) => (a.no >= 0 ? a.no : 1e9) - (b.no >= 0 ? b.no : 1e9)).map((e) => ({ title: e.title, url: e.url }))
  }
  const before = ordered.length
  if (cfg.dedup?.byUrl !== false) {
    const seen = new Set<string>()
    ordered = ordered.filter((e) => {
      const k = e.url || e.title
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
      strategy: res0(pages),
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

function res0(pages: { url: string }[]): string {
  return pages[0]?.url ?? ''
}

async function testContent(cfg: ContentRuleConfig, url: string, started: number): Promise<TestResponse> {
  if (!cfg?.content?.expr) return { ok: false, message: '正文选择器不能为空' }
  const cleaning = mergeCleaning()
  const parts: string[] = []
  let pageUrl = url
  let pageCount = 1
  const maxPages = cfg.pagination?.enabled ? Math.min(cfg.pagination.maxConcat ?? 5, 5) : 1
  for (let i = 0; i < maxPages; i++) {
    const res = await fetchPage(pageUrl, cfg)
    const raw = parseContentHtml(res.html, cfg.content)
    if (raw) {
      const cleaned = cleanContent(raw, cleaning, cfg.extraAdPatterns ?? [])
      parts.push(cleaned.text)
    }
    if (!cfg.pagination?.enabled || !cfg.pagination.nextLink?.expr) break
    const { selectValue } = await import('./parser')
    const next = String(selectValue(res.html, { ...cfg.pagination.nextLink, multiple: false }, { baseUrl: res.finalUrl }) || '')
    if (!next || !/^https?:\/\//.test(next)) break
    pageUrl = next
    pageCount++
  }
  const text = parts.filter(Boolean).join('\n')
  if (!text) return { ok: false, message: '正文解析为空，请检查正文选择器', elapsedMs: Date.now() - started }
  return {
    ok: true,
    message: `正文解析成功：${text.replace(/\s/g, '').length} 字，共 ${pageCount} 页`,
    elapsedMs: Date.now() - started,
    data: {
      pagesFetched: pageCount,
      wordCount: text.replace(/\s/g, '').length,
      paragraphCount: text.split('\n').filter(Boolean).length,
      preview: text.slice(0, 500),
    },
  }
}
