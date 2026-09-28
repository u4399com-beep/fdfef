// ============================================================
// 多搜索引擎下拉关键词抓取（百度 / 必应 / 360 / DuckDuckGo / 谷歌）
// 用于书籍辅助标签与关联词，独立关键词页均指向主书籍信息页
// ============================================================

import { randomUA } from './fetcher'

export interface SuggestSourceResult {
  source: string
  keywords: string[]
  error?: string
}

const TIMEOUT = 4500

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': randomUA(),
      Accept: 'application/json, text/plain, */*',
      Referer: new URL(url).origin,
    },
    signal: AbortSignal.timeout(TIMEOUT),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  // 兼容 jsonp / 前缀垃圾：定位首个 { 或 [
  const starts = ['{', '['].map((c) => text.indexOf(c)).filter((i) => i >= 0)
  if (starts.length === 0) throw new Error('响应不是 JSON')
  const candidate = text.slice(Math.min(...starts))
  try {
    return JSON.parse(candidate)
  } catch {
    // JSONP 包裹形如 cb({...}) / cb([...])：截到最后一个 } 或 ] 再试一次
    const last = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
    if (last < 0) throw new Error('响应不是 JSON')
    return JSON.parse(candidate.slice(0, last + 1))
  }
}

function asStringArray(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map((x) => {
      if (typeof x === 'string') return x
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        const val = o.k ?? o.w ?? o.word ?? o.s ?? o.q ?? o.text ?? o.name
        return typeof val === 'string' ? val : ''
      }
      return ''
    })
    .filter((s) => s.trim() !== '')
    .slice(0, max)
}

async function withTimeout(name: string, fn: () => Promise<string[]>): Promise<SuggestSourceResult> {
  try {
    const keywords = await fn()
    return { source: name, keywords }
  } catch (e) {
    return { source: name, keywords: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** 百度下拉 */
function baidu(q: string): Promise<string[]> {
  return fetchJson(`https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(q)}`).then((data) => {
    const g = (data as { g?: unknown[] }).g
    return asStringArray(g)
  })
}

/** 必应下拉 */
function bing(q: string): Promise<string[]> {
  return fetchJson(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}`).then((data) => {
    const arr = data as [string, unknown[]]
    return asStringArray(arr?.[1])
  })
}

/** 360 下拉 */
function so360(q: string): Promise<string[]> {
  return fetchJson(
    `https://sug.so.360.cn/suggest?word=${encodeURIComponent(q)}&encodein=utf-8&encodeout=utf-8&format=json`
  ).then((data) => asStringArray((data as { s?: unknown }).s ?? data))
}

/** DuckDuckGo 下拉 */
function duckduckgo(q: string): Promise<string[]> {
  return fetchJson(`https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`).then((data) => {
    const arr = data as [string, unknown[]]
    return asStringArray(arr?.[1])
  })
}

/** 谷歌下拉 */
function google(q: string): Promise<string[]> {
  return fetchJson(
    `https://suggestqueries.google.com/complete/search?client=firefox&hl=zh-CN&q=${encodeURIComponent(q)}`
  ).then((data) => {
    const arr = data as [string, unknown[]]
    return asStringArray(arr?.[1])
  })
}

/** 抓取全部搜索引擎下拉词 */
export async function fetchSuggestKeywords(title: string): Promise<SuggestSourceResult[]> {
  const q = title.trim().slice(0, 30)
  if (!q) return []
  const results = await Promise.all([
    withTimeout('baidu', () => baidu(q)),
    withTimeout('bing', () => bing(q)),
    withTimeout('360', () => so360(q)),
    withTimeout('duckduckgo', () => duckduckgo(q)),
    withTimeout('google', () => google(q)),
  ])
  return results
}

/** 合并去重（排除书名自身），返回统一关联词列表 */
export function mergeSuggestKeywords(results: SuggestSourceResult[], bookTitle: string, cap = 30): string[] {
  const seen = new Set<string>([bookTitle.trim()])
  const merged: string[] = []
  for (const r of results) {
    for (const kw of r.keywords) {
      const k = kw.trim()
      if (!k || seen.has(k)) continue
      seen.add(k)
      merged.push(k)
      if (merged.length >= cap) return merged
    }
  }
  return merged
}
