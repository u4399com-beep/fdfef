/** 逐条验证 kelexs 四类规则（走系统测试 API） */
const BASE = 'http://localhost:3000'
const TESTS = [
  { type: 'list', url: 'https://www.kelexs.com/list-1/' },
  { type: 'book', url: 'https://www.kelexs.com/book/G0AIH0.html' },
  { type: 'toc', url: 'https://www.kelexs.com/chapter/G0AIH0.html' },
  { type: 'content', url: 'https://www.kelexs.com/book/G0AIH0-1.html' },
]

const rules = (await (await fetch(`${BASE}/api/rules`)).json()) as { rules: { id: string; name: string; type: string; config: string }[] }

for (const t of TESTS) {
  const rule = rules.rules.find((r) => r.type === t.type && r.name.includes('可乐小说'))
  if (!rule) { console.log(`[${t.type}] 规则未找到!`); continue }
  const res = await fetch(`${BASE}/api/rules/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: t.type, config: JSON.parse(rule.config), url: t.url }),
  })
  const out = (await res.json()) as { ok: boolean; message: string; data?: Record<string, unknown> }
  console.log(`\n[${t.type}] ${out.ok ? '✓' : '✗'} ${out.message}`)
  if (t.type === 'list' && out.data) {
    const sample = out.data.sample as { title: string; url: string }[]
    console.log('  样本:', sample?.slice(0, 3).map((s) => `${s.title} → ${s.url}`).join(' | '))
    console.log('  nextUrl:', out.data.nextUrl)
  }
  if (t.type === 'book' && out.data) {
    console.log('  fields:', JSON.stringify(out.data.fields, null, 0).slice(0, 400))
    console.log('  smart:', JSON.stringify(out.data.smartCategory), '|', JSON.stringify(out.data.smartCompletion))
  }
  if (t.type === 'toc' && out.data) {
    const sample = out.data.sample as { title: string; url: string }[]
    console.log('  pages:', out.data.pagesFetched, '| total:', out.data.total, '| dupRemoved:', out.data.dupRemoved, '| scrambled:', out.data.scrambled)
    console.log('  头3章:', sample?.slice(0, 3).map((s) => s.title).join(' | '))
    console.log('  尾3章:', (out.data.tail as { title: string }[])?.map((s) => s.title).join(' | '))
  }
  if (t.type === 'content' && out.data) {
    console.log('  pages:', out.data.pagesFetched, '| wordCount:', out.data.wordCount)
    console.log('  preview:', String(out.data.preview).slice(0, 120).replace(/\n/g, ' '))
  }
}

export {}
