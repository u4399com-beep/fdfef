import { NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { COVERS_DIR } from '@/lib/collect/storage'
import { RouteCtx } from '../../_lib/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** 本地封面（webp）服务 */
export async function GET(_req: NextRequest, { params }: RouteCtx<{ name: string }>) {
  const { name } = await params
  if (!/^[\w-]+\.webp$/.test(name)) {
    return new Response('Bad request', { status: 400 })
  }
  try {
    const buf = await fs.readFile(path.join(COVERS_DIR, name))
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400' },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
