import * as cheerio from 'cheerio'
import type { CleaningConfig } from '../collect-types'

// ============================================================
// 内容清洗系统：广告清洗、HTML 标签规范化、实体解码、段落规范
// ============================================================

const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  copy: '©', reg: '®', mdash: '—', ndash: '–', hellip: '…',
  ldquo: '\u201c', rdquo: '\u201d', lsquo: '\u2018', rsquo: '\u2019', middot: '·',
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        const cp = parseInt(hex, 16)
        return cp > 0 && cp < 0x10ffff ? String.fromCodePoint(cp) : ' '
      } catch {
        return ' '
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        const cp = parseInt(dec, 10)
        return cp > 0 && cp < 0x10ffff ? String.fromCodePoint(cp) : ' '
      } catch {
        return ' '
      }
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name: string) => ENTITY_MAP[name] ?? m)
}

export interface CleanResult {
  text: string // 规范化纯文本（段落 \n 分隔）
  wordCount: number
  removedLines: number
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/** 判断一行是否像正文段落（以中文/字母开头，非纯符号） */
function isContentLine(line: string): boolean {
  if (!line) return false
  const stripped = line.replace(/[\s。，、；：？！…—·《》""''()（）\[\]【】-]/g, '')
  return stripped.length > 0
}

/**
 * 清洗章节正文/简介 HTML：
 * 1. 移除 script/style/iframe 等标签  2. 广告正则清洗（整行/行内）
 * 3. 实体解码  4. 段落规范化（缩进、空行合并）
 */
export function cleanContent(
  rawHtml: string,
  cfg: CleaningConfig,
  extraAdPatterns: string[] = []
): CleanResult {
  const $ = cheerio.load(rawHtml)
  for (const tag of cfg.removeTags) $(tag).remove()

  // 块级结构 → 换行
  const $clone = $.root().clone()
  $clone.find('br').replaceWith('\n')
  $clone.find('p, div, li, dd, dt, section, article').after('\n')

  let raw = $clone.text()
  raw = decodeEntities(raw)

  const adRegexes = [...cfg.adPatterns, ...extraAdPatterns]
    .map(safeRegex)
    .filter((r): r is RegExp => r !== null)

  let removed = 0
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)

  const kept: string[] = []
  for (const line of lines) {
    // 广告清洗：循环应用全部命中规则（先剔除 URL，再剔除站点话术，直至整行清除）
    let cleaned = line
    let matched = false
    for (const re of adRegexes) {
      if (re.test(cleaned)) {
        cleaned = cleaned.replace(new RegExp(re.source, 'g'), '').trim()
        matched = true
      }
    }
    if (matched) {
      removed++
      // 剔除后剩余内容仍像正文则保留，否则整行丢弃
      if (isContentLine(cleaned) && cleaned.length >= 4) {
        kept.push(cleaned)
      }
      continue
    }
    if (cfg.minParagraphLength > 0 && line.length < cfg.minParagraphLength) {
      removed++
      continue
    }
    kept.push(line)
  }

  let text = kept.join('\n')
  if (cfg.normalizeParagraphs) {
    text = text.replace(/\n{3,}/g, '\n\n').trim()
  }
  return { text, wordCount: text.replace(/\s/g, '').length, removedLines: removed }
}

/** 简介清洗（保留换行，宽松清洗） */
export function cleanIntro(rawHtml: string, cfg: CleaningConfig): string {
  const result = cleanContent(rawHtml, { ...cfg, minParagraphLength: 0 })
  return result.text.slice(0, 3000)
}
