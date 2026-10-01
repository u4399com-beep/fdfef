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
