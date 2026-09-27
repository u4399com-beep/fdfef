import { NextResponse } from 'next/server'

/** 系统 API 根：健康检查 */
export async function GET() {
  return NextResponse.json({ ok: true, name: 'novel-manager-api', time: new Date().toISOString() })
}
