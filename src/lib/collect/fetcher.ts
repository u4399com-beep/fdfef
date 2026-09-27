import type { FetchConfig } from '../collect-types'

// ============================================================
// 抓取器：多策略（http / playwright / hyperbrowser）
// 反反爬基础层：UA 轮换、Cookie、Referer、随机超时、编码识别
// ============================================================

export const UA_LIST = [
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
}

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

function buildHeaders(cfg: FetchConfig): Record<string, string> {
  const ua = cfg.rotateUA === false ? UA_LIST[0] : randomUA()
  const headers: Record<string, string> = {
    'User-Agent': ua,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.6',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  }
  if (cfg.referer) headers.Referer = cfg.referer
  if (cfg.cookies) headers.Cookie = cfg.cookies
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

  const res = await fetchWithRetry(url, buildHeaders(cfg), timeout)
  const buffer = Buffer.from(await res.arrayBuffer())
  const charset = detectCharset(buffer, res.headers.get('content-type') ?? '', cfg.encoding ?? 'auto')
  const html = decodeBuffer(buffer, charset)
  return {
    html,
    status: res.status,
    finalUrl: res.url || url,
    strategy: 'http',
    elapsedMs: Date.now() - started,
  }
}

async function fetchWithRetry(url: string, headers: Record<string, string>, timeout: number, retries = 1): Promise<Response> {
  let lastErr: unknown = null
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
        cache: 'no-store',
      })
      if (!res.ok && i < retries) {
        lastErr = new Error(`HTTP ${res.status}`)
        await sleep(600 + Math.random() * 800)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (i < retries) await sleep(600 + Math.random() * 800)
    }
  }
  throw new Error(`请求失败: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

/** JS 渲染策略：Playwright（未安装时给出明确指引） */
async function fetchWithPlaywright(url: string, cfg: FetchConfig, timeout: number, started: number): Promise<FetchResult> {
  const pwSpec = 'playwright'
  const pw = (await import(/* webpackIgnore: true */ pwSpec).catch(() => null)) as
    | { chromium: { launch: (o: Record<string, unknown>) => Promise<PlaywrightBrowser> } }
    | null
  if (!pw) {
    throw new Error('Playwright 未安装：请在服务器执行 `bun add playwright && bunx playwright install chromium` 后使用 js 渲染策略')
  }
  const headers = buildHeaders(cfg)
  const { chromium } = pw
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })
  try {
    const context = await browser.newContext({
      userAgent: headers['User-Agent'],
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      extraHTTPHeaders: headers,
    })
    if (cfg.cookies) {
      const cookies = cfg.cookies
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
      if (cookies.length) await context.addCookies(cookies)
    }
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined)
    await page.waitForTimeout(800)
    const html = await page.content()
    const finalUrl = page.url()
    await context.close()
    return { html, status: 200, finalUrl, strategy: 'playwright', elapsedMs: Date.now() - started }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/** 云端隐身策略：Hyperbrowser（需配置 HYPERBROWSER_API_KEY） */
interface PlaywrightContext {
  addCookies: (cookies: unknown[]) => Promise<void>
  newPage: () => Promise<PlaywrightPage>
  close: () => Promise<void>
}
interface PlaywrightPage {
  goto: (url: string, o: Record<string, unknown>) => Promise<unknown>
  waitForLoadState: (state: string, o?: Record<string, unknown>) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
  content: () => Promise<string>
  url: () => string
}
interface PlaywrightBrowser {
  newContext: (o: Record<string, unknown>) => Promise<PlaywrightContext>
  close: () => Promise<void>
}

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
      proxyCountryCode: undefined,
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

/** 带反反爬头抓取图片（封面下载用） */
export async function fetchImage(url: string, referer?: string, timeout = 20000): Promise<Buffer> {
  const res = await fetchWithRetry(
    url,
    { 'User-Agent': randomUA(), Referer: referer || url, Accept: 'image/*,*/*;q=0.8' },
    timeout
  )
  return Buffer.from(await res.arrayBuffer())
}
