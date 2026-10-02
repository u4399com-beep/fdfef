import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { json, badRequest, readJson } from '@/app/api/_lib/http'
import { getSessionUser, hashPassword, requireAuth, verifyPassword } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIN_PASSWORD_LEN = 6
const MAX_PASSWORD_LEN = 72 // scrypt 输入长度上限（与 bcrypt 惯例对齐，防超长输入拖 CPU）

export async function POST(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied

  const session = getSessionUser(req)
  const body = await readJson(req)
  if (!body) return badRequest('请求体格式错误')
  const oldPassword = typeof body.oldPassword === 'string' ? body.oldPassword : ''
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
  if (!oldPassword || !newPassword) return badRequest('请输入旧密码和新密码')
  if (newPassword.length < MIN_PASSWORD_LEN) return badRequest(`新密码至少 ${MIN_PASSWORD_LEN} 位`)
  if (newPassword.length > MAX_PASSWORD_LEN) return badRequest(`新密码最多 ${MAX_PASSWORD_LEN} 位`)

  try {
    const user = session ? await db.adminUser.findUnique({ where: { username: session.u } }) : null
    if (!user) return json({ error: '账户不存在，请重新登录' }, { status: 401 })
    if (!(await verifyPassword(oldPassword, user.passwordHash))) {
      return json({ error: '旧密码错误' }, { status: 400 })
    }
    if (oldPassword === newPassword) return badRequest('新密码不能与旧密码相同')
    await db.adminUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } })
    return json({ ok: true })
  } catch (e) {
    console.error('[auth/change-password] 修改密码失败', e)
    return json({ error: '修改密码失败，请稍后重试' }, { status: 500 })
  }
}
