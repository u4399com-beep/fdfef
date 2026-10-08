/**
 * 全库规则实盘验证：逐一测试在库采集规则能否在目标站真实抓通。
 * 链路：列表 → 书籍 → 目录 → 正文（用上一环解析出的真实 URL 驱动下一环）。
 * 用法：bun tests/verify-all-rules.ts [siteName ...]
 */
import { PrismaClient } from '@prisma/client'
import { testRule } from '../src/lib/collect/testing'

const db = new PrismaClient({ log: ['warn', 'error'] })

interface SitePlan {
  /** 规则名前缀（分组键） */
  prefix: string
  label: string
  /** 列表页/首页测试地址 */
  listUrl: string
  /** 跳过某环（如演示站无列表） */
  skip?: Array<'list' | 'book' | 'toc' | 'content'>
}

const PLANS: SitePlan[] = [
  { prefix: '演示', label: '演示(mock)', listUrl: 'http://localhost:3031/list/1.html' },
  { prefix: '可乐小说', label: '可乐小说 kelexs', listUrl: 'https://www.kelexs.com/list-1/' },
  { prefix: '存书啦', label: '存书啦 cunshu', listUrl: 'https://www.cunshu.la/library.php?sort=latest&page=1' },
  { prefix: '人气完本', label: '人气完本 rqwb', listUrl: 'https://www.rqwb.com/' },
  { prefix: '笔趣阁biqutu', label: '笔趣阁 biqutu(镜像bqgbe)', listUrl: 'https://www.bqgbe.com/fenlei/1/1.html' },
  { prefix: '大文学无错', label: '大文学无错 dwxwc', listUrl: 'https://www.dwxwc.com/sort/1/1/' },
  { prefix: '101看書', label: '101看書 101kks', listUrl: 'https://101kks.com/novels/class' },
]

async function pickFirstUrl(type: string, data: Record<string, unknown> | undefined): Promise<string> {
  if (!data) return ''
  if (type === 'list') {
    const sample = data.sample as { url?: string }[] | undefined
    return sample?.find((s) => s.url)?.url ?? ''
  }
  if (type === 'toc') {
    const sample = data.sample as { url?: string }[] | undefined
    return sample?.find((s) => s.url)?.url ?? ''
  }
  return ''
}

async function verifySite(plan: SitePlan): Promise<{ ok: boolean; detail: string }> {
  const rules = await db.collectRule.findMany({ where: { name: { startsWith: plan.prefix } } })
  if (rules.length === 0) return { ok: false, detail: '未找到规则' }
  const byType = new Map(rules.map((r) => [r.type, r]))
  const steps: Array<'list' | 'book' | 'toc' | 'content'> = ['list', 'book', 'toc', 'content']
  let bookUrl = ''
  let chapterUrl = ''
  const summary: string[] = []

  for (const step of steps) {
    const rule = byType.get(step)
    if (!rule) {
      summary.push(`${step}:缺规则`)
      continue
    }
    let url = plan.listUrl
    if (step === 'book' || step === 'toc') url = bookUrl || plan.listUrl
    if (step === 'content') url = chapterUrl
    if (!url) {
      summary.push(`${step}:跳过(无URL)`)
      continue
    }
    // 环节间停顿：同一站点的 list→book→toc→content 连环请求放缓节奏
    if (summary.length > 0) await new Promise((r) => setTimeout(r, 2000))
    const res = await testRule(step as 'list' | 'book' | 'toc' | 'content', JSON.parse(rule.config), url)
    if (!res.ok) {
      return { ok: false, detail: `${summary.join(' → ')} → ${step}:❌ ${res.message.slice(0, 120)}` }
    }
    const d = res.data as Record<string, unknown>
    const usedStrategy = typeof d?.strategy === 'string' ? d.strategy : ''
    if (step === 'list') {
      const total = d?.total as number
      summary.push(`list:${total}项${usedStrategy ? `[${usedStrategy}]` : ''}`)
      bookUrl = await pickFirstUrl('list', d)
    } else if (step === 'book') {
      const f = d?.fields as Record<string, string>
      summary.push(`book:《${(f?.书名 ?? '').slice(0, 18)}》${usedStrategy ? `[${usedStrategy}]` : ''}`)
      bookUrl = (d?.tocUrl as string) || (d?.finalUrl as string) || bookUrl
    } else if (step === 'toc') {
      summary.push(`toc:${d?.total}章/去重${d?.dupRemoved}${usedStrategy ? `[${usedStrategy}]` : ''}`)
      chapterUrl = await pickFirstUrl('toc', d)
    } else if (step === 'content') {
      summary.push(`content:${d?.wordCount}字/${d?.pagesFetched}页${usedStrategy ? `[${usedStrategy}]` : ''}`)
    }
  }
  return { ok: true, detail: summary.join(' → ') }
}

async function main() {
  const only = process.argv.slice(2)
  console.log('=== 全库采集规则实盘验证 ===\n')
  let pass = 0
  let fail = 0
  for (const plan of PLANS) {
    if (only.length && !only.some((o) => plan.label.includes(o) || plan.prefix.includes(o))) continue
    // 站点间停顿：连续验证多站时避免高频请求触发 WAF（验证脚本自身也要做“礼貌爬虫”）
    if (pass + fail > 0) await new Promise((r) => setTimeout(r, 5000))
    process.stdout.write(`${plan.label.padEnd(30)} `)
    try {
      const r = await verifySite(plan)
      if (r.ok) {
        pass++
        console.log(`✅ ${r.detail}`)
      } else {
        fail++
        console.log(`❌ ${r.detail}`)
      }
    } catch (e) {
      fail++
      console.log(`❌ 异常: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`)
    }
  }
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
  await db.$disconnect()
  if (fail > 0) process.exit(1)
}
void main()
