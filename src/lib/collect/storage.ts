import path from 'path'
import fs from 'fs/promises'

// ============================================================
// 本地文件存储：章节 txt 文件 / 封面 webp
// ============================================================

export const STORAGE_ROOT = path.join(process.cwd(), 'storage')
export const NOVELS_DIR = path.join(STORAGE_ROOT, 'novels')
export const COVERS_DIR = path.join(STORAGE_ROOT, 'covers')

export async function ensureStorageDirs(): Promise<void> {
  await fs.mkdir(NOVELS_DIR, { recursive: true })
  await fs.mkdir(COVERS_DIR, { recursive: true })
}

/** 文件名安全化 */
export function safeFileName(name: string): string {
  return name
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'untitled'
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
  const full = path.join(NOVELS_DIR, relPath)
  if (!full.startsWith(NOVELS_DIR)) throw new Error('非法路径')
  return fs.readFile(full, 'utf-8')
}

export async function fileExists(relPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(NOVELS_DIR, relPath))
    return true
  } catch {
    return false
  }
}

/** 封面下载并转换为 webp，返回文件名 */
export async function downloadCoverAsWebp(
  coverUrl: string,
  bookId: string,
  referer?: string
): Promise<string> {
  const { fetchImage } = await import('./fetcher')
  const sharp = (await import('sharp')).default
  const buffer = await fetchImage(coverUrl, referer)
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
