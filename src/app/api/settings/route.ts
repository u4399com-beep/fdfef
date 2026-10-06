import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { DEFAULT_DOWNLOAD, mergeCleaning } from '@/lib/collect-types'
import { json, badRequest, isPlainObject, readJson } from '../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 读取系统配置（清洗规则 + 下载注入）。清洗配置经 mergeCleaning 收敛：
 * 存量库中旧版配置缺新增字段（如启发式开关）时补默认值，UI 开关不会收到 undefined */
export async function GET(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const row = await db.systemConfig.findUnique({ where: { id: 'main' } })
  let download = { ...DEFAULT_DOWNLOAD }
  try {
    if (row?.download) download = { ...download, ...JSON.parse(row.download) }
  } catch { /* keep defaults */ }
  return json({ cleaning: mergeCleaning(row?.cleaning), download })
}

/** 保存系统配置 */
export async function PUT(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  // 仅接受纯对象：防字符串/数组/数字被 JSON.stringify 后展开污染配置（数字/字符串 spread 出索引键）
  if (body.cleaning !== undefined && !isPlainObject(body.cleaning)) {
    return badRequest('cleaning 必须为对象')
  }
  if (body.download !== undefined && !isPlainObject(body.download)) {
    return badRequest('download 必须为对象')
  }
  const data = {
    ...(body.cleaning !== undefined ? { cleaning: JSON.stringify(body.cleaning) } : {}),
    ...(body.download !== undefined ? { download: JSON.stringify(body.download) } : {}),
  }
  if (Object.keys(data).length === 0) return badRequest('请提供 cleaning 或 download 配置')
  await db.systemConfig.upsert({
    where: { id: 'main' },
    create: { id: 'main', ...data },
    update: data,
  })
  return json({ ok: true })
}
