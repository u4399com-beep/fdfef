import { NextResponse, type NextRequest } from 'next/server'

/**
 * 前后端分离：后台入口 /admin。
 * 项目仅有一个页面路由 /（前台站点），/admin 通过 rewrite 复用它，
 * 并以 x-admin-view 请求头告知页面渲染后台壳（登录墙 + 管理控制台）。
 * 静态资源与 API 不在 matcher 内，不受影响。
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-admin-view', '1')
  return NextResponse.rewrite(new URL('/', req.url), { request: { headers } })
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
}
