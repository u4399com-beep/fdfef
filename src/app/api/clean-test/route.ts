import { NextRequest } from 'next/server'
import { cleanContent } from '@/lib/collect/cleaner'
import { mergeCleaning } from '@/lib/collect-types'
import { json, badRequest, isPlainObject, readJson } from '../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 清洗测试：输入 HTML → 输出清洗结果 */
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  if (typeof body.html !== 'string') return badRequest('html 必须为字符串')
  const html = body.html
  if (!html.trim()) return json({ ok: false, message: '请输入待清洗的 HTML' }, { status: 400 })
  // 清洗为逐行×多条正则的同步 CPU 处理，超长输入（如恶意超大 body）会长时间占死事件循环；
  // 正常章节/整页 HTML 远小于该上限（一章 ≈10KB），5M 字符为宽裕兜底
  if (html.length > 5_000_000) return badRequest('html 过长（上限 5,000,000 字符）')

  const base = mergeCleaning()
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
