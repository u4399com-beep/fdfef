/**
 * 自适应巡航节流仿真：不发起网络请求，直接驱动 DomainThrottle 验证——
 * ① 全间隔起步 ② 连续干净响应逐档提速（受档位下限约束）
 * ③ 挑战/失败立即回满 ④ polite 档等价旧版行为 ⑤ 同域 FIFO 链语义不变。
 * 用法：bun tests/sim-throttle-pacing.ts
 */
import { domainThrottle, applyCollectSpeed } from '../src/lib/collect/fetcher'

const HOST = 'http://sim-throttle.test/page1.html'

async function measureGap(tag: string, gapCfg: number): Promise<number> {
  const t0 = Date.now()
  await domainThrottle.wait(HOST, gapCfg)
  const dt = Date.now() - t0
  console.log(`${tag}: wait=${dt}ms`)
  return dt
}

async function main() {
  console.log('== ① 起步 = 完整间隔（balanced 档）==')
  applyCollectSpeed('balanced')
  await measureGap('首请求(域空闲零等待)', 1000)
  const g1 = await measureGap('第2请求', 1000)
  const g2 = await measureGap('第3请求', 1000)
  if (g1 < 900 || g2 < 900) throw new Error(`起步应为完整间隔: g1=${g1} g2=${g2}`)

  console.log('== ② 连续干净响应 → 逐档降间隔 ==')
  for (let i = 1; i <= 8; i++) {
    domainThrottle.reportOutcome(HOST, true)
    if (i % 2 === 0) {
      const g = await measureGap(`成功×${i} 后`, 1000)
      console.log(`   期望 ≤ ${1000 * (1 - 0.15 * (i / 2)) + 60}`)
      if (g > 1000 * (1 - 0.15 * (i / 2)) + 60) throw new Error(`巡航未降档: ${g}`)
    }
  }
  const gFloor = await measureGap('到达下限后', 1000)
  if (gFloor > 470) throw new Error(`balanced 下限应≈450ms: ${gFloor}`)

  console.log('== ③ 失败 → 立即回满 ==')
  domainThrottle.reportOutcome(HOST, false)
  const gReset = await measureGap('失败后首请求', 1000)
  if (gReset < 900) throw new Error(`失败应回满间隔: ${gReset}`)

  console.log('== ④ polite 档 = 旧版行为（不提速）==')
  applyCollectSpeed('polite')
  for (let i = 0; i < 6; i++) domainThrottle.reportOutcome(HOST, true)
  const gPolite = await measureGap('polite 多次成功后', 1000)
  if (gPolite < 900) throw new Error(`polite 不应降档: ${gPolite}`)

  console.log('== ⑤ fast 档下限 300ms（1.0→0.3 需 5 档=10 次成功）==')
  applyCollectSpeed('fast')
  for (let i = 0; i < 12; i++) domainThrottle.reportOutcome(HOST, true)
  const gFast = await measureGap('fast 下限', 1000)
  if (gFast > 360) throw new Error(`fast 下限应≈300ms: ${gFast}`)

  console.log('\n全部断言通过 ✅')
  process.exit(0)
}

void main()
