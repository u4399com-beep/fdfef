import path from 'path'
import fs from 'fs/promises'

// ============================================================
// 本地文件存储：章节 txt 文件 / 封面 webp
// ============================================================

export const STORAGE_ROOT = path.join(process.cwd(), 'storage')
export const NOVELS_DIR = path.join(STORAGE_ROOT, 'novels')
export const COVERS_DIR = path.join(STORAGE_ROOT, 'covers')

/** 文件名安全化 */
export function safeFileName(name: string): string {
  let s = name
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '') // Windows：结尾点/空格非法（顺带消化 "."/".." 路径拼接风险）
    .slice(0, 120)
    .replace(/[. ]+$/g, '') // 截断后可能重新以点/空格结尾
    .trimEnd()
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) s = `_${s}`
  return s || 'untitled'
}

/** 保存单章 txt，返回相对路径（相对 storage/novels） */
export async function saveChapterTxt(
  bookDir: string,
  chapter: { title: string; order: number; content: string }
): Promise<string> {
  const dir = path.join(NOVELS_DIR, safeFileName(bookDir))
  await fs.mkdir(dir, { recursive: true })
  const idx = String(chapter.order).padStart(5, '0')
  const fileName = `${idx}-${safeFileName(chapter.title)}.txt`
  const body = `${chapter.title}\n\n${chapter.content}\n`
  await fs.writeFile(path.join(dir, fileName), body, 'utf-8')
  return path.join(safeFileName(bookDir), fileName)
}

export async function readChapterTxt(relPath: string): Promise<string> {
  const full = path.resolve(NOVELS_DIR, relPath)
  if (full !== NOVELS_DIR && !full.startsWith(NOVELS_DIR + path.sep)) {
    throw new Error('非法路径')
  }
  return fs.readFile(full, 'utf-8')
}

/** 尽力删除章节 txt 文件（全量重采清理失效章节时使用）：路径越界/非 .txt 一律拒绝，失败静默不影响采集流程 */
export async function removeChapterTxt(relPath: string): Promise<void> {
  if (!relPath || !relPath.endsWith('.txt')) return
  const full = path.resolve(NOVELS_DIR, relPath)
  if (full !== NOVELS_DIR && !full.startsWith(NOVELS_DIR + path.sep)) return
  try {
    await fs.unlink(full)
  } catch {
    /* 文件不存在/被占用等：忽略 */
  }
}

/** 封面下载并转换为 webp，返回文件名 */
export async function downloadCoverAsWebp(
  coverUrl: string,
  bookId: string,
  referer?: string,
  ua?: string,
  cookies?: string
): Promise<string> {
  const { fetchImage } = await import('./fetcher')
  const sharp = (await import('sharp')).default
  const buffer = await fetchImage(coverUrl, referer, 20000, ua, cookies)
  // 解压炸弹防护：正常封面 <2MB，超过 20MB 的“图片”拒绝转换（转换失败由调用方降级）
  if (buffer.length > 20 * 1024 * 1024) throw new Error(`封面体积异常（${Math.round(buffer.length / 1024)}KB），已拒绝处理`)
  const fileName = `${bookId}.webp`
  await fs.mkdir(COVERS_DIR, { recursive: true })
  await sharp(buffer)
    .resize(400, 533, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(path.join(COVERS_DIR, fileName))
  return fileName
}

/** 简易文本 hash（本地无链接章节的去重键） */
export function hashText(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
