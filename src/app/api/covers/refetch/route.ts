import { NextRequest } from 'next/server'
import { refetchAllCovers } from '@/lib/collect/cover'
import { isPlainObject, json, toBoolOrNull } from '../../_lib/http'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * 封面补全（维护操作）：
 * 按 coverUrl 重新下载；无源封面（源站不提供）或下载失败时生成占位封面，
 * 保证所有在库书籍最终都有本地 webp 封面。
 * body: { force?: boolean }  force=true 时跳过「本地文件完好」检查，全部重做
 */
export async function POST(req: NextRequest) {
  const denied = requireAuth(req)
  if (denied) return denied
  const body = await req.json().catch(() => null)
  const force = isPlainObject(body) ? toBoolOrNull(body.force) === true : false
  try {
    const summary = await refetchAllCovers({ force })
    return json(summary)
  } catch (e) {
    console.error('[covers/refetch 失败]', e)
    return json({ error: e instanceof Error ? e.message : '封面补全失败' }, { status: 500 })
  }
}
