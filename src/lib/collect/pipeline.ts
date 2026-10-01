import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import type {
  BookRuleConfig,
  ContentRuleConfig,
  ListRuleConfig,
  TocRuleConfig,
} from '../collect-types'
import type { FieldSelector } from '../collect-types'
import { mergeCleaning, normalizeBookMeta } from '../collect-types'
import { fetchPage, FIXED_UA, randomInt } from './fetcher'
import { parseFields, parseListEntries, resolveUrl, selectValue } from './parser'
import { detectCompletion, extractChapterNumber, smartMatchCategory } from './matcher'
import { fetchSuggestKeywords, mergeSuggestKeywords } from './suggest'
import { downloadCoverAsWebp, hashText, removeChapterTxt, saveChapterTxt } from './storage'
import { interruptibleSleep, runRandomPool, taskLog, taskManager } from './task-manager'
import type { TaskRuntime } from './task-manager'
import { fetchCleanedContent, fetchPaginated } from './paginated'
import { loadSystemCleaningRaw } from './system-config'

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

/** 目录去重键归一化：忽略 hash、默认端口、末尾斜杠差异（仅用于去重比较，不改变入库 URL） */
function normalizeTocUrlKey(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    u.hash = ''
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = ''
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1)
    return u.href
  } catch {
    return url
  }
}

/** 目录采集 + 乱序重排 + 去重 */
async function collectTocEntries(
  tocUrl: string,
  rule: TocRuleConfig
): Promise<{ entries: { title: string; url: string }[]; scrambled: boolean; dupRemoved: number }> {
  const pages = await fetchPaginated(tocUrl, rule, rule.pagination, 50)
  const all: { title: string; url: string; no: number }[] = []
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const entries = parseListEntries(page.html, rule.items, page.url)
    pages[i] = { url: page.url, html: '' } // 及时释放已解析页 HTML（50 页上限 × MB 级页面，多线程叠加可观）
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
    const urlKey = e.url ? normalizeTocUrlKey(e.url) : `local:${hashText(e.title)}`
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
  /** 规整前原始标题（内部字段：用于日志对比） */
  rawTitle: string
  /** 作者是否由标题后缀回填 */
  authorFromTitle: boolean
} | null> {
  const res = await fetchPage(bookUrl, rule)
  const fields = rule.fields ?? ({} as BookRuleConfig['fields'])
  const parsed = parseFields(res.html, fields as Record<string, FieldSelector | undefined>, res.finalUrl)
  const parsedTitle = parsed.title?.trim()
  if (!parsedTitle) return null

  // 标题规整（保守行尾剥离）：提取「作者：xxx」后缀回填作者、剥离尾部章节范围数字。
  // 规整后的标题/作者同时用于唯一键、智能分类、下拉词，避免脏后缀分裂去重、污染关键词
  const norm = normalizeBookMeta(parsedTitle, (parsed.author ?? '').trim(), rule.titleNormalize)
  const title = norm.title
  const author = norm.author

  const cleaningCfg = mergeCleaning(await loadSystemCleaningRaw())
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
    author,
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
    rawTitle: parsedTitle,
    authorFromTitle: norm.authorFromTitle,
  }
}

/** 停止哨兵：列表阶段收到停止信号时中止任务（catch 据此写 stopped 而非 failed） */
class TaskStoppedError extends Error {
  constructor() {
    super('任务已停止')
    this.name = 'TaskStoppedError'
  }
}

/**
 * 可中断睡眠：底层由 task-manager.interruptibleSleep 按 400ms 切片轮询暂停/停止信号。
 * 长时间 sleep（如书籍信息重试跨 WAF 冷却的 150s 等待、阶段间隔）若不可中断，
 * 停止指令要等整段 sleep 结束才生效——控制路由 8s 兕底已把任务标为 stopped，
 * 而管线仍在后台请求目标站（外站风控暴露面 + 阶段名回写覆盖已停止状态）。
 */
async function stoppableSleep(rt: TaskRuntime, ms: number): Promise<void> {
  if ((await interruptibleSleep(rt, ms)) === 'stopping') throw new TaskStoppedError()
}

/** 主入口：执行采集任务 */
export async function executeTask(taskId: string): Promise<void> {
  const task = await db.collectTask.findUnique({ where: { id: taskId } })
  if (!task) {
    // 任务在 start 占位后、执行前被删除：清理 control start 遗留的运行时占位
    taskManager.remove(taskId)
    return
  }
  // 同步注册运行时（在首个 await 之前）：避免启动窗口内被 /api/tasks 的 stale 检测误杀。
  // 用 ensure 复用 control start 已占位的运行时而非覆盖重建：
  // create 会把首个 await（任务查询）窗口内到达的 pause/stop 信号重置回 running
  const { rt } = taskManager.ensure(taskId)

  const stats: TaskStats = { books: 0, booksNew: 0, chapters: 0, chaptersNew: 0, contents: 0, errors: 0 }
  let lastProgress = 0
  const writeStats = async (stage: string, progress: number) => {
    // progress=-1：保持已有全局进度不回退（内容阶段按书局部完成度无法直接折算全局百分比）
    if (progress >= 0) lastProgress = progress
    try {
      await db.collectTask.update({
        where: { id: taskId },
        data: { stage, progress: lastProgress, stats: JSON.stringify(stats) },
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
      if (!task.urlTemplate.includes('{page}') && task.pageEnd > task.pageStart) {
        await taskLog(
          taskId,
          'warn',
          `urlTemplate 未含 {page} 占位符：第 ${task.pageStart}~${task.pageEnd} 页将重复抓取同一地址（书籍地址会去重，仅浪费请求）`
        )
      }
      for (let p = task.pageStart; p <= task.pageEnd; p++) {
        // 列表阶段可能持续数分钟：逐页响应暂停/停止（此前停止信号要等列表全部抓完才生效）
        if (!(await taskManager.waitWhilePaused(rt))) throw new TaskStoppedError()
        const url = task.urlTemplate.replace('{page}', String(p))
        // 任务模板已定义分页区间，忽略规则自身的 pagination 配置：
        // 否则规则的 template 分页（有自己的 startPage/endPage）会覆盖任务页码，
        // 导致同一页被重复抓 N 遍（浪费请求且增加风控暴露面）
        const pages = await fetchPaginated(url, listCfg, undefined, 20)
        for (const page of pages) {
          const entries = parseListEntries(page.html, listCfg.items, page.url)
          for (const e of entries) if (e.url && /^https?:\/\//.test(e.url)) bookUrls.push(e.url)
        }
        await taskLog(taskId, 'info', `列表第 ${p} 页解析完成，累计 ${bookUrls.length} 本候选`)
        await stoppableSleep(rt, randomInt(task.intervalMin, task.intervalMax))
      }
    } else {
      try {
        const parsed: unknown = JSON.parse(task.targetUrls)
        // 防御非数组/非 http(s) 项：误存字符串时 [...new Set("abc")] 会按字符拆成 3 个伪地址
        bookUrls = Array.isArray(parsed)
          ? parsed.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u))
          : []
      } catch {
        bookUrls = []
      }
    }
    bookUrls = [...new Set(bookUrls)]
    if (bookUrls.length === 0) throw new Error('未解析到任何书籍地址')

    const totalBooks = bookUrls.length
    await db.collectTask.update({ where: { id: taskId }, data: { total: totalBooks } })
    await taskLog(taskId, 'info', `共 ${totalBooks} 本待采集`)

    // 来源站名称（取书籍页主机名，回填书籍 sourceName 供筛选/展示）
    let sourceName = ''
    try {
      sourceName = new URL(bookUrls[0]).hostname
    } catch {
      /* ignore */
    }

    const cleaningCfg = mergeCleaning(await loadSystemCleaningRaw())

    // ---------- 阶段 2~4：书籍 → 目录 → 内容（随机线程池） ----------
    const poolResult = await runRandomPool({
      items: bookUrls,
      taskId,
      // 与内容阶段线程池同款钉底：非法/越界的线程数配置不致产生 0 线程（randomInt 非有限值回退 min）
      threadMin: Math.max(1, task.threadMin),
      threadMax: Math.max(1, task.threadMax),
      intervalMin: task.intervalMin,
      intervalMax: task.intervalMax,
      onProgress: async (completed, total) => {
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
            // 跨 WAF 冷却期的长等待必须可被暂停/停止打断（150s 不可中断会拖延停止指令数分钟）
            await stoppableSleep(rt, randomInt(task.intervalMin, task.intervalMax) + 150_000)
            info = await collectBookInfo(bookUrl, bookCfg, infoOpts)
          }
          if (!info) {
            stats.errors++
            await taskLog(taskId, 'warn', `书籍字段解析失败（title 为空，可能被目标站拦截）：${bookUrl}`)
            return
          }
          if (info.rawTitle !== info.title) {
            await taskLog(
              taskId,
              'info',
              `标题规整：《${info.rawTitle}》→《${info.title}》${info.authorFromTitle ? `，作者回填：${info.author}` : ''}`
            )
          }

          const existing = await db.book.findUnique({
            where: { sourceUrl_title: { sourceUrl: info.finalUrl, title: info.title } },
          })
          // 来源站按书计算：镜像轮换/多站混合任务下，任务级 bookUrls[0] 主机名可能与实际抓取域不一致
          let bookSource = sourceName
          try {
            bookSource = new URL(info.finalUrl).hostname || sourceName
          } catch {
            /* 回退任务级 sourceName */
          }
          let bookId: string
          if (existing) {
            const updateData: Record<string, string | number | undefined> = {
              // 来源站仅首次写入，避免同书多源互覆盖
              sourceName: existing.sourceName || bookSource,
            }
            if (task.mode === 'full') {
              // 完全重采集同样防「空值覆盖」：本次解析为空（选择器失配/反爬半页）时保留库内已有值，
              // 非空值仍以本次采集为准（与增量分支同一保护语义，避免把好数据清成空串）
              Object.assign(updateData, {
                author: info.author || existing.author,
                category: info.category || existing.category,
                categoryScore: info.category ? info.categoryScore : existing.categoryScore,
                keywords: info.keywords || existing.keywords,
                intro: info.intro || existing.intro,
                latestChapter: info.latestChapter || existing.latestChapter,
              })
              // 状态置信度守卫（与增量分支同语义）：本次解析降级为低置信猜测
              // （状态字段选择器失配时 detectCompletion 默认给 0.5 的连载）不回退库内高置信状态，
              // 避免完结书被误翻回连载
              if (info.statusConfidence >= (existing.statusConfidence ?? 0)) {
                updateData.status = info.status
                updateData.statusConfidence = info.statusConfidence
                updateData.statusSource = info.statusSource
              }
              if (info.suggestKeywords) updateData.suggestKeywords = info.suggestKeywords
            } else {
              if (info.author) updateData.author = info.author
              if (info.category) {
                updateData.category = info.category
                // 分类与置信度成对更新，避免换了分类还挂着旧分数
                updateData.categoryScore = info.categoryScore
              }
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
            try {
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
                  sourceName: bookSource,
                },
              })
              bookId = created.id
              stats.books++
              stats.booksNew++
              await taskLog(taskId, 'success', `新增书籍《${info.title}》${info.author ? ` / ${info.author}` : ''} [${info.category}]`)
            } catch (e) {
              // 并发竞态兜底：同一本书经不同入口 URL 被两个线程同时处理时，
              // 双双 findUnique 未命中后竞相 create 触发唯一约束冲突 → 复用先建记录继续采集
              const dup =
                e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
                  ? await db.book.findUnique({
                      where: { sourceUrl_title: { sourceUrl: info.finalUrl, title: info.title } },
                    })
                  : null
              if (!dup) throw e
              bookId = dup.id
              stats.books++
              await taskLog(taskId, 'info', `书籍并发创建冲突，复用已有《${info.title}》继续采集`)
            }
          }

          // ---- 封面下载 webp（阶段间隔限频） ----
          await stoppableSleep(rt, randomInt(task.intervalMin, task.intervalMax))
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
          await stoppableSleep(rt, randomInt(task.intervalMin, task.intervalMax))
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
          // 批量比对写入：1 次读全量 + createMany 批量建 + 仅差量 update
          // （原逐条 findUnique+create/update 对千章书是 2400+ 次串行 DB 往返）
          const existingChapters = await db.chapter.findMany({
            where: { bookId },
            select: { id: true, url: true, title: true, order: true, contentLocal: true },
          })
          const byUrl = new Map(existingChapters.map((c) => [c.url, c]))
          let order = 0
          const toCreate: { bookId: string; title: string; order: number; url: string }[] = []
          const toUpdate: { id: string; title: string; order: number }[] = []
          for (const entry of toc.entries) {
            order++
            const urlKey = entry.url || `local:${hashText(entry.title)}`
            const ex = byUrl.get(urlKey)
            if (ex) {
              if (ex.title !== entry.title || ex.order !== order) {
                toUpdate.push({ id: ex.id, title: entry.title, order })
              }
              stats.chapters++
            } else {
              toCreate.push({ bookId, title: entry.title, order, url: urlKey })
              stats.chapters++
              stats.chaptersNew++
            }
          }
          if (toCreate.length > 0) {
            try {
              await db.chapter.createMany({ data: toCreate })
            } catch (e) {
              // 极罕见并发同书竞态（两线程同时为同一 bookId 建章）触发唯一约束冲突：
              // 整批失败时退回逐条插入，冲突行跳过，其余照常入库
              if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                for (const c of toCreate) {
                  try {
                    await db.chapter.create({ data: c })
                  } catch {
                    /* 冲突行跳过 */
                  }
                }
              } else {
                throw e
              }
            }
          }
          for (const u of toUpdate) {
            await db.chapter.update({ where: { id: u.id }, data: { title: u.title, order: u.order } })
          }
          // 全量重采清理失效章节：源目录已不再列出的旧章节（连同其 txt 文件）一并移除，
          // 否则残留旧 order 与新目录序号冲突（目录/上下章导航错乱）、totalChapters 与实际行数漂移。
          // 防御目录瞬时残缺（反爬半页/选择器失配）：仅当本次目录条目数 ≥ 现有章节数才清理，
          // 目录变少（解析残缺）一律保留旧章节不动
          if (task.mode === 'full' && toc.entries.length >= existingChapters.length) {
            const freshKeys = new Set(toc.entries.map((e) => e.url || `local:${hashText(e.title)}`))
            const stale = existingChapters.filter((c) => !freshKeys.has(c.url))
            if (stale.length > 0) {
              for (let i = 0; i < stale.length; i += 500) {
                await db.chapter.deleteMany({ where: { id: { in: stale.slice(i, i + 500).map((c) => c.id) } } })
              }
              await Promise.all(stale.map((c) => (c.contentLocal ? removeChapterTxt(c.contentLocal) : undefined)))
              await taskLog(taskId, 'info', `《${info.title}》全量重采清理失效章节 ${stale.length} 条（源目录已不列出）`)
            }
          }
          await db.book.update({
            where: { id: bookId },
            data: {
              // 目录为空（瞬时反爬拦截等）时不清零已有统计，仅在有章节时覆盖
              totalChapters: order > 0 ? order : undefined,
              // 乱序目录（未开启重排）的末条不可信（可能是「最新章节置顶」布局下的最旧章），
              // 此时保留库内 latestChapter，避免把最新章节回写成旧章节
              latestChapter:
                toc.entries.length && (!toc.scrambled || tocCfg.reorder?.enabled)
                  ? toc.entries[toc.entries.length - 1].title
                  : undefined,
            },
          })

          // ---- 章节内容（增量：只采未完成的；完全：全部重采） ----
          // 只取内容阶段所需列：默认 findMany 会携带全部章节正文（千章书可达数十 MB 无谓驻留）
          const chapters = await db.chapter.findMany({
            where: { bookId },
            orderBy: { order: 'asc' },
            select: { id: true, url: true, title: true, order: true, collected: true },
          })
          // local: 章节无源地址，抓取必然失败；排除以免每轮全量/重采都刷一遍错误
          const todo = (task.mode === 'full' ? chapters : chapters.filter((c) => !c.collected)).filter(
            (c) => !c.url.startsWith('local:')
          )
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
          // 内容阶段实时回写 stats/进度（长书采集时 UI 不再长时间停留在旧阶段/旧统计）
          await writeStats(`正文采集《${info.title}》`, -1)
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
                  // 阶段进度 = 书籍进度基础 + 本书内容完成占比；-1 表示保持全局进度不变
                  await writeStats(`正文采集《${info.title}》（${contentDone}/${todo.length}）`, -1)
                }
              } catch (e) {
                stats.errors++
                await taskLog(taskId, 'error', `正文采集失败《${info.title}》${chapter.title}：${e instanceof Error ? e.message : String(e)}`)
              }
            },
          })
        } catch (e) {
          // 停止信号必须向上传播：由线程池循环顶部的 shouldStop 检查统一退出（stopped 语义），
          // 否则单本书的停止会被误记为「书籍采集失败」
          if (e instanceof TaskStoppedError) throw e
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
        // 仅成功完成才置 100；停止保持原进度，失败保留最后进度（避免 failed 显示 100% 的误导）
        progress: finalStatus === 'done' ? 100 : undefined,
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
    const stoppedEarly = e instanceof TaskStoppedError
    await db.collectTask.update({
      where: { id: taskId },
      data: {
        status: stoppedEarly ? 'stopped' : 'failed',
        stage: stoppedEarly ? '已停止' : '失败',
        stats: JSON.stringify(stats),
      },
    })
    await taskLog(
      taskId,
      stoppedEarly ? 'warn' : 'error',
      stoppedEarly
        ? `任务已停止（列表阶段）：书籍 ${stats.books}，正文 ${stats.contents} 篇`
        : `任务失败：${e instanceof Error ? e.message : String(e)}`
    )
  } finally {
    taskManager.remove(taskId)
  }
}
