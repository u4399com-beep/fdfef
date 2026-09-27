import { db } from '@/lib/db'
import { randomInt, sleep } from './fetcher'

// ============================================================
// 任务运行时管理：立即执行 / 暂停 / 恢复 / 停止（多任务并行）
// ============================================================

export type RuntimeStatus = 'running' | 'paused' | 'stopping'

export interface TaskRuntime {
  taskId: string
  status: RuntimeStatus
  startedAt: number
  processed: number
}

class TaskManagerImpl {
  private runtimes = new Map<string, TaskRuntime>()

  get(taskId: string): TaskRuntime | undefined {
    return this.runtimes.get(taskId)
  }

  isRunning(taskId: string): boolean {
    return this.runtimes.get(taskId)?.status === 'running'
  }

  has(taskId: string): boolean {
    return this.runtimes.has(taskId)
  }

  create(taskId: string): TaskRuntime {
    const rt: TaskRuntime = { taskId, status: 'running', startedAt: Date.now(), processed: 0 }
    this.runtimes.set(taskId, rt)
    return rt
  }

  pause(taskId: string): boolean {
    const rt = this.runtimes.get(taskId)
    if (rt && rt.status === 'running') {
      rt.status = 'paused'
      return true
    }
    return false
  }

  resume(taskId: string): boolean {
    const rt = this.runtimes.get(taskId)
    if (rt && rt.status === 'paused') {
      rt.status = 'running'
      return true
    }
    return false
  }

  stop(taskId: string): boolean {
    const rt = this.runtimes.get(taskId)
    if (rt && rt.status !== 'stopping') {
      rt.status = 'stopping'
      return true
    }
    return false
  }

  remove(taskId: string): void {
    this.runtimes.delete(taskId)
  }

  /** 暂停期间自旋等待；返回 false 表示需要终止 */
  async waitWhilePaused(rt: TaskRuntime): Promise<boolean> {
    while (this.runtimes.get(rt.taskId)?.status === 'paused') {
      await sleep(400)
    }
    return (this.runtimes.get(rt.taskId)?.status ?? 'running') !== 'stopping'
  }

  shouldStop(rt: TaskRuntime): boolean {
    return rt.status === 'stopping'
  }
}

const globalForTaskManager = globalThis as unknown as { __novelTaskManager?: TaskManagerImpl }
export const taskManager: TaskManagerImpl =
  globalForTaskManager.__novelTaskManager ?? new TaskManagerImpl()
globalForTaskManager.__novelTaskManager = taskManager

// ============================================================
// 随机线程池：线程数与间隔均在 [min, max] 随机取值
// ============================================================

export interface PoolOptions<T> {
  items: T[]
  taskId: string
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
  process: (item: T, index: number) => Promise<void>
  onProgress?: (completed: number, total: number) => Promise<void> | void
}

export async function runRandomPool<T>(opts: PoolOptions<T>): Promise<{ stopped: boolean; completed: number }> {
  const rt = taskManager.create(opts.taskId)
  const total = opts.items.length
  let counter = 0
  let completed = 0
  let stopped = false

  const worker = async (workerId: number): Promise<void> => {
    void workerId
    while (true) {
      if (taskManager.shouldStop(rt)) {
        stopped = true
        return
      }
      const alive = await taskManager.waitWhilePaused(rt)
      if (!alive) {
        stopped = true
        return
      }
      const idx = counter++
      if (idx >= total) return
      try {
        await opts.process(opts.items[idx], idx)
      } catch {
        // 单条失败不中断整体（错误已在上层记录）
      }
      completed++
      if (opts.onProgress) {
        try {
          await opts.onProgress(completed, total)
        } catch {
          /* ignore */
        }
      }
      if (counter >= total && completed >= total) return
      // 随机间隔：每次请求后按 [intervalMin, intervalMax] 随机等待
      await sleep(randomInt(opts.intervalMin, opts.intervalMax))
    }
  }

  const threadCount = Math.max(1, randomInt(opts.threadMin, opts.threadMax))
  await Promise.all(Array.from({ length: threadCount }, () => worker(0)))
  taskManager.remove(opts.taskId)
  return { stopped, completed }
}

/** 日志辅助：写库 + 容错 */
export async function taskLog(
  taskId: string,
  level: 'info' | 'warn' | 'error' | 'success',
  message: string
): Promise<void> {
  try {
    await db.taskLog.create({ data: { taskId, level, message: message.slice(0, 1000) } })
  } catch {
    /* ignore */
  }
}
