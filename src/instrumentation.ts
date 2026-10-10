/**
 * Next.js 服务器生命周期钩子：拉起循环采集调度器（进程内单例）+ SQLite 提速保障。
 * register() 每个服务器进程执行一次；dev 热重载与多实例由 scheduler 的 globalThis 守卫去重。
 */

/**
 * 确保 SQLite 运行在 WAL 模式（多线程章节采集写入吞吐的关键）：
 * - journal_mode=WAL 持久化在库文件头，只需设置一次；回滚日志模式下每个写事务
 *   创建+删除日志文件并独占锁 + 两次 fsync，多线程写章节串行化严重；
 *   WAL 下写不阻塞读、无日志文件抖动，千章书落库提速明显。
 * - 容错设计：非 bun 运行时/bun:sqlite 不可用/文件缺失一律静默跳过（Prisma 自身仍可用）。
 */
async function ensureSqliteWal(): Promise<void> {
  try {
    const { Database } = await import('bun:sqlite')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const candidates = ['db/custom.db', 'prisma/db/custom.db', 'custom.db'].map((p) => path.resolve(p))
    const dbPath = candidates.find((p) => fs.existsSync(p))
    if (!dbPath) return
    const d = new Database(dbPath)
    try {
      const mode = (d.query('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined)?.journal_mode
      if (mode?.toLowerCase() !== 'wal') {
        d.query('PRAGMA journal_mode=WAL').run()
        console.log('[instrumentation] SQLite 已切换 WAL 模式（章节写入吞吐优化）')
      }
      d.query('PRAGMA wal_checkpoint(TRUNCATE)').run() // 收敛残留 WAL 文件（便于随仓提交 db 快照）
    } finally {
      d.close()
    }
  } catch {
    /* bun:sqlite 不可用（非 bun 运行时）等场景：静默跳过 */
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  void ensureSqliteWal()
  try {
    const { startScheduler } = await import('./lib/collect/scheduler')
    startScheduler()
  } catch (e) {
    console.error('[instrumentation] 循环采集调度器启动失败:', e)
  }
}
