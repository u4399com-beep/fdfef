import type { CleaningConfig, ContentRuleConfig, FetchConfig, PaginationConfig } from '../collect-types'
import { fetchPage, randomInt, sleep } from './fetcher'
import { parseContentHtml, selectValue } from './parser'
import { cleanContent } from './cleaner'

/** 分页抓取：nextLink 跟随 / URL 模板区间（列表页、目录页、内容页通用） */
export async function fetchPaginated(
  startUrl: string,
  cfg: FetchConfig,
  pagination: PaginationConfig | undefined,
  hardCap: number
): Promise<{ url: string; html: string }[]> {
  if (!pagination?.enabled) {
    const r = await fetchPage(startUrl, cfg)
    return [{ url: r.finalUrl, html: r.html }]
  }
  const cap = Math.min(pagination.maxPages ?? hardCap, hardCap)
  const pages: { url: string; html: string }[] = []

  if (pagination.mode === 'template' && pagination.urlTemplate) {
    const start = pagination.startPage ?? 1
    const end = Math.min(pagination.endPage ?? start, start + cap - 1)
    for (let p = start; p <= end; p++) {
      const url = pagination.urlTemplate.replace('{page}', String(p))
      const r = await fetchPage(url, cfg)
      pages.push({ url: r.finalUrl, html: r.html })
      if (p < end) await sleep(randomInt(400, 1200))
    }
    return pages
  }

  // nextLink 跟随
  let url = startUrl
  for (let i = 0; i < cap; i++) {
    const r = await fetchPage(url, cfg)
    pages.push({ url: r.finalUrl, html: r.html })
    if (!pagination.nextLink?.expr) break
    const next = String(selectValue(r.html, { ...pagination.nextLink, multiple: false }, { baseUrl: r.finalUrl }) || '')
    if (!next || !/^https?:\/\//.test(next) || next === r.finalUrl) break
    url = next
    await sleep(randomInt(400, 1200))
  }
  return pages
}

/**
 * 抓取并清洗章节正文（内容页分页合并 + 广告清洗）。
 * 采集管线与规则测试引擎共用此实现，避免双份逻辑漂移。
 */
export async function fetchCleanedContent(
  startUrl: string,
  rule: ContentRuleConfig,
  cleaningCfg: CleaningConfig
): Promise<{ text: string; pages: number }> {
  const parts: string[] = []
  const pagination = rule.pagination
  const maxPages = pagination?.enabled
    ? Math.min(pagination.maxPages ?? 5, pagination.maxConcat ?? 5, 10)
    : 1
  let url = startUrl
  let pages = 0
  for (let i = 0; i < maxPages; i++) {
    const res = await fetchPage(url, rule)
    pages++
    const rawHtml = parseContentHtml(res.html, rule.content)
    if (rawHtml) {
      const cleaned = cleanContent(rawHtml, cleaningCfg, rule.extraAdPatterns ?? [])
      parts.push(cleaned.text)
    }
    if (!pagination?.enabled || !pagination.nextLink?.expr) break
    const next = String(
      selectValue(res.html, { ...pagination.nextLink, multiple: false }, { baseUrl: res.finalUrl }) || ''
    )
    if (!next || !/^https?:\/\//.test(next) || next === res.finalUrl) break
    url = next
    await sleep(randomInt(300, 1000))
  }
  return { text: parts.filter(Boolean).join('\n'), pages }
}
