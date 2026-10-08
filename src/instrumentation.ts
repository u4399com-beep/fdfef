/**
 * Next.js 服务器生命周期钩子：拉起循环采集调度器（进程内单例）。
 * register() 每个服务器进程执行一次；dev 热重载与多实例由 scheduler 的 globalThis 守卫去重。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { startScheduler } = await import('./lib/collect/scheduler')
    startScheduler()
  } catch (e) {
    console.error('[instrumentation] 循环采集调度器启动失败:', e)
  }
}
