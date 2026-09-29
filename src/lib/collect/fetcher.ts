import fs from 'node:fs'
import path from 'node:path'
import type { FetchConfig } from '../collect-types'

// ============================================================
// 抓取器：多策略（http / playwright / hyperbrowser）
// 反反爬增强层：
//   1. CookieJar 会话保持（WAF 通过后 cookie 全局复用，磁盘持久化跨重启保留）
//   2. UA 轮换 + Client Hints / Sec-Fetch 真实浏览器指纹
//   3. Playwright stealth 注入（移除 webdriver 特征）
//   4. WAF 挑战页自动检测 + VLM 验证码求解
//   5. HTTP 被 WAF 拦截时自动升级为浏览器渲染
//   6. 编码识别（GBK/GB2312/Big5 经 iconv-lite）
// ============================================================

const UA_LIST = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 115browser/26.0.0',
  'Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2102J2SC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/17.5.11',
]

/** 从 UA 推断主版本号（生成匹配的 Client Hints） */
function chromeMajorVersion(ua: string): string | null {
  const m = /Chrome\/(\d+)/.exec(ua)
  return m ? m[1] : null
}

export function randomUA(): string {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]
}

/** 固定 UA（rotateUA=false 时全局使用；WAF 通行 cookie 与 UA 绑定的站点必须用同一 UA） */
export const FIXED_UA = UA_LIST[0]

export function randomInt(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min
  const lo = Math.max(0, Math.ceil(min))
  const hi = Math.max(lo, Math.floor(max))
  if (lo === hi) return lo
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)))
}

export interface FetchResult {
  html: string
  status: number
  finalUrl: string
  strategy: string
  elapsedMs: number
  /** 本次响应是否为 WAF 验证页（未通过） */
  wafChallenged?: boolean
}

// ============================================================
// CookieJar：按 host 持久会话 cookie（进程级单例）
// ============================================================

interface JarCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
}

class CookieJar {
  private store: Map<string, JarCookie[]>

  constructor(store?: Map<string, JarCookie[]>) {
    this.store = store ?? new Map()
  }

  /** 解析 Set-Cookie 响应头并入 jar */
  absorbFromFetch(host: string, headers: Headers): void {
    const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
    if (!raw.length) return
    const list = this.store.get(host) ?? []
    for (const line of raw) {
      const [pair, ...attrs] = line.split(';')
      const idx = pair.indexOf('=')
      if (idx <= 0) continue
      const name = pair.slice(0, idx).trim()
      const value = pair.slice(idx + 1).trim()
      const lower = attrs.map((a) => a.trim().toLowerCase())
      const expired =
        lower.some((a) => a.startsWith('expires=') && new Date(a.slice(8)).getTime() < Date.now()) ||
        // Max-Age<=0 同样表示删除该 cookie（GoEdge 等 WAF 常用）
        lower.some((a) => {
          if (!a.startsWith('max-age=')) return false
          const sec = Number.parseFloat(a.slice(8))
          return Number.isFinite(sec) && sec <= 0
        })
      const pos = list.findIndex((c) => c.name === name)
      if (expired) {
        if (pos >= 0) list.splice(pos, 1)
        continue
      }
      if (pos >= 0) list.splice(pos, 1)
      list.push({ name, value })
    }
    this.store.set(host, list)
    scheduleJarPersist()
  }

  /** Playwright context.cookies() 结果并入 jar */
  absorbFromBrowser(originHost: string, cookies: { name: string; value: string; expires?: number }[]): void {
    const list = this.store.get(originHost) ?? []
    for (const c of cookies) {
      if (!c.name) continue
      const pos = list.findIndex((x) => x.name === c.name)
      if (pos >= 0) list.splice(pos, 1)
      if (c.expires && c.expires > 0 && c.expires * 1000 < Date.now()) continue
      list.push({ name: c.name, value: c.value, expires: c.expires })
    }
    this.store.set(originHost, list)
    scheduleJarPersist()
  }

  /** 取指定 URL 的 Cookie 请求头 */
  header(url: string): string {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      return ''
    }
    // 允许父子域共享（.kelexs.com 场景）：精确 host + 点边界域后缀。
    // 必须带点边界，否则 kelexs.com 的 cookie 会泄漏给 notkelexs.com 等无关域
    const matched: { key: string; cookies: JarCookie[] }[] = []
    for (const [key, cookies] of this.store) {
      const base = key.replace(/^\./, '')
      if (host === base || host.endsWith('.' + base)) matched.push({ key, cookies })
    }
    if (!matched.length) return ''
    // 同名 cookie 去重（更具体的子域键覆盖父域键），已过期的不再下发
    const byName = new Map<string, JarCookie>()
    const now = Date.now()
    for (const { key, cookies } of matched.sort((a, b) => a.key.length - b.key.length)) {
      for (const c of cookies) {
        if (c.expires && c.expires > 0 && c.expires * 1000 < now) continue
        byName.set(c.name, c)
      }
    }
    if (!byName.size) return ''
    return [...byName.values()].map((c) => `${c.name}=${c.value}`).join('; ')
  }

  count(): number {
    let n = 0
    for (const cookies of this.store.values()) n += cookies.length
    return n
  }
}

// 状态数据挂 globalThis（跨热重载保留），实例每次新建
interface JarState {
  store: Map<string, JarCookie[]>
}
const JAR_STATE_KEY = '__novelCookieJarState'
const globalForJar = globalThis as unknown as { [JAR_STATE_KEY]?: JarState }
const jarState: JarState = globalForJar[JAR_STATE_KEY] ?? { store: new Map() }
globalForJar[JAR_STATE_KEY] = jarState
export const cookieJar = new CookieJar(jarState.store)

// ------------------------------------------------------------
// Cookie 磁盘持久化：WAF 通行 cookie（VLM 解题成果）跨进程重启保留。
// 通行 cookie 通常有效数小时～数天；不持久化则每次重启都要重新解验证码，
// 这是“稳定长期获取”的关键一环。
// ------------------------------------------------------------
const COOKIE_PERSIST_PATH = path.join(process.cwd(), 'storage', 'waf-cookies.json')
const globalForJarPersist = globalThis as unknown as { __novelJarPersistTimer?: ReturnType<typeof setTimeout> | null }

function scheduleJarPersist(): void {
  if (globalForJarPersist.__novelJarPersistTimer) return
  const timer = setTimeout(() => {
    globalForJarPersist.__novelJarPersistTimer = null
    try {
      const now = Date.now()
      const hosts: Record<string, { name: string; value: string; expires?: number }[]> = {}
      for (const [host, cookies] of jarState.store) {
        const valid = cookies.filter((c) => !c.expires || c.expires <= 0 || c.expires * 1000 > now)
        if (valid.length) hosts[host] = valid
      }
      fs.mkdirSync(path.dirname(COOKIE_PERSIST_PATH), { recursive: true })
      fs.writeFileSync(COOKIE_PERSIST_PATH, JSON.stringify({ savedAt: now, hosts }))
    } catch {
      /* 磁盘写入失败不影响采集主链路 */
    }
  }, 2000)
  timer.unref?.()
  globalForJarPersist.__novelJarPersistTimer = timer
}

function loadPersistedJar(): void {
  try {
    const raw = fs.readFileSync(COOKIE_PERSIST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as {
      savedAt?: number
      hosts?: Record<string, { name: string; value: string; expires?: number }[]>
    }
    // 超过 7 天的存档整体放弃（陈旧通行 cookie 是脏数据）
    if (!parsed?.hosts || (parsed.savedAt && Date.now() - parsed.savedAt > 7 * 86_400_000)) return
    const now = Date.now()
    for (const [host, cookies] of Object.entries(parsed.hosts)) {
      if (!Array.isArray(cookies)) continue
      const valid = cookies.filter((c) => c?.name && (!c.expires || c.expires <= 0 || c.expires * 1000 > now))
      if (valid.length) jarState.store.set(host, valid)
    }
  } catch {
    /* 文件不存在/损坏：空 jar 启动 */
  }
}
loadPersistedJar()

// ============================================================
// 全局同域节流器：无论任务线程数如何，同一域名的请求间隔不小于最小值，
// 从源头避免高频请求触发目标站 WAF（反反爬核心基础设施）
// ============================================================

// 状态数据挂 globalThis（跨热重载保留），类实例每次模块加载新建（类代码始终最新）——
// 从根上避免 dev 热重载后旧实例缺少新方法的问题
interface ThrottleState {
  queues: Map<string, Promise<void>>
  blockedUntil: Map<string, number>
}
const THROTTLE_STATE_KEY = '__novelThrottleState'
const globalForThrottle = globalThis as unknown as { [THROTTLE_STATE_KEY]?: ThrottleState }
const throttleState: ThrottleState =
  globalForThrottle[THROTTLE_STATE_KEY] ?? { queues: new Map(), blockedUntil: new Map() }
globalForThrottle[THROTTLE_STATE_KEY] = throttleState

class DomainThrottle {
  private queues = throttleState.queues
  private blockedUntil = throttleState.blockedUntil

  /**
   * 同域串行化：每个请求至少间隔 minGapMs。
   * 若该域处于封禁冷却期（reportBlock），自动等待冷却结束后再入队。
   */
  async wait(url: string, customGap?: number): Promise<void> {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      return
    }
    // 封禁冷却期：等待解除后继续（避免在封禁期继续请求加剧封禁）
    const blockedUntil = this.blockedUntil.get(host) ?? 0
    const now = Date.now()
    if (now < blockedUntil) {
      await sleep(blockedUntil - now + 200)
      this.blockedUntil.delete(host)
    }
    const gap = Math.max(0, customGap ?? 1200)
    if (gap <= 0) return
    const prev = this.queues.get(host) ?? Promise.resolve()
    const next = prev.then(
      () => new Promise<void>((r) => setTimeout(r, gap)),
      () => new Promise<void>((r) => setTimeout(r, gap))
    )
    this.queues.set(host, next)
    await next
  }

  /** 目标站封禁（硬 403）：设置同域全局冷却期 */
  reportBlock(url: string, ms = 180_000): void {
    try {
      const host = new URL(url).hostname
      const until = Date.now() + ms + Math.random() * 60_000
      const prev = this.blockedUntil.get(host) ?? 0
      if (until > prev) this.blockedUntil.set(host, until)
    } catch {
      /* ignore */
    }
  }
}

export const domainThrottle = new DomainThrottle()

// ============================================================
// WAF 挑战页识别
// ============================================================

const WAF_SIGNATURES = [
  /WAF\/VERIFY\/CAPTCHA/i,
  /GOEDGE_WAF_CAPTCHA/i,
  /ui-captcha-image/i,
  /captcha-form/i,
  /verify yourself/i,
  // Cloudflare 挑战页（headless 无法通过，但至少给出明确的 WAF 报错而非静默解析为空）
  /<title>[^<]*just a moment[^<]*<\/title>/i,
  /challenges\.cloudflare\.com\//i,
]

/** 判断 HTML 是否为 WAF/验证码挑战页或硬拒绝页（403 黑名单） */
export function isWafChallengeHtml(html: string): boolean {
  if (isHardDeniedHtml(html)) return true
  if (!html || html.length > 20000) {
    // 验证页很小；超长页面再做签名兜底检查（避免正文误判）
    return WAF_SIGNATURES.slice(0, 2).some((re) => re.test(html))
  }
  return WAF_SIGNATURES.some((re) => re.test(html))
}

/** 硬 403/封禁页（IP 黑名单，需向调用方明确报告而非静默解析为空） */
export function isHardDeniedHtml(html: string): boolean {
  if (!html || html.length > 4000) return false
  return /<title>\s*403\s*Forbidden\s*<\/title>/i.test(html) || /\b403 Forbidden\b/.test(html)
}

// ============================================================
// 编码识别与解码
// ============================================================

function detectCharset(buffer: Buffer, contentType: string, fallback: string): string {
  const explicit = fallback !== 'auto' ? fallback : ''
  if (explicit) return explicit
  const ctMatch = /charset=["']?([\w-]+)/i.exec(contentType)
  if (ctMatch) return ctMatch[1].toLowerCase()
  const head = buffer.subarray(0, 4096).toString('latin1')
  const meta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ?? /charset=["']([\w-]+)/i.exec(head)
  if (meta) return meta[1].toLowerCase()
  return 'utf-8'
}

function decodeBuffer(buffer: Buffer, charset: string): string {
  const cs = charset.toLowerCase()
  if (cs === 'utf-8' || cs === 'utf8' || cs === 'ascii') {
    return new TextDecoder('utf-8').decode(buffer)
  }
  // 动态加载 iconv-lite 以处理 gbk/gb2312/big5
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const iconv = require('iconv-lite') as {
      decode: (b: Buffer, enc: string) => string
      encodingExists: (enc: string) => boolean
    }
    if (iconv.encodingExists(cs === 'gb2312' ? 'gbk' : cs)) {
      return iconv.decode(buffer, cs === 'gb2312' ? 'gbk' : cs)
    }
  } catch {
    /* fallthrough */
  }
  return new TextDecoder('utf-8').decode(buffer)
}

// ============================================================
// 请求头构建：UA + Client Hints + Sec-Fetch 指纹
// ============================================================

/** 合并两组 cookie 串：override 中同名键优先，base 中独有键保留（jar 通行 cookie 与显式 cookie 合并） */
function mergeCookieStrings(base: string, override: string): string {
  const parse = (s: string): [string, string][] =>
    s
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf('=')
        return idx <= 0 ? null : ([c.slice(0, idx).trim(), c.slice(idx + 1).trim()] as [string, string])
      })
      .filter((p): p is [string, string] => p !== null)
  const map = new Map(parse(base))
  for (const [k, v] of parse(override)) map.set(k, v)
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

/**
 * UA 轮换时同步重建 Client Hints 指纹。
 * 只换 User-Agent 而保留旧 UA 的 sec-ch-ua 会造成自相矛盾的浏览器指纹（Firefox UA + Chrome Hints），
 * 反而是比固定 UA 更显眼的爬虫特征。
 */
function rotateFingerprint(headers: Record<string, string>): Record<string, string> {
  const ua = randomUA()
  const out: Record<string, string> = { ...headers, 'User-Agent': ua }
  const chromeVer = chromeMajorVersion(ua)
  if (chromeVer) {
    out['sec-ch-ua'] = `"Chromium";v="${chromeVer}", "Google Chrome";v="${chromeVer}", "Not-A.Brand";v="99"`
    out['sec-ch-ua-mobile'] = /Mobile|Android|iPhone/.test(ua) ? '?1' : '?0'
    out['sec-ch-ua-platform'] = /Windows/i.test(ua)
      ? '"Windows"'
      : /Macintosh/i.test(ua)
        ? '"macOS"'
        : /Android/i.test(ua)
          ? '"Android"'
          : /iPhone|iPad/i.test(ua)
            ? '"iOS"'
            : '"Linux"'
  } else {
    delete out['sec-ch-ua']
    delete out['sec-ch-ua-mobile']
    delete out['sec-ch-ua-platform']
  }
  return out
}

function buildHeaders(cfg: FetchConfig, url: string, uaOverride?: string): Record<string, string> {
  const ua = uaOverride ?? (cfg.rotateUA === false ? FIXED_UA : randomUA())
  const headers: Record<string, string> = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
  }
  // Chrome 系 UA 注入配套 Client Hints（真实浏览器指纹）
  const chromeVer = chromeMajorVersion(ua)
  if (chromeVer) {
    headers['sec-ch-ua'] = `"Chromium";v="${chromeVer}", "Google Chrome";v="${chromeVer}", "Not-A.Brand";v="99"`
    headers['sec-ch-ua-mobile'] = /Mobile|Android|iPhone/.test(ua) ? '?1' : '?0'
    headers['sec-ch-ua-platform'] = /Windows/i.test(ua)
      ? '"Windows"'
      : /Macintosh/i.test(ua)
        ? '"macOS"'
        : /Android/i.test(ua)
          ? '"Android"'
          : /iPhone|iPad/i.test(ua)
            ? '"iOS"'
            : '"Linux"'
  }
  if (cfg.referer) headers.Referer = cfg.referer
  else {
    // 默认 Referer 指纹：真实浏览器站内跳转必带同源 Referer，裸无 Referer 是明显爬虫特征
    try {
      headers.Referer = `${new URL(url).origin}/`
    } catch {
      /* 非法 URL 已在入口拦 */
    }
  }
  // Sec-Fetch 导航指纹（现代浏览器导航请求必带，缺失同样是爬虫特征）；
  // Sec-Fetch-Site 与 Referer 的同源/跨源关系保持一致，避免自相矛盾
  {
    let refHost = ''
    try {
      refHost = new URL(headers.Referer).hostname
    } catch {
      /* Referer 缺失时按跨源处理 */
    }
    try {
      headers['Sec-Fetch-Dest'] = 'document'
      headers['Sec-Fetch-Mode'] = 'navigate'
      headers['Sec-Fetch-Site'] = refHost && refHost === new URL(url).hostname ? 'same-origin' : 'cross-site'
      headers['Sec-Fetch-User'] = '?1'
    } catch {
      /* 非法 URL 已在入口拦 */
    }
  }
  // 显式 cookies 与 jar 会话 cookie 合并：jar 同名键优先。
  // WAF 通行 cookie 与 UA/会话绑定且会滚动更新，规则里保存的只是注册时刻的旧快照——
  // 长期稳定采集必须让解题后新入 jar 的通行 cookie 覆盖旧快照，否则每次都要重新解题
  {
    const jarCookie = cookieJar.header(url)
    if (cfg.cookies && jarCookie) headers.Cookie = mergeCookieStrings(cfg.cookies, jarCookie)
    else if (cfg.cookies) headers.Cookie = cfg.cookies
    else if (jarCookie) headers.Cookie = jarCookie
  }
  if (cfg.headers) {
    // 兼容 UI 保存的 JSON 字符串形式（对象按原样合并，字符串则解析后再合并）
    let extra = cfg.headers as unknown
    if (typeof extra === 'string') {
      try {
        extra = JSON.parse(extra)
      } catch {
        extra = null
      }
    }
    // 数组按索引展开会污染请求头（'0'/'1' 等非法头名），仅接受普通对象
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) Object.assign(headers, extra)
  }
  return headers
}

/** 主入口：按策略抓取页面 */
export async function fetchPage(url: string, cfg: FetchConfig = {}): Promise<FetchResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`非法 URL：${url}`)
  // 镜像加速：主域名近期网络不可达时直接改写到可用镜像（域名轮换是小说站常态）
  const mirrored = rerouteToMirror(url)
  try {
    return await fetchPageInner(mirrored.url, cfg)
  } catch (e) {
    if (!mirrored.swapped && isNetworkUnreachableError(e) && cfg.mirrorUrls?.length) {
      let lastErr: unknown = e
      for (const mirror of cfg.mirrorUrls) {
        const alt = swapOrigin(url, mirror)
        if (!alt || alt === mirrored.url) continue
        try {
          const r = await fetchPageInner(alt, cfg)
          // 记忆可用镜像：后续请求跳过已死主域，直至冷却期结束复检
          markMirrorAlive(url, alt)
          return r
        } catch (err) {
          lastErr = err
        }
      }
      throw lastErr instanceof Error ? lastErr : e
    }
    throw e
  }
}

// ============================================================
// 镜像域名轮换：主域网络级不可达（DNS 解析失败/连接拒绝/超时）时自动切换镜像源。
// 状态挂 globalThis：originalHost → { mirrorOrigin, deadUntil }
// ============================================================
interface MirrorState {
  active: Map<string, { mirrorOrigin: string; deadUntil: number }>
}
const MIRROR_STATE_KEY = '__novelMirrorState'
const globalForMirror = globalThis as unknown as { [MIRROR_STATE_KEY]?: MirrorState }
const mirrorState: MirrorState = globalForMirror[MIRROR_STATE_KEY] ?? { active: new Map() }
globalForMirror[MIRROR_STATE_KEY] = mirrorState

/** 主域死亡冷却期（期间请求直接走镜像，到期后复检主域） */
const MIRROR_DEAD_MS = 10 * 60_000

function rerouteToMirror(url: string): { url: string; swapped: boolean } {
  try {
    const u = new URL(url)
    const rec = mirrorState.active.get(u.hostname)
    if (!rec) return { url, swapped: false }
    if (Date.now() < rec.deadUntil) {
      const alt = swapOrigin(url, rec.mirrorOrigin)
      if (alt && alt !== url) return { url: alt, swapped: true }
    } else {
      mirrorState.active.delete(u.hostname)
    }
  } catch {
    /* ignore */
  }
  return { url, swapped: false }
}

function markMirrorAlive(originalUrl: string, mirrorUrl: string): void {
  try {
    const orig = new URL(originalUrl)
    const mir = new URL(mirrorUrl)
    if (orig.hostname === mir.hostname) return
    mirrorState.active.set(orig.hostname, { mirrorOrigin: mir.origin, deadUntil: Date.now() + MIRROR_DEAD_MS })
  } catch {
    /* ignore */
  }
}

/** 识别网络层不可达错误（区别于 WAF/HTTP 状态错误——后者换域名无意义） */
export function isNetworkUnreachableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return (
    /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i.test(msg) ||
    /ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_(REFUSED|RESET|TIMED_OUT)|ERR_NAME_NOT_RESOLVED|ERR_NETWORK/i.test(msg) ||
    /请求失败.*(timed?\s*out|abort|socket|terminated|unreachable)/i.test(msg) ||
    /(operation was aborted|operation timed out|network error|connection (closed|terminated|error))/i.test(msg)
  )
}

/** 保留路径与查询，替换协议+域名（mirror 传 origin 或完整 URL 均可） */
export function swapOrigin(url: string, mirror: string): string | null {
  try {
    const u = new URL(url)
    const m = new URL(mirror)
    u.protocol = m.protocol
    u.hostname = m.hostname
    u.port = m.port
    return u.href
  } catch {
    return null
  }
}

async function fetchPageInner(url: string, cfg: FetchConfig): Promise<FetchResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`非法 URL：${url}`)
  const strategy = cfg.strategy ?? 'http'
  const timeout = cfg.timeout ?? 20000
  const started = Date.now()

  if (strategy === 'playwright') return fetchWithPlaywright(url, cfg, timeout, started)
  if (strategy === 'hyperbrowser') return fetchWithHyperbrowser(url, cfg, timeout, started)

  // HTTP 直连策略（遇 WAF 自动升级浏览器渲染；同域全局节流）
  await domainThrottle.wait(url, cfg.throttleGap)
  let html = ''
  let status = 0
  let finalUrl = url
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchWithRetry(url, buildHeaders(cfg, url), timeout, 2, cfg.rotateUA === false)
    const buffer = Buffer.from(await res.arrayBuffer())
    cookieJar.absorbFromFetch(new URL(res.url || url).hostname, res.headers)
    const charset = detectCharset(buffer, res.headers.get('content-type') ?? '', cfg.encoding ?? 'auto')
    html = decodeBuffer(buffer, charset)
    status = res.status
    finalUrl = res.url || url
    if (isHardDeniedHtml(html)) {
      // IP 已被目标站拉黑（硬 403）：全局冷却后向调用方明确报告
      domainThrottle.reportBlock(finalUrl, 180_000)
      throw new Error(`目标站拒绝访问（IP 临时封禁，HTTP 403）：${finalUrl}。已自动冷却 3 分钟`)
    }
    if (!isWafChallengeHtml(html)) {
      return { html, status, finalUrl, strategy: 'http', elapsedMs: Date.now() - started }
    }
    // WAF 拦截：升级为 Playwright（带验证码求解），仅尝试一次
    try {
      const pwResult = await fetchWithPlaywright(url, cfg, timeout, started)
      return { ...pwResult, elapsedMs: Date.now() - started }
    } catch (e) {
      if (attempt === 1) {
        throw new Error(
          `WAF 拦截且浏览器策略不可用：${e instanceof Error ? e.message : String(e)}（请安装 Playwright：bun add playwright && bunx playwright install chromium）`
        )
      }
      // 浏览器策略失败后稍候再试一轮 HTTP：此时 jar 里可能已有解题通行 cookie，直连即可通过
      await sleep(1500)
    }
  }
  return { html, status, finalUrl, strategy: 'http', elapsedMs: Date.now() - started, wafChallenged: true }
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  timeout: number,
  retries = 2,
  keepUA = false
): Promise<Response> {
  let lastErr: unknown = null
  for (let i = 0; i <= retries; i++) {
    try {
      // 每次重试轮换 UA（模拟多用户）；keepUA=true 时固定 UA（WAF 通行 cookie 与 UA 绑定，换 UA 即失效）
      const res = await fetch(url, {
        headers: i === 0 || keepUA ? headers : rotateFingerprint(headers),
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        cache: 'no-store',
      })
      if (!res.ok) {
        // 403（WAF 拒绝）：重试只会加剧封禁，直接抛出
        if (res.status === 403) {
          const body = await res.text().catch(() => '')
          if (isHardDeniedHtml(body)) {
            domainThrottle.reportBlock(url, 180_000)
            throw new Error(`目标站拒绝访问（IP 临时封禁，HTTP 403）：${url}。已自动冷却 3 分钟`)
          }
          if (isWafChallengeHtml(body)) {
            // 挑战页常以 403 状态下发：body 原样交回调用方，由 isWafChallengeHtml
            // 识别并升级浏览器策略（直接 break 会绕过整条 WAF 升级链路）
            const h = new Headers(res.headers)
            h.delete('content-encoding')
            h.delete('content-length')
            return new Response(body, { status: 403, headers: h })
          }
          lastErr = new Error(`HTTP 403`)
          break
        }
        if (i < retries) {
          // 429/5xx：更长退避（尊重 Retry-After 头）+ 轮换 UA
          lastErr = new Error(`HTTP ${res.status}`)
          await res.body?.cancel().catch(() => undefined) // 释放未读 body，归还连接
          let backoff = res.status === 429 ? 1500 + Math.random() * 2000 : 600 + Math.random() * 800
          const ra = Number.parseFloat(res.headers.get('retry-after') ?? '')
          if (Number.isFinite(ra) && ra >= 0) backoff = Math.min(ra * 1000 + 250, 30_000)
          await sleep(backoff)
          continue
        }
        // 最后一次重试仍非 2xx：不再把错误页 body 当解析对象（避免 5xx 错误页文本混入正文）
        await res.body?.cancel().catch(() => undefined)
        throw new Error(`HTTP ${res.status}（${url.slice(0, 120)}）`)
      }
      return res
    } catch (e) {
      if (e instanceof Error && e.message.includes('IP 临时封禁')) throw e
      lastErr = e
      if (i < retries) await sleep(600 + Math.random() * 800)
    }
  }
  throw new Error(`请求失败: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

// ============================================================
// Playwright 策略：stealth 注入 + Cookie 会话 + WAF 验证码求解
// ============================================================

/** 浏览器指纹伪装脚本（每个页面加载前注入） */
const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
  Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
  // WebGL 指纹：真实显卡厂商/型号（默认 SwiftShader 是 headless 的显著特征）
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, param);
    };
    if (window.WebGL2RenderingContext) {
      const p2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return p2.call(this, param);
      };
    }
  } catch (e) {}
  const origQuery = window.navigator.permissions && window.navigator.permissions.query;
  if (origQuery) {
    window.navigator.permissions.query = (p) =>
      p && p.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : origQuery(p);
  }
`

// 浏览器进程级单例：持久会话 + 稳定 TLS 指纹，WAF 视为同一真实用户会话（反反爬核心）
const BROWSER_STATE_KEY = '__novelPwBrowser'
interface BrowserState {
  browser: PlaywrightBrowser | null
  starting: Promise<PlaywrightBrowser> | null
}
const globalForBrowser = globalThis as unknown as { [BROWSER_STATE_KEY]?: BrowserState }
const browserState: BrowserState = globalForBrowser[BROWSER_STATE_KEY] ?? { browser: null, starting: null }
globalForBrowser[BROWSER_STATE_KEY] = browserState

async function getSharedBrowser(): Promise<PlaywrightBrowser | null> {
  const pwSpec = 'playwright'
  const pw = (await import(/* webpackIgnore: true */ pwSpec).catch(() => null)) as {
    chromium: { launch: (o: Record<string, unknown>) => Promise<PlaywrightBrowser> }
  } | null
  if (!pw) return null
  // 复用存活实例
  const existing = browserState.browser
  if (existing && typeof existing.isConnected === 'function' && existing.isConnected()) return existing
  // 并发去重：共享同一个启动 Promise
  if (!browserState.starting) {
    browserState.starting = pw.chromium
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-infobars',
          '--window-size=1366,850',
        ],
      })
      .then((b) => {
        browserState.browser = b
        return b
      })
      .finally(() => {
        browserState.starting = null
      })
  }
  return browserState.starting
}

async function fetchWithPlaywright(url: string, cfg: FetchConfig, timeout: number, started: number): Promise<FetchResult> {
  await domainThrottle.wait(url, cfg.throttleGap)
  const browser = await getSharedBrowser()
  if (!browser) {
    throw new Error('Playwright 未安装：请在服务器执行 `bun add playwright && bunx playwright install chromium` 后使用 js 渲染策略')
  }
  const headers = buildHeaders(cfg, url)
  const jarCookie = cookieJar.header(url)
  // Cookie 单独经 addCookies 注入（context 级会话），避免 extraHTTPHeaders 里的静态 Cookie 头
  // 与浏览器 cookie 罐重复发送同名字段造成 WAF 判定异常
  const { Cookie: _cookieHeader, ...extraHeaders } = headers
  const context = await browser.newContext({
    userAgent: headers['User-Agent'],
    viewport: { width: 1366, height: 850 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    extraHTTPHeaders: extraHeaders,
  })
  // try 覆盖 newContext 之后的全部步骤：addInitScript/addCookies 抛错时
  // context 也必须关闭，否则浏览器 context（含页面进程）泄漏
  try {
    await context.addInitScript(STEALTH_SCRIPT)

    // 显式 cookies + jar 会话 cookies 一并注入
    const jarCookies: { name: string; value: string; domain?: string }[] = jarCookie
      ? jarCookie.split(';').map((c) => {
          const idx = c.indexOf('=')
          return { name: c.slice(0, idx).trim(), value: c.slice(idx + 1).trim() }
        })
      : []
    const explicitCookies = (cfg.cookies ?? '')
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const idx = c.indexOf('=')
        if (idx <= 0) return null
        const u = new URL(url)
        return { name: c.slice(0, idx).trim(), value: c.slice(idx + 1).trim(), domain: u.hostname, path: '/' }
      })
      .filter((c): c is { name: string; value: string; domain: string; path: string } => c !== null)
    const allCookies = [...explicitCookies, ...jarCookies].map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain ?? new URL(url).hostname,
      path: '/',
    }))
    if (allCookies.length) await context.addCookies(allCookies)

    const page = await context.newPage()
    // goto 带一次重试（沙箱/网络偶发 ERR_ADDRESS_UNREACHABLE）
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION|net::ERR/i.test(msg)) throw e
      await page.waitForTimeout(2500)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    }
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined)
    await page.waitForTimeout(800)

    let html = await page.content()
    let finalUrl = page.url()

    // WAF 挑战页 → 自动求解验证码
    if (isWafChallengeHtml(html) && !isHardDeniedHtml(html)) {
      const solved = await solveWafChallenge(page)
      if (solved) {
        await page.waitForTimeout(600)
        html = await page.content()
        finalUrl = page.url()
      }
    }

    // 硬 403（IP 黑名单）：全局冷却后明确抛错，避免静默返回空解析结果
    if (isHardDeniedHtml(html)) {
      domainThrottle.reportBlock(url, 180_000)
      throw new Error(`目标站拒绝浏览器访问（IP 临时封禁，HTTP 403）：${url}。已自动冷却 3 分钟`)
    }

    // JS 渲染翻页交互：逐项点击分页控件并拼接快照（参数加密/URL 不变站点）
    if (cfg.jsPages?.enabled && cfg.jsPages.itemsSelector && !isWafChallengeHtml(html)) {
      html = await collectJsPages(page, html, cfg.jsPages)
    }

    // 会话 cookie 回写 jar（WAF 通过后的通行 cookie 全局复用）
    try {
      const cookies = await context.cookies()
      cookieJar.absorbFromBrowser(new URL(url).hostname, cookies)
    } catch {
      /* ignore */
    }

    return {
      html,
      status: isWafChallengeHtml(html) ? 403 : 200,
      finalUrl,
      strategy: 'playwright',
      elapsedMs: Date.now() - started,
      wafChallenged: isWafChallengeHtml(html),
    }
  } finally {
    // 仅关闭 context（页面级），共享 browser 单例保持存活以复用会话
    await context.close().catch(() => undefined)
  }
}

/**
 * JS 渲染翻页交互：逐项点击分页控件（下拉/按钮）并拼接每页快照。
 * 适用于分页参数加密、点击后 URL 不变的站点；拼接结果用 <!--JSPAGE--> 分隔，
 * 解析器（css/regex/xpath）对拼接后的 HTML 透明。
 * 点击均用短超时（3s）且单页失败跳过，避免不可见元素 30s 重试导致整体挂起。
 */
async function collectJsPages(
  page: PlaywrightPage,
  firstPageHtml: string,
  js: NonNullable<FetchConfig['jsPages']>
): Promise<string> {
  const snapshots: string[] = [firstPageHtml]
  const CLICK_TIMEOUT = 3000
  try {
    const wait = js.waitAfterClick ?? 1200
    const max = Math.min(js.maxPages ?? 30, 40)
    const startIdx = js.skipFirst ? 1 : 0
    for (let i = startIdx; snapshots.length < max; i++) {
      // 下拉类控件需先展开再选目标项：展开会重建列表 DOM，
      // 因此 items 必须在展开之后（重）查询——先查后展开拿到的是 stale element
      const trigger = js.triggerSelector ? await page.$(js.triggerSelector) : null
      if (trigger) {
        await trigger.click({ timeout: 1500, force: true }).catch(() => undefined)
        await page.waitForTimeout(200)
      }
      // 每轮重新查询分页项：点击翻页后 DOM 常被重建，
      // 跨轮持有的 ElementHandle 会失效（stale element）导致后续翻页静默失败
      const items = await page.$$(js.itemsSelector)
      if (i >= items.length) break
      try {
        await items[i].click({ timeout: CLICK_TIMEOUT, force: true })
        await page.waitForTimeout(wait)
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined)
        snapshots.push(await page.content())
      } catch {
        // 单页点击失败跳过
      }
    }
  } catch {
    // 分页控件不存在 → 仅返回首屏
  }
  return snapshots.length > 1 ? snapshots.join('<!--JSPAGE-->') : firstPageHtml
}

/** VLM 识别验证码图片，返回识别出的字符 */
async function recognizeCaptcha(pngBuffer: Buffer): Promise<string> {
  const spec = 'z-ai-web-dev-sdk'
  const mod = (await import(/* webpackIgnore: true */ spec).catch(() => null)) as {
    default: {
      create: () => Promise<{
        chat: {
          completions: {
            createVision: (req: Record<string, unknown>) => Promise<{
              choices?: { message?: { content?: string } }[]
            }>
          }
        }
      }>
    }
  } | null
  if (!mod) throw new Error('z-ai-web-dev-sdk 不可用，无法自动识别验证码')
  const zai = await mod.default.create()
  const base64 = pngBuffer.toString('base64')
  // VLM 调用带 25s 超时保护，避免网络异常时请求挂起
  const response = await Promise.race([
    zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '图片中是一个网站验证码。请准确识别其中的全部字符（可能包含数字与英文字母，注意区分大小写与易混字符如 0/O、1/l/I、6/b、8/B）。只输出识别出的验证码字符本身，不要任何解释、标点或空格。',
            },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
          ],
        },
      ],
      thinking: { type: 'disabled' },
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('VLM 验证码识别超时')), 25000)),
  ])
  const content = response.choices?.[0]?.message?.content ?? ''
  return content.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
}

/**
 * GoEdge WAF（及同构验证码页）自动求解：
 * 截图验证码 → VLM 识别 → 填表提交 → 校验是否通过（最多 4 次刷新重试）
 */
async function solveWafChallenge(page: PlaywrightPage): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const img = await page.$('#ui-captcha-image')
      if (!img) return !isWafChallengeHtml(await page.content())
      const shot = await img.screenshot({ encoding: 'base64' })
      const base64 = typeof shot === 'string' ? shot : Buffer.from(shot).toString('base64')
      if (!base64) continue
      const code = await recognizeCaptcha(Buffer.from(base64, 'base64'))
      if (!code || code.length < 3) continue
      const input = await page.$('#GOEDGE_WAF_CAPTCHA_CODE')
      const submit = await page.$('#captcha-form button')
      if (!input || !submit) return !isWafChallengeHtml(await page.content())
      await input.fill(code)
      await submit.click()
      // 等待跳转/刷新（WAF 通过后会 302 回原页面）
      await page.waitForLoadState('domcontentloaded', { timeout: 12000 }).catch(() => undefined)
      await page.waitForTimeout(1500)
      const html = await page.content()
      if (!isWafChallengeHtml(html)) return true
    } catch {
      // 下一轮刷新重试
    }
    // 刷新验证码后重试
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => undefined)
    await page.waitForTimeout(800)
  }
  return false
}

// ============================================================
// 类型别名（Playwright 最小接口面）
// ============================================================

interface PlaywrightElement {
  screenshot: (opts?: Record<string, unknown>) => Promise<string | Buffer>
  fill: (v: string) => Promise<void>
  click: (opts?: Record<string, unknown>) => Promise<void>
}
interface PlaywrightPage {
  goto: (url: string, o: Record<string, unknown>) => Promise<unknown>
  waitForLoadState: (state: string, o?: Record<string, unknown>) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
  content: () => Promise<string>
  url: () => string
  reload: (o?: Record<string, unknown>) => Promise<unknown>
  $: (sel: string) => Promise<PlaywrightElement | null>
  $$: (sel: string) => Promise<PlaywrightElement[]>
}
interface PlaywrightContext {
  addCookies: (cookies: unknown[]) => Promise<void>
  addInitScript: (script: string) => Promise<void>
  cookies: () => Promise<{ name: string; value: string; expires?: number }[]>
  newPage: () => Promise<PlaywrightPage>
  close: () => Promise<void>
}
interface PlaywrightBrowser {
  newContext: (o: Record<string, unknown>) => Promise<PlaywrightContext>
  isConnected?: () => boolean
  close: () => Promise<void>
}

// ============================================================
// Hyperbrowser 云端隐身策略
// ============================================================

interface HyperbrowserModule {
  Hyperbrowser: new (options: { apiKey: string }) => {
    scrape: {
      startAndWait: (options: Record<string, unknown>) => Promise<{
        data?: { html?: string; finalUrl?: string }
      }>
    }
  }
}

async function fetchWithHyperbrowser(url: string, cfg: FetchConfig, timeout: number, started: number): Promise<FetchResult> {
  // 与 http/playwright 策略一致的同域节流：云端渲染请求同样受全局限频约束
  await domainThrottle.wait(url, cfg.throttleGap)
  const spec = '@hyperbrowser/sdk'
  const mod = (await import(/* webpackIgnore: true */ spec).catch(() => null)) as HyperbrowserModule | null
  if (!mod) {
    throw new Error('Hyperbrowser SDK 未安装：请执行 `bun add @hyperbrowser/sdk` 后使用')
  }
  const apiKey = process.env.HYPERBROWSER_API_KEY
  if (!apiKey) throw new Error('未配置 HYPERBROWSER_API_KEY 环境变量，无法使用 Hyperbrowser 策略')
  const client = new mod.Hyperbrowser({ apiKey })
  const result = await client.scrape.startAndWait({
    url,
    useStealth: true,
    timeout,
    sessionOptions: {
      acceptCookies: true,
    },
  })
  const html = result.data?.html ?? ''
  return {
    html,
    status: html ? 200 : 502,
    finalUrl: result.data?.finalUrl ?? url,
    strategy: 'hyperbrowser',
    elapsedMs: Date.now() - started,
  }
}

// ============================================================
// 图片抓取（封面下载）：带会话 cookie + Referer 伪装
// ============================================================

export async function fetchImage(url: string, referer?: string, timeout = 20000, ua?: string, cookies?: string): Promise<Buffer> {
  await domainThrottle.wait(url)
  const headers: Record<string, string> = {
    'User-Agent': ua ?? randomUA(),
    Referer: referer || new URL(url).origin,
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }
  // 显式 cookies 与 jar 会话 cookie 合并（jar 同名优先，与 fetchPage 语义一致）
  const jarCookie = cookieJar.header(url)
  const mergedCookie = cookies && jarCookie ? mergeCookieStrings(cookies, jarCookie) : cookies || jarCookie
  if (mergedCookie) headers.Cookie = mergedCookie
  const res = await fetchWithRetry(url, headers, timeout, 1, Boolean(ua))
  const buf = Buffer.from(await res.arrayBuffer())
  if (!res.ok || buf.length === 0) {
    throw new Error(`图片下载失败：HTTP ${res.status}（${url.slice(0, 120)}）`)
  }
  return buf
}
