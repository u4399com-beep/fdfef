import type { CleaningConfig, ContentRuleConfig, FetchConfig, PaginationConfig } from '../collect-types'
import { fetchPage, randomInt, sleep } from './fetcher'
import { parseContentHtml, selectValue } from './parser'
import { cleanContent } from './cleaner'

/** 分页抓取：nextLink 跟随 / URL 模板区间 / select 下拉枚举（列表页、目录页、内容页通用） */
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
  // maxPages≤0/负数的配置错误不产生空页集（nextLink 模式循环不执行会返回 []，上游误判"目录为空"）
  const cap = Math.max(1, Math.min(pagination.maxPages ?? hardCap, hardCap))
  const pages: { url: string; html: string }[] = []
  const sleepBetween = () => sleep(randomInt(400, 1200))

  if (pagination.mode === 'template' && pagination.urlTemplate) {
    const start = Math.max(1, pagination.startPage ?? 1)
    // endPage < startPage 的配置错误不应返回空页集（上游会误判为“目录为空/无书籍”）
    const end = Math.max(start, Math.min(pagination.endPage ?? start, start + cap - 1))
    for (let p = start; p <= end; p++) {
      const url = pagination.urlTemplate.replace('{page}', String(p))
      const r = await fetchPage(url, cfg)
      pages.push({ url: r.finalUrl, html: r.html })
      if (p < end) await sleepBetween()
    }
    return pages
  }

  if (pagination.mode === 'select' && pagination.nextLink?.expr) {
    // 下拉选页：解析 select option value 枚举全部分页地址（相对地址按当前页解析），
    // 跳过起始页自身与重复值，逐页抓取（对末页"下一页"指向书籍页的蜜罐免疫）
    const r0 = await fetchPage(startUrl, cfg)
    pages.push({ url: r0.finalUrl, html: r0.html })
    const rawVals = selectValue(r0.html, { ...pagination.nextLink, multiple: true }, { baseUrl: r0.finalUrl })
    const seen = new Set([r0.finalUrl.replace(/\/$/, ''), r0.finalUrl])
    const queue: string[] = []
    if (Array.isArray(rawVals)) {
      for (const v of rawVals) {
        const key = v.replace(/\/$/, '')
        if (!v || seen.has(key) || seen.has(v)) continue
        seen.add(key)
        seen.add(v)
        queue.push(v)
      }
    }
    for (const url of queue) {
      if (pages.length >= cap) break
      const r = await fetchPage(url, cfg)
      pages.push({ url: r.finalUrl, html: r.html })
      await sleepBetween()
    }
    return pages
  }

  // nextLink 跟随
  let url = startUrl
  const visited = new Set<string>()
  for (let i = 0; i < cap; i++) {
    const r = await fetchPage(url, cfg)
    pages.push({ url: r.finalUrl, html: r.html })
    visited.add(r.finalUrl)
    if (!pagination.nextLink?.expr) break
    const next = String(selectValue(r.html, { ...pagination.nextLink, multiple: false }, { baseUrl: r.finalUrl }) || '')
    // 已访问页再次出现（站点分页 bug：末页下一页指回前页成环）时终止，避免空转到上限浪费请求
    if (!next || !/^https?:\/\//.test(next) || next === r.finalUrl || visited.has(next)) break
    url = next
    await sleepBetween()
  }
  return pages
}

/**
 * 内容分页防跨章保护：归一化分页 base（剥去 _N.html 后缀与查询串）。
 * xnnmummd.html 与 xnnmummd_1.html → 同一 base；下一章 xnnmummb.html → 不同 base。
 */
function pageBase(url: string): string {
  try {
    const u = new URL(url)
    u.search = ''
    u.hash = ''
    const m = /_(\d+)(\.x?html?|\/)?$/i.exec(u.pathname)
    if (m) u.pathname = u.pathname.slice(0, m.index)
    else u.pathname = u.pathname.replace(/\.(x?html?)$/i, '')
    return u.href.replace(/\/$/, '')
  } catch {
    return url
  }
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
    ? Math.max(1, Math.min(pagination.maxPages ?? 5, pagination.maxConcat ?? 5, 10))
    : 1
  let url = startUrl
  let pages = 0
  const visited = new Set<string>()
  for (let i = 0; i < maxPages; i++) {
    const res = await fetchPage(url, rule)
    pages++
    visited.add(res.finalUrl)
    const rawHtml = parseContentHtml(res.html, rule.content)
    if (rawHtml) {
      const cleaned = cleanContent(rawHtml, cleaningCfg, rule.extraAdPatterns ?? [])
      parts.push(cleaned.text)
    }
    if (!pagination?.enabled || !pagination.nextLink?.expr) break
    const next = String(
      selectValue(res.html, { ...pagination.nextLink, multiple: false }, { baseUrl: res.finalUrl }) || ''
    )
    // 环检测：指向已抓取过的页（分页 bug / 末页回指）时终止，防止重复拼接同一段正文
    if (!next || !/^https?:\/\//.test(next) || next === res.finalUrl || visited.has(next)) break
    // 防跨章保护：下一页必须与当前页同 base（剥去 _N.html 后缀一致），否则立即终止
    // （部分站点把"下一章"伪装成"下一页"，误跟会把整本书正文合并进一章）
    if (pagination.sameChapterOnly && pageBase(next) !== pageBase(res.finalUrl)) break
    url = next
    await sleep(randomInt(300, 1000))
  }
  return { text: parts.filter(Boolean).join('\n'), pages }
}
