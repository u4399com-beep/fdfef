import path from 'path'
import fs from 'fs/promises'
import { db } from '@/lib/db'
import { COVERS_DIR, downloadCoverAsWebp, hashText } from './storage'
import { FIXED_UA } from './fetcher'

// ============================================================
// 封面维护：重新下载 / 本地占位封面生成 / 全库补全
// 背景：部分源站（如存书啦 TXT 分享站）书籍页不提供封面图，
// 采集入库的书籍可能完全没有 coverUrl；另有历史任务日志中的
// 下载失败（403 / 图片格式不支持）会导致 coverLocal 缺失或损坏。
// ============================================================

/** 占位封面调色板（暖色/中性系渐变，避开蓝靛系） */
const PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#0f766e', '#5eead4', '#f0fdfa'], // teal
  ['#b45309', '#fcd34d', '#fffbeb'], // amber
  ['#be185d', '#f9a8d4', '#fdf2f8'], // rose
  ['#4d7c0f', '#bef264', '#f7fee7'], // lime
  ['#9a3412', '#fdba74', '#fff7ed'], // orange
  ['#334155', '#94a3b8', '#f8fafc'], // slate
  ['#065f46', '#6ee7b7', '#ecfdf5'], // emerald
  ['#86198f', '#e9d5ff', '#faf5ff'], // purple-fuchsia
]

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 书名按 CJK 字宽换行：行宽 7 字，最多 5 行，超长以「…」收尾 */
function wrapTitle(title: string): string[] {
  const clean = title.trim() || '未命名'
  const perLine = 7
  const maxLines = 5
  const chars = [...clean]
  const lines: string[] = []
  for (let i = 0; i < chars.length && lines.length < maxLines; i += perLine) {
    lines.push(chars.slice(i, i + perLine).join(''))
  }
  if (chars.length > perLine * maxLines) {
    // 截断：最后一行留一位给省略号
    const last = lines[maxLines - 1]
    lines[maxLines - 1] = [...last].slice(0, perLine - 1).join('') + '…'
  }
  return lines
}

/** 生成占位封面 SVG：渐变底 + 书名居中 + 作者/来源落款 */
function buildCoverSvg(title: string, author: string, sourceName: string): string {
  const idx = Number.parseInt(hashText(title), 36) % PALETTES.length
  const [dark, light, bg] = PALETTES[Math.abs(idx) || 0]
  const lines = wrapTitle(title)
  const fontSize = lines.length <= 1 ? 44 : lines.length <= 3 ? 38 : 32
  const lineH = Math.round(fontSize * 1.45)
  const startY = 266 - ((lines.length - 1) * lineH) / 2

  const titleTspans = lines
    .map((l, i) => `<tspan x="200" y="${startY + i * lineH}">${escapeXml(l)}</tspan>`)
    .join('')
  const authorLine = author.trim() || '佚名'
  const sourceLine = sourceName.trim().replace(/^www\./, '')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="533" viewBox="0 0 400 533">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${dark}"/>
      <stop offset="1" stop-color="${light}" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="400" height="533" fill="${bg}"/>
  <rect x="14" y="14" width="372" height="505" rx="10" fill="url(#g)"/>
  <rect x="14" y="14" width="372" height="505" rx="10" fill="none" stroke="${dark}" stroke-width="3"/>
  <text x="200" y="96" font-size="64" fill="${light}" opacity="0.35" text-anchor="middle" font-family="Noto Serif SC, WenQuanYi Zen Hei, serif">书</text>
  <text font-size="${fontSize}" font-weight="600" fill="#ffffff" text-anchor="middle" font-family="Noto Serif SC, WenQuanYi Zen Hei, serif">${titleTspans}</text>
  <line x1="150" y1="${startY + lines.length * lineH + 4}" x2="250" y2="${startY + lines.length * lineH + 4}" stroke="${light}" stroke-width="2" opacity="0.7"/>
  <text x="200" y="${startY + lines.length * lineH + 40}" font-size="22" fill="#ffffff" opacity="0.92" text-anchor="middle" font-family="Noto Serif SC, WenQuanYi Zen Hei, serif">${escapeXml(authorLine.slice(0, 16))}</text>
  <text x="200" y="496" font-size="16" fill="#ffffff" opacity="0.6" text-anchor="middle" font-family="Noto Serif SC, WenQuanYi Zen Hei, sans-serif">${escapeXml(sourceLine.slice(0, 28))}</text>
</svg>`
}

/** 生成本地占位封面（webp），返回文件名（storage/covers/ 下） */
export async function generatePlaceholderCover(
  bookId: string,
  title: string,
  author: string,
  sourceName: string
): Promise<string> {
  const sharp = (await import('sharp')).default
  const svg = buildCoverSvg(title, author, sourceName)
  await fs.mkdir(COVERS_DIR, { recursive: true })
  await sharp(Buffer.from(svg))
    .resize(400, 533, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(COVERS_DIR, `${bookId}.webp`))
  return `${bookId}.webp`
}

/** 校验本地封面文件可被解码（损坏文件返回 false） */
export async function coverFileValid(fileName: string): Promise<boolean> {
  if (!/^[\w-]+\.webp$/.test(fileName)) return false
  try {
    const full = path.join(COVERS_DIR, fileName)
    const sharp = (await import('sharp')).default
    const meta = await sharp(full).metadata()
    return !!(meta.width && meta.height)
  } catch {
    return false
  }
}

export interface CoverRefetchItem {
  bookId: string
  title: string
  action: 'skip' | 'download' | 'regenerate-placeholder'
  ok: boolean
  detail: string
}

export interface CoverRefetchSummary {
  checked: number
  skipped: number
  downloaded: number
  placeholder: number
  failed: number
  items: CoverRefetchItem[]
}

/** 单本封面补全：优先按 coverUrl 重下载，失败/无源则生成占位封面 */
export async function refetchBookCover(
  book: { id: string; title: string; author: string; coverUrl: string; coverLocal: string; sourceUrl: string; sourceName: string },
  opts: { force?: boolean }
): Promise<CoverRefetchItem> {
  const base = { bookId: book.id, title: book.title }
  // 本地文件已存在且可解码：非 force 直接跳过
  if (!opts.force && book.coverLocal && (await coverFileValid(book.coverLocal))) {
    return { ...base, action: 'skip', ok: true, detail: '本地封面完好' }
  }
  // 有源封面地址：重新下载（referer 指向书籍来源页，最大化防盗链通过率）
  if (book.coverUrl) {
    try {
      const fileName = await downloadCoverAsWebp(book.coverUrl, book.id, book.sourceUrl || undefined, FIXED_UA)
      return { ...base, action: 'download', ok: true, detail: `已下载：${fileName}` }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      // 下载失败降级为占位封面，保证最终必有本地封面
      try {
        const fileName = await generatePlaceholderCover(book.id, book.title, book.author, book.sourceName)
        return { ...base, action: 'regenerate-placeholder', ok: true, detail: `下载失败（${reason.slice(0, 80)}）→ 已生成占位封面` }
      } catch (e2) {
        return { ...base, action: 'download', ok: false, detail: `下载与占位生成均失败：${e2 instanceof Error ? e2.message : String(e2)}` }
      }
    }
  }
  // 无源封面地址（源站本就不提供）：生成占位封面
  try {
    const fileName = await generatePlaceholderCover(book.id, book.title, book.author, book.sourceName)
    return { ...base, action: 'regenerate-placeholder', ok: true, detail: `源站无封面，已生成占位封面：${fileName}` }
  } catch (e) {
    return { ...base, action: 'regenerate-placeholder', ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

/** 全库封面补全（顺序执行）：返回逐本结果 */
export async function refetchAllCovers(
  opts: { force?: boolean; limit?: number; bookId?: string } = {}
): Promise<CoverRefetchSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? 300, 500))
  const books = await db.book.findMany({
    ...(opts.bookId ? { where: { id: opts.bookId } } : {}),
    select: { id: true, title: true, author: true, coverUrl: true, coverLocal: true, sourceUrl: true, sourceName: true },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  })
  const summary: CoverRefetchSummary = { checked: books.length, skipped: 0, downloaded: 0, placeholder: 0, failed: 0, items: [] }
  for (const book of books) {
    const item = await refetchBookCover(book, { force: opts.force })
    summary.items.push(item)
    if (!item.ok) summary.failed++
    else if (item.action === 'skip') summary.skipped++
    else if (item.action === 'download') summary.downloaded++
    else summary.placeholder++
    if (item.ok && item.action !== 'skip') {
      await db.book.update({ where: { id: book.id }, data: { coverLocal: `${book.id}.webp` } })
    }
  }
  return summary
}
