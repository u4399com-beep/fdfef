import { NextRequest, NextResponse } from 'next/server'
import { cleanContent } from '@/lib/collect/cleaner'
import { mergeCleaning } from '@/lib/collect-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 清洗测试：输入 HTML → 输出清洗结果 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { html?: string; cleaning?: unknown; extraPatterns?: string[] }
  const html = body.html ?? ''
  if (!html.trim()) return NextResponse.json({ ok: false, message: '请输入待清洗的 HTML' }, { status: 400 })
  const base = mergeCleaning()
  const cfg = body.cleaning ? { ...base, ...(body.cleaning as object) } : base
  const result = cleanContent(html, cfg, body.extraPatterns ?? [])
  return NextResponse.json({ ok: true, ...result })
}
