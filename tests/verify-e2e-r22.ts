/**
 * R22 E2E 回归：字段级噪声清洗全字段覆盖（清洗对正常数据零破坏 + 脏数据清洗生效）
 * 节流提速部分由 754f27f 的 sim-throttle-pacing / bench-collect-speed 基准覆盖，此处仅冒烟。
 * 运行：bun tests/verify-e2e-r22.ts
 */
import { testRule } from '../src/lib/collect/testing'
import { fetchPage } from '../src/lib/collect/fetcher'
import { PrismaClient } from '@prisma/client'

const MOCK = 'http://localhost:3031'
let pass = 0, fail = 0
function ok(label: string, cond: boolean, detail = ''): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? `（${detail}）` : ''}`) }
}

async function main() {
  const db = new PrismaClient({ log: ['warn', 'error'] })
  const rules = await db.collectRule.findMany()
  const byType = (t: string) => rules.find((r) => r.type === t)

  console.log('— ① 规则测试全链路（演示站，字段清洗后数据干净）—')
  const rList = await testRule('list', JSON.parse(byType('list')!.config), `${MOCK}/list/1.html`)
  ok('list 解析成功', rList.ok, rList.message)
  ok('list 条目数>0', ((rList.data as Record<string, unknown>)?.total as number ?? 0) > 0)

  const rBook = await testRule('book', JSON.parse(byType('book')!.config), `${MOCK}/book/1.html`)
  ok('book 解析成功', rBook.ok, rBook.message)
  const fields = (rBook.data as Record<string, unknown>)?.fields as Record<string, string>
  ok('书名非空', (fields?.书名 ?? '').length > 0)
  ok('书名无 URL/推广残留', !/https?:|www\.|笔趣阁|无弹窗/.test(fields?.书名 ?? ''))

  const rToc = await testRule('toc', JSON.parse(byType('toc')!.config), `${MOCK}/toc/1.html`)
  ok('toc 解析成功', rToc.ok, rToc.message)
  const sample = ((rToc.data as Record<string, unknown>)?.sample as { title: string }[]) ?? []
  const dirty = sample.find((s) => /_笔趣阁|无弹窗|\(\d+\/\d+\)/.test(s.title))
  ok('目录标题样本无推广残留', !dirty, dirty ? JSON.stringify(dirty) : '')

  const rContent = await testRule('content', JSON.parse(byType('content')!.config), `${MOCK}/chapter/1/1.html`)
  ok('content 解析成功', rContent.ok, rContent.message)
  ok('content 字数>100', ((rContent.data as Record<string, unknown>)?.wordCount as number ?? 0) > 100)

  console.log('— ② 连抓冒烟（自适应巡航下零错误）—')
  let errors = 0
  for (let i = 0; i < 12; i++) {
    try { await fetchPage(`${MOCK}/chapter/1/1.html`) } catch { errors++ }
  }
  ok(`连抓 12 次零错误（错误 ${errors}）`, errors === 0)

  await db.$disconnect()
  console.log(`\nE2E 结果：${pass} 通过，${fail} 失败`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error('E2E 异常:', e); process.exit(1) })
