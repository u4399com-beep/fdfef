/**
 * 采集任务参数规范化：POST /api/tasks（手动建任务）与循环任务模板（CollectSchedule.taskTemplate）
 * 共用同一套校验/夹取逻辑，保证「UI 手动创建」与「调度器自动创建」产出完全同构的 CollectTask，
 * 消除两处内联校验漂移。
 */
import { Prisma } from '@prisma/client'

export const STORAGE_MODES = ['db', 'txt', 'both'] as const
export type StorageMode = (typeof STORAGE_MODES)[number]

export interface NormalizedTaskData {
  name: string
  targetType: 'single' | 'range'
  listRuleId: string | null
  bookRuleId: string | null
  tocRuleId: string | null
  contentRuleId: string | null
  targetUrls: string[]
  urlTemplate: string
  pageStart: number
  pageEnd: number
  mode: 'full' | 'incremental'
  storageMode: StorageMode
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
}

export type NormalizeResult = { ok: true; data: NormalizedTaskData } | { ok: false; error: string }

function toInt(value: unknown, fallback: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function strId(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s || null
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 500)
}

/**
 * 规范化任务参数。name 为空时使用 defaultName（循环任务模板场景）；
 * 两者皆空 → error。targetUrls/urlTemplate 按 targetType 归一：另一形态清空。
 */
export function normalizeTaskInput(
  body: Record<string, unknown>,
  opts?: { defaultName?: string }
): NormalizeResult {
  const name = String(body.name ?? '').trim() || String(opts?.defaultName ?? '').trim()
  if (!name) return { ok: false, error: '任务名称必填' }

  const targetType = body.targetType === 'range' ? 'range' : 'single'
  const pStart = toInt(body.pageStart, 1, 1, 1_000_000)
  const pEnd = toInt(body.pageEnd, 1, 1, 1_000_000)
  const tMin = toInt(body.threadMin, 1, 1, 32)
  const tMax = toInt(body.threadMax, 3, 1, 32)
  const iMin = toInt(body.intervalMin, 500, 0, 600_000)
  const iMax = toInt(body.intervalMax, 2000, 0, 600_000)
  const storage = String(body.storageMode ?? 'db')

  return {
    ok: true,
    data: {
      name,
      targetType,
      listRuleId: strId(body.listRuleId),
      bookRuleId: strId(body.bookRuleId),
      tocRuleId: strId(body.tocRuleId),
      contentRuleId: strId(body.contentRuleId),
      targetUrls: targetType === 'single' ? stringArray(body.targetUrls) : [],
      urlTemplate: targetType === 'range' ? String(body.urlTemplate ?? '') : '',
      pageStart: Math.min(pStart, pEnd),
      pageEnd: Math.max(pStart, pEnd),
      mode: body.mode === 'full' ? 'full' : 'incremental',
      storageMode: (STORAGE_MODES as readonly string[]).includes(storage) ? (storage as StorageMode) : 'db',
      threadMin: Math.min(tMin, tMax),
      threadMax: Math.max(tMin, tMax),
      intervalMin: Math.min(iMin, iMax),
      intervalMax: Math.max(iMin, iMax),
    },
  }
}

/** 循环任务模板入库形态：规范化结果去掉 name（调度触发时按「调度名 + 时间戳」自动生成） */
export function taskTemplateToStore(data: NormalizedTaskData): string {
  const { name: _name, ...rest } = data
  return JSON.stringify(rest)
}

/** 从已存在的 CollectTask 行构造循环任务模板体（UI「从现有任务创建循环」用） */
export function taskRowToTemplate(task: {
  targetType: string
  listRuleId: string | null
  bookRuleId: string | null
  tocRuleId: string | null
  contentRuleId: string | null
  targetUrls: string
  urlTemplate: string
  pageStart: number
  pageEnd: number
  mode: string
  storageMode: string
  threadMin: number
  threadMax: number
  intervalMin: number
  intervalMax: number
}): Record<string, unknown> {
  let urls: unknown = []
  try {
    urls = JSON.parse(task.targetUrls || '[]')
  } catch {
    urls = []
  }
  return {
    targetType: task.targetType,
    listRuleId: task.listRuleId,
    bookRuleId: task.bookRuleId,
    tocRuleId: task.tocRuleId,
    contentRuleId: task.contentRuleId,
    targetUrls: urls,
    urlTemplate: task.urlTemplate,
    pageStart: task.pageStart,
    pageEnd: task.pageEnd,
    mode: task.mode,
    storageMode: task.storageMode,
    threadMin: task.threadMin,
    threadMax: task.threadMax,
    intervalMin: task.intervalMin,
    intervalMax: task.intervalMax,
  }
}

/** Prisma CollectTaskCreateInput 构造（routes 共用） */
export function taskCreateData(data: NormalizedTaskData): Prisma.CollectTaskCreateInput {
  return {
    name: data.name,
    targetType: data.targetType,
    listRuleId: data.listRuleId ?? undefined,
    bookRuleId: data.bookRuleId ?? undefined,
    tocRuleId: data.tocRuleId ?? undefined,
    contentRuleId: data.contentRuleId ?? undefined,
    targetUrls: JSON.stringify(data.targetUrls),
    urlTemplate: data.urlTemplate,
    pageStart: data.pageStart,
    pageEnd: data.pageEnd,
    mode: data.mode,
    storageMode: data.storageMode,
    threadMin: data.threadMin,
    threadMax: data.threadMax,
    intervalMin: data.intervalMin,
    intervalMax: data.intervalMax,
  }
}
