import { NextRequest } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { db } from '@/lib/db'
import { DEFAULT_DOWNLOAD, mergeCleaning } from '@/lib/collect-types'
import { json, badRequest, isPlainObject, readJson } from '../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 只读运行时引擎状态（反反爬面板展示用）：不触发下载/安装，仅探测 env 与本地文件存在性 */
function engineStatus() {
  const pkg = (p: string) => fs.existsSync(path.join(process.cwd(), 'node_modules', p))
  const engineEnv = (process.env.BROWSER_ENGINE ?? '').trim().toLowerCase()
  const browserEngine =
    engineEnv === 'cloakbrowser' || engineEnv === 'cloak'
      ? 'cloakbrowser'
      : engineEnv
        ? 'playwright'
        : process.env.CLOAKBROWSER_LICENSE_KEY || process.env.CLOAKBROWSER_BINARY_PATH
          ? 'cloakbrowser'
          : 'playwright'
  return {
    browserEngine,
    playwrightInstalled: pkg('playwright') || pkg('playwright-core'),
    cloakbrowserInstalled: pkg('cloakbrowser'),
    hyperbrowserConfigured: Boolean((process.env.HYPERBROWSER_API_KEY ?? '').trim()),
    iv8Configured: Boolean((process.env.IV8_COMMAND ?? '').trim() || (process.env.IV8_ENABLED ?? '').trim() === '1'),
    iv8SolverPresent: fs.existsSync(path.join(process.cwd(), 'scripts', 'iv8-solver.py')),
    captchaVisionConfigured: Boolean(
      (process.env.CAPTCHA_VISION_API_BASE ?? '').trim() && (process.env.CAPTCHA_VISION_API_KEY ?? '').trim(),
    ),
  }
}

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
  return json({ cleaning: mergeCleaning(row?.cleaning), download, engines: engineStatus() })
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
