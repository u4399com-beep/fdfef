import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { FetchConfig } from '../collect-types'

// ============================================================
// 抓取器：多策略（http / playwright / cloakbrowser / hyperbrowser）
// 反反爬增强层：
//   1. CookieJar 会话保持（WAF 通过后 cookie 全局复用，磁盘持久化跨重启保留）
//   2. UA 轮换 + Client Hints / Sec-Fetch 真实浏览器指纹
//   3. WAF 挑战页自动检测 + 验证码双通道求解：
//      ① 纯 HTTP 无浏览器求解（GoEdge 系：GET 页→解析表单→VLM 识图→POST 表单，
//        服务器无需安装 Playwright/chromium；kelexs 生产实测一次通过）
//      ② Playwright DOM 求解兑底（非 GoEdge 布局或 HTTP 通道失败时自动升级）
//   4. 同主机求解串行锁：并发章节同时遇 WAF 只解一次，通行 cookie 共享
//   5. 验证码图片预处理（放大+二值化去噪）后再交 VLM——识别率关键环节
//   6. HTTP 被 WAF 拦截时自动升级为浏览器渲染
//   7. 编码识别（GBK/GB2312/Big5 经 iconv-lite）
//   8. 浏览器引擎可插拔（BROWSER_ENGINE）：playwright（默认，社区开源）|
//      cloakbrowser（源码级 87 处 C++ 隐身补丁的 Chromium，npm 包同 API，
//      Cloudflare Turnstile/FingerprintJS 实测满分；启动失败自动降级 playwright）
//   9. iv8 补环境求解通道（外部 Python 命令）：JS 计算型 cookie 挑战
//      （瑞数/acw_sc__v2 等混淆 JS 写 cookie 后刷新，无验证码图可识）——
//      页面 HTML 喂给 iv8（V8 内核 C++ 层 BOM/DOM 模拟）跑出通行 cookie 后重放，
//      不需真实浏览器。IV8_ENABLED=1 或 IV8_COMMAND 自定义命令启用
// ============================================================

const UA_LIST = [
  // [0] 固定 UA（rotateUA=false / WAF 通行 cookie 绑定场景），字符串保持不变
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Chromium 版本族（Win/Mac/Linux × 现代版本号，Client Hints 品牌随 UA 严格配套）
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  // Edge：UA 的 Edg/ 版本必须与 sec-ch-ua 的 "Microsoft Edge" 品牌同现（真实 Edge 行为）
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  // 非 Chromium 家族（Safari/Firefox 本就不发送 Client Hints，无需品牌配套）
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
]

/** 从 UA 推断主版本号（生成匹配的 Client Hints） */
function chromeMajorVersion(ua: string): string | null {
  const m = /Chrome\/(\d+)/.exec(ua)
  return m ? m[1] : null
}

/**
 * 从 UA 推导 sec-ch-ua 品牌列表（与 UA 家族严格配套，防指纹自相矛盾）：
 * - Chrome 系 → "Chromium"+"Google Chrome" 同版本号
 * - Edge（UA 含 Edg/EdgA/EdgiOS）→ 以 "Microsoft Edge" 为首品牌（真实 Edge 发送的组合，
 *   此前 UA 报 Edg/ 而 hints 报 "Google Chrome" 是自相矛盾的爬虫特征）
 * - 非 Chromium 家族（Safari/Firefox）→ null（不发送 Client Hints）
 */
export function secChUaBrands(ua: string): string | null {
  const ver = chromeMajorVersion(ua)
  if (!ver) return null
  if (/Edg(e|A|iOS)?\//.test(ua)) {
    return `"Microsoft Edge";v="${ver}", "Chromium";v="${ver}", "Not-A.Brand";v="99"`
  }
  return `"Chromium";v="${ver}", "Google Chrome";v="${ver}", "Not-A.Brand";v="99"`
}

/** 由 sec-ch-ua 品牌推导 UA 对应的移动/平台 hints（仅 Chromium 家族调用） */
function secChUaPlatformHints(ua: string): { mobile: string; platform: string } {
  return {
    mobile: /Mobile|Android|iPhone/.test(ua) ? '?1' : '?0',
    platform: /Windows/i.test(ua)
      ? '"Windows"'
      : /Macintosh/i.test(ua)
        ? '"macOS"'
        : /Android/i.test(ua)
          ? '"Android"'
          : /iPhone|iPad/i.test(ua)
            ? '"iOS"'
            : '"Linux"',
  }
}

/** 两主机是否同站（父子域互认，用于 Cookie 作用域与 Sec-Fetch-Site 推导） */
function sameSiteHost(a: string, b: string): boolean {
  return !!a && !!b && (a === b || a.endsWith('.' + b) || b.endsWith('.' + a))
}

/** 取 URL 主机名（非法 URL 返回空串） */
function urlHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function randomUA(): string {
  return UA_LIST[Math.floor(Math.random() * UA_LIST.length)]
}

/** 固定 UA（rotateUA=false 时全局使用；WAF 通行 cookie 与 UA 绑定的站点必须用同一 UA） */
/** fetchPage 页面响应体上限（字节）：防超大/恶意页面内存放大 */
const MAX_HTML_BYTES = 8 * 1024 * 1024
/** 封面图片下载上限（字节） */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
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
    if (!host) return
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
const globalForJarPersist = globalThis as unknown as {
  __novelJarPersistTimer?: ReturnType<typeof setTimeout> | null
  __novelJarDirty?: boolean
  __novelJarExitHooked?: boolean
  __novelJarSignalHooked?: boolean
}

/**
 * 原子写盘：先写同目录唯一临时文件再 rename。
 * 直接 writeFileSync 目标文件时，进程崩溃/磁盘异常会留下半个 JSON（损坏后只能空 jar 重启，
 * 解题成果全丢）；rename 在同一文件系统上原子生效，读侧永远看到完整旧版或完整新版。
 * 临时文件名含 pid+时间戳：多进程（dev server + 脚本）同时写盘也不会互相覆盖同一个临时文件。
 */
function writeJarFileAtomic(): void {
  const now = Date.now()
  const hosts: Record<string, { name: string; value: string; expires?: number }[]> = {}
  for (const [host, cookies] of jarState.store) {
    const valid = cookies.filter((c) => !c.expires || c.expires <= 0 || c.expires * 1000 > now)
    if (valid.length) hosts[host] = valid
  }
  fs.mkdirSync(path.dirname(COOKIE_PERSIST_PATH), { recursive: true })
  const tmp = `${COOKIE_PERSIST_PATH}.${process.pid}.${now.toString(36)}.tmp`
  let renamed = false
  try {
    fs.writeFileSync(tmp, JSON.stringify({ savedAt: now, hosts }))
    fs.renameSync(tmp, COOKIE_PERSIST_PATH)
    renamed = true
  } finally {
    if (!renamed) {
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* 清理失败无碍：残留 .tmp 不影响读侧 */
      }
    }
  }
}

/** 同步刷盘（仅在确有未落盘变更时写）；磁盘失败不影响采集主链路 */
function flushJarPersistSync(): void {
  if (!globalForJarPersist.__novelJarDirty) return
  globalForJarPersist.__novelJarDirty = false
  try {
    writeJarFileAtomic()
  } catch {
    /* 磁盘写入失败不影响采集主链路 */
  }
}

function scheduleJarPersist(): void {
  globalForJarPersist.__novelJarDirty = true
  if (globalForJarPersist.__novelJarPersistTimer) return
  const timer = setTimeout(() => {
    globalForJarPersist.__novelJarPersistTimer = null
    flushJarPersistSync()
  }, 2000)
  timer.unref?.()
  globalForJarPersist.__novelJarPersistTimer = timer
  // 防抖窗口内进程退出会丢掉未落盘的通行 cookie（下次重启又要重新解验证码）——
  // exit 钩子只能同步操作，writeFileSync 满足；globalThis 守卫防热重载重复注册
  if (!globalForJarPersist.__novelJarExitHooked) {
    globalForJarPersist.__novelJarExitHooked = true
    process.once('exit', flushJarPersistSync)
  }
  // SIGTERM/SIGINT 默认终止不走 'exit' 事件，补信号级刷盘兜底（见 hookSignalFlush 注释）
  hookSignalFlush()
}

// 信号场景兜底：SIGTERM/SIGINT 在无监听者时按默认行为终止，**不触发 'exit' 事件**，
// 防抖窗口内未落盘的通行 cookie 会丢（solve 验证码后立即被运维重启是最伤场景）。
// 接管策略保守：注册前快照 listeners——已有其他监听者（如 Next 的优雅退出，最终会走
// process.exit → 'exit' 钩子）时只刷盘、绝不抢终止权；无监听者时刷盘后向自身重发信号
// 恢复默认终止语义，行为与未挂钩子前完全一致。once 语义：消费后解除挂载并复位标记，
// 允许下次模块加载重新注册（globalThis 守卫防热重载重复挂载）。
const JAR_FLUSH_SIGNALS = ['SIGTERM', 'SIGINT'] as const
function hookSignalFlush(): void {
  if (globalForJarPersist.__novelJarSignalHooked) return
  globalForJarPersist.__novelJarSignalHooked = true
  for (const sig of JAR_FLUSH_SIGNALS) {
    const hadOtherListeners = process.listeners(sig).length > 0
    const handler = (): void => {
      flushJarPersistSync()
      process.removeListener(sig, handler)
      globalForJarPersist.__novelJarSignalHooked = false
      if (!hadOtherListeners) {
        try {
          process.kill(process.pid, sig)
        } catch {
          /* 平台不支持自发信号时忽略：flush 已完成，仅终止语义可能滞后 */
        }
      }
    }
    process.on(sig, handler)
  }
}

function loadPersistedJar(): void {
  try {
    const raw = fs.readFileSync(COOKIE_PERSIST_PATH, 'utf8')
    const parsed = JSON.parse(raw) as {
      savedAt?: number
      hosts?: Record<string, { name: string; value: string; expires?: number }[]>
    }
    // 形状校验：损坏/被手改的存档（hosts 非对象等）直接放弃，而不是把垃圾灌进 jar
    if (!parsed || typeof parsed !== 'object' || !parsed.hosts || typeof parsed.hosts !== 'object' || Array.isArray(parsed.hosts)) return
    // 超过 7 天的存档整体放弃（陈旧通行 cookie 是脏数据）
    if (parsed.savedAt && Date.now() - parsed.savedAt > 7 * 86_400_000) return
    const now = Date.now()
    for (const [host, cookies] of Object.entries(parsed.hosts)) {
      if (!host || !Array.isArray(cookies)) continue
      const valid = cookies.filter(
        (c) =>
          c &&
          typeof c.name === 'string' &&
          typeof c.value === 'string' &&
          (!c.expires || c.expires <= 0 || c.expires * 1000 > now)
      )
      if (valid.length) jarState.store.set(host, valid)
    }
  } catch {
    /* 文件不存在/损坏（截断 JSON 等）：空 jar 启动，下次防抖写盘自愈 */
  }
}

// 仅冷启动（jar 为空）时从磁盘恢复：globalThis 使 jarState 跨热重载存活，
// 热重载时再读盘会用磁盘旧快照覆盖内存中防抖窗口内（<2s）刚吸收的新通行 cookie。
// 进程重启时 store 必为空，磁盘恢复路径不受影响。
if (jarState.store.size === 0) loadPersistedJar()

// ============================================================
// 全局同域节流器：无论任务线程数如何，同一域名的请求间隔不小于最小值，
// 从源头避免高频请求触发目标站 WAF（反反爬核心基础设施）
// ============================================================

// 状态数据挂 globalThis（跨热重载保留），类实例每次模块加载新建（类代码始终最新）——
// 从根上避免 dev 热重载后旧实例缺少新方法的问题
// queues：host → 链尾 Promise<number>，resolve 值 = 该链上最后一次放行请求的时刻
// （老状态热重载后为 Promise<void>，resolve 值 undefined → 等待计算优雅降级为不等待）
interface ThrottleState {
  queues: Map<string, Promise<number>>
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
   * 放行时刻沿链传递（Promise 链值），天然 FIFO 无饥饿；域空闲时首个请求零等待放行。
   */
  async wait(url: string, customGap?: number): Promise<void> {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      return
    }
    // 封禁冷却期：等待解除后继续（避免在封禁期继续请求加剧封禁）。
    // 循环处理「等待期间又收到更长冷却」的情形；reportBlock 只会延长冷却（until 单调递增），
    // 因此仅当存储值仍是等过的那个值时才清除——修复：早先实现无条件 delete，
    // 等待期间新设置的更长冷却会被误删，导致封禁期放行请求加剧封禁
    for (;;) {
      const until = this.blockedUntil.get(host)
      if (!until) break
      const now = Date.now()
      if (now < until) await sleep(until - now + 200)
      if ((this.blockedUntil.get(host) ?? 0) <= until) this.blockedUntil.delete(host)
    }
    const gap = Math.max(0, customGap ?? 1200)
    if (gap <= 0) return
    const prev = this.queues.get(host)
    if (!prev) {
      // 域空闲：首个请求零等待放行（此前实现对新域也空等一整个 gap，白白拖慢冷启动），
      // 仅记录放行时刻供后续请求推算间隔
      this.queues.set(host, Promise.resolve(Date.now()))
      return
    }
    const release = prev.then(
      async (prevFire: number) => {
        const waitMs = prevFire + gap - Date.now()
        if (Number.isFinite(waitMs) && waitMs > 0) await sleep(waitMs)
        return Date.now()
      },
      // 链尾理论上不会 reject，此分支纯防御（取当前时刻继续，保持链不断）
      () => Date.now()
    )
    this.queues.set(host, release)
    await release
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
// 站点级熔断器：同域连续 N 次网络级失败（DNS 解析/连接拒绝/超时）后
// 冷却 M 分钟，期间请求快速失败、不再打站点（避免对已死/正在封禁的站点
// 反复消耗重试预算并加重风控）。冷却结束进入半开状态放行探测请求，
// 成功即复位，失败立即重新熔断。
// 与镜像轮换协同：熔断错误按「网络不可达」分类（见错误文案），
// fetchPage 捕获后自动转试 cfg.mirrorUrls，主域停摆期间采集无缝切镜像。
// 状态挂 globalThis：跨热重载保留（磁盘不持久化，重启即清零，属合理瞬态）。
// ============================================================
interface BreakerEntry {
  fails: number // 当前连续失败计数
  openUntil: number // >0 表示熔断打开，至此时刻
  lastFailAt: number // 上次失败时刻（用于陈旧失败衰减）
}
const BREAKER_STATE_KEY = '__novelCircuitBreakerState'
const CIRCUIT_FAIL_THRESHOLD = 3
const CIRCUIT_COOLDOWN_MS = 120_000
const CIRCUIT_FAIL_DECAY_MS = 10 * 60_000
const CIRCUIT_MAX_ENTRIES = 500
const globalForBreaker = globalThis as unknown as { [BREAKER_STATE_KEY]?: Map<string, BreakerEntry> }
const breakerState: Map<string, BreakerEntry> = globalForBreaker[BREAKER_STATE_KEY] ?? new Map()
globalForBreaker[BREAKER_STATE_KEY] = breakerState

/** 请求前检查：熔断打开且未到冷却期 → 快速失败（错误文案按网络不可达分类，可触发镜像轮换） */
function assertCircuitClosed(url: string): void {
  const host = urlHost(url)
  if (!host) return
  const entry = breakerState.get(host)
  if (!entry || !entry.openUntil) return
  if (Date.now() >= entry.openUntil) return // 半开：放行探测请求
  const remainSec = Math.ceil((entry.openUntil - Date.now()) / 1000)
  throw new Error(
    `请求失败: ${host} 连续 ${entry.fails} 次网络不可达（network unreachable）已熔断，${remainSec}s 后自动半开复检`
  )
}

function recordNetworkFailure(url: string): void {
  const host = urlHost(url)
  if (!host) return
  // 容量保险：长期运行防无限增长（正常远小于该值：每站一条）
  if (breakerState.size >= CIRCUIT_MAX_ENTRIES && !breakerState.has(host)) {
    const now = Date.now()
    for (const [k, rec] of breakerState) if (!rec.openUntil && now - rec.lastFailAt > CIRCUIT_FAIL_DECAY_MS) breakerState.delete(k)
    while (breakerState.size >= CIRCUIT_MAX_ENTRIES) {
      const oldest = breakerState.keys().next().value
      if (oldest === undefined) break
      breakerState.delete(oldest)
    }
  }
  const now = Date.now()
  const entry = breakerState.get(host) ?? { fails: 0, openUntil: 0, lastFailAt: 0 }
  if (entry.openUntil && now >= entry.openUntil) {
    // 半开探测失败：立即重新熔断（不给已死站点再消耗完整 N 次失败预算）
    entry.openUntil = now + CIRCUIT_COOLDOWN_MS + randomInt(0, 30_000)
    entry.lastFailAt = now
    breakerState.set(host, entry)
    return
  }
  // 久远的失败不累计：新故障周期从零开始计数，避免偶发失败永久垫高熔断敏感度
  if (entry.lastFailAt && now - entry.lastFailAt > CIRCUIT_FAIL_DECAY_MS) entry.fails = 0
  entry.fails += 1
  entry.lastFailAt = now
  if (entry.fails >= CIRCUIT_FAIL_THRESHOLD) {
    entry.openUntil = now + CIRCUIT_COOLDOWN_MS + randomInt(0, 30_000)
  }
  breakerState.set(host, entry)
}

function recordNetworkSuccess(url: string): void {
  const host = urlHost(url)
  if (host) breakerState.delete(host)
}

/** 重置熔断状态（管理/测试用；不传 url 清空全部） */
export function resetCircuitBreaker(url?: string): void {
  if (url) {
    const host = urlHost(url)
    if (host) breakerState.delete(host)
    return
  }
  breakerState.clear()
}

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
  // Cloudflare 中文变体挑战页：zh-cn「请稍候…」/ zh-tw「請稍候…」
  /<title>[^<]*(?:请|請)稍候[^<]*<\/title>/,
  /_cf_chl_opt|_cf_chl_rt_tk/,
]

/**
 * 长页面（>20KB）专用高特异度签名：CF 中文挑战页带内联脚本可超 20KB，
 * 原逻辑只查前 2 个 GoEdge 签名导致漏判 → 挑战页被当正常内容交给解析器（静默 0 结果）。
 * 这些 token 只出现在 WAF 挑战脚本里，正文页几乎不可能含，误判风险极低。
 */
const WAF_LONGPAGE_SIGNATURES = [
  /WAF\/VERIFY\/CAPTCHA/i,
  /GOEDGE_WAF_CAPTCHA/i,
  /challenges\.cloudflare\.com\//i,
  /_cf_chl_opt|_cf_chl_rt_tk/,
  /<title>[^<]*(?:请|請)稍候[^<]*<\/title>/,
]

/** 判断 HTML 是否为 WAF/验证码挑战页或硬拒绝页（403 黑名单） */
export function isWafChallengeHtml(html: string): boolean {
  if (isHardDeniedHtml(html)) return true
  if (!html || html.length > 20000) {
    // 验证页很小；超长页面再用高特异度签名兜底检查（避免正文误判）
    return WAF_LONGPAGE_SIGNATURES.some((re) => re.test(html))
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
  const brands = secChUaBrands(ua)
  if (brands) {
    const hints = secChUaPlatformHints(ua)
    out['sec-ch-ua'] = brands
    out['sec-ch-ua-mobile'] = hints.mobile
    out['sec-ch-ua-platform'] = hints.platform
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
    'Upgrade-Insecure-Requests': '1',
  }
  // Chrome 系 UA 注入配套 Client Hints（品牌与版本号严格随 UA 家族，见 secChUaBrands）
  const brands = secChUaBrands(ua)
  if (brands) {
    const hints = secChUaPlatformHints(ua)
    headers['sec-ch-ua'] = brands
    headers['sec-ch-ua-mobile'] = hints.mobile
    headers['sec-ch-ua-platform'] = hints.platform
  }
  // 显式 cookies 与 jar 会话 cookie 合并：jar 同名键优先。
  // WAF 通行 cookie 与 UA/会话绑定且会滚动更新，规则里保存的只是注册时刻的旧快照——
  // 长期稳定采集必须让解题后新入 jar 的通行 cookie 覆盖旧快照，否则每次都要重新解题。
  // 合并先于 Referer/Sec-Fetch 决策：是否携带会话 cookie 决定导航语义（见下）
  {
    const jarCookie = cookieJar.header(url)
    if (cfg.cookies && jarCookie) headers.Cookie = mergeCookieStrings(cfg.cookies, jarCookie)
    else if (cfg.cookies) headers.Cookie = cfg.cookies
    else if (jarCookie) headers.Cookie = jarCookie
  }
  const hasSessionCookie = Boolean(headers.Cookie)
  if (cfg.referer) headers.Referer = cfg.referer
  else if (hasSessionCookie) {
    // 站内跳转指纹（携带会话 cookie 时与 cookie 相互印证）：真实浏览器站内跳转
    // 必带同源 Referer + 存量 cookie，两者同时出现才是自洽的回访用户
    try {
      headers.Referer = `${new URL(url).origin}/`
    } catch {
      /* 非法 URL 已在入口拦 */
    }
  }
  // kelexs/GoEdge 生产实测结论（2026-02，多轮对照实验）：
  // 「声称浏览器导航却无任何 cookie」的请求嫌疑分最高——Sec-Fetch-Site: same-origin
  // + Referer + 零 cookie 稳定触发 307 挑战乃至 403 硬封禁；带有效 cookie 的完整
  // 指纹放行；纯 UA 简单客户端（curl 式）也稳定放行。因此：
  // - 无会话 cookie（首次访问）→ 简单客户端画像：不发 Sec-Fetch-*，
  //   不带默认 Referer（仅规则显式配置 cfg.referer 时才带），
  //   语义等价于首次直达的真实工具型客户端，GoEdge 侧嫌疑分最低
  // - 有会话 cookie（回访）→ 完整导航画像：Sec-Fetch 三件套 + 同源 Referer，
  //   与 cookie 相互印证构成自洽的回访用户
  // - Cache-Control/Pragma 一律不发：真实浏览器普通导航不带（reload 才带），
  //   爬虫教程式全量头反而抬高 WAF 嫌疑分
  if (hasSessionCookie || cfg.referer) {
    const refHost = urlHost(headers.Referer)
    const targetHost = urlHost(url)
    try {
      headers['Sec-Fetch-Dest'] = 'document'
      headers['Sec-Fetch-Mode'] = 'navigate'
      headers['Sec-Fetch-Site'] = !refHost
        ? 'none'
        : refHost === targetHost
          ? 'same-origin'
          : sameSiteHost(refHost, targetHost)
            ? 'same-site'
            : 'cross-site'
      headers['Sec-Fetch-User'] = '?1'
    } catch {
      /* 非法 URL 已在入口拦 */
    }
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
    const r = await fetchPageInner(mirrored.url, cfg)
    recordNetworkSuccess(mirrored.url)
    return r
  } catch (e) {
    const networkErr = isNetworkUnreachableError(e)
    if (networkErr) recordNetworkFailure(mirrored.url)
    if (networkErr && cfg.mirrorUrls?.length) {
      // 已在用的记忆镜像也死了：清除记忆，下次请求复检主域
      if (mirrored.swapped) {
        try {
          mirrorState.active.delete(new URL(url).hostname)
        } catch {
          /* ignore */
        }
      }
      let lastErr: unknown = e
      for (const mirror of cfg.mirrorUrls) {
        const alt = swapOrigin(url, mirror)
        // swapped 时 alt === mirrored.url 即刚失败的那个镜像，跳过
        if (!alt || alt === mirrored.url) continue
        try {
          const r = await fetchPageInner(alt, cfg)
          recordNetworkSuccess(alt)
          // 记忆可用镜像：后续请求跳过已死主域，直至冷却期结束复检
          markMirrorAlive(url, alt)
          return r
        } catch (err) {
          if (isNetworkUnreachableError(err)) recordNetworkFailure(alt)
          lastErr = err
        }
      }
      // 透传最后一个错误；已有「请求失败:」前缀的不重复叠加；
      // 网络类故障升级为带排查步骤的中文诊断（保留原始文案以维持网络类识别）
      const finalErr =
        lastErr instanceof Error
          ? lastErr.message.startsWith('请求失败:')
            ? lastErr
            : new Error(`请求失败: ${lastErr.message}`)
          : e
      throw diagnoseNetworkError(finalErr, url)
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
/** 镜像记忆表容量上限（过期条目惰性删除之外的硬保险，防长期运行无限增长） */
const MIRROR_MAX_ENTRIES = 200

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
    // 容量保险：超限先清理已过期记忆，仍超限则按插入序淘汰最旧一条
    if (mirrorState.active.size >= MIRROR_MAX_ENTRIES && !mirrorState.active.has(orig.hostname)) {
      const now = Date.now()
      for (const [k, rec] of mirrorState.active) if (now >= rec.deadUntil) mirrorState.active.delete(k)
      while (mirrorState.active.size >= MIRROR_MAX_ENTRIES) {
        const oldest = mirrorState.active.keys().next().value
        if (oldest === undefined) break
        mirrorState.active.delete(oldest)
      }
    }
    mirrorState.active.set(orig.hostname, { mirrorOrigin: mir.origin, deadUntil: Date.now() + MIRROR_DEAD_MS })
  } catch {
    /* ignore */
  }
}

/** 识别网络层不可达错误（区别于 WAF/HTTP 状态错误——后者换域名无意义）；
 *  重定向环/跳数超限也按网络类处理：镜像通常能提供不同的跳转链路。
 *  运行时差异必配：Node(undici) 报 "fetch failed"（ECONNREFUSED 等在 cause 里），
 *  Bun 报 "Unable to connect. Is the computer able to access the url?"（无 cause，
 *  DNS 失败与连接拒绝同文案）——生产 Docker 以 bun 运行，漏配会导致熔断器/镜像
 *  轮换在 Bun 下整体失明（连接类失败不再被记录，也不会触发镜像切换）。 */
export function isNetworkUnreachableError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return (
    /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH/i.test(msg) ||
    /unable to (connect|resolve)/i.test(msg) ||
    /ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_(REFUSED|RESET|TIMED_OUT)|ERR_NAME_NOT_RESOLVED|ERR_NETWORK/i.test(msg) ||
    /请求失败.*(重定向|timed?\s*out|abort|socket|terminated|unreachable)/i.test(msg) ||
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

/**
 * 连接层故障的最终诊断包装：fetchPage 全部重试/镜像轮换均失败后，
 * 把 "请求失败: Unable to connect..." 这类低信息量错误升级为可行动的中文排查指引。
 * 注意：原始错误文案完整保留在 message 内——isNetworkUnreachableError 按全文匹配
 * （如 /unable to connect/i），包装后后续链路仍能正确识别为网络类错误。
 */
function diagnoseNetworkError(e: unknown, url: string): Error {
  const raw = e instanceof Error ? e.message : String(e)
  // 防重入：已诊断过直接返回
  if (raw.includes('连接失败（服务器无法访问目标站')) return e instanceof Error ? e : new Error(raw)
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* ignore */
  }
  const brief = url.length > 80 ? `${url.slice(0, 80)}…` : url
  return new Error(
    `连接失败（服务器无法访问目标站 [${host}]，DNS/TCP 网络层故障，非 WAF 拦截）。排查步骤——` +
      `① 在服务器上执行 curl -vI --max-time 15 ${brief} 验证连通；` +
      `② 执行 nslookup ${host} 检查 DNS 解析（Bun 下 DNS 失败与连接拒绝同文案）；` +
      `③ 若目标站封机房 IP：在规则配置 mirrorUrls 镜像域名，或将抓取策略切换为「Hyperbrowser 云隐身」（云出口 IP 与服务器不同）；` +
      `④ 检查服务器出站防火墙/安全组是否放行 80/443。` +
      `原始错误：${raw.slice(0, 200)}`,
  )
}

// ============================================================
// iv8 补环境求解通道（外部 Python 命令）
// 适用：JS 计算型 cookie 挑战——响应 200 但 body 是混淆 JS，执行后
// document.cookie= 计算值并刷新（瑞数系 / acw_sc__v2 / acw_tc 类），
// 无验证码图片可识、无表单可提交，纯 HTTP 无法直接突破。
// 原理：把挑战页 HTML 喂给外部 iv8 求解器（Python 原生 V8 扩展，
// C++ 层模拟 BOM/DOM，不启动真实浏览器），在补环境里跑出通行 cookie，
// 吸收进 CookieJar 后重放请求。iv8 未配置时该通道静默跳过，零开销。
// env：IV8_ENABLED=1（使用内置 scripts/iv8-solver.py，需 pip install iv8）
//      IV8_COMMAND="python3 /path/to/your-solver.py"（自定义命令，stdin 收
//      JSON {url,ua,html}，stdout 回 JSON {ok,cookies[],finalUrl?,error?}）
// ============================================================

/** JS 计算型 cookie 挑战页启发式识别（保守：特征不全不触发，宁漏勿误） */
export function looksLikeJsCookieChallenge(html: string): boolean {
  if (!html || html.length < 300 || html.length > 600_000) return false
  if (!/<script/i.test(html)) return false
  // 瑞数系特征：大段变量运算流 + 标志性模式（无明文 document.cookie）
  if (/\$[a-z0-9_$]{1,12}\s*=\s*~\[\]|FSSBBIl1UgzbN7N|while\s*\(\s*!\s*!\s*\[\]\s*\)|\$_ts=\s*window/.test(html)) return true
  // 通用特征：JS 明文写 cookie 且随后刷新/跳转（acw_sc__v2 等标准形态）
  const cookieWrite = /document\s*\.\s*cookie\s*=\s*['"`][^'"`]{3,}['"`]/.test(html) || /document\s*\.\s*cookie\s*=\s*[a-zA-Z_$]/.test(html)
  if (!cookieWrite) return false
  const reload =
    /location\.reload\s*\(|location\.replace\s*\(|window\.location(?:\.href)?\s*=|document\.location(?:\.href)?\s*=|location\.href\s*=\s*location\.href/.test(html)
  return reload
}

function extractLastJson(text: string): unknown {
  const s = text.trim()
  try {
    return JSON.parse(s)
  } catch {
    /* 容忍求解器输出日志行：扫描全部顶层 '{' 位置，从最后一个尝试解析 */
  }
  const candidates: number[] = []
  let depth = 0
  let inStr: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'") inStr = ch
    else if (ch === '{') {
      if (depth === 0) candidates.push(i)
      depth++
    } else if (ch === '}') depth = Math.max(0, depth - 1)
  }
  for (let k = candidates.length - 1; k >= 0; k--) {
    try {
      return JSON.parse(s.slice(candidates[k]))
    } catch {
      /* try next */
    }
  }
  return null
}

interface Iv8SolverResult {
  ok: boolean
  cookies?: { name: string; value: string; domain?: string }[]
  finalUrl?: string
  error?: string
}

function iv8Configured(): boolean {
  return Boolean((process.env.IV8_COMMAND ?? '').trim() || (process.env.IV8_ENABLED ?? '').trim() === '1')
}

function getIv8Command(): string | null {
  const explicit = (process.env.IV8_COMMAND ?? '').trim()
  if (explicit) return explicit
  if ((process.env.IV8_ENABLED ?? '').trim() === '1') {
    const local = path.join(process.cwd(), 'scripts', 'iv8-solver.py')
    if (fs.existsSync(local)) return `python3 "${local}"`
    // standalone 构建不携带 scripts/：一次性提示而非每次请求刷屏
    console.warn('[iv8] IV8_ENABLED=1 但未找到 scripts/iv8-solver.py（standalone 部署需手动携带或用 IV8_COMMAND 指定），iv8 通道跳过')
  }
  return null
}

/** 调用外部 iv8 求解器：stdin 传 {url,ua,html}，stdout 收 {ok,cookies[]}；失败/超时返回非阻断结果 */
async function solveCookiesViaIv8(
  url: string,
  ua: string,
  html: string,
  timeoutMs = 45_000,
): Promise<Iv8SolverResult> {
  const command = getIv8Command()
  if (!command) return { ok: false, error: 'iv8 未配置（IV8_ENABLED=1 或 IV8_COMMAND）' }
  const payload = JSON.stringify({ url, ua, html, timeout: timeoutMs })
  return new Promise<Iv8SolverResult>((resolve) => {
    let settled = false
    const done = (r: Iv8SolverResult) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }
    let stdout = ''
    try {
      const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] })
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* ignore */
        }
        done({ ok: false, error: `iv8 求解超时（${timeoutMs}ms）` })
      }, timeoutMs)
      child.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString()
        if (stdout.length > 2_000_000) {
          try {
            child.kill('SIGKILL')
          } catch {
            /* ignore */
          }
        }
      })
      child.on('error', (e: Error) => {
        clearTimeout(timer)
        done({ ok: false, error: `iv8 命令启动失败：${e.message}` })
      })
      child.on('close', () => {
        clearTimeout(timer)
        const parsed = extractLastJson(stdout)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const r = parsed as Iv8SolverResult
          if (typeof r.ok === 'boolean') return done(r)
        }
        done({ ok: false, error: `iv8 输出无法解析：${stdout.slice(0, 200) || '(空)'}` })
      })
      child.stdin?.write(payload)
      child.stdin?.end()
    } catch (e) {
      done({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}

// ============================================================
// curl 子进程通道：TLS/HTTP2 指纹级反反爬兜底
// ============================================================
// Cloudflare 等按客户端 TLS/JA3 指纹打分的 WAF 会拦截 Bun fetch（BoringSSL
// 指纹）与 headless Chromium（自动化信号），但常规放行系统 curl（OpenSSL
// 大众指纹）。实测（101kks.com，2026-10）：同 IP 同 UA 下 bun fetch 403 挑战、
// CloakBrowser 隐身引擎 18s 等待后仍「请稍候…」，系统 curl 稳定 200。
// 该通道 spawn 系统 curl 完整复刻规则 headers，作为 http 策略遇挑战时的
// 第一顺位降级（成功后 Set-Cookie 吸入全局罐，后续 bun fetch 直连复用）。

interface CurlFetchResult {
  html: string
  status: number
  finalUrl: string
}

async function fetchViaCurl(url: string, cfg: FetchConfig, timeout: number): Promise<CurlFetchResult> {
  const os = await import('node:os')
  const fsp = await import('node:fs/promises')
  const path = await import('node:path')
  const headerFile = path.join(os.tmpdir(), `novel-curl-hdr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`)
  const headers = buildHeaders(cfg, url)
  const args: string[] = [
    '-s',
    '-L',
    '--compressed',
    '--max-redirs', '8',
    '--connect-timeout', String(Math.max(5, Math.min(15, Math.ceil(timeout / 2000)))),
    '-m', String(Math.max(5, Math.ceil(timeout / 1000))),
    '-D', headerFile, // 响应头落盘：解析 status 与 Set-Cookie（多跳全部转储，取最后一跳）
    '-o', '-', // 正文走 stdout
    // 写在正文尾部再剥离（含 url_effective 精确最终地址；正文含同名标记的概率可忽略）
    '-w', '\n__NOVEL_CURL_EFFECTIVE__%{url_effective}',
  ]
  for (const [k, v] of Object.entries(headers)) {
    const kl = k.toLowerCase()
    if (kl === 'cookie' || kl === 'content-length' || kl === 'host') continue
    args.push('-H', `${k}: ${v}`)
  }
  args.push(url)

  const proc = (await import('node:child_process')).spawn('curl', args, { stdio: ['ignore', 'pipe', 'ignore'] })
  try {
    const chunks: Buffer[] = []
    for await (const chunk of proc.stdout) chunks.push(chunk as Buffer)
    const exitCode = await new Promise<number>((resolve, reject) => {
      proc.on('error', reject) // ENOENT：curl 未安装
      proc.on('close', (code) => resolve(code ?? -1))
    })
    const buf = Buffer.concat(chunks)
    if (exitCode !== 0) {
      // 28=总超时 7=连接失败 6=DNS 解析失败 60=证书校验失败（-k 不启用，证书异常应当暴露）
      throw new Error(`curl 子进程退出码 ${exitCode}（28=超时/7=连接失败/6=DNS 失败/60=证书校验失败）`)
    }
    if (buf.length > MAX_HTML_BYTES) throw new Error(`页面过大（curl 通道 ${buf.length} 字节 > ${MAX_HTML_BYTES}）`)

    // 剥离尾部 url_effective 标记
    const MARKER = '__NOVEL_CURL_EFFECTIVE__'
    let htmlBuf = buf
    let finalUrl = url
    const text0 = buf.toString('utf8')
    const mi = text0.lastIndexOf(MARKER)
    if (mi >= 0) {
      finalUrl = text0.slice(mi + MARKER.length).trim() || url
      htmlBuf = buf.subarray(0, Buffer.byteLength(text0.slice(0, mi), 'utf8'))
    }

    // 解析转储头：status 取最后一跳；Set-Cookie 全部吸入全局罐
    const headerText = await fsp.readFile(headerFile, 'utf8').catch(() => '')
    let status = 0
    const statusMatches = [...headerText.matchAll(/^HTTP\/[\d.]+ (\d{3})/gim)]
    if (statusMatches.length) status = Number(statusMatches[statusMatches.length - 1][1])
    const setCookies = [...headerText.matchAll(/^set-cookie:\s*(.+)$/gim)].map((m) => m[1].trim())
    if (setCookies.length) {
      const h = new Headers()
      for (const sc of setCookies) h.append('set-cookie', sc)
      cookieJar.absorbFromFetch(urlHost(finalUrl), h)
    }

    const charset = detectCharset(htmlBuf, '', cfg.encoding ?? 'auto')
    return { html: decodeBuffer(htmlBuf, charset), status, finalUrl }
  } finally {
    fsp.unlink(headerFile).catch(() => undefined)
    proc.kill()
  }
}

/** curl 通道完整抓取（节流 + 硬封禁识别 + WAF 标记，与 http 策略产出同构） */
async function fetchWithCurl(url: string, cfg: FetchConfig, timeout: number, started: number): Promise<FetchResult> {
  await domainThrottle.wait(url, cfg.throttleGap)
  const { html, status, finalUrl } = await fetchViaCurl(url, cfg, timeout)
  if (isHardDeniedHtml(html)) {
    domainThrottle.reportBlock(finalUrl, 180_000)
    throw new Error(`目标站拒绝访问（IP 临时封禁，HTTP 403）：${finalUrl}。已自动冷却 3 分钟`)
  }
  return {
    html,
    status,
    finalUrl,
    strategy: 'curl',
    elapsedMs: Date.now() - started,
    wafChallenged: isWafChallengeHtml(html),
  }
}

async function fetchPageInner(url: string, cfg: FetchConfig): Promise<FetchResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error(`非法 URL：${url}`)
  // 熔断检查（含 playwright/hyperbrowser 策略）：打开则快速失败，
  // 错误按网络不可达分类，fetchPage 会转试镜像而非继续打已死站点
  assertCircuitClosed(url)
  const strategy = cfg.strategy ?? 'http'
  const timeout = cfg.timeout ?? 20000
  const started = Date.now()

  if (strategy === 'playwright') return fetchWithPlaywright(url, cfg, timeout, started)
  if (strategy === 'hyperbrowser') return fetchWithHyperbrowser(url, cfg, timeout, started)
  if (strategy === 'curl') return fetchWithCurl(url, cfg, timeout, started)

  // JS 翻页交互（jsPages）依赖浏览器点击逐页拼接快照：HTTP 直连只能拿到首屏。
  // 规则配置了 jsPages 即视为内容需要 JS 交互才完整 → 自动升级 Playwright
  // （此前该升级依赖「恰好被 WAF 拦截」，站点放行时翻页静默丢失，只采到第 1 页）
  if (cfg.jsPages?.enabled) return fetchWithPlaywright(url, cfg, timeout, started)

  // HTTP 直连策略（遇 WAF 自动升级浏览器渲染；同域全局节流）
  await domainThrottle.wait(url, cfg.throttleGap)
  let html = ''
  let status = 0
  let finalUrl = url
  for (let attempt = 0; attempt < 2; attempt++) {
    // 显式构建 headers：iv8 求解需要拿到「本次请求实际使用的 UA」
    //（JS 计算的 cookie 通常与 UA 绑定，重放必须同 UA 才有效）
    const headers = buildHeaders(cfg, url)
    const { res, finalUrl: fetchedUrl } = await fetchWithRetry(
      url,
      headers,
      timeout,
      2,
      cfg.rotateUA === false,
      cfg.cookies
    )
    const effectiveFinal = fetchedUrl || url
    // 响应体大小兜底：content-length 预检 + 读取后复核（超大页面全量进解码/cheerio 是内存放大点；
    // 正常小说页面 ≈几十~几百 KB，8MB 为宽裕上限）。超限按网络类错误抛出，可触发镜像轮换
    const declaredLen = Number(res.headers.get('content-length') ?? 0)
    if (declaredLen > MAX_HTML_BYTES) throw new Error(`页面过大（content-length ${declaredLen} > ${MAX_HTML_BYTES}）：${effectiveFinal.slice(0, 120)}`)
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_HTML_BYTES) throw new Error(`页面过大（实际 ${buffer.length} 字节 > ${MAX_HTML_BYTES}）：${effectiveFinal.slice(0, 120)}`)
    cookieJar.absorbFromFetch(urlHost(effectiveFinal), res.headers)
    const charset = detectCharset(buffer, res.headers.get('content-type') ?? '', cfg.encoding ?? 'auto')
    html = decodeBuffer(buffer, charset)
    status = res.status
    finalUrl = effectiveFinal
    if (isHardDeniedHtml(html)) {
      // IP 已被目标站拉黑（硬 403）：全局冷却后向调用方明确报告
      domainThrottle.reportBlock(finalUrl, 180_000)
      throw new Error(`目标站拒绝访问（IP 临时封禁，HTTP 403）：${finalUrl}。已自动冷却 3 分钟`)
    }
    if (!isWafChallengeHtml(html)) {
      // JS 计算型 cookie 挑战（200 + 混淆 JS 写 cookie 刷新）：iv8 外部求解通道
      // 触发条件：启发式命中 且（env 启用 或 规则显式 iv8Cookies=true）
      if (looksLikeJsCookieChallenge(html) && (cfg.iv8Cookies || iv8Configured())) {
        console.warn(`[iv8-solve] 命中 JS cookie 挑战（${effectiveFinal.slice(0, 100)}），调用外部 iv8 求解器…`)
        const solved = await solveCookiesViaIv8(effectiveFinal, headers['User-Agent'] ?? '', html)
        if (solved.ok && solved.cookies?.length) {
          // 通行 cookie 入 jar（同 UA 重放；absorbFromBrowser 签名兼容 {name,value}）
          cookieJar.absorbFromBrowser(urlHost(effectiveFinal), solved.cookies)
          console.warn(`[iv8-solve] 求解成功：获得 ${solved.cookies.length} 枚 cookie（${solved.cookies.map((c) => c.name).slice(0, 6).join(', ')}），携带重试`)
          if (attempt === 0) continue // 消耗第二轮：带新 cookie 重新请求
        } else {
          console.warn(`[iv8-solve] 求解未成功：${(solved.error ?? '未知原因').slice(0, 200)}`)
        }
      }
      return { html, status, finalUrl, strategy: 'http', elapsedMs: Date.now() - started }
    }
    // WAF 挑战：第一顺位降级为系统 curl 指纹重放（TLS 指纹型 WAF（如 Cloudflare）
    // 拦截 Bun/headless Chromium 但放行 curl，成功即吸收通行 cookie 全局复用）；
    // curl 未安装/仍被挑战 → 再试纯 HTTP 无浏览器求解（GoEdge 系验证码可全程 HTTP 突破，
    // 服务器无需安装 Playwright/chromium）；最后升级浏览器渲染策略（DOM 求解兑底）
    try {
      const curlResult = await fetchWithCurl(url, cfg, timeout, started)
      if (!curlResult.wafChallenged) {
        console.warn(`[curl-fallback] WAF 挑战页降级 curl 指纹重放成功：${url.slice(0, 100)}`)
        return { ...curlResult, elapsedMs: Date.now() - started }
      }
    } catch {
      /* curl 不可用（未安装/网络层失败）→ 继续原有求解链 */
    }
    const solvedHttp = await withWafSolveLock(url, () => solveWafCaptchaOverHttp(url, cfg, timeout, started))
    if (solvedHttp) return { ...solvedHttp, elapsedMs: Date.now() - started }
    // HTTP 求解未通过：升级为 Playwright（带验证码求解），仅尝试一次
    try {
      const pwResult = await fetchWithPlaywright(url, cfg, timeout, started)
      return { ...pwResult, elapsedMs: Date.now() - started }
    } catch (e) {
      if (attempt === 1) {
        throw new Error(
          `WAF 验证码自动求解未通过（HTTP 与浏览器两通道均失败）：${e instanceof Error ? e.message : String(e)}` +
            `。可行解：①配置 OpenAI 兼容视觉 API（CAPTCHA_VISION_API_BASE/KEY/MODEL）后重试；②本机浏览器过验证码后把通行 cookie 粘贴到规则「Cookie」字段并关闭「UA 随机轮换」；③策略切换为 Hyperbrowser 云隐身`
        )
      }
      // 浏览器策略失败后稍候再试一轮 HTTP：此时 jar 里可能已有解题通行 cookie，直连即可通过
      await sleep(1500)
    }
  }
  return { html, status, finalUrl, strategy: 'http', elapsedMs: Date.now() - started, wafChallenged: true }
}

/** 不可重试错误：结构性的请求/响应问题（重定向缺 Location、非法跳转协议等），重试无意义 */
class NoRetryError extends Error {}

/** 视为重定向的响应状态 */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
/** 手动跟随重定向的跳数上限（真实浏览器 20 跳；小说站链路极短，收紧上限换取更快的环检测） */
const MAX_REDIRECT_HOPS = 8

/** Retry-After 头解析（RFC 7231）：秒数或 HTTP 日期，返回应等待的 ms；缺失/非法返回 null */
function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null
  const s = headerValue.trim()
  if (/^\d+$/.test(s)) {
    const sec = Number.parseInt(s, 10)
    return sec >= 0 ? sec * 1000 : null
  }
  const t = Date.parse(s)
  return Number.isFinite(t) ? Math.max(0, t - Date.now()) : null
}

/**
 * 重试退避曲线：指数增长 + 随机抖动（多线程/多实例同时重试时避免同步踩踏同站点）。
 * 429 从更高基线起步（限流信号优先退让，退让不足只会加重限流）。
 */
function retryBackoffMs(attempt: number, baseMs: number, capMs = 20_000): number {
  const exp = baseMs * Math.pow(2, Math.max(0, attempt))
  const jitter = Math.random() * baseMs
  return Math.min(exp + jitter, capMs)
}

interface FetchRetryResult {
  res: Response
  /** 跟随重定向后的最终 URL（manual 模式下不再依赖 res.url） */
  finalUrl: string
}

/**
 * 单次请求（手动重定向跟随，总超时预算跨全部跳共享）：
 * - 逐跳吸收 Set-Cookie：redirect:'follow' 模式下中间 302 下发的 WAF 通行 cookie 会整体丢失
 * - 逐跳按目标 host 重算 Cookie 头：显式 cookie 仅随同站跳转携带，绝不跨站泄漏
 *   （真实浏览器按目标域作用域发 cookie；follow 模式会把原站 Cookie 头原样发给跨域跳转目标）
 * - Referer/Sec-Fetch 等导航指纹保持发起时的原值（浏览器在重定向链上不重写这些头）
 * - visited 集合环检测 + 跳数上限
 */
async function fetchFollowingRedirects(
  startUrl: string,
  headers: Record<string, string>,
  explicitCookies: string,
  timeout: number,
  init?: { method?: string; body?: string }
): Promise<FetchRetryResult> {
  let current = startUrl
  let method = (init?.method ?? 'GET').toUpperCase()
  const body = init?.body
  const visited = new Set<string>()
  const deadline = Date.now() + timeout
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // 环检测按「方法+URL」计：WAF 验证码 POST 通过后 303 跳回同 URL（改 GET）是正常链路，
    // 不区分方法会把解题成功链误判为重定向环
    const visitKey = `${method} ${current}`
    if (visited.has(visitKey)) {
      // 环是确定性的：同请求重试只会重复同样的跳转链（对目标站白打 3 倍请求），按不可重试抛出；
      // 错误文案仍按网络类分类，fetchPage 层依旧会转试镜像（不同链路可解）
      throw new NoRetryError(`请求失败: 重定向环（${current.slice(0, 120)}）`)
    }
    visited.add(visitKey)
    // 逐跳重算 Cookie：jar 会话 cookie 按跳转目标域下发；显式 cookie 仅同站跳转携带
    const hopHeaders: Record<string, string> = { ...headers }
    const jarCookie = cookieJar.header(current)
    const carryExplicit = sameSiteHost(urlHost(current), urlHost(startUrl)) ? explicitCookies : ''
    const merged = carryExplicit && jarCookie ? mergeCookieStrings(carryExplicit, jarCookie) : carryExplicit || jarCookie
    if (merged) hopHeaders.Cookie = merged
    else delete hopHeaders.Cookie
    // 跨站跳转按浏览器默认 referrer 策略（strict-origin-when-cross-origin）降级 Referer：
    // 重定向链上浏览器保留的仍是原始 referrer，但本跳目标与 referrer 跨站时只发其 origin，
    // 不把原始页面的完整路径/查询参数泄漏给跨站跳转目标（小说站常经广告/统计域中转）
    const refHost = urlHost(headers.Referer ?? '')
    if (hop > 0 && refHost && !sameSiteHost(urlHost(current), refHost)) {
      try {
        hopHeaders.Referer = new URL(headers.Referer).origin
      } catch {
        /* 保持原 Referer */
      }
    }
    // Sec-Fetch-Site 逐跳按「原始 referrer ↔ 本跳目标」重算（Fetch Metadata 语义：
    // 导航重定向不更新请求 origin，比较基准始终是发起文档），与上面的 Referer 降级自洽
    if ('Sec-Fetch-Site' in hopHeaders) {
      const hopTargetHost = urlHost(current)
      hopHeaders['Sec-Fetch-Site'] = !refHost
        ? 'none'
        : refHost === hopTargetHost
          ? 'same-origin'
          : sameSiteHost(refHost, hopTargetHost)
            ? 'same-site'
            : 'cross-site'
    }
    // 总超时预算跨跳共享（而非每跳重新计时）：8 跳 × 20s 不会把总耗时放大 8 倍
    const remain = deadline - Date.now()
    if (remain <= 500) throw new Error(`请求失败: 重定向链超时（${startUrl.slice(0, 120)}）`)
    const res = await fetch(current, {
      method,
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      headers: hopHeaders,
      redirect: 'manual',
      signal: AbortSignal.timeout(remain),
      cache: 'no-store',
    })
    // 逐跳吸收 Set-Cookie：WAF 通行 cookie 常在 302 响应上下发
    cookieJar.absorbFromFetch(urlHost(current), res.headers)
    if (!REDIRECT_STATUSES.has(res.status)) return { res, finalUrl: current }
    const loc = res.headers.get('location')
    if (!loc) {
      // 3xx 无 Location：无法跟随且重试无意义，按不可重试错误抛出
      await res.body?.cancel().catch(() => undefined)
      throw new NoRetryError(`HTTP ${res.status}（重定向缺少 Location）: ${current.slice(0, 120)}`)
    }
    let next: URL
    try {
      next = new URL(loc, current)
    } catch {
      await res.body?.cancel().catch(() => undefined)
      throw new NoRetryError(`请求失败: 重定向 Location 非法（${loc.slice(0, 120)}）`)
    }
    if (next.protocol !== 'http:' && next.protocol !== 'https:') {
      await res.body?.cancel().catch(() => undefined)
      throw new NoRetryError(`请求失败: 不支持的重定向协议（${next.protocol}）`)
    }
    // 释放未读 body，归还连接
    await res.body?.cancel().catch(() => undefined)
    // 303（及 301/302）后 POST 语义降级为 GET（浏览器重定向规范）：
    // WAF 验证码表单 POST → 303 回原页就是靠这个拿到正文；307/308 保持方法不变
    if (method !== 'GET' && method !== 'HEAD' && res.status !== 307 && res.status !== 308) {
      method = 'GET'
    }
    current = next.href
  }
  throw new NoRetryError(
    `请求失败: 重定向超过 ${MAX_REDIRECT_HOPS} 跳上限（可能重定向环）: ${startUrl.slice(0, 120)}`
  )
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  timeout: number,
  retries = 2,
  keepUA = false,
  explicitCookies = ''
): Promise<FetchRetryResult> {
  let lastErr: unknown = null
  for (let i = 0; i <= retries; i++) {
    try {
      // 每次重试轮换 UA（模拟多用户）；keepUA=true 时固定 UA（WAF 通行 cookie 与 UA 绑定，换 UA 即失效）
      const { res, finalUrl } = await fetchFollowingRedirects(
        url,
        i === 0 || keepUA ? headers : rotateFingerprint(headers),
        explicitCookies,
        timeout
      )
      if (!res.ok) {
        // 403（WAF 拒绝）：重试只会加剧封禁，直接抛出
        if (res.status === 403) {
          const body = await res.text().catch(() => '')
          if (isHardDeniedHtml(body)) {
            domainThrottle.reportBlock(finalUrl, 180_000)
            throw new Error(`目标站拒绝访问（IP 临时封禁，HTTP 403）：${finalUrl}。已自动冷却 3 分钟`)
          }
          if (isWafChallengeHtml(body)) {
            // 挑战页常以 403 状态下发：body 原样交回调用方，由 isWafChallengeHtml
            // 识别并升级浏览器策略（直接 break 会绕过整条 WAF 升级链路）
            const h = new Headers(res.headers)
            h.delete('content-encoding')
            h.delete('content-length')
            return { res: new Response(body, { status: 403, headers: h }), finalUrl }
          }
          lastErr = new Error(`HTTP 403`)
          break
        }
        if (i < retries) {
          // 429/5xx：指数退避 + 抖动，尊重 Retry-After（秒数或 HTTP 日期两种形式都支持）
          lastErr = new Error(`HTTP ${res.status}`)
          await res.body?.cancel().catch(() => undefined) // 释放未读 body，归还连接
          const ra = parseRetryAfter(res.headers.get('retry-after'))
          const backoff =
            ra !== null ? Math.min(ra + 250, 30_000) : retryBackoffMs(i, res.status === 429 ? 2000 : 700)
          await sleep(backoff)
          continue
        }
        // 最后一次重试仍非 2xx：不再把错误页 body 当解析对象（避免 5xx 错误页文本混入正文）
        await res.body?.cancel().catch(() => undefined)
        throw new Error(`HTTP ${res.status}（${url.slice(0, 120)}）`)
      }
      return { res, finalUrl }
    } catch (e) {
      if (e instanceof NoRetryError) throw e
      if (e instanceof Error && e.message.includes('IP 临时封禁')) throw e
      lastErr = e
      // 网络错/超时：指数退避（首轮短退避快速恢复，连续失败逐步拉长）
      if (i < retries) await sleep(retryBackoffMs(i, 600))
    }
  }
  throw lastErr instanceof Error && lastErr.message.startsWith('请求失败:')
    ? lastErr
    : new Error(`请求失败: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

// ============================================================
// WAF 验证码纯 HTTP 求解（无浏览器，GoEdge 系）
// ============================================================

/**
 * 同主机验证码求解串行锁：多线程采集并发命中 WAF 时，只放行一个请求去解题，
 * 其余排队等待——解题成功后通行 cookie 已入 jar，后续请求直接放行，
 * 避免同一验证码被并发重复识别/提交（VLM 成本翻倍且互相顶号）。
 */
const WAF_SOLVE_LOCKS = new Map<string, Promise<void>>()
async function withWafSolveLock<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const key = urlHost(url) || '__global__'
  const prev = WAF_SOLVE_LOCKS.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((r) => {
    release = r
  })
  // 队列尾挂本任务的释放门；前序任务失败也不阻断排队（prev.then 双分支）
  WAF_SOLVE_LOCKS.set(key, prev.then(() => gate, () => gate))
  await prev.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
  }
}

/**
 * 验证码图片预处理：3x 放大 → 灰度 → 对比度归一 → 阈值二值化。
 * 实测（kelexs/GoEdge）：原图噪点+干扰线使 VLM 识别失败（"11B64"→"61565"），
 * 二值化滤除浅色噪声后一次通过——预处理是识别率的关键环节而非可选优化。
 * sharp 加载失败/异常时原样返回，识别通道自行兜底（最多损失识别率）。
 */
async function preprocessCaptchaForVlm(png: Buffer): Promise<Buffer> {
  try {
    interface SharpChain {
      resize: (o: { width: number; kernel: string }) => SharpChain
      grayscale: () => SharpChain
      normalise: () => SharpChain
      threshold: (v: number) => SharpChain
      png: () => SharpChain
      toBuffer: () => Promise<Buffer>
    }
    const mod = (await import('sharp').catch(() => null)) as {
      default: (b: Buffer) => SharpChain
    } | null
    if (!mod) return png
    return await mod
      .default(png)
      .resize({ width: 600, kernel: 'lanczos3' })
      .grayscale()
      .normalise()
      .threshold(128)
      .png()
      .toBuffer()
  } catch {
    return png
  }
}

/** GoEdge 验证码页表单解析（captcha_id + 图片地址；属性顺序无关） */
export function parseGoEdgeCaptchaForm(html: string): { id: string; imgSrc: string } | null {
  const id = /name="GOEDGE_WAF_CAPTCHA_ID"\s+value="([^"]+)"/i.exec(html)?.[1]
  const imgSrc =
    /<img[^>]+id="ui-captcha-image"[^>]+src="([^"]+)"/i.exec(html)?.[1] ??
    /<img[^>]+src="([^"]+)"[^>]+id="ui-captcha-image"/i.exec(html)?.[1]
  if (!id || !imgSrc) return null
  return { id, imgSrc: imgSrc.replace(/&amp;/g, '&') }
}

/**
 * GoEdge 验证码表单已解析但 VLM 连续未命中的类型化错误：
 * 调用方据此跳过 Playwright 升级——同一 VLM 换浏览器重试无精度增益，
 * 只会白白增加 ~2 分钟延迟与对 WAF 的请求量。
 */
class WafVlmExhaustedError extends Error {}

/**
 * GoEdge WAF（及同构验证码页）纯 HTTP 求解——无需浏览器：
 * GET 挑战页 → 解析表单 → 下载图片（预处理+VLM 识别）→ POST 表单 → 303 落回原页。
 * 通行 cookie 经逐跳 Set-Cookie 吸收进 jar（ge_wc_20 等，2h 有效），全站后续请求复用。
 * 返回 null = 非 GoEdge 布局或结构性失败（调用方升级 Playwright DOM 求解）；
 * 抛 WafVlmExhaustedError = 表单已解析但 VLM 连续未命中（跳过 Playwright 升级）；
 * VLM 配置缺失/不可用的错误原样上抛（含中文配置指引，不得吞掉）。
 */
async function solveWafCaptchaOverHttp(
  url: string,
  cfg: FetchConfig,
  timeout: number,
  started: number
): Promise<FetchResult | null> {
  // 4 次识别尝试：每次挑战刷新验证码，按单次识别命中率 ~60% 估算，
  // 4 连败概率 ~2.5%——与旧「HTTP 3 次 + Playwright 4 次」链路的通过率相当，
  // 但无浏览器启动/导航/长等待开销，最坏耗时从 ~209s 压到 ~1 分钟内
  const SOLVE_ATTEMPTS = 4
  // 通行 cookie 与 UA 绑定：整条解题链（GET 页→GET 图→POST 表）共用同一组请求头指纹
  const headers = buildHeaders(cfg, url)
  let layoutMatched = false
  let lastReason = '未知'
  for (let attempt = 0; attempt < SOLVE_ATTEMPTS; attempt++) {
    try {
      // ① 取挑战页（jar 已持有有效通行 cookie 时这一步直接拿到正文并返回）
      const { res, finalUrl: pageUrl } = await fetchFollowingRedirects(url, headers, cfg.cookies ?? '', timeout)
      const buf = Buffer.from(await res.arrayBuffer())
      const html = decodeBuffer(buf, detectCharset(buf, res.headers.get('content-type') ?? '', cfg.encoding ?? 'auto'))
      if (!isWafChallengeHtml(html)) {
        return { html, status: res.status, finalUrl: pageUrl, strategy: 'http', elapsedMs: Date.now() - started }
      }
      if (isHardDeniedHtml(html)) return null // IP 黑名单非验证码可解，交上层（Playwright/报错）处理
      // ② 解析 GoEdge 表单
      const form = parseGoEdgeCaptchaForm(html)
      if (!form) return null
      layoutMatched = true
      // ③ 下载验证码图片：Referer 指向挑战页；剥离 Sec-Fetch document 导航指纹——
      //    图片子资源应发 image 语义（与 Playwright 路径同一教训：GoEdge 校验
      //    fetch-metadata 一致性，矛盾指纹会拒供验证码图）
      const imgHeaders: Record<string, string> = {
        ...headers,
        Referer: pageUrl,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      }
      for (const k of Object.keys(imgHeaders)) {
        if (k.toLowerCase().startsWith('sec-fetch-')) delete imgHeaders[k]
      }
      const img = await fetchFollowingRedirects(new URL(form.imgSrc, pageUrl).href, imgHeaders, '', timeout)
      const png = Buffer.from(await img.res.arrayBuffer())
      if (!img.res.ok || png.length < 100) {
        lastReason = `验证码图下载失败（HTTP ${img.res.status}, ${png.length}B）`
        console.warn(`[waf-http-solve] 第 ${attempt + 1}/${SOLVE_ATTEMPTS} 次: ${lastReason}`)
        continue
      }
      // ④ 预处理 + VLM 识别（识别不可用错误原样上抛，含配置指引）
      const code = await recognizeCaptcha(await preprocessCaptchaForVlm(png))
      if (!code || code.length < 3) {
        lastReason = 'VLM 空回复'
        console.warn(`[waf-http-solve] 第 ${attempt + 1}/${SOLVE_ATTEMPTS} 次: ${lastReason}`)
        continue
      }
      // ⑤ POST 表单（303 后自动转 GET 落回 from 原页；逐跳 Set-Cookie 已进 jar）
      const postHeaders: Record<string, string> = {
        ...headers,
        Referer: pageUrl,
        'Content-Type': 'application/x-www-form-urlencoded',
      }
      const post = await fetchFollowingRedirects(pageUrl, postHeaders, '', timeout, {
        method: 'POST',
        body: `GOEDGE_WAF_CAPTCHA_ID=${encodeURIComponent(form.id)}&GOEDGE_WAF_CAPTCHA_CODE=${encodeURIComponent(code)}`,
      })
      const postBuf = Buffer.from(await post.res.arrayBuffer())
      const postHtml = decodeBuffer(
        postBuf,
        detectCharset(postBuf, post.res.headers.get('content-type') ?? '', cfg.encoding ?? 'auto')
      )
      if (!isWafChallengeHtml(postHtml)) {
        // 放行：POST 303 的 from 落地页即原目标内容，直接作为结果返回
        return { html: postHtml, status: post.res.status, finalUrl: post.finalUrl, strategy: 'http', elapsedMs: Date.now() - started }
      }
      // 未通过（识别错误）：WAF 重发新验证码，下一轮重试
      lastReason = `识别答案 "${code.slice(0, 8)}" 未被接受`
      console.warn(`[waf-http-solve] 第 ${attempt + 1}/${SOLVE_ATTEMPTS} 次: ${lastReason}，刷新重试`)
      await sleep(randomInt(400, 900))
    } catch (e) {
      // VLM 配置性错误必须上抛（含手动过码指引，吞掉会让用户失去唯一行动线索）；
      // 其余（网络抖动/重定向环）下一轮重试
      if (e instanceof Error && /CAPTCHA_VISION|验证码识别|手动过码/.test(e.message)) throw e
      lastReason = (e instanceof Error ? e.message : String(e)).slice(0, 140)
      console.warn(`[waf-http-solve] 第 ${attempt + 1}/${SOLVE_ATTEMPTS} 次异常: ${lastReason}`)
      if (attempt === SOLVE_ATTEMPTS - 1) return null
      await sleep(randomInt(300, 700))
    }
  }
  if (layoutMatched) {
    // GoEdge 表单已解析、HTTP 通道本身工作正常：连续未命中是 VLM 识别率问题，
    // 升级 Playwright（同一 VLM）无增益，直接给出可行动的错误并跳过浏览器升级
    throw new WafVlmExhaustedError(
      `WAF 验证码自动求解未通过（GoEdge 表单已解析，HTTP 通道正常，VLM 连续 ${SOLVE_ATTEMPTS} 次未命中，末次原因: ${lastReason}）。` +
        '这通常是识别率问题而非网络/浏览器问题——直接重试任务即可（每次挑战会自动刷新验证码）；' +
        '识别率持续偏低时更换视觉模型（CAPTCHA_VISION_MODEL，推荐 glm-4v-flash / glm-4v-plus）'
    )
  }
  return null
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
  /** 当前共享浏览器实际使用的引擎（fetchWithPlaywright 据此决定 stealth 注入与结果标注） */
  engine: BrowserEngine
}
const globalForBrowser = globalThis as unknown as { [BROWSER_STATE_KEY]?: BrowserState }
const browserState: BrowserState = globalForBrowser[BROWSER_STATE_KEY] ?? { browser: null, starting: null, engine: 'playwright' }
globalForBrowser[BROWSER_STATE_KEY] = browserState

/**
 * launch 失败诊断包装：浏览器二进制存在但缺系统共享库时，chrome 进程启动即崩溃，
 * Playwright 表现为笼统的 "Target page, context or browser has been closed"。
 * 识别特征并替换为可执行的中文修复指引，原始错误附在末尾保留现场。
 */
function diagnoseLaunchError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e)
  if (/has been closed|loading shared libraries|dlerror|libnss|libgbm|libatk|libasound|error while loading/i.test(msg)) {
    return new Error(
      'Chromium 启动失败（浏览器已安装但缺 Linux 系统依赖库）。修复方式——' +
        '裸机：cd 项目目录 && bunx playwright install-deps chromium；' +
        'Docker：docker compose exec novel-system bun node_modules/playwright/cli.js install-deps chromium，' +
        '或用 INSTALL_PLAYWRIGHT=true docker compose up -d --build 重新构建（已内置依赖安装）。' +
        `原始错误：${msg.slice(0, 300)}`,
    )
  }
  return e instanceof Error ? e : new Error(msg)
}

// ============================================================
// 浏览器引擎可插拔：playwright（默认）| cloakbrowser（源码级隐身 Chromium）
// CloakBrowser：87 处 C++ 源码级指纹补丁（canvas/WebGL/音频/字体/GPU/网络时序/
// 自动化信号），过 Cloudflare Turnstile、FingerprintJS、BrowserScan 等 30+ 检测，
// Playwright 同 API（返回标准 Browser 对象），npm 包 cloakbrowser，二进制首次
// 启动自动下载（~200MB）。env：BROWSER_ENGINE=cloakbrowser 强制启用；
// CLOAKBROWSER_LICENSE_KEY（Pro）/ CLOAKBROWSER_BINARY_PATH（本地二进制，免下载）
// 存在时自动启用。启动失败自动降级 playwright，采集不中断。
// ============================================================

type BrowserEngine = 'playwright' | 'cloakbrowser'

function selectBrowserEngine(): BrowserEngine {
  const env = (k: string) => (process.env[k] ?? '').trim()
  const explicit = env('BROWSER_ENGINE').toLowerCase()
  if (explicit === 'cloakbrowser' || explicit === 'cloak') return 'cloakbrowser'
  if (explicit === 'playwright' || explicit === 'pw') return 'playwright'
  // 自动判据：配置了许可证或本地二进制 → 有现成隐身引擎可用
  if (env('CLOAKBROWSER_LICENSE_KEY') || env('CLOAKBROWSER_BINARY_PATH')) return 'cloakbrowser'
  return 'playwright'
}

async function launchBrowserEngine(engine: BrowserEngine): Promise<PlaywrightBrowser> {
  const args = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-infobars',
    '--window-size=1366,850',
  ]
  if (engine === 'cloakbrowser') {
    const cloakSpec = 'cloakbrowser'
    const cloak = (await import(/* webpackIgnore: true */ cloakSpec).catch(() => null)) as {
      launch: (o: Record<string, unknown>) => Promise<PlaywrightBrowser>
    } | null
    if (!cloak) {
      throw new Error('cloakbrowser 包未安装：请在项目目录执行 `bun add cloakbrowser`（首次启动会自动下载隐身 Chromium 二进制，约 200MB）')
    }
    // stealthArgs 默认开启（引擎自身的隐身参数集）；--no-sandbox 容器/root 必需
    return cloak.launch({ headless: true, args })
  }
  const pwSpec = 'playwright'
  const pw = (await import(/* webpackIgnore: true */ pwSpec).catch(() => null)) as {
    chromium: { launch: (o: Record<string, unknown>) => Promise<PlaywrightBrowser> }
  } | null
  if (!pw) {
    throw new Error('Playwright 未安装：请在服务器执行 `bun add playwright && bunx playwright install chromium` 后使用 js 渲染策略')
  }
  return pw.chromium.launch({ headless: true, args })
}

async function getSharedBrowser(): Promise<PlaywrightBrowser | null> {
  // 复用存活实例
  const existing = browserState.browser
  if (existing && typeof existing.isConnected === 'function' && existing.isConnected()) return existing
  // 并发去重：共享同一个启动 Promise
  if (!browserState.starting) {
    const startPromise = (async () => {
      const engine = selectBrowserEngine()
      try {
        const b = await launchBrowserEngine(engine)
        browserState.engine = engine
        return b
      } catch (e) {
        if (engine === 'cloakbrowser') {
          // 隐身引擎不可用（未装包/下载失败/二进制损坏）→ 自动降级，采集不中断
          console.warn(
            `[browser-engine] CloakBrowser 启动失败，自动降级 Playwright：${e instanceof Error ? e.message.slice(0, 240) : String(e)}`,
          )
          const b = await launchBrowserEngine('playwright')
          browserState.engine = 'playwright'
          return b
        }
        throw e
      }
    })()
    browserState.starting = startPromise
      .then((b) => {
        browserState.browser = b
        return b
      })
      .catch((e) => {
        // 包装后重抛：让上层（WAF 升级链/任务日志）看到可执行的修复指引而非原始 launch 崩溃
        throw diagnoseLaunchError(e)
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
  const activeEngine: BrowserEngine = browserState.engine ?? 'playwright'
  const headers = buildHeaders(cfg, url)
  const jarCookie = cookieJar.header(url)
  // Cookie 单独经 addCookies 注入（context 级会话），避免 extraHTTPHeaders 里的静态 Cookie 头
  // 与浏览器 cookie 罐重复发送同名字段造成 WAF 判定异常
  const { Cookie: _cookieHeader, ...extraHeaders } = headers
  // Sec-Fetch-* 必须从浏览器上下文剥离：Chromium 会按每类子资源自动下发真实
  // Fetch Metadata（document 导航 vs image 子资源各不相同）；静态注入的
  // document/navigate/user 会被强加到验证码图片等所有子资源请求上，
  // GoEdge 校验 fetch-metadata 一致性时判定矛盾 → 拒供验证码图（元素不可见，
  // 截图 30s×4 超时、解题链全灭）。HTTP 策略路径无原生元数据，保留注入不变。
  for (const key of Object.keys(extraHeaders)) {
    if (key.toLowerCase().startsWith('sec-fetch-')) delete extraHeaders[key]
  }
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
    // CloakBrowser 的隐身能力在 Chromium 源码层（87 处 C++ 补丁），运行时 JS 补丁
    // 不再需要——重复注入反而引入可观测的行为差异，仅 playwright 引擎注入
    if (activeEngine !== 'cloakbrowser') await context.addInitScript(STEALTH_SCRIPT)

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

    // Cloudflare 托管挑战自动放行等待：挑战页（Just a moment / 请稍候…）会在
    // 浏览器内自动解题 5~10s 后重定向回原页。轮询 page.title() 天然跨导航
    // （waitForFunction 在导航时随执行上下文销毁而抛错，不可用）。
    // 挑战从未出现 → 立即通过；始终不通过 → 等满上限后照常截图，
    // 由 isWafChallengeHtml 给出明确的 WAF 报错（而非静默解析为空）。
    const cfWaitMs = Math.min(18000, Math.max(timeout, 10000))
    const cfDeadline = Date.now() + cfWaitMs
    let cfChallengeSeen = false
    while (Date.now() < cfDeadline) {
      const title = (await page.title().catch(() => '')) || ''
      if (!/just a moment|请稍候|請稍候|attention required|checking your browser|安全验证/i.test(title)) break
      cfChallengeSeen = true
      await page.waitForTimeout(800)
    }
    if (cfChallengeSeen) {
      // 挑战通过后的重定向目标页：等网络稳定再截图，避免抓到半渲染 DOM
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined)
      await page.waitForTimeout(600)
    }

    let html = await page.content()
    let finalUrl = page.url()

    // 重定向链中途断链（TLS/HTTP2/瞬时网络错）时 goto 不抛错，而是落在浏览器错误页：
    // 必须显式识别，否则错误页 HTML 会被当作正常 200 交给解析器产出空结果。
    // 先原地重试一次（瞬时网络抖动常见），仍失败按网络类错误抛出（fetchPage 层触发镜像轮换）
    if (/^chrome-error/i.test(finalUrl) || finalUrl === 'about:blank') {
      await page.waitForTimeout(1200)
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout }).catch(() => undefined)
      await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => undefined)
      await page.waitForTimeout(500)
      html = await page.content()
      finalUrl = page.url()
      if (/^chrome-error/i.test(finalUrl) || finalUrl === 'about:blank') {
        throw new Error(`请求失败: 浏览器导航失败（network unreachable，${finalUrl}）: ${url.slice(0, 120)}`)
      }
    }

    // WAF 挑战页 → 自动求解验证码（同主机串行：并发请求只解一次，其余共享通行 cookie）
    if (isWafChallengeHtml(html) && !isHardDeniedHtml(html)) {
      const solved = await withWafSolveLock(url, () => solveWafChallenge(page))
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
      strategy: activeEngine === 'cloakbrowser' ? 'cloakbrowser' : 'playwright',
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
        // 原生 <select><option> 分页：收起的 option 无法被 force click 选中（Chromium 不派发变更），
        // 改为 selectedIndex 定位后派发 input+change（AJAX 翻页站点标准事件接线）
        const isOption = await items[i].evaluate((el) => (el as HTMLElement).tagName === 'OPTION').catch(() => false)
        if (isOption) {
          await items[i].evaluate((el) => {
            const sel = (el as HTMLElement).closest('select')
            if (!sel) return
            sel.selectedIndex = (el as HTMLOptionElement).index
            sel.dispatchEvent(new Event('input', { bubbles: true }))
            sel.dispatchEvent(new Event('change', { bubbles: true }))
          })
        } else {
          // 锚点后代优先：li 类分页项 force-click 命中的是几何中心，可能落在内部 <a> 之外
          // （导航型控件点击无效，快照重复首页）；点击 <a> 既触发导航，事件又冒泡到
          // li 自身的 JS 处理器（JS 渲染型站点）——两类交互模型都覆盖
          const anchor = await items[i].$('a').catch(() => null)
          const target = anchor ?? items[i]
          await target.click({ timeout: CLICK_TIMEOUT, force: true })
        }
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

/** 验证码识别提示词（两通道共用） */
const CAPTCHA_PROMPT =
  '图片中是一个网站验证码。请准确识别其中的全部字符（可能包含数字与英文字母，注意区分大小写与易混字符如 0/O、1/l/I、6/b、8/B）。只输出识别出的验证码字符本身，不要任何解释、标点或空格。'

/** 自定义视觉识别 API 配置（OpenAI 兼容；三个环境变量齐全才启用该通道） */
interface VisionApiConf {
  baseUrl: string
  apiKey: string
  model: string
}

function getCustomVisionConf(): VisionApiConf | null {
  const baseUrl = process.env.CAPTCHA_VISION_API_BASE?.trim()
  const apiKey = process.env.CAPTCHA_VISION_API_KEY?.trim()
  const model = process.env.CAPTCHA_VISION_MODEL?.trim()
  if (!baseUrl || !apiKey || !model) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, model }
}

/**
 * OpenAI 兼容视觉识别（自定义通道）：兼容 OpenAI / 智谱 GLM-4V / 本地 Ollama(llava,qwen2-vl) 等
 * 任何实现 POST {base}/chat/completions 且支持 image_url 消息的服务端。
 */
async function recognizeViaCustomApi(pngBase64: string, conf: VisionApiConf): Promise<string> {
  const res = await fetch(`${conf.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${conf.apiKey}` },
    body: JSON.stringify({
      model: conf.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: CAPTCHA_PROMPT },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${pngBase64}` } },
          ],
        },
      ],
      max_tokens: 32,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(18_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 120)}`)
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
}

/** 识别不可用时的中文解决指引（前置动作，日志截断仍可见） */
const CAPTCHA_MANUAL_GUIDE =
  '验证码自动识别不可用。解决方式——' +
  '①(全自动·推荐) 配置任意 OpenAI 兼容视觉 API 并重启服务: CAPTCHA_VISION_API_BASE(如 https://open.bigmodel.cn/api/paas/v4) + CAPTCHA_VISION_API_KEY + CAPTCHA_VISION_MODEL(如 glm-4v-flash 免费); ' +
  '②(手动·1分钟) 本机浏览器打开目标站完成验证码 → F12 应用/网络面板复制 Cookie(如 ge_wc_20=...) → 粘贴到规则「Cookie」字段并关闭「UA 随机轮换」(通行cookie与UA绑定, 需同浏览器UA)'

/**
 * VLM 识别验证码图片，返回识别出的字符。
 * 双通道降级：z-ai 平台 SDK（沙箱/平台内可用）→ 自定义 OpenAI 兼容视觉 API
 * （CAPTCHA_VISION_* 环境变量，部署服务器无平台凭证时的自动化方案）。
 * 两通道均不可用/失败时抛出带手动过码教程的错误。
 */
export async function recognizeCaptcha(pngBuffer: Buffer): Promise<string> {
  const base64 = pngBuffer.toString('base64')
  const errors: string[] = []

  // 通道 1：z-ai 平台 SDK
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
  if (mod) {
    // VLM 调用带 25s 超时保护，避免网络异常时请求挂起；竞速结束后必须清定时器，
    // 否则成功路径下事件循环被无用的 25s 定时器拖住
    let vlmTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const zai = await mod.default.create()
      const response = await Promise.race([
        zai.chat.completions.createVision({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: CAPTCHA_PROMPT },
                // Vision API 迁移期兼容格式（2026-10 实测）：校验层要求 file 对象
                // （file_id/file_url/file_data 至少其一，缺任一报 400 code 1214），
                // 而视觉后端实际消费 image_url——单独 image_url 被校验拒绝、单独
                // file_data 校验通过但图片不会送达模型（模型回复「请上传图片」）。
                // 双字段并存为唯一可行载荷，此结论经红圆无歧义图实测确认。
                {
                  type: 'image_url',
                  image_url: { url: `data:image/png;base64,${base64}` },
                  file: { file_data: `data:image/png;base64,${base64}` },
                },
              ],
            },
          ],
          thinking: { type: 'disabled' },
        }),
        new Promise<never>((_, reject) => {
          // 18s：主流视觉模型典型响应 3～10s，25s 的长尾等待在多次重试场景下
          // 会线性放大求解总耗时（实测一次求解 209s 的主要成分）
          vlmTimer = setTimeout(() => reject(new Error('VLM 验证码识别超时')), 18_000)
        }),
      ])
      const code = (response.choices?.[0]?.message?.content ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
      if (code) return code
      errors.push('z-ai: 空回复')
    } catch (e) {
      errors.push(`z-ai: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160))
    } finally {
      if (vlmTimer) clearTimeout(vlmTimer)
    }
  } else {
    errors.push('z-ai SDK 不可用（部署环境无平台凭证，属预期）')
  }

  // 通道 2：自定义 OpenAI 兼容视觉 API（环境变量齐全才启用）
  const conf = getCustomVisionConf()
  if (conf) {
    try {
      const code = await recognizeViaCustomApi(base64, conf)
      if (code) return code
      errors.push('自定义API: 空回复')
    } catch (e) {
      errors.push(`自定义API: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160))
    }
  } else {
    errors.push('自定义API: 未配置 CAPTCHA_VISION_* 环境变量')
  }

  if (!conf) throw new Error(`${CAPTCHA_MANUAL_GUIDE}（明细: ${errors.join('；')}）`)
  throw new Error(`验证码识别失败（z-ai 与自定义视觉 API 两通道均失败）: ${errors.join('；')}`)
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
      // 截图先经放大+二值化预处理再交 VLM（与 HTTP 通道同一结论：原图识别率低）
      const code = await recognizeCaptcha(await preprocessCaptchaForVlm(Buffer.from(base64, 'base64')))
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
    } catch (e) {
      // 解题环节异常必须留痕（此前静默吞掉导致 VLM API 契约变更后解题
      // 全链路失效且无任何日志线索），warn 级不打断重试节奏；
      // slice 放宽到 400：识别不可用时的中文解决指引（含环境变量名）需完整落日志
      console.warn(
        `[waf-solve] 第 ${attempt + 1}/4 次解题异常: ${e instanceof Error ? e.message.slice(0, 400) : String(e)}`
      )
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
  /** 页面上下文内求值（ElementHandle.evaluate）：jsPages 原生 <select> 翻页派发 change 事件用 */
  evaluate: <T>(fn: (el: Element) => T) => Promise<T>
  /** 查询后代元素（ElementHandle.$）：jsPages 锚点后代优先点击用 */
  $: (sel: string) => Promise<PlaywrightElement | null>
}
interface PlaywrightPage {
  goto: (url: string, o: Record<string, unknown>) => Promise<unknown>
  waitForLoadState: (state: string, o?: Record<string, unknown>) => Promise<unknown>
  waitForTimeout: (ms: number) => Promise<void>
  content: () => Promise<string>
  url: () => string
  title: () => Promise<string>
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

/**
 * 图片魔数校验：JPEG/PNG/WebP/GIF/BMP/TIFF/SVG。
 * 背景（生产实证）：封面 URL 被 WAF 劫持或指向错误页时返回 200 + HTML，
 * 此前直接交给 sharp 报「Input buffer contains unsupported image format」——
 * 错误信息完全无法定位问题；在此处拦截并给出可行动的报错。
 */
export function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false
  // JPEG / PNG / GIF87a+89a / BMP / TIFF(II|MM)
  if (buf[0] === 0xff && buf[1] === 0xd8) return true
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true
  if (buf[0] === 0x42 && buf[1] === 0x4d) return true
  if (buf[0] === 0x49 && buf[1] === 0x49 && (buf[2] === 0x2a || buf[2] === 0x49)) return true
  if (buf[0] === 0x4d && buf[1] === 0x4d && (buf[2] === 0x00 || buf[2] === 0x2a)) return true
  // WebP: RIFF....WEBP
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return true
  // SVG：文本开头（WAF 挑战页开头是 <!DOCTYPE/<html/<form，不会命中）
  const head = buf.subarray(0, 200).toString('utf8').trimStart()
  return head.startsWith('<svg') || head.startsWith('<?xml')
}

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
  const { res } = await fetchWithRetry(url, headers, timeout, 1, Boolean(ua), cookies)
  const declaredImgLen = Number(res.headers.get('content-length') ?? 0)
  if (declaredImgLen > MAX_IMAGE_BYTES) throw new Error(`封面图片过大（content-length ${declaredImgLen}）：${url.slice(0, 120)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!res.ok || buf.length === 0) {
    throw new Error(`图片下载失败：HTTP ${res.status}（${url.slice(0, 120)}）`)
  }
  // 内容校验：HTML 响应（WAF 挑战/防盗链错误页常以 200 下发）不进 sharp，报错可定位
  const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
  const htmlLike = contentType.includes('text/html') || contentType.includes('application/json')
  if (htmlLike || !looksLikeImage(buf)) {
    throw new Error(`图片地址返回了非图片内容（可能被 WAF 拦截、防盗链或链接已失效，content-type=${contentType || '未知'}）：${url.slice(0, 120)}`)
  }
  return buf
}
