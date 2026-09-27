import * as cheerio from 'cheerio'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'
import type { Document as XmlDocument } from '@xmldom/xmldom'
import { select as xpathSelect } from 'xpath'
import type { AnyNode, Element } from 'domhandler'
import type { FieldSelector, ListItemSelectors } from '../collect-types'

// ============================================================
// 统一选择器引擎：css / regex / xpath 三种模式同时可用
// ============================================================

/** 常见命名实体 → 字符（XML 解析前需要把命名实体转为字面量） */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: '\u00a0', copy: '©', reg: '®', trade: '™', mdash: '—', ndash: '–',
  hellip: '…', ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019',
  middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷', laquo: '«',
  raquo: '»', yen: '¥', sect: '§', para: '¶', permil: '‰',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', bull: '•',
  sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
}

function decodeNamedEntities(input: string): string {
  return input.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name: string) => {
    if (name === 'amp' || name === 'lt' || name === 'gt' || name === 'quot' || name === 'apos') return m
    const v = NAMED_ENTITIES[name]
    return v !== undefined ? v : ' '
  })
}

/** 把 HTML 规范化为可被 xmldom 解析的 XML（关闭标签、去 doctype/注释、解码实体） */
function htmlToXml(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, noscript').remove()
  $('*')
    .contents()
    .each((_, node) => {
      if (node.type === 'comment') $(node).remove()
    })
  let xml = $.html()
  xml = xml.replace(/<!DOCTYPE[^>]*>/gi, '')
  xml = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  return decodeNamedEntities(xml)
}

const xmlParser = new DOMParser({ onError: () => undefined })

function parseHtmlAsXml(html: string): XmlDocument | null {
  try {
    return xmlParser.parseFromString(htmlToXml(html), 'text/xml')
  } catch {
    return null
  }
}

type XmlDomNodeLike = {
  nodeType?: number
  value?: string
  nodeValue?: string | null
  textContent?: string
  getAttribute?: (name: string) => string
}

function attrFromNode($: cheerio.CheerioAPI, el: AnyNode, attr: string): string {
  const $el = $(el)
  if (attr === 'text') return $el.text()
  if (attr === 'html') return $el.html() ?? ''
  if (attr === 'outerHtml') return $.html(el)
  if (attr === 'textContent') return $el.prop('textContent') ?? ''
  return $el.attr(attr) ?? ''
}

function collapseWs(s: string): string {
  return s.replace(/[ \t\r\n\f\v]+/g, ' ').trim()
}

function cleanText(s: string): string {
  return collapseWs(s.replace(/\u00a0/g, ' '))
}

/** 在 cheerio 作用域内应用 css 相对选择器 */
function cssSelectScope($: cheerio.CheerioAPI, scope: AnyNode | null, expr: string): AnyNode[] {
  if (!expr) return scope ? [scope] : []
  if (!scope) return $(expr).toArray()
  const $scope = $(scope) as unknown as cheerio.Cheerio<Element>
  const found = $scope.find(expr).toArray() as AnyNode[]
  if (found.length === 0 && $(scope).is(expr)) return [scope]
  return found
}

interface SelectorOpts {
  scopeNode?: AnyNode
  $?: cheerio.CheerioAPI
  baseUrl?: string
}

/** 单一选择器提取（支持 css/regex/xpath） */
const URL_ATTRS = new Set([
  'href', 'src', 'data-src', 'data-original', 'data-url', 'data-lazy-src',
  'data-lazyload', 'data-srcset', 'poster', 'action', 'cite', 'icon', 'manifest', 'longdesc', 'srcset',
])

export function selectValue(html: string, sel: FieldSelector, opts: SelectorOpts = {}): string | string[] {
  if (!sel || !sel.expr) return sel?.multiple ? [] : ''
  const trim = sel.trim !== false
  // attr 明确为 URL 语义属性时总是尝试相对→绝对解析；其他属性（如 content/text）仅在值形如链接时解析
  const urlSemantics = sel.attr !== undefined && URL_ATTRS.has(sel.attr)
  const finish = (v: string) => {
    let out = trim ? v.trim() : v
    if (opts.baseUrl && out) {
      const looksUrl = /^(https?:\/\/|\/\/|\/)/i.test(out)
      if (urlSemantics) {
        if (!/^(data|javascript|mailto|tel):/i.test(out)) out = resolveUrl(out, opts.baseUrl)
      } else if (looksUrl) {
        out = resolveUrl(out, opts.baseUrl)
      }
    }
    return out
  }

  // ---------- CSS ----------
  if (sel.mode === 'css') {
    const $ = opts.$ ?? cheerio.load(html)
    const nodes = cssSelectScope($, opts.scopeNode ?? null, sel.expr)
    const attr = sel.attr ?? 'text'
    const picked = sel.multiple ? nodes : nodes.slice(0, 1)
    const vals = picked
      .map((n) => finish(attrFromNode($, n, attr)))
      .filter((v) => v !== '')
    return sel.multiple ? vals : vals[0] ?? ''
  }

  // ---------- Regex ----------
  if (sel.mode === 'regex') {
    let source = html
    if (opts.scopeNode && opts.$) {
      source = opts.$.html(opts.scopeNode) ?? ''
    }
    let re: RegExp
    try {
      re = new RegExp(sel.expr, sel.multiple ? 'g' : '')
    } catch {
      return sel.multiple ? [] : ''
    }
    if (sel.multiple) {
      const out: string[] = []
      for (const m of source.matchAll(re)) {
        const g = sel.group ?? 1
        const v = (m[g] ?? m[0] ?? '').toString()
        if (v.trim() !== '') out.push(finish(v))
      }
      return out
    }
    const m = re.exec(source)
    if (!m) return ''
    const g = sel.group ?? 1
    return finish((m[g] ?? m[0] ?? '').toString())
  }

  // ---------- XPath ----------
  let source = html
  if (opts.scopeNode && opts.$) {
    source = opts.$.html(opts.scopeNode) ?? ''
  }
  const doc = parseHtmlAsXml(source)
  if (!doc) return sel.multiple ? [] : ''
  let results: unknown[] = []
  try {
    const scopeEl = opts.scopeNode ? doc.documentElement : undefined
    results = xpathSelect(sel.expr, scopeEl ?? doc)
  } catch {
    return sel.multiple ? [] : ''
  }
  const attr = sel.attr ?? 'text'
  const serializer = new XMLSerializer()
  const vals = results
    .map((r) => {
      const node = r as XmlDomNodeLike
      if (node && typeof node.nodeType === 'number') {
        if (node.nodeType === 2) return node.value ?? '' // attribute
        if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? '' // text/cdata
        if (node.nodeType === 1) {
          if (attr === 'text' || attr === 'textContent') return node.textContent ?? ''
          if (attr === 'html' || attr === 'outerHtml') return serializer.serializeToString(r as unknown as import("@xmldom/xmldom").Node)
          if (node.getAttribute) return node.getAttribute(attr) ?? ''
        }
      }
      return String(r ?? '')
    })
    .map(finish)
    .filter((v) => v !== '')
  return sel.multiple ? vals : vals[0] ?? ''
}

export function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return ''
  try {
    return new URL(href, baseUrl).href
  } catch {
    return href
  }
}

/** 字段集合提取 */
export function parseFields(
  html: string,
  fields: Record<string, FieldSelector | undefined>,
  baseUrl?: string
): Record<string, string> {
  const $ = cheerio.load(html)
  const out: Record<string, string> = {}
  for (const [key, sel] of Object.entries(fields)) {
    if (!sel || !sel.expr) continue
    const v = selectValue(html, sel, { $, baseUrl })
    out[key] = typeof v === 'string' ? v : v[0] ?? ''
  }
  return out
}

export interface ParsedListEntry {
  title: string
  url: string
  raw: string
}

/** 列表项解析（列表页/目录页通用） */
export function parseListEntries(html: string, items: ListItemSelectors, baseUrl: string): ParsedListEntry[] {
  const entries: ParsedListEntry[] = []
  const itemSel = items.item
  if (!itemSel?.expr) return entries

  if (itemSel.mode === 'regex') {
    let re: RegExp
    try {
      re = new RegExp(itemSel.expr, 'g')
    } catch {
      return entries
    }
    for (const m of html.matchAll(re)) {
      const raw = m[0] ?? ''
      let title = m[1] ?? ''
      let link = m[2] ?? ''
      if (items.title?.expr) title = String(selectValue(raw, { ...items.title, multiple: false }) || '')
      if (items.link?.expr) link = String(selectValue(raw, { ...items.link, multiple: false }) || '')
      entries.push({ title: cleanText(title), url: link ? resolveUrl(link, baseUrl) : '', raw })
    }
    return entries
  }

  if (itemSel.mode === 'xpath') {
    const doc = parseHtmlAsXml(html)
    if (!doc) return entries
    const serializer = new XMLSerializer()
    let nodes: unknown[] = []
    try {
      nodes = xpathSelect(itemSel.expr, doc)
    } catch {
      return entries
    }
    const fragments = nodes
      .filter((n) => (n as XmlDomNodeLike).nodeType === 1)
      .map((n) => serializer.serializeToString(n as unknown as import('@xmldom/xmldom').Node))
    return entriesFromFragments(fragments, items, baseUrl)
  }

  // ---------- CSS ----------
  const $ = cheerio.load(html)
  const nodes = cssSelectScope($, null, itemSel.expr)
  for (const el of nodes) {
    const $el = $(el)
    const raw = $.html(el)
    let title = ''
    let link = ''
    if (items.title?.expr) {
      const t = selectValue(raw, { ...items.title, multiple: false }, { $, scopeNode: el, baseUrl })
      title = typeof t === 'string' ? t : ''
    } else {
      title = $el.text()
    }
    if (items.link?.expr) {
      const l = selectValue(raw, { ...items.link, multiple: false }, { $, scopeNode: el, baseUrl })
      link = typeof l === 'string' ? l : ''
    } else if ($el.is('a')) {
      link = $el.attr('href') ?? ''
    } else {
      link = $el.find('a').first().attr('href') ?? ''
    }
    entries.push({ title: cleanText(title), url: link ? resolveUrl(link, baseUrl) : '', raw })
  }
  return entries
}

/** 对独立 html 片段列表执行相对选择（xpath 列表场景） */
function entriesFromFragments(fragments: string[], items: ListItemSelectors, baseUrl: string): ParsedListEntry[] {
  const out: ParsedListEntry[] = []
  for (const frag of fragments) {
    let title = ''
    let link = ''
    if (items.title?.expr) title = String(selectValue(frag, { ...items.title, multiple: false }, { baseUrl }) || '')
    else title = frag.replace(/<[^>]+>/g, ' ')
    if (items.link?.expr) link = String(selectValue(frag, { ...items.link, multiple: false }, { baseUrl }) || '')
    else {
      const m = /href=["']?([^"'\s>]+)/i.exec(frag)
      link = m?.[1] ?? ''
    }
    out.push({ title: cleanText(title), url: link ? resolveUrl(link, baseUrl) : '', raw: frag })
  }
  return out
}

/** 正文选择器提取（保留段落换行） */
export function parseContentHtml(html: string, sel: FieldSelector): string {
  if (!sel?.expr) return ''
  if (sel.mode === 'css') {
    const $ = cheerio.load(html)
    if (sel.multiple) {
      const parts = $(sel.expr)
        .toArray()
        .map((el) => nodeToText($, el))
      return parts.filter(Boolean).join('\n')
    }
    const el = $(sel.expr).first()
    if (el.length === 0) return ''
    return nodeToText($, el.get(0) as AnyNode)
  }
  if (sel.mode === 'regex') {
    const v = selectValue(html, sel)
    return typeof v === 'string' ? v : v.join('\n')
  }
  // xpath
  const doc = parseHtmlAsXml(html)
  if (!doc) return ''
  try {
    const results = xpathSelect(sel.expr, doc)
    const serializer = new XMLSerializer()
    return results
      .map((r) => {
        const node = r as XmlDomNodeLike
        if (node?.nodeType === 1) return serializer.serializeToString(r as unknown as import("@xmldom/xmldom").Node)
        if (node?.nodeType === 3 || node?.nodeType === 4) return node.nodeValue ?? ''
        return String(r ?? '')
      })
      .filter(Boolean)
      .join('\n')
  } catch {
    return ''
  }
}

function nodeToText($: cheerio.CheerioAPI, el: AnyNode): string {
  const $el = $(el)
  $el.find('script, style, iframe, ins, noscript').remove()
  // 保留块级结构：p/div/br 转换行
  const $clone = $el.clone()
  $clone.find('br').replaceWith('\n')
  $clone.find('p, div').after('\n')
  const text = $clone.text()
  return text
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}
