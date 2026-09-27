import { db } from '@/lib/db'
import { mergeDownload } from '../collect-types'
import { readChapterTxt } from './storage'

// ============================================================
// 小说文件下载系统：站点信息 / 广告 / 混淆 注入（后台可配置）
// ============================================================

const ZERO_WIDTH = ['\u200b', '\u200c', '\u200d', '\ufeff']
const LOOKALIKE: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', A: 'А', B: 'В',
  E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', X: 'Х',
}
const RARE_CHARS = '攴夂彐疒辶镸飠黾鼍齾龘靐齉爩鱻麤龗灪吁'

/** 按配置混淆章节文本 */
export function obfuscateText(text: string, cfg: { mode: string; rate: number }): string {
  if (!text) return text
  const rate = Math.min(0.2, Math.max(0, cfg.rate))
  if (rate <= 0) return text

  if (cfg.mode === 'zero-width') {
    let out = ''
    for (const ch of text) {
      out += ch
      if (/\S/.test(ch) && Math.random() < rate) {
        out += ZERO_WIDTH[Math.floor(Math.random() * ZERO_WIDTH.length)]
      }
    }
    return out
  }

  if (cfg.mode === 'lookalike') {
    let out = ''
    for (const ch of text) {
      if (Math.random() < rate) {
        const mapped = LOOKALIKE[ch]
        out += mapped ?? ch
      } else {
        out += ch
      }
    }
    return out
  }

  // junk-line：随机插入干扰行
  const lines = text.split('\n')
  const out: string[] = []
  for (const line of lines) {
    out.push(line)
    if (Math.random() < rate * 3) {
      let junk = ''
      const len = 6 + Math.floor(Math.random() * 14)
      for (let i = 0; i < len; i++) junk += RARE_CHARS[Math.floor(Math.random() * RARE_CHARS.length)]
      out.push(junk)
    }
  }
  return out.join('\n')
}

function fillTemplate(tpl: string, siteName: string, domain: string): string {
  return tpl.replaceAll('{siteName}', siteName).replaceAll('{domain}', domain)
}

export interface BuiltDownload {
  filename: string
  content: string
}

/** 构建整本书的 txt 下载文件 */
export async function buildBookTxt(bookId: string, siteName?: string, domain?: string): Promise<BuiltDownload | null> {
  const book = await db.book.findUnique({ where: { id: bookId }, include: { chapters: { orderBy: { order: 'asc' } } } })
  if (!book) return null

  const cfgRow = await db.systemConfig.findUnique({ where: { id: 'main' } })
  const cfg = mergeDownload(cfgRow?.download)

  const site = siteName?.trim() || (await db.siteConfig.findFirst())?.siteName || '小说站'
  const dom = domain?.trim() || (await db.siteConfig.findFirst())?.domain || 'localhost'

  const parts: string[] = []
  parts.push(`《${book.title}》`)
  parts.push(`作者：${book.author || '佚名'}`)
  parts.push(`分类：${book.category || '其他'} / 状态：${book.status} / 共 ${book.totalChapters} 章`)
  if (book.intro) parts.push(`\n简介：${book.intro}`)
  if (cfg.insertSiteInfo) {
    parts.push('\n' + '—'.repeat(24))
    parts.push(fillTemplate(cfg.siteInfoTemplate, site, dom))
    parts.push('—'.repeat(24))
  }

  const adEvery = Math.max(1, cfg.adEveryNChapters)
  for (let i = 0; i < book.chapters.length; i++) {
    const ch = book.chapters[i]
    let body = ch.content
    if (!body && ch.contentLocal) {
      body = await readChapterTxt(ch.contentLocal).catch(() => '')
    }
    if (!body) body = '（本章内容缺失）'
    if (cfg.insertObfuscation) {
      body = obfuscateText(body, { mode: cfg.obfuscationMode, rate: cfg.obfuscationRate })
    }
    parts.push('')
    parts.push(`${ch.title}`)
    parts.push(body)

    // 定点插入广告
    if (cfg.insertAds && cfg.adTemplates.length > 0 && (i + 1) % adEvery === 0) {
      const ad = cfg.adTemplates[Math.floor(Math.random() * cfg.adTemplates.length)]
      parts.push('')
      parts.push(fillTemplate(ad, site, dom))
    }
  }

  if (cfg.insertSiteInfo) parts.push('\n' + fillTemplate(cfg.siteInfoTemplate, site, dom))

  const content = parts.join('\n')
  const safeName = book.title.replace(/[/\\:*?"<>|]/g, '_').slice(0, 60)
  return { filename: `${safeName}.txt`, content }
}
