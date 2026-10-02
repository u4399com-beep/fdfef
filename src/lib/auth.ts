import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

// ============================================================
// 后台认证（server-only：仅限服务端组件 / API 路由导入）
// - 密码：scrypt(N=16384, r=8, p=1, 64B) + 随机盐，存 `scrypt$salt$hash`
// - 会话：HMAC-SHA256 签名 token（payload.u + exp），HttpOnly Cookie，7 天有效
// - 密钥：AUTH_SECRET 环境变量优先；否则落盘 db/auth-secret（自动生成，gitignore）
// - 限速：内存级「IP+用户名」登录失败计数（5 次 / 10 分钟）
// ============================================================

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>

export const SESSION_COOKIE = 'nm_session'

/** 会话有效期：7 天 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ---------- 密钥管理 ----------

let cachedSecret: Buffer | null = null

function getSecret(): Buffer {
  if (cachedSecret) return cachedSecret
  const env = process.env.AUTH_SECRET
  if (env && env.length >= 16) {
    cachedSecret = Buffer.from(env, 'utf8')
    return cachedSecret
  }
  // 文件持久化：跨进程/重启稳定（沙箱无 .env 注入时的默认方案）
  const dir = path.join(process.cwd(), 'db')
  const file = path.join(dir, 'auth-secret')
  try {
    if (existsSync(file)) {
      const s = readFileSync(file, 'utf8').trim()
      if (s.length >= 32) {
        cachedSecret = Buffer.from(s, 'utf8')
        return cachedSecret
      }
    }
  } catch {
    /* 读取失败则重新生成 */
  }
  const s = randomBytes(32).toString('hex')
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(file, s, { encoding: 'utf8', mode: 0o600 })
  } catch {
    /* 写盘失败（只读 FS 等）时退化为进程内随机密钥：会话不跨重启，安全侧不受影响 */
  }
  cachedSecret = Buffer.from(s, 'utf8')
  return cachedSecret
}

// ---------- 密码哈希 ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(hashB64, 'base64')
    const actual = await scrypt(password, salt, expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ---------- 会话令牌 ----------

export function createSessionToken(username: string): string {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + SESSION_TTL_MS })).toString('base64url')
  const sig = createHmac('sha256', getSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifySessionToken(token: string): { u: string } | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const payload = token.slice(0, dot)
  const sigBuf = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = createHmac('sha256', getSecret()).update(payload).digest()
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; exp?: number }
    if (!data.u || typeof data.exp !== 'number' || data.exp < Date.now()) return null
    return { u: data.u }
  } catch {
    return null
  }
}

// ---------- Cookie 解析 / 会话读取 ----------

function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim())
      } catch {
        return part.slice(idx + 1).trim()
      }
    }
  }
  return null
}

/** API 路由用：从 Request 读取会话 */
export function getSessionUser(req: Request): { u: string } | null {
  return verifySessionToken(readCookie(req.headers.get('cookie'), SESSION_COOKIE) ?? '')
}

/** 服务端组件用：从 headers() 的 cookie 头读取会话 */
export function getSessionFromCookieHeader(header: string | null | undefined): { u: string } | null {
  return verifySessionToken(readCookie(header, SESSION_COOKIE) ?? '')
}

/**
 * 管理类 API 统一守卫：会话有效返回 null 放行；否则返回 401 响应。
 * 用法：`const denied = requireAuth(req); if (denied) return denied;`
 */
export function requireAuth(req: Request): NextResponse | null {
  if (getSessionUser(req)) return null
  return NextResponse.json({ error: '未登录或会话已过期，请重新登录' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
}

// ---------- 登录限速（内存级，单实例部署足够） ----------

const MAX_FAILS = 5
const FAIL_WINDOW_MS = 10 * 60 * 1000
const attempts = new Map<string, { count: number; resetAt: number }>()

export function clientKey(req: Request, username: string): string {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  return `${ip}|${username.toLowerCase()}`
}

export function checkRateLimit(key: string): { ok: boolean; retryAfterMin?: number } {
  const now = Date.now()
  if (attempts.size > 500) {
    for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k)
  }
  const rec = attempts.get(key)
  if (rec && rec.resetAt > now && rec.count >= MAX_FAILS) {
    return { ok: false, retryAfterMin: Math.max(1, Math.ceil((rec.resetAt - now) / 60000)) }
  }
  return { ok: true }
}

export function recordLoginFail(key: string): void {
  const now = Date.now()
  const rec = attempts.get(key)
  if (!rec || rec.resetAt < now) attempts.set(key, { count: 1, resetAt: now + FAIL_WINDOW_MS })
  else rec.count++
}

export function clearLoginFails(key: string): void {
  attempts.delete(key)
}
