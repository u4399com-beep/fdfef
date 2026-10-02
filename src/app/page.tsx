import { headers } from 'next/headers'
import { AdminRoot } from '@/components/admin/admin-root'
import { FrontRoot } from '@/components/site/front-root'
import { db } from '@/lib/db'
import { getSessionFromCookieHeader } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * 前后端分离唯一页面入口：
 * - /      → 公开前台站点（蜘蛛/读者访问，全屏主题渲染）
 * - /admin → middleware rewrite 到本路由（x-admin-view=1），渲染后台：
 *            未登录 → 登录墙（账户密码）；已登录 → 管理控制台
 */
export default async function Page() {
  const h = await headers()
  if (h.get('x-admin-view') !== '1') return <FrontRoot />

  const session = getSessionFromCookieHeader(h.get('cookie'))
  if (!session) {
    let firstRun = false
    try {
      firstRun = (await db.adminUser.count()) === 0
    } catch {
      /* 表未就绪等异常不阻断登录墙展示 */
    }
    return <AdminRoot authed={false} firstRun={firstRun} />
  }
  return <AdminRoot authed username={session.u} />
}
