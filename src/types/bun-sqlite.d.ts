/**
 * bun:sqlite 最小类型声明：仅覆盖 instrumentation.ts 的 WAL 引导用法
 * （完整类型由 bun-runtime 提供，此处避免引入 @types/bun 全量替换 node 全局）。
 */
declare module 'bun:sqlite' {
  export interface Statement<T = Record<string, unknown>> {
    get(...params: unknown[]): T | undefined
    all(...params: unknown[]): T[]
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
  }
  export class Database {
    constructor(path?: string, options?: { readonly?: boolean; create?: boolean })
    query<T = Record<string, unknown>>(sql: string): Statement<T>
    run(sql: string): { changes: number; lastInsertRowid: number | bigint }
    close(): void
  }
}
