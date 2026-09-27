import type { FetchConfig } from '../collect-types'

// ============================================================
// 抓取器：多策略（http / playwright / hyperbrowser）
// 反反爬增强层：
//   1. CookieJar 会话保持（WAF 通过后 cookie 全局复用）
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
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
      const expired = lower.some((a) => a.startsWith('expires=') && new Date(a.slice(8)).getTime() < Date.now())
      const pos = list.findIndex((c) => c.name === name)
      if (expired) {
        if (pos >= 0) list.splice(pos, 1)
        continue
      }
      if (pos >= 0) list.splice(pos, 1)
      list.push({ name, value })
    }
    this.store.set(host, list)
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
  }

  /** 取指定 URL 的 Cookie 请求头 */
  header(url: string): string {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      return ''
    }
    // 允许父子域共享（.kelexs.com 场景）：精确 host + 以点开头的域后缀
    const list: JarCookie[] = []
    for (const [key, cookies] of this.store) {
      if (key === host || host.endsWith(key.replace(/^\./, ''))) list.push(...cookies)
    }
    if (!list.length) return ''
    return list.map((c) => `${c.name}=${c.value}`).join('; ')
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

function buildHeaders(cfg: FetchConfig, url: string, uaOverride?: string): Record<string, string> {
  const ua = uaOverride ?? (cfg.rotateUA === false ? UA_LIST[0] : randomUA())
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
  if (cfg.cookies) headers.Cookie = cfg.cookies
  // 会话 cookie 自动附带（用户显式 cookies 优先）
  if (!cfg.cookies) {
    const jarCookie = cookieJar.header(url)
    if (jarCookie) headers.Cookie = jarCookie
  }
  if (cfg.headers) Object.assign(headers, cfg.headers)
  return headers
}

/** 主入口：按策略抓取页面 */
export async function fetchPage(url: string, cfg: FetchConfig = {}): Promise<FetchResult> {
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
    const res = await fetchWithRetry(url, buildHeaders(cfg, url), timeout)
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
    }
  }
  return { html, status, finalUrl, strategy: 'http', elapsedMs: Date.now() - started, wafChallenged: true }
}

async function fetchWithRetry(url: string, headers: Record<string, string>, timeout: number, retries = 2): Promise<Response> {
  let lastErr: unknown = null
  for (let i = 0; i <= retries; i++) {
    try {
      // 每次重试轮换 UA（模拟多用户）
      const res = await fetch(url, {
        headers: i === 0 ? headers : { ...headers, 'User-Agent': randomUA() },
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
          lastErr = new Error(`HTTP 403`)
          break
        }
        if (i < retries) {
          // 429/5xx：更长退避 + 轮换 UA
          lastErr = new Error(`HTTP ${res.status}`)
          await sleep(res.status === 429 ? 1500 + Math.random() * 2000 : 600 + Math.random() * 800)
          continue
        }
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
  const context = await browser.newContext({
    userAgent: headers['User-Agent'],
    viewport: { width: 1366, height: 850 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    extraHTTPHeaders: headers,
  })
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

  try {
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
    const items = await page.$$(js.itemsSelector)
    const wait = js.waitAfterClick ?? 1200
    const max = Math.min(js.maxPages ?? 30, 40)
    const startIdx = js.skipFirst ? 1 : 0
    let trigger: PlaywrightElement | null = null
    if (js.triggerSelector) {
      trigger = await page.$(js.triggerSelector)
    }
    for (let i = startIdx; i < items.length && snapshots.length < max; i++) {
      try {
        // 下拉类控件需先展开再选目标项
        if (trigger) {
          await trigger.click({ timeout: 1500, force: true }).catch(() => undefined)
          await page.waitForTimeout(200)
        }
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

export async function fetchImage(url: string, referer?: string, timeout = 20000, ua?: string): Promise<Buffer> {
  await domainThrottle.wait(url)
  const headers: Record<string, string> = {
    'User-Agent': ua ?? randomUA(),
    Referer: referer || new URL(url).origin,
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }
  const jarCookie = cookieJar.header(url)
  if (jarCookie) headers.Cookie = jarCookie
  const res = await fetchWithRetry(url, headers, timeout, 1)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!res.ok || buf.length === 0) {
    throw new Error(`图片下载失败：HTTP ${res.status}（${url.slice(0, 120)}）`)
  }
  return buf
}
