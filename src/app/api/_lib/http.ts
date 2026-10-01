import { NextResponse } from 'next/server'

// ============================================================
// API 路由共享助手（_lib 为 Next 私有目录，不参与路由）
// 目标：把恶意/畸形输入从 Prisma 500 变为 400，堵 NaN/Infinity 注入；
// 并收敛各路由重复的分页解析 / 字段归一 / 类型守卫 / 公共常量
// ============================================================

/** 动态路由段上下文（Next 16：params 为 Promise） */
export type RouteCtx<T extends Record<string, string>> = { params: Promise<T> }

/**
 * JSON body 全局上限（字节）。规则/配置/设置类请求均为 KB 级；
 * 上限由 clean-test 的合法最大值决定：5,000,000 字符 × UTF-8 最多 4 字节/字符 ≈ 20MB，
 * 取 24MB 兼容之，同时保持有界（防超大 body 占用内存与 JSON 解析 CPU）。
 */
const MAX_BODY_BYTES = 24 * 1024 * 1024

/** 安全解析 JSON body：非法 JSON / 非对象 body / 超大 body 返回 null（调用方统一 400，避免裸 500） */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const len = Number(req.headers.get('content-length') ?? 0)
    if (len > MAX_BODY_BYTES) return null
    const data: unknown = await req.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

/** 400 统一响应 */
export function badRequest(message: string) {
  return json({ error: message }, { status: 400 })
}

/**
 * Prisma 写操作错误 → HTTP 语义映射：P2025（记录不存在）→ 404，其余 → 500 留痕。
 * 修复前 catch 全量归 404，非「不存在」类失败（连接/约束/序列化）会被误报且无日志可查。
 */
export function prismaErrorToResponse(entity: string, e: unknown) {
  if (e instanceof Error && 'code' in e && (e as { code?: string }).code === 'P2025') {
    return json({ error: `${entity}不存在` }, { status: 404 })
  }
  console.error(`[${entity} 写操作失败]`, e)
  return json({ error: `${entity}操作失败，请稍后重试` }, { status: 500 })
}

/**
 * JSON 统一响应：显式 no-store。
 * 实测（curl -D -）动态路由不回任何 Cache-Control 头——预览数据源/统计/任务列表等
 * 轮询型 GET 可能被浏览器或中间层按启发式缓存，拿到陈旧数据；统一显式禁缓存。
 * （covers/download 等文件型响应自带缓存语义，不走此助手）
 */
export function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(data, { ...init, headers })
}

/**
 * 安全整数解析：NaN/Infinity/非数字回退默认值，并夹取 [min, max]。
 * 防 `Number('abc')=NaN` / `Number('1e999')=Infinity` 直达 Prisma Int 字段导致 500。
 */
export function toInt(value: unknown, fallback: number, min: number, max: number = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** 仅接受真正面值的 boolean（防 Prisma Boolean 字段收到字符串/数字后 500） */
export function toBoolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** 归一外键 id：非空字符串原样返回，其余一律 null（listRuleId 等四类规则 id 共用） */
export function strId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** 归一字符串数组：仅保留字符串项，非数组输入回退空数组（targetUrls 等共用） */
export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((u): u is string => typeof u === 'string') : []
}

/** 仅接受纯对象：防字符串/数组/数字被展开污染配置（clean-test / settings 共用） */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ---- 共享枚举常量（与 prisma/schema.prisma 字段取值一致）----

export const STORAGE_MODES = ['db', 'txt', 'both']

export const RULE_TYPES = ['list', 'book', 'toc', 'content']

/** 任务活动态（running/paused）：stale 检测、禁止编辑/删除、start 冲突判断共用 */
export const ACTIVE_TASK_STATUSES = ['running', 'paused']

/** 列表/章节通用分页参数解析：page≥1、pageSize 夹取 [min,max]，附计算好的 skip */
export function parsePagination(
  sp: URLSearchParams,
  defaultPageSize: number,
  minPageSize: number,
  maxPageSize: number
): { page: number; pageSize: number; skip: number } {
  const page = toInt(sp.get('page'), 1, 1)
  const pageSize = toInt(sp.get('pageSize'), defaultPageSize, minPageSize, maxPageSize)
  return { page, pageSize, skip: (page - 1) * pageSize }
}

/** 章节正文统一读取：db 优先，空则回退本地 txt（读取失败返回空串；与 chapters/preview 两路由原逻辑一致） */
export async function chapterContentText(c: { content: string; contentLocal: string }): Promise<string> {
  if (!c.content && c.contentLocal) {
    const { readChapterTxt } = await import('@/lib/collect/storage')
    return readChapterTxt(c.contentLocal).catch(() => '')
  }
  return c.content
}

// R8-a: json() 响应助手统一注入 Cache-Control: no-store
