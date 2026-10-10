/** kelexs 3 本书最终采集任务：超宽松限频 + 增量智能补采 */
const BASE = 'http://localhost:3000'
const rules = (await (await fetch(`${BASE}/api/rules`)).json()) as { rules: { id: string; name: string; type: string }[] }
const rid = (type: string) => rules.rules.find((r) => r.type === type && r.name.includes('可乐小说'))?.id

const taskRes = await fetch(`${BASE}/api/tasks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: '可乐小说-三本增量补采',
    targetType: 'single',
    bookRuleId: rid('book'),
    tocRuleId: rid('toc'),
    contentRuleId: rid('content'),
    listRuleId: rid('list'),
    targetUrls: [
      'https://www.kelexs.com/book/B0FDJBG.html',
      'https://www.kelexs.com/book/B0AAAAI.html',
      'https://www.kelexs.com/book/B00JIGK.html',
    ],
    mode: 'incremental',
    storageMode: 'db',
    threadMin: 1,
    threadMax: 1,
    intervalMin: 20000,
    intervalMax: 40000,
  }),
})
const { task } = (await taskRes.json()) as { task?: { id: string }; error?: string }
if (!task) { console.error('任务创建失败'); process.exit(1) }
console.log('任务已创建:', task.id)
const ctl = await fetch(`${BASE}/api/tasks/${task.id}/control`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'start' }),
})
console.log('启动:', ctl.status, await ctl.text())
