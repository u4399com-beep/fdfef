import { db } from '@/lib/db'
import type {
  BookRuleConfig,
  ContentRuleConfig,
  ListRuleConfig,
  TocRuleConfig,
} from '../collect-types'
import type { FieldSelector } from '../collect-types'
import { mergeCleaning } from '../collect-types'
import { fetchPage, FIXED_UA, randomInt, sleep } from './fetcher'
import { parseFields, parseListEntries, resolveUrl, selectValue } from './parser'
import { detectCompletion, extractChapterNumber, smartMatchCategory } from './matcher'
import { fetchSuggestKeywords, mergeSuggestKeywords } from './suggest'
import { downloadCoverAsWebp, hashText, saveChapterTxt } from './storage'
import { runRandomPool, taskLog, taskManager } from './task-manager'
import { fetchCleanedContent, fetchPaginated } from './paginated'

// ============================================================
// 采集管线：列表页 → 书籍信息页 → 章节目录页 → 章节内容页
// 支持单本/范围采集、完全重采集/增量更新、乱序重排、去重
// ============================================================

interface TaskStats {
  books: number
  booksNew: number
  chapters: number
  chaptersNew: number
  contents: number
  errors: number
}

function parseRuleConfig<T>(configJson: string): T | null {
  try {
    return JSON.parse(configJson) as T
  } catch {
    return null
  }
}

/** 目录采集 + 乱序重排 + 去重 */
async function collectTocEntries(
  tocUrl: string,
  rule: TocRuleConfig
): Promise<{ entries: { title: string; url: string }[]; scrambled: boolean; dupRemoved: number }> {
  const pages = await fetchPaginated(tocUrl, rule, rule.pagination, 50)
  const all: { title: string; url: string; no: number }[] = []
  for (const page of pages) {
    const entries = parseListEntries(page.html, rule.items, page.url)
    for (const e of entries) {
      if (!e.title && !e.url) continue
      all.push({ title: e.title || e.url, url: e.url, no: extractChapterNumber(e.title, rule.reorder?.numberPattern) })
    }
  }

  // 原始顺序是否乱序（序号非单调）
  let scrambled = false
  const numbers = all.map((e) => e.no).filter((n) => n >= 0)
  if (numbers.length >= 5) {
    let desc = 0
    for (let i = 1; i < numbers.length; i++) if (numbers[i] < numbers[i - 1]) desc++
    scrambled = desc >= 2
  }
  if (rule.reorder?.enabled) {
    const numbered = all.filter((e) => e.no >= 0).sort((a, b) => a.no - b.no)
    const unnumbered = all.filter((e) => e.no < 0)
    all.length = 0
    all.push(...numbered, ...unnumbered)
  }

  // URL / 章节名去重
  const seenUrl = new Set<string>()
  const seenTitle = new Set<string>()
  let dupRemoved = 0
  const dedup: { title: string; url: string }[] = []
  for (const e of all) {
    const urlKey = e.url || `local:${hashText(e.title)}`
    if (rule.dedup?.byUrl !== false && seenUrl.has(urlKey)) {
      dupRemoved++
      continue
    }
    if (rule.dedup?.byTitle && seenTitle.has(e.title)) {
      dupRemoved++
      continue
    }
    seenUrl.add(urlKey)
    seenTitle.add(e.title)
    dedup.push({ title: e.title, url: e.url })
  }
  return { entries: dedup, scrambled, dupRemoved }
}

/** 书籍信息采集 */
async function collectBookInfo(
  bookUrl: string,
  rule: BookRuleConfig,
  opts: { smartCategory: boolean; smartCompletion: boolean; fetchSuggest: boolean; downloadCover: boolean }
): Promise<{
  title: string
  author: string
  category: string
  categoryScore: number
  keywords: string
  intro: string
  coverUrl: string
  status: string
  statusConfidence: number
  statusSource: string
  latestChapter: string
  suggestKeywords: string
  tocUrl: string
  finalUrl: string
} | null> {
  const res = await fetchPage(bookUrl, rule)
  const fields = rule.fields ?? ({} as BookRuleConfig['fields'])
  const parsed = parseFields(res.html, fields as Record<string, FieldSelector | undefined>, res.finalUrl)
  const title = parsed.title?.trim()
  if (!title) return null

  const cleaningCfg = mergeCleaning()
  const { cleanIntro } = await import('./cleaner')
  const intro = parsed.intro ? cleanIntro(parsed.intro, cleaningCfg, rule.extraAdPatterns ?? []) : ''

  // 关键词规范化
  const keywords = (parsed.keywords ?? '')
    .split(/[,，、|\s]+/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(',')

  // 智能分类
  let category = (parsed.category ?? '').trim()
  let categoryScore = category ? 0.9 : 0
  if (opts.smartCategory || !category) {
    const match = smartMatchCategory({ title, intro, keywords: keywords.split(',').filter(Boolean), sourceCategory: category })
    if (!category || match.score > 0.3) {
      category = match.category
      categoryScore = match.score
    }
  }

  // 智能完结
  const completion = detectCompletion({
    status: parsed.status,
    latestChapter: parsed.latestChapter,
    intro,
  })
  const status = opts.smartCompletion || !parsed.status ? completion.status : parsed.status.includes('完') ? '完结' : '连载'
  const statusConfidence = opts.smartCompletion || !parsed.status ? completion.confidence : 0.9
  const statusSource = completion.source

  // 搜索引擎下拉词
  let suggestKeywords = ''
  if (opts.fetchSuggest) {
    const results = await fetchSuggestKeywords(title)
    const merged = mergeSuggestKeywords(results, title)
    if (merged.length) suggestKeywords = merged.join(',')
  }

  // 封面绝对地址
  let coverUrl = parsed.cover ?? ''
  if (coverUrl) coverUrl = resolveUrl(coverUrl, res.finalUrl)

  // 目录页地址（默认书籍页本身，字段 tocLink 可指定目录页链接）
  let tocUrl = res.finalUrl
  const tocLinkSel = fields.tocLink
  if (tocLinkSel?.expr) {
    const toc = String(selectValue(res.html, { ...tocLinkSel, multiple: false }, { baseUrl: res.finalUrl }) || '')
    if (toc) tocUrl = resolveUrl(toc, res.finalUrl)
  }

  return {
    title,
    author: (parsed.author ?? '').trim(),
    category,
    categoryScore,
    keywords,
    intro,
    coverUrl,
    status,
    statusConfidence,
    statusSource,
    latestChapter: (parsed.latestChapter ?? '').trim(),
    suggestKeywords,
    tocUrl,
    finalUrl: res.finalUrl,
  }
}

/** 主入口：执行采集任务 */
export async function executeTask(taskId: string): Promise<void> {
  const task = await db.collectTask.findUnique({ where: { id: taskId } })
  if (!task) return
  // 同步注册运行时（在首个 await 之前）：避免启动窗口内被 /api/tasks 的 stale 检测误杀
  taskManager.create(taskId)

  const stats: TaskStats = { books: 0, booksNew: 0, chapters: 0, chaptersNew: 0, contents: 0, errors: 0 }
  const writeStats = async (stage: string, progress: number) => {
    try {
      await db.collectTask.update({
        where: { id: taskId },
        data: { stage, progress, stats: JSON.stringify(stats) },
      })
    } catch {
      /* ignore */
    }
  }

  try {
    await db.collectTask.update({ where: { id: taskId }, data: { status: 'running', progress: 0, stats: '{}' } })
    await taskLog(taskId, 'info', `任务启动：${task.name}（模式：${task.mode === 'full' ? '完全重采集' : '增量更新'}，存储：${task.storageMode}）`)

    const bookRule = task.bookRuleId
      ? await db.collectRule.findUnique({ where: { id: task.bookRuleId } })
      : null
    const tocRule = task.tocRuleId ? await db.collectRule.findUnique({ where: { id: task.tocRuleId } }) : null
    const contentRule = task.contentRuleId ? await db.collectRule.findUnique({ where: { id: task.contentRuleId } }) : null
    const listRule = task.listRuleId ? await db.collectRule.findUnique({ where: { id: task.listRuleId } }) : null

    if (!bookRule) throw new Error('未配置书籍信息页规则')
    if (!tocRule) throw new Error('未配置章节目录页规则')
    if (!contentRule) throw new Error('未配置章节内容页规则')

    const bookCfg = parseRuleConfig<BookRuleConfig>(bookRule.config)
    const tocCfg = parseRuleConfig<TocRuleConfig>(tocRule.config)
    const contentCfg = parseRuleConfig<ContentRuleConfig>(contentRule.config)
    if (!bookCfg || !tocCfg || !contentCfg) throw new Error('规则配置 JSON 解析失败')

    // ---------- 阶段 1：确定书籍列表 ----------
    let bookUrls: string[] = []
    if (task.targetType === 'range') {
      const listCfg = listRule ? parseRuleConfig<ListRuleConfig>(listRule.config) : null
      if (!listCfg) throw new Error('范围采集必须配置列表页规则')
      await writeStats('列表页解析', 2)
      await taskLog(taskId, 'info', `范围采集：模板 ${task.urlTemplate}，第 ${task.pageStart} ~ ${task.pageEnd} 页`)
      for (let p = task.pageStart; p <= task.pageEnd; p++) {
        const url = task.urlTemplate.replace('{page}', String(p))
        const pages = await fetchPaginated(url, listCfg, listCfg.pagination, 20)
        for (const page of pages) {
          const entries = parseListEntries(page.html, listCfg.items, page.url)
          for (const e of entries) if (e.url && /^https?:\/\//.test(e.url)) bookUrls.push(e.url)
        }
        await taskLog(taskId, 'info', `列表第 ${p} 页解析完成，累计 ${bookUrls.length} 本候选`)
        await sleep(randomInt(task.intervalMin, task.intervalMax))
      }
    } else {
      try {
        bookUrls = JSON.parse(task.targetUrls) as string[]
      } catch {
        bookUrls = []
      }
    }
    bookUrls = [...new Set(bookUrls)]
    if (bookUrls.length === 0) throw new Error('未解析到任何书籍地址')

    const totalBooks = bookUrls.length
    await db.collectTask.update({ where: { id: taskId }, data: { total: totalBooks } })
    await taskLog(taskId, 'info', `共 ${totalBooks} 本待采集`)

    const cleaningCfg = mergeCleaning()
    let doneBooks = 0

    // ---------- 阶段 2~4：书籍 → 目录 → 内容（随机线程池） ----------
    const poolResult = await runRandomPool({
      items: bookUrls,
      taskId,
      threadMin: task.threadMin,
      threadMax: task.threadMax,
      intervalMin: task.intervalMin,
      intervalMax: task.intervalMax,
      onProgress: async (completed, total) => {
        doneBooks = completed
        await writeStats('书籍采集', Math.round((completed / Math.max(1, total)) * 100))
      },
      process: async (bookUrl) => {
        try {
          // ---- 书籍信息（失败重试，跨过 WAF 冷却期） ----
          const infoOpts = {
            smartCategory: bookCfg.smartCategory ?? true,
            smartCompletion: bookCfg.smartCompletion ?? true,
            fetchSuggest: bookCfg.fetchSuggest ?? false,
            downloadCover: bookCfg.downloadCover ?? true,
          }
          let info = await collectBookInfo(bookUrl, bookCfg, infoOpts)
          if (!info) {
            await sleep(randomInt(task.intervalMin, task.intervalMax) + 150_000)
            info = await collectBookInfo(bookUrl, bookCfg, infoOpts)
          }
          if (!info) {
            stats.errors++
            await taskLog(taskId, 'warn', `书籍字段解析失败（title 为空，可能被目标站拦截）：${bookUrl}`)
            return
          }

          const existing = await db.book.findUnique({
            where: { sourceUrl_title: { sourceUrl: info.finalUrl, title: info.title } },
          })
          let bookId: string
          if (existing) {
            const updateData: Record<string, string | number | undefined> = {}
            if (task.mode === 'full') {
              Object.assign(updateData, {
                author: info.author,
                category: info.category,
                categoryScore: info.categoryScore,
                keywords: info.keywords,
                intro: info.intro,
                status: info.status,
                statusConfidence: info.statusConfidence,
                statusSource: info.statusSource,
                latestChapter: info.latestChapter,
              })
              if (info.suggestKeywords) updateData.suggestKeywords = info.suggestKeywords
            } else {
              if (info.author) updateData.author = info.author
              if (info.category) updateData.category = info.category
              if (info.keywords) updateData.keywords = info.keywords
              if (info.intro) updateData.intro = info.intro
              if (info.statusConfidence >= (existing.statusConfidence ?? 0)) {
                updateData.status = info.status
                updateData.statusConfidence = info.statusConfidence
                updateData.statusSource = info.statusSource
              }
              if (info.latestChapter) updateData.latestChapter = info.latestChapter
              if (info.suggestKeywords) {
                const merged = [...new Set([...existing.suggestKeywords.split(',').filter(Boolean), ...info.suggestKeywords.split(',').filter(Boolean)])]
                updateData.suggestKeywords = merged.join(',')
              }
            }
            await db.book.update({ where: { id: existing.id }, data: updateData })
            bookId = existing.id
            stats.books++
            await taskLog(taskId, 'info', `更新书籍《${info.title}》${info.author ? ` / ${info.author}` : ''}`)
          } else {
            const created = await db.book.create({
              data: {
                title: info.title,
                author: info.author,
                category: info.category,
                categoryScore: info.categoryScore,
                keywords: info.keywords,
                suggestKeywords: info.suggestKeywords,
                intro: info.intro,
                coverUrl: info.coverUrl,
                status: info.status,
                statusConfidence: info.statusConfidence,
                statusSource: info.statusSource,
                latestChapter: info.latestChapter,
                sourceUrl: info.finalUrl,
              },
            })
            bookId = created.id
            stats.books++
            stats.booksNew++
            await taskLog(taskId, 'success', `新增书籍《${info.title}》${info.author ? ` / ${info.author}` : ''} [${info.category}]`)
          }

          // ---- 封面下载 webp（阶段间隔限频） ----
          await sleep(randomInt(task.intervalMin, task.intervalMax))
          if ((bookCfg.downloadCover ?? true) && info.coverUrl) {
            try {
              const coverUA = bookCfg.rotateUA === false ? (bookCfg.headers?.['User-Agent'] ?? FIXED_UA) : undefined
              const fileName = await downloadCoverAsWebp(info.coverUrl, bookId, info.finalUrl, coverUA, bookCfg.cookies)
              await db.book.update({ where: { id: bookId }, data: { coverLocal: fileName } })
            } catch (e) {
              await taskLog(taskId, 'warn', `封面下载失败《${info.title}》：${e instanceof Error ? e.message : String(e)}`)
            }
          }

          // ---- 章节目录（阶段间隔限频） ----
          await sleep(randomInt(task.intervalMin, task.intervalMax))
          const toc = await collectTocEntries(info.tocUrl, tocCfg)
          if (toc.entries.length === 0) {
            await taskLog(taskId, 'warn', `目录解析为空《${info.title}》：${info.tocUrl}`)
          } else {
            await taskLog(
              taskId,
              'info',
              `《${info.title}》目录 ${toc.entries.length} 章${toc.scrambled ? '（检测到乱序，已重排）' : ''}，去重移除 ${toc.dupRemoved} 条`
            )
          }
          const orderMap: Record<string, string> = {}
          let order = 0
          for (const entry of toc.entries) {
            order++
            const urlKey = entry.url || `local:${hashText(entry.title)}`
            const existingChapter = await db.chapter.findUnique({
              where: { bookId_url: { bookId, url: urlKey } },
            })
            if (existingChapter) {
              if (existingChapter.title !== entry.title || existingChapter.order !== order) {
                await db.chapter.update({
                  where: { id: existingChapter.id },
                  data: { title: entry.title, order },
                })
              }
              orderMap[entry.title] = existingChapter.id
              stats.chapters++
            } else {
              const created = await db.chapter.create({
                data: { bookId, title: entry.title, order, url: urlKey },
              })
              orderMap[entry.title] = created.id
              stats.chapters++
              stats.chaptersNew++
            }
          }
          await db.book.update({
            where: { id: bookId },
            data: { totalChapters: order, latestChapter: toc.entries.length ? toc.entries[toc.entries.length - 1].title : undefined },
          })

          // ---- 章节内容（增量：只采未完成的；完全：全部重采） ----
          const chapters = await db.chapter.findMany({ where: { bookId }, orderBy: { order: 'asc' } })
          const todo = task.mode === 'full' ? chapters : chapters.filter((c) => !c.collected)
          if (todo.length === 0) {
            await taskLog(
              taskId,
              'info',
              chapters.length === 0
                ? `《${info.title}》无章节可采集（目录为空）`
                : task.mode === 'full'
                  ? `《${info.title}》正文无需更新`
                  : `《${info.title}》正文无需更新（增量模式，均已采集）`
            )
            return
          }
          let contentDone = 0
          await runRandomPool({
            items: todo,
            taskId,
            threadMin: Math.max(1, task.threadMin),
            threadMax: Math.max(1, task.threadMax),
            intervalMin: task.intervalMin,
            intervalMax: task.intervalMax,
            process: async (chapter) => {
              try {
                const { text } = await fetchCleanedContent(chapter.url, contentCfg, cleaningCfg)
                if (!text) {
                  await taskLog(taskId, 'warn', `正文为空《${info.title}》${chapter.title}`)
                  stats.errors++
                  return
                }
                const data: { content?: string; contentLocal?: string; collected: boolean; wordCount: number } = {
                  collected: true,
                  wordCount: text.replace(/\s/g, '').length,
                }
                if (task.storageMode === 'db' || task.storageMode === 'both') data.content = text
                if (task.storageMode === 'txt' || task.storageMode === 'both') {
                  data.contentLocal = await saveChapterTxt(info.title, {
                    title: chapter.title,
                    order: chapter.order,
                    content: text,
                  })
                  if (task.storageMode === 'txt') data.content = ''
                }
                await db.chapter.update({ where: { id: chapter.id }, data })
                stats.contents++
                contentDone++
                if (contentDone % 20 === 0) {
                  await taskLog(taskId, 'info', `《${info.title}》正文进度 ${contentDone}/${todo.length}`)
                }
              } catch (e) {
                stats.errors++
                await taskLog(taskId, 'error', `正文采集失败《${info.title}》${chapter.title}：${e instanceof Error ? e.message : String(e)}`)
              }
            },
          })
        } catch (e) {
          stats.errors++
          await taskLog(taskId, 'error', `书籍采集失败 ${bookUrl}：${e instanceof Error ? e.message : String(e)}`)
        }
      },
    })

    const stopped = poolResult.stopped
    const finalStatus = stopped ? 'stopped' : stats.books === 0 && stats.errors > 0 ? 'failed' : 'done'
    await db.collectTask.update({
      where: { id: taskId },
      data: {
        status: finalStatus,
        stage: stopped ? '已停止' : '完成',
        progress: stopped ? undefined : 100,
        stats: JSON.stringify(stats),
      },
    })
    if (stopped) {
      await taskLog(taskId, 'warn', `任务已停止：书籍 ${stats.books}，正文 ${stats.contents} 篇，错误 ${stats.errors}`)
    } else {
      await taskLog(
        taskId,
        'success',
        `任务完成：书籍 ${stats.books}（新增 ${stats.booksNew}），目录章节 ${stats.chapters}（新增 ${stats.chaptersNew}），正文 ${stats.contents} 篇，错误 ${stats.errors}`
      )
    }
  } catch (e) {
    await db.collectTask.update({
      where: { id: taskId },
      data: { status: 'failed', stage: '失败', stats: JSON.stringify(stats) },
    })
    await taskLog(taskId, 'error', `任务失败：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    taskManager.remove(taskId)
  }
}

/** 编辑任务时防止并发：任务是否正在运行 */
export async function isTaskActive(taskId: string): Promise<boolean> {
  const t = await db.collectTask.findUnique({ where: { id: taskId } })
  return t?.status === 'running' || t?.status === 'paused'
}

export type { CollectTask } from '@prisma/client'
