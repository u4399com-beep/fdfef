/**
 * dwxwc（大文学无错）最新更新循环采集任务种子：
 * 按 intervalMin 间隔自动创建并启动「范围采集」任务——
 *   /sort/1/{page}/ 第 1~2 页（玄幻最近更新小说列表，站方按更新时间倒序）→ 增量模式
 *   已在库书籍只补新章节，新书全量采集；规则 id 从库内按名称解析（不硬编码 cuid）。
 * 用法：bun tests/register-dwxwc-schedule.ts [间隔分钟]（默认 120，最短 5）
 */
import { db } from '../src/lib/db'

const INTERVAL_MIN = Math.max(5, Number.parseInt(process.argv[2] ?? '120', 10) || 120)

const RULE_NAMES = [
  ['list', '大文学无错-列表页'],
  ['book', '大文学无错-书籍信息页'],
  ['toc', '大文学无错-章节目录页'],
  ['content', '大文学无错-章节内容页'],
] as const

const SCHEDULE_NAME = 'dwxwc最新更新循环采集'

async function main() {
  const ids: Record<string, string | null> = {}
  for (const [type, name] of RULE_NAMES) {
    const rule = await db.collectRule.findFirst({ where: { name, type } })
    ids[type] = rule?.id ?? null
    if (!rule) console.warn(`⚠️ 未找到规则「${name}」，对应字段留空`)
  }

  const template = {
    targetType: 'range',
    listRuleId: ids.list,
    bookRuleId: ids.book,
    tocRuleId: ids.toc,
    contentRuleId: ids.content,
    targetUrls: [],
    urlTemplate: 'https://www.dwxwc.com/sort/1/{page}/',
    pageStart: 1,
    pageEnd: 2,
    mode: 'incremental',
    storageMode: 'db',
    threadMin: 1,
    threadMax: 2,
    intervalMin: 1500,
    intervalMax: 3000,
  }

  const existing = await db.collectSchedule.findFirst({ where: { name: SCHEDULE_NAME } })
  if (existing) {
    // 幂等更新：间隔/模板以脚本为准；enabled/lastRun* 保留运行现场
    await db.collectSchedule.update({
      where: { id: existing.id },
      data: { intervalMin: INTERVAL_MIN, taskTemplate: JSON.stringify(template) },
    })
    console.log(`updated schedule: ${SCHEDULE_NAME} (${existing.id}) interval=${INTERVAL_MIN}min`)
  } else {
    // lastRunAt=now：首次触发在部署后一个间隔，避免服务一启动就开跑（可 UI 手动「立即执行」）
    const created = await db.collectSchedule.create({
      data: {
        name: SCHEDULE_NAME,
        enabled: true,
        intervalMin: INTERVAL_MIN,
        taskTemplate: JSON.stringify(template),
        lastRunAt: new Date(),
      },
    })
    console.log(`created schedule: ${SCHEDULE_NAME} (${created.id}) interval=${INTERVAL_MIN}min`)
  }
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
