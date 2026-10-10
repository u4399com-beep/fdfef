import type { CleaningConfig, ContentRuleConfig, FetchConfig, PaginationConfig } from '../collect-types'
import { fetchPage, randomInt, sleep } from './fetcher'
import { parseContentHtml, resolveUrl, selectValue } from './parser'
import { cleanContent } from './cleaner'

/**
 * 分页链接取值归一化（三处共用）：绝对地址原样返回；相对地址（page_2.html、/list-2.html、//cdn/x.html）
 * 按当前页补全——regex/xpath 捕获与 select option value 不满足 selectValue 的 looksUrl 门控
 * （^https?|^//|^/ 才解析），需在此补全，否则多页目录会被截成单页。
 * 纯页码数字等非地址值无法安全解释（resolveUrl 会拼出 base 目录下错误地址），返回空串由调用方跳过。
 */
/**
 * 数字页码 → 查询参数分页地址（select 模式 option value 为纯页码的站点，如 rqwb 家族 ?page=2）。
 * baseUrl 非法返回空串（调用方跳过该页）。
 */
export function buildPageParamUrl(baseUrl: string, param: string, page: number): string {
  try {
    const u = new URL(baseUrl)
    u.searchParams.set(param, String(page))
    return u.href
  } catch {
    return ''
  }
}

function normalizePageLink(raw: string, baseUrl: string): string {
  const v = (raw || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  // 可安全解释为相对地址：含路径分隔符或带文件扩展名（.html/.php/...）
  if (!/\/[/?]|[.][a-z]{2,8}$/i.test(v)) return ''
  return resolveUrl(v, baseUrl)
}

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
  // 页间轻抖动：同域请求间隔已由 DomainThrottle 统一保证（自适应巡航），
  // 此处仅保留小幅随机化对抗朴素频率统计，不再叠加整段长睡（旧 400-1200ms 为双重等待）
  const sleepBetween = () => sleep(randomInt(200, 600))

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
        // 非地址值（纯页码数字等）默认跳过而非让 fetchPage 抛「非法 URL」使整书目录采集失败；
        // 配置 pageParam 时纯数字页码按查询参数构造分页地址（value=2 → 当前页?page=2），
        // 页码 1 即起始页自身跳过；服务端若无视该参数总返全量目录，重叠页由 seen 去重吸收
        const pageNum = /^\d{1,5}$/.test(v.trim()) ? Number.parseInt(v.trim(), 10) : 0
        const abs =
          normalizePageLink(v, r0.finalUrl) ||
          (pagination.pageParam && pageNum >= 2 ? buildPageParamUrl(r0.finalUrl, pagination.pageParam, pageNum) : '')
        if (!abs) continue
        if (seen.has(abs) || seen.has(abs.replace(/\/$/, ''))) continue
        seen.add(abs)
        seen.add(abs.replace(/\/$/, ''))
        queue.push(abs)
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
    const nextRaw = String(selectValue(r.html, { ...pagination.nextLink, multiple: false }, { baseUrl: r.finalUrl }) || '')
    const next = normalizePageLink(nextRaw, r.finalUrl)
    // 已访问页再次出现（站点分页 bug：末页下一页指回前页成环）时终止，避免空转到上限浪费请求
    if (!next || next === r.finalUrl || visited.has(next)) break
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
 * context（书名/章节标题）透传给清洗器用于章首结构性垃圾识别。
 */
export async function fetchCleanedContent(
  startUrl: string,
  rule: ContentRuleConfig,
  cleaningCfg: CleaningConfig,
  context: { bookTitle?: string; chapterTitle?: string } = {}
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
      const cleaned = cleanContent(rawHtml, cleaningCfg, rule.extraAdPatterns ?? [], context)
      parts.push(cleaned.text)
    }
    if (!pagination?.enabled || !pagination.nextLink?.expr) break
    const nextRaw = String(
      selectValue(res.html, { ...pagination.nextLink, multiple: false }, { baseUrl: res.finalUrl }) || ''
    )
    const next = normalizePageLink(nextRaw, res.finalUrl)
    // 环检测：指向已抓取过的页（分页 bug / 末页回指）时终止，防止重复拼接同一段正文
    if (!next || next === res.finalUrl || visited.has(next)) break
    // 防跨章保护：下一页必须与当前页同 base（剥去 _N.html 后缀一致），否则立即终止
    // （部分站点把"下一章"伪装成"下一页"，误跟会把整本书正文合并进一章）
    if (pagination.sameChapterOnly && pageBase(next) !== pageBase(res.finalUrl)) break
    url = next
    // 页间轻抖动：同域间隔已由 DomainThrottle 保证，这里仅对抗频率统计（旧 300-1000ms 为冗余叠加）
    await sleep(randomInt(120, 400))
  }
  return { text: parts.filter(Boolean).join('\n'), pages }
}
