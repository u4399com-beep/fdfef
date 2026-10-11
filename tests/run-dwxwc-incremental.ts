/**
 * dwxwc 真实增量采集实战轮（有界·单次调用自含模式）：
 * 平台会话边界会清扫后台进程，长驻 dev server 不可靠——本脚本在单个 bun 进程内
 * 走生产代码路径（normalizeTaskInput → taskCreateData → launchTask → pipeline）
 * 跑一轮真实增量采集，限时优雅停止，产出实战证据：
 *   ① 字段清洗（列表/书页 meta/章节名/正文混淆域名）在真实数据上的表现
 *   ② 章节级失败重试（R22）在 WAF 站真实失败（404 缺陷章/瞬时拦截）上的表现
 *   ③ DomainThrottle 巡航与 WAF 挑战/限流的互动
 *
 * 用法：bun tests/run-dwxwc-incremental.ts [预算秒=450]（Bash 10min 上限内自含完成）
 */
import { db } from '../src/lib/db'
import { normalizeTaskInput, taskCreateData } from '../src/lib/collect/task-input'
import { launchTask } from '../src/lib/collect/task-launch'
import { taskManager } from '../src/lib/collect/task-manager'

const BUDGET_SEC = Math.max(60, Number.parseInt(process.argv[2] ?? '450', 10) || 450)
const BOOK_URL = process.env.BOOK_URL ?? 'https://www.dwxwc.com/index/106419033/' // 默认人间武圣；可 BOOK_URL=… 覆盖
const RULE_NAMES = [
  ['book', '大文学无错-书籍信息页'],
  ['toc', '大文学无错-章节目录页'],
  ['content', '大文学无错-章节内容页'],
] as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function contentStats(): Promise<{ withContent: number; chars: number; lowChar: number }> {
  const rows = (await db.$queryRawUnsafe<{ n: number; wc: number; c: number; low: number }[]>(
    `SELECT COUNT(*) n,
            SUM(CASE WHEN content IS NOT NULL AND content != '' THEN 1 ELSE 0 END) wc,
            COALESCE(SUM(LENGTH(CASE WHEN content IS NOT NULL THEN content END)),0) c,
            SUM(CASE WHEN collected=1 AND wordCount>0 AND wordCount<80 THEN 1 ELSE 0 END) low
     FROM Chapter WHERE bookId IN (SELECT id FROM Book WHERE sourceUrl LIKE '%dwxwc%')`
  )) as { n: number; wc: number; c: number; low: number }[]
  return { withContent: Number(rows[0]?.wc ?? 0), chars: Number(rows[0]?.c ?? 0), lowChar: Number(rows[0]?.low ?? 0) }
}

async function fetchLogs(taskId: string, sinceMs: number) {
  return db.taskLog.findMany({
    where: { taskId, createdAt: { gte: new Date(sinceMs) } },
    orderBy: { createdAt: 'asc' },
  })
}

async function main(): Promise<void> {
  const startedAt = Date.now()
  const before = await contentStats()
  console.log(`[baseline] dwxwc 章节有正文 ${before.withContent} 章 / ${before.chars} 字 / 低字数 ${before.lowChar}`)

  const ids: Record<string, string | null> = {}
  for (const [type, name] of RULE_NAMES) {
    const rule = await db.collectRule.findFirst({ where: { name, type } })
    ids[type] = rule?.id ?? null
    if (!rule) throw new Error(`规则缺失：${name}`)
  }

  const norm = normalizeTaskInput({
    name: `dwxwc实战增量验证 ${new Date(startedAt).toISOString().slice(5, 16).replace('T', ' ')}`,
    targetType: 'single',
    targetUrls: [BOOK_URL],
    bookRuleId: ids.book,
    tocRuleId: ids.toc,
    contentRuleId: ids.content,
    mode: 'incremental',
    storageMode: 'db',
    threadMin: 1,
    threadMax: 2,
    intervalMin: 1500,
    intervalMax: 3000,
  })
  if (!norm.ok) throw new Error(`任务参数非法：${norm.error}`)
  const task = await db.collectTask.create({ data: taskCreateData(norm.data) })
  console.log(`[task] 已创建 ${task.id}（single 增量，预算 ${BUDGET_SEC}s）`)

  const r = await launchTask(task.id)
  if (!r.ok) throw new Error(`启动失败：${r.error}`)
  console.log('[task] 已启动，开始监控 TaskLog …')

  let cursor = startedAt
  const SETTLED = ['done', 'failed', 'stopped', 'template-error']
  let stopRequested = false
  while (true) {
    await sleep(5000)
    const logs = await fetchLogs(task.id, cursor)
    for (const l of logs) {
      cursor = Math.max(cursor, l.createdAt.getTime() + 1)
      console.log(`  ${new Date(l.createdAt).toISOString().slice(11, 19)} ${l.level.padEnd(7)} ${l.message.slice(0, 150)}`)
    }
    const row = await db.collectTask.findUnique({ where: { id: task.id }, select: { status: true, stage: true, progress: true, total: true } })
    const elapsed = Math.round((Date.now() - startedAt) / 1000)
    console.log(`[poll ${elapsed}s] ${row?.status} | ${row?.stage} | ${row?.progress}/${row?.total}`)

    if (row && SETTLED.includes(row.status)) {
      console.log(`[task] 终态：${row.status}（${elapsed}s）`)
      break
    }
    if (!stopRequested && elapsed >= BUDGET_SEC) {
      console.log(`[budget] 到达预算，优雅停止 …`)
      taskManager.stop(task.id)
      stopRequested = true
    }
    if (stopRequested && elapsed >= BUDGET_SEC + 90) {
      console.log(`[budget] 停止等待超 90s，放弃等待（运行时随进程退出清理）`)
      break
    }
  }

  const after = await contentStats()
  const final = await db.collectTask.findUnique({ where: { id: task.id } })
  const logs = await fetchLogs(task.id, startedAt)
  console.log('\n========== 实战轮审计 ==========')
  console.log(`任务终态: ${final?.status} | stage: ${final?.stage}`)
  console.log(`内容增量: ${before.withContent} → ${after.withContent} 章（+${after.withContent - before.withContent}），字数 ${before.chars} → ${after.chars}（+${after.chars - before.chars}）`)
  console.log(`低字数(<80)预警章节: ${after.lowChar - before.lowChar} 新增`)
  const retries = logs.filter((l) => l.message.includes('将重试') || l.message.includes('已重试'))
  const errors = logs.filter((l) => l.level === 'error')
  const warns = logs.filter((l) => l.level === 'warn' && !l.message.includes('将重试') && !l.message.includes('已重试'))
  console.log(`重试事件: ${retries.length} 条 | error: ${errors.length} 条 | 其他 warn: ${warns.length} 条`)
  for (const l of [...retries, ...errors, ...warns].slice(0, 12)) {
    console.log(`  [${l.level}] ${l.message.slice(0, 160)}`)
  }

  // 抽查最新采集的 2 章正文（噪声残留检查：混淆域名/广告话术/首尾完整性）
  const fresh = (await db.$queryRawUnsafe<{ title: string; content: string; wordCount: number }[]>(
    `SELECT title, content, wordCount FROM Chapter
     WHERE bookId IN (SELECT id FROM Book WHERE sourceUrl LIKE '%dwxwc%') AND collected=1 AND wordCount>80
     ORDER BY createdAt DESC LIMIT 2`
  )) as { title: string; content: string; wordCount: number }[]
  for (const c of fresh) {
    const noise = /`r¨c!y·x|大文学无错|www\.dwxwc|无弹窗|首发|请记住本站|最新章节/.test(c.content ?? '')
    console.log(`抽检《${c.title.slice(0, 26)}》 wordCount=${c.wordCount} 噪声残留=${noise}`)
    console.log(`   首行: ${(c.content ?? '').split('\n')[0]?.slice(0, 60)}`)
  }
  await db.$disconnect()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[fatal]', e)
    process.exit(1)
  })
