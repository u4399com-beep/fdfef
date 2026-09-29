import { NextResponse, NextRequest } from 'next/server'
import { badRequest, readJson, RULE_TYPES } from '../../_lib/http'
import { testRule } from '@/lib/collect/testing'
import type { RuleType } from '@/lib/collect-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * 规则测试：四类规则保存前即可用真实页面验证。
 * 入参 { type, config, url }；返回 { ok, message, elapsedMs, data }。
 */
export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest('请求体必须为 JSON 对象')
  const type = typeof body.type === 'string' ? body.type : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  if (!RULE_TYPES.includes(type)) {
    return badRequest('规则类型不合法（list/book/toc/content）')
  }
  if (!url) return badRequest('测试 URL 必填')
  if (typeof body.config !== 'object' || body.config === null) {
    return badRequest('规则配置必须为对象')
  }
  const result = await testRule(type as RuleType, body.config, url)
  return NextResponse.json(result)
}
