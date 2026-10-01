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
  /**
   * 运行时代际：每次 create 递增。finally/兜底 remove 携带启动时捕获的代际，
   * 仅当代际匹配才删除——防止「停止 8s 强制清理后用户立即重启、旧协程才退出」
   * 的时序下旧实例误删新一轮启动的运行时（导致新任务控制失效）
   */
  epoch: number
}

// 状态数据挂 globalThis（跨热重载保留），类实例每次新建（类代码始终最新）
const RUNTIME_STATE_KEY = '__novelTaskRuntimes'
const globalForTaskManager = globalThis as unknown as {
  [RUNTIME_STATE_KEY]?: Map<string, TaskRuntime>
  __novelTaskEpoch?: number
}
const runtimeStore: Map<string, TaskRuntime> =
  globalForTaskManager[RUNTIME_STATE_KEY] ?? new Map()
globalForTaskManager[RUNTIME_STATE_KEY] = runtimeStore
// 代际计数器同样挂 globalThis（热重载不回退）；epoch 0 保留给「ensure 兜底创建」之外的语义
function nextEpoch(): number {
  globalForTaskManager.__novelTaskEpoch = (globalForTaskManager.__novelTaskEpoch ?? 0) + 1
  return globalForTaskManager.__novelTaskEpoch
}

export class TaskManagerImpl {
  private runtimes = runtimeStore

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
    const rt: TaskRuntime = { taskId, status: 'running', startedAt: Date.now(), processed: 0, epoch: nextEpoch() }
    this.runtimes.set(taskId, rt)
    return rt
  }

  /**
   * 获取或创建 runtime（嵌套池复用同一 runtime）。
   * 返回 owned=true 表示本次调用创建的 runtime（负责 remove）；
   * owned=false 表示复用外层 runtime（绝不能 remove，否则外层暂停/停止将失效）。
   */
  ensure(taskId: string): { rt: TaskRuntime; owned: boolean } {
    const existing = this.runtimes.get(taskId)
    if (existing) return { rt: existing, owned: false }
    return { rt: this.create(taskId), owned: true }
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

  /**
   * 删除运行时。携带 epoch 时仅当代际匹配才删（防旧实例退出误删新一轮启动的运行时）；
   * 不携带时无条件删（控制路由的强制清理/僵尸自愈场景）。
   */
  remove(taskId: string, epoch?: number): void {
    if (epoch === undefined) {
      this.runtimes.delete(taskId)
      return
    }
    const rt = this.runtimes.get(taskId)
    if (rt && rt.epoch === epoch) this.runtimes.delete(taskId)
  }

  /** 暂停期间自旋等待；返回 false 表示需要终止 */
  async waitWhilePaused(rt: TaskRuntime): Promise<boolean> {
    while (this.runtimes.get(rt.taskId)?.status === 'paused') {
      await sleep(400)
    }
    return (this.runtimes.get(rt.taskId)?.status ?? 'running') !== 'stopping'
  }

  shouldStop(rt: TaskRuntime): boolean {
    // 双源判定：map 条目为 stopping（常规停止/热重载后条目被替换再停止）或闭包持有的
    // rt 自身为 stopping（停止后条目被强制清理又被新一轮启动覆盖——旧协程读 map 会看到
    // 新实例的 running，此时闭包对象仍保留 stop 写入的 stopping，任一命中即终止，
    // 防止强清+重启时序下旧协程脱管继续爬取）
    return this.runtimes.get(rt.taskId)?.status === 'stopping' || rt.status === 'stopping'
  }
}

/**
 * 可被暂停/停止信号打断的睡眠：按 400ms 切片轮询，停止/暂停中不再消耗等待时长之外的阻塞。
 * 返回 'stopping' 表示收到终止信号（调用方可据此提前退出/抛出停止哨兵），'done' 表示完整等待结束。
 * 线程池的条目间随机间隔此前为整段 sleep：intervalMax 较大时（如 30s）停止指令要等整段睡完才生效。
 */
export async function interruptibleSleep(rt: TaskRuntime, ms: number): Promise<'done' | 'stopping'> {
  const deadline = Date.now() + Math.max(0, ms)
  while (true) {
    if (taskManager.shouldStop(rt)) return 'stopping'
    if (!(await taskManager.waitWhilePaused(rt))) return 'stopping'
    const remain = deadline - Date.now()
    if (remain <= 0) return 'done'
    await sleep(Math.min(400, remain))
  }
}

// 实例每次模块加载新建，共享 globalThis 状态
export const taskManager = new TaskManagerImpl()

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
  // 嵌套池（书级池内嵌章节池）必须复用外层 runtime，否则暂停/停止控制会失效
  const { rt, owned } = taskManager.ensure(opts.taskId)
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
      // 收尾前最后一次停止检查：单条目池/末条完成的 early-return 不经过循环顶部，
      // 漏掉这次检查会让处理期间到达的停止信号丢失（任务被误标 done 而非 stopped）
      if (taskManager.shouldStop(rt)) {
        stopped = true
        return
      }
      // 条目已全部领完（counter>=total）：本 worker 永远拿不到新条目，立即收尾。
      // 原实现为 `counter>=total && completed>=total`——最后一批完成 worker 会先空睡一个
      // 随机间隔才回循环顶发现无条目可领，intervalMax 较大时（如 30s）任务实际已完成
      // 却迟迟不退出 Promise.all，DB 状态与 UI 进度被无谓拖住
      if (counter >= total) return
      // 随机间隔：每次请求后按 [intervalMin, intervalMax] 随机等待；
      // 睡眠期间收到停止/暂停信号立即打断（由循环顶部统一退出）
      await interruptibleSleep(rt, randomInt(opts.intervalMin, opts.intervalMax))
    }
  }

  const threadCount = Math.max(1, randomInt(opts.threadMin, opts.threadMax))
  await Promise.all(Array.from({ length: threadCount }, () => worker(0)))
  if (owned) taskManager.remove(opts.taskId, rt.epoch)
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
