/** 对指定名称的规则跑真实 URL 测试（走 /api/rules/test 全链路） */
const BASE = 'http://localhost:3000'

const TESTS: { rule: string; url: string }[] = [
  { rule: '存书啦-列表页', url: 'https://www.cunshu.la/library.php?sort=latest&page=1' },
  { rule: '存书啦-书籍信息页', url: 'https://www.cunshu.la/read/NDU0ODN8YzFhODkzOGVkNmM4' },
  { rule: '存书啦-章节目录页', url: 'https://www.cunshu.la/read/NDU0ODN8YzFhODkzOGVkNmM4' },
  { rule: '存书啦-章节内容页', url: 'https://www.cunshu.la/read/NDU0ODN8YzFhODkzOGVkNmM4?key=NDU0ODN8YzFhODkzOGVkNmM4&chapter=1' },
  { rule: '存书啦-章节内容页(ch2藏字)', url: 'https://www.cunshu.la/read/NDU0ODN8YzFhODkzOGVkNmM4?key=NDU0ODN8YzFhODkzOGVkNmM4&chapter=2' },
  { rule: '存书啦-章节内容页(ch10行内广告)', url: 'https://www.cunshu.la/read/NDU0ODN8YzFhODkzOGVkNmM4?key=NDU0ODN8YzFhODkzOGVkNmM4&chapter=10' },
  { rule: '人气完本-列表页', url: 'https://www.rqwb.com/' },
  { rule: '人气完本-书籍信息页', url: 'https://www.rqwb.com/book/55NQF.html' },
  { rule: '人气完本-书籍信息页(书2验证)', url: 'https://www.rqwb.com/book/5N37G.html' },
  { rule: '人气完本-章节目录页', url: 'https://www.rqwb.com/book/55NQF.html' },
  { rule: '人气完本-章节内容页', url: 'https://www.rqwb.com/book/55NQF-1.html' },
]

async function main() {
  const { rules } = (await (await fetch(`${BASE}/api/rules`)).json()) as {
    rules: { id: string; name: string; type: string; config: string }[]
  }
  for (const t of TESTS) {
    const baseName = t.rule.replace(/\(.*\)$/, '')
    const rule = rules.find((r) => r.name === baseName)
    if (!rule) {
      console.log(`✗ ${t.rule}: 规则不存在`)
      continue
    }
    const res = await fetch(`${BASE}/api/rules/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: rule.type, config: JSON.parse(rule.config), url: t.url }),
    })
    const body = (await res.json()) as {
      ok: boolean
      message: string
      elapsedMs?: number
      data?: Record<string, unknown>
    }
    console.log(`${body.ok ? '✓' : '✗'} ${t.rule}: ${body.message} (${body.elapsedMs ?? 0}ms)`)
    if (body.data) {
      const d = body.data as Record<string, unknown>
      for (const key of ['total', 'pagesFetched', 'wordCount', 'nextUrl', 'strategy']) {
        if (d[key] !== undefined) console.log(`    ${key}: ${String(d[key])}`)
      }
      const sample = d.sample as unknown
      const fields = d.fields as unknown
      if (Array.isArray(sample) && sample.length) {
        console.log(`    sample[0]:`, JSON.stringify(sample[0]).slice(0, 220))
      }
      if (fields && typeof fields === 'object') {
        console.log(`    fields:`, JSON.stringify(fields).slice(0, 400))
      }
      if (typeof d.preview === 'string' && d.preview) {
        console.log(`    preview:`, d.preview.slice(0, 150).replace(/\n/g, '⏎'))
      }
    }
  }
}
void main()
