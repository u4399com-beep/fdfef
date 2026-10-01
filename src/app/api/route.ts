import { json } from './_lib/http'

/** 系统 API 根：健康检查 */
export async function GET() {
  return json({ ok: true, name: 'novel-manager-api', time: new Date().toISOString() })
}
