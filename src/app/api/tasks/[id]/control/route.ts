import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { taskManager, taskLog } from '@/lib/collect/task-manager'
import { executeTask } from '@/lib/collect/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 任务控制：start 立即执行 / pause 暂停 / resume 继续 / stop 停止 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { action } = (await req.json()) as { action?: string }
  const task = await db.collectTask.findUnique({ where: { id } })
  if (!task) return NextResponse.json({ error: '任务不存在' }, { status: 404 })

  switch (action) {
    case 'start': {
      if (taskManager.has(id)) {
        return NextResponse.json({ error: '任务已在运行中' }, { status: 400 })
      }
      if (task.status === 'running' || task.status === 'paused') {
        return NextResponse.json({ error: '任务状态异常，请先停止' }, { status: 400 })
      }
      await taskLog(id, 'info', '收到执行指令')
      void executeTask(id).catch(() => undefined)
      return NextResponse.json({ ok: true, status: 'running' })
    }
    case 'pause': {
      const ok = taskManager.pause(id)
      if (!ok) return NextResponse.json({ error: '仅运行中的任务可暂停' }, { status: 400 })
      await db.collectTask.update({ where: { id }, data: { status: 'paused', stage: '已暂停' } })
      await taskLog(id, 'warn', '任务已暂停')
      return NextResponse.json({ ok: true, status: 'paused' })
    }
    case 'resume': {
      const ok = taskManager.resume(id)
      if (!ok) return NextResponse.json({ error: '仅暂停中的任务可继续' }, { status: 400 })
      await db.collectTask.update({ where: { id }, data: { status: 'running', stage: '继续执行' } })
      await taskLog(id, 'info', '任务继续执行')
      return NextResponse.json({ ok: true, status: 'running' })
    }
    case 'stop': {
      const rt = taskManager.get(id)
      if (!rt) {
        await db.collectTask.update({
          where: { id },
          data: { status: 'stopped', stage: '已停止' },
        })
        return NextResponse.json({ ok: true, status: 'stopped' })
      }
      taskManager.stop(id)
      await taskLog(id, 'warn', '收到停止指令，正在终止…')
      // 等待运行时退出（最多 8 秒）
      for (let i = 0; i < 16; i++) {
        if (!taskManager.has(id)) break
        await new Promise((r) => setTimeout(r, 500))
      }
      await db.collectTask.update({
        where: { id },
        data: { status: 'stopped', stage: '已停止' },
      })
      await taskLog(id, 'warn', '任务已停止')
      return NextResponse.json({ ok: true, status: 'stopped' })
    }
    default:
      return NextResponse.json({ error: '未知操作' }, { status: 400 })
  }
}
