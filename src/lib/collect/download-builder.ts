import { db } from '@/lib/db'
import { DEFAULT_DOWNLOAD, mergeDownload } from '../collect-types'
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
  // Number() 归一：字符串数字可识别，NaN/undefined 回退 0（同原 NaN 行为：不插入），Infinity 被钳到上限
  const rate = Math.min(0.2, Math.max(0, Number(cfg.rate) || 0))
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
  // String() 归一：存储端配置若混入非字符串模板（数字等），replaceAll 直接 TypeError → 下载 500
  return String(tpl ?? '').replaceAll('{siteName}', siteName).replaceAll('{domain}', domain)
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

  const fallbackSite = (await db.siteConfig.findFirst()) ?? null
  const site = siteName?.trim() || fallbackSite?.siteName || '小说站'
  const dom = domain?.trim() || fallbackSite?.domain || 'localhost'

  const parts: string[] = []
  parts.push(`《${book.title}》`)
  parts.push(`作者：${book.author || '佚名'}`)
  parts.push(`分类：${book.category || '其他'} / 状态：${book.status} / 共 ${book.totalChapters} 章`)
  if (book.intro) parts.push(`\n简介：${book.intro}`)
  const adTemplates = Array.isArray(cfg.adTemplates) ? cfg.adTemplates : []
  if (cfg.insertSiteInfo) {
    parts.push('\n' + '—'.repeat(24))
    parts.push(fillTemplate(cfg.siteInfoTemplate, site, dom))
    parts.push('—'.repeat(24))
  }

  // 广告间隔数字归一：存储端若被写入 NaN/非数字字符串，Math.max(1, NaN)=NaN 会使 (i+1)%NaN===0
  // 恒为 false，已配置的广告静默失效——非法值回退默认间隔（同 mergeDownload 缺省键语义），0/负数仍钳为 1
  const adEveryN = Number(cfg.adEveryNChapters)
  const adEvery = Number.isFinite(adEveryN) ? Math.max(1, Math.floor(adEveryN)) : DEFAULT_DOWNLOAD.adEveryNChapters
  for (let i = 0; i < book.chapters.length; i++) {
    const ch = book.chapters[i]
    // 空白正文（纯换行/空格）也视为缺失：先尝试回退本地 txt，再兜底占位
    let body = ch.content
    if (!body.trim() && ch.contentLocal) {
      body = await readChapterTxt(ch.contentLocal).catch(() => '')
    }
    if (!body.trim()) body = '（本章内容缺失）'
    if (cfg.insertObfuscation) {
      body = obfuscateText(body, { mode: cfg.obfuscationMode, rate: cfg.obfuscationRate })
    }
    parts.push('')
    parts.push(`${ch.title}`)
    parts.push(body)

    // 定点插入广告
    if (cfg.insertAds && adTemplates.length > 0 && (i + 1) % adEvery === 0) {
      const ad = adTemplates[Math.floor(Math.random() * adTemplates.length)]
      parts.push('')
      parts.push(fillTemplate(ad, site, dom))
    }
  }

  if (cfg.insertSiteInfo) parts.push('\n' + fillTemplate(cfg.siteInfoTemplate, site, dom))

  const content = parts.join('\n')
  // 文件名安全化：控制字符与 Windows 非法字符替换、去结尾点/空格、保留名前缀、空标题回退
  // 按码点截断（直接 slice 可能把增补平面字符切成孤立代理项，encodeURIComponent 会直接抛 URIError → 下载 500）
  let safeName = Array.from(
    book.title
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[/\\:*?"<>|]/g, '_')
      .trim()
      .replace(/[. ]+$/g, '')
  )
    .slice(0, 60)
    .join('')
    .trimEnd()
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safeName)) safeName = `_${safeName}`
  if (!safeName) safeName = book.id || 'book'
  return { filename: `${safeName}.txt`, content }
}
