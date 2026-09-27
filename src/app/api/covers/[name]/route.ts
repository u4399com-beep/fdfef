import { NextRequest } from 'next/server'
import path from 'path'
import fs from 'fs/promises'
import { COVERS_DIR } from '@/lib/collect/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ name: string }> }

/** 本地封面（webp）服务 */
export async function GET(_req: NextRequest, { params }: Ctx) {
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
