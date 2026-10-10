import { db } from '@/lib/db'

/**
 * 读取库内系统清洗配置原文（SystemConfig.cleaning JSON 字符串）。
 * 未保存/读取失败返回 null，由 mergeCleaning(raw) 回退默认值——
 * 管理后台「内容清洗系统」保存的配置必须真正被采集/测试引擎消费，
 * 而非仅作设置页回显（修复前 mergeCleaning 全部无参调用，配置存而不用）。
 */
export async function loadSystemCleaningRaw(): Promise<string | null> {
  try {
    const row = await db.systemConfig.findUnique({
      where: { id: 'main' },
      select: { cleaning: true },
    })
    return row?.cleaning ?? null
  } catch {
    // 表不存在/库未就绪等场景不影响采集主流程：回退默认清洗配置
    return null
  }
}

/** 采集速度档位：polite=始终完整间隔（等价旧行为）；balanced=自适应下限 0.45×；fast=下限 0.3× */
export type CollectSpeed = 'polite' | 'balanced' | 'fast'
export const COLLECT_SPEEDS: CollectSpeed[] = ['polite', 'balanced', 'fast']

/** 内存缓存（15s TTL）：节流器每次请求都会读档位，不能每次打库 */
let speedCache: { value: CollectSpeed; at: number } | null = null

/** 读取采集速度档位（带 15s 缓存；未配置/读取失败回退 balanced） */
export async function loadCollectSpeed(): Promise<CollectSpeed> {
  if (speedCache && Date.now() - speedCache.at < 15_000) return speedCache.value
  let value: CollectSpeed = 'balanced'
  try {
    const row = await db.systemConfig.findUnique({ where: { id: 'main' }, select: { collect: true } })
    const parsed = row?.collect ? (JSON.parse(row.collect) as { speed?: string }) : null
    if (parsed && COLLECT_SPEEDS.includes(parsed.speed as CollectSpeed)) {
      value = parsed.speed as CollectSpeed
    }
  } catch {
    /* 未保存/损坏/库未就绪：回退默认 */
  }
  speedCache = { value, at: Date.now() }
  return value
}

/** 设置页保存后调用：立即使档位缓存失效（下次读取即取新值，不等 15s） */
export function invalidateCollectSpeedCache(): void {
  speedCache = null
}
