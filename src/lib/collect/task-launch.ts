/**
 * 任务启动共享入口：/api/tasks/[id]/control（手动启动）与循环任务调度器（自动触发）
 * 共用同一套「原子占位 → 运行时创建 → 异步执行」逻辑，闭合并发双启动竞态。
 */
import { db } from '@/lib/db'
import { taskManager } from './task-manager'
import { executeTask } from './pipeline'

/** 与 _lib/http.ts ACTIVE_TASK_STATUSES 同值（lib 层不反向依赖 app 路由助手） */
const ACTIVE_TASK_STATUSES = ['running', 'paused']

export interface LaunchResult {
  ok: boolean
  error?: string
  notFound?: boolean
}

/**
 * 启动一个采集任务（幂等防并发）：
 * 1. 内存残留运行时但 DB 已非活动 → 强清残留（停止竞态窗口/热重载僵尸兜底）
 * 2. DB 原子占位：仅当状态仍非活动才置 running（并发双启动只有一个成功）
 * 3. 同步占位运行时后异步 executeTask（ensure 幂等复用）
 */
export async function launchTask(taskId: string): Promise<LaunchResult> {
  const task = await db.collectTask.findUnique({ where: { id: taskId } })
  if (!task) return { ok: false, error: '任务不存在', notFound: true }
  if (taskManager.has(taskId)) {
    if (ACTIVE_TASK_STATUSES.includes(task.status)) {
      return { ok: false, error: '任务已在运行中' }
    }
    taskManager.remove(taskId)
  }
  const claim = await db.collectTask.updateMany({
    where: { id: taskId, status: { notIn: ACTIVE_TASK_STATUSES } },
    data: { status: 'running' },
  })
  if (claim.count === 0) {
    return { ok: false, error: '任务正在运行，请先停止后再启动' }
  }
  const rt = taskManager.create(taskId)
  void executeTask(taskId).catch((e) => {
    // executeTask 在进入自身 try 前抛错（如任务查询失败）时不会走到其 finally 清理，
    // 占位运行时将永驻内存且任务永久卡在「已在运行中」→ 兜底移除
    // （带代际：若 entry 已被新一轮启动覆盖则不动；正常完成路径其 finally 已 remove，此处幂等无害）
    taskManager.remove(taskId, rt.epoch)
    console.error(`[task-launch] 任务 ${taskId} 执行启动失败:`, e)
  })
  return { ok: true }
}
