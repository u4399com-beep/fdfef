import { NextRequest } from 'next/server'
import { cleanContent } from '@/lib/collect/cleaner'
import { mergeCleaning } from '@/lib/collect-types'
import { loadSystemCleaningRaw } from '@/lib/collect/system-config'
import { json, badRequest, isPlainObject, readJson } from '../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 清洗测试：输入 HTML → 输出清洗结果 */
export async function POST(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  if (typeof body.html !== 'string') return badRequest('html 必须为字符串')
  const html = body.html
  if (!html.trim()) return json({ ok: false, message: '请输入待清洗的 HTML' }, { status: 400 })
  // 清洗为逐行×多条正则的同步 CPU 处理，超长输入会长时间占死事件循环（实测多行大文本
  // 每百万字符可达数十秒且全程阻塞其他请求）；正常章节/整页 HTML ≈10~30KB，
  // 1M 字符仍为其 30~100 倍宽裕兜底（R8 曾实测 5M 上限下合法极端输入可阻塞 99s，故收紧）
  if (html.length > 1_000_000) return badRequest('html 过长（上限 1,000,000 字符）')

  const base = mergeCleaning(await loadSystemCleaningRaw())
  // 仅接受纯对象覆盖，防字符串/数组/数字混入后被展开污染配置（同形于 headers [object Object] 类 bug）
  const override = isPlainObject(body.cleaning) ? body.cleaning : {}
  const cfg = { ...base, ...override } as typeof base
  // cleanContent 内部对这两个字段做展开/迭代，非数组会导致 500，回退默认值
  if (!Array.isArray(cfg.adPatterns)) cfg.adPatterns = base.adPatterns
  if (!Array.isArray(cfg.removeTags)) cfg.removeTags = base.removeTags
  // 附加正则仅接受字符串数组（cleanContent 内部 safeRegex 会过滤非法正则，不抛错）
  const extraPatterns = Array.isArray(body.extraPatterns)
    ? body.extraPatterns.filter((p): p is string => typeof p === 'string')
    : []

  try {
    const result = cleanContent(html, cfg, extraPatterns)
    return json({ ok: true, ...result })
  } catch (e) {
    return json(
      { ok: false, message: `清洗失败：${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    )
  }
}
