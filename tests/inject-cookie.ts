/** 将 WAF 通行 cookie 注入 kelexs 四类规则 */
const BASE = 'http://localhost:3000'
const cookieArg = process.argv[2]
if (!cookieArg) { console.error('usage: bun tests/inject-cookie.ts <cookie>'); process.exit(1) }
const rules = (await (await fetch(`${BASE}/api/rules`)).json()) as { rules: { id: string; name: string; type: string; config: string }[] }
for (const rule of rules.rules.filter((r) => r.name.includes('可乐小说'))) {
  const cfg = JSON.parse(rule.config) as Record<string, unknown>
  cfg.cookies = cookieArg
  const res = await fetch(`${BASE}/api/rules/${rule.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: rule.name, config: cfg }),
  })
  console.log(res.ok ? `✓ ${rule.name}` : `✗ ${rule.name}`)
}

export {}
