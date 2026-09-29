import { NextResponse } from 'next/server'

// ============================================================
// API 路由共享输入校验助手（_lib 为 Next 私有目录，不参与路由）
// 目标：把恶意/畸形输入从 Prisma 500 变为 400，堵 NaN/Infinity 注入
// ============================================================

/** 安全解析 JSON body：非法 JSON / 非对象 body 返回 null（调用方统一 400，避免裸 500） */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await req.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

/** 400 统一响应 */
export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * 安全整数解析：NaN/Infinity/非数字回退默认值，并夹取 [min, max]。
 * 防 `Number('abc')=NaN` / `Number('1e999')=Infinity` 直达 Prisma Int 字段导致 500。
 */
export function toInt(value: unknown, fallback: number, min: number, max: number = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** 仅接受真正面值的 boolean（防 Prisma Boolean 字段收到字符串/数字后 500） */
export function toBoolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}
