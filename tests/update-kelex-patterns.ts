/** 给可乐小说内容规则追加站名话术清洗（kelexs 旧书存量数据再清洗配套） */
const BASE = 'http://localhost:3000'
async function main() {
  const { rules } = (await (await fetch(`${BASE}/api/rules`)).json()) as unknown as {
    rules: { id: string; name: string; config: string }[]
  }
  const rule = rules.find((r) => r.name === '可乐小说-章节内容页')
  if (!rule) {
    console.log('可乐内容规则不存在')
    return
  }
  const cfg = JSON.parse(rule.config) as { extraAdPatterns?: string[] }
  const extra = new Set([...(cfg.extraAdPatterns ?? [])])
  for (const p of [
    '可乐小说[^。！？\\n]{0,80}[。！？]',
    '可乐小说[^\\n]{0,40}$',
    '全网热读[^。！？\\n]{0,80}[。！？]',
    '诚意奉献[^。！？\\n]{0,60}[。！？]',
    '独家首发[^。！？\\n]{0,40}[。！？]',
    '倾心之作[^。！？\\n]{0,50}[。！？]',
    '书友们都去[^。！？\\n]{0,50}[。！？]',
    '欢迎到[^。！？\\n]{0,60}阅读本书[！!]',
  ]) extra.add(p)
  cfg.extraAdPatterns = [...extra]
  const res = await fetch(`${BASE}/api/rules/${rule.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: cfg }),
  })
  console.log('可乐内容规则更新:', res.ok ? 'OK' : await res.text())
}
void main()
export {}
