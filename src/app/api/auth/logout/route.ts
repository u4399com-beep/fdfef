import { json } from '@/app/api/_lib/http'
import { SESSION_COOKIE } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 退出登录：清空会话 Cookie（幂等，未登录调用亦返回成功） */
export async function POST() {
  const res = json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
}
