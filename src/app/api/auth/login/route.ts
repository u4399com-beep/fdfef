import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, badRequest, readJson } from '@/app/api/_lib/http'
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  verifyPassword,
  checkRateLimit,
  recordLoginFail,
  clearLoginFails,
  clientKey,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 首次部署引导：库中无任何管理员时创建默认账户 admin/admin123；返回是否本次新建 */
async function ensureDefaultAdmin(): Promise<boolean> {
  const count = await db.adminUser.count()
  if (count > 0) return false
  try {
    await db.adminUser.create({ data: { username: 'admin', passwordHash: await hashPassword('admin123') } })
    console.log('[auth] 首次部署：已创建默认管理员账户 admin（默认密码 admin123，请登录后立即修改）')
    return true
  } catch (e) {
    // 并发首登唯一冲突 → 已被其他请求创建，忽略
    console.warn('[auth] 默认管理员创建冲突（可能已存在）', e)
    return false
  }
}

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest('请求体格式错误')
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) return badRequest('请输入用户名和密码')

  // 限速键：IP+用户名（5 次失败 / 10 分钟）
  const key = clientKey(req, username)
  const rl = checkRateLimit(key)
  if (!rl.ok) {
    return json({ error: `登录尝试次数过多，请约 ${rl.retryAfterMin} 分钟后再试` }, { status: 429 })
  }

  try {
    await ensureDefaultAdmin()
    const user = await db.adminUser.findUnique({ where: { username } })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordLoginFail(key)
      return json({ error: '用户名或密码错误' }, { status: 401 })
    }
    clearLoginFails(key)
    await db.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    // 默认密码未修改提示（仅当 admin 账户密码仍为 admin123）
    const defaultPassword = user.username === 'admin' && (await verifyPassword('admin123', user.passwordHash))

    const res = json({ ok: true, username: user.username, defaultPassword })
    res.cookies.set(SESSION_COOKIE, createSessionToken(user.username), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
      // 反向代理终止 TLS 时走 https；本地沙箱 http 下不设 Secure 保证可用
      secure: (req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')) === 'https',
    })
    return res
  } catch (e) {
    console.error('[auth/login] 登录失败', e)
    return json({ error: '登录失败，请稍后重试' }, { status: 500 })
  }
}
