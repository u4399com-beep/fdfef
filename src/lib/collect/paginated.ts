import type { FetchConfig, PaginationConfig } from '../collect-types'
import { fetchPage, randomInt, sleep } from './fetcher'
import { selectValue } from './parser'

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
