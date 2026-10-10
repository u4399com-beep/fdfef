'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { api } from '@/lib/client-api'
import { toNumOr } from '@/lib/utils'
import { Beaker, Gauge, KeyRound, Loader2, Save } from 'lucide-react'

type CollectSpeed = 'polite' | 'balanced' | 'fast'

const COLLECT_SPEED_META: Record<CollectSpeed, { label: string; desc: string }> = {
  polite: { label: '礼貌模式', desc: '始终使用规则配置的完整间隔，适合严格反爬站点' },
  balanced: { label: '均衡模式（推荐）', desc: '站点容忍时逐渐提速至 45% 间隔，遇拦截立即回满' },
  fast: { label: '极速模式', desc: '逐渐提速至 30% 间隔，速度优先，适合无 WAF 站点' },
}

/** 输入过程保留空段/空行（否则逗号、换行会被 onChange 过滤吞掉，无法连续输入多段），提交前统一剔除空段 */
function compactCleaning(c: CleaningCfg): CleaningCfg {
  return { ...c, removeTags: c.removeTags.map((s) => s.trim()).filter(Boolean), adPatterns: c.adPatterns.filter((s) => s.trim()) }
}
function compactDownload(d: DownloadCfg): DownloadCfg {
  return { ...d, adTemplates: d.adTemplates.filter(Boolean) }
}

interface CleaningCfg {
  removeTags: string[]
  adPatterns: string[]
  decodeEntities: boolean
  normalizeParagraphs: boolean
  minParagraphLength: number
  stripInlineUrls: boolean
  removeHeaderJunk: boolean
  removePromoRepeats: boolean
  stripInvisibleChars: boolean
}

interface DownloadCfg {
  insertSiteInfo: boolean
  siteInfoTemplate: string
  insertAds: boolean
  adTemplates: string[]
  adEveryNChapters: number
  insertObfuscation: boolean
  obfuscationMode: string
  obfuscationRate: number
}

interface EngineStatus {
  browserEngine: 'playwright' | 'cloakbrowser'
  playwrightInstalled: boolean
  cloakbrowserInstalled: boolean
  hyperbrowserConfigured: boolean
  iv8Configured: boolean
  iv8SolverPresent: boolean
  captchaVisionConfigured: boolean
}

export function SettingsPage() {
  const { toast } = useToast()
  const [cleaning, setCleaning] = useState<CleaningCfg | null>(null)
  const [download, setDownload] = useState<DownloadCfg | null>(null)
  const [collectSpeed, setCollectSpeed] = useState<CollectSpeed>('balanced')
  const [saving, setSaving] = useState(false)
  const [testHtml, setTestHtml] = useState('')
  const [testOut, setTestOut] = useState('')
  const [testing, setTesting] = useState(false)
  // 账户安全：修改后台登录密码
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [engines, setEngines] = useState<EngineStatus>({
    browserEngine: 'playwright',
    playwrightInstalled: true,
    cloakbrowserInstalled: false,
    hyperbrowserConfigured: false,
    iv8Configured: false,
    iv8SolverPresent: false,
    captchaVisionConfigured: false,
  })

  const load = useCallback(async () => {
    try {
      const r = await api<{ cleaning: CleaningCfg; download: DownloadCfg; collect?: { speed?: CollectSpeed }; engines?: EngineStatus }>('/api/settings')
      setCleaning(r.cleaning)
      setDownload(r.download)
      if (r.collect?.speed) setCollectSpeed(r.collect.speed)
      if (r.engines) setEngines(r.engines)
    } catch (e) {
      toast({ title: '加载失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!cleaning || !download) return
    setSaving(true)
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ cleaning: compactCleaning(cleaning), download: compactDownload(download), collect: { speed: collectSpeed } }) })
      toast({ title: '设置已保存' })
    } catch (e) {
      toast({ title: '保存失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    if (savingPw) return
    if (newPw.length < 6) {
      toast({ title: '新密码至少 6 位', variant: 'destructive' })
      return
    }
    if (newPw !== confirmPw) {
      toast({ title: '两次输入的新密码不一致', variant: 'destructive' })
      return
    }
    setSavingPw(true)
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      })
      setOldPw('')
      setNewPw('')
      setConfirmPw('')
      try {
        sessionStorage.removeItem('nm-default-pw')
        // 通知 AdminRoot 重读标记，默认密码横幅即时消失
        window.dispatchEvent(new CustomEvent('nm-default-pw'))
      } catch {
        /* 忽略 */
      }
      toast({ title: '密码已修改，下次登录请使用新密码' })
    } catch (e) {
      toast({ title: '修改失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setSavingPw(false)
    }
  }

  const runCleanTest = async () => {
    if (!cleaning || !testHtml.trim()) return
    setTesting(true)
    try {
      const r = await api<{
        text: string
        wordCount: number
        removedLines: number
        stats?: Record<string, number>
        removedSamples?: string[]
      }>('/api/clean-test', {
        method: 'POST',
        body: JSON.stringify({ html: testHtml, cleaning: compactCleaning(cleaning) }),
      })
      // 输出清洗后正文 + 各机制移除统计 + 被移除行样本（便于确认误杀率）
      const parts: string[] = [r.text || '（清洗后为空）']
      if (r.stats && Object.values(r.stats).some((n) => n > 0)) {
        const label: Record<string, string> = {
          adPattern: '广告正则', inlineUrl: '行内URL剥离', headerJunk: '章首垃圾',
          promoRepeat: '重复推广行', punctuation: '纯符号行', tooShort: '过短段落', invisibleChars: '不可见字符数',
        }
        parts.push(
          '\n—— 移除统计 ——\n' +
            Object.entries(r.stats).filter(([, n]) => n > 0).map(([k, n]) => `${label[k] ?? k}: ${n}`).join('，')
        )
      }
      if (r.removedSamples?.length) {
        parts.push('\n—— 移除样本 ——\n' + r.removedSamples.map((s, i) => `${i + 1}. ${s}`).join('\n'))
      }
      setTestOut(parts.join('\n'))
      toast({ title: `清洗完成：${r.wordCount} 字，移除 ${r.removedLines} 行` })
    } catch (e) {
      toast({ title: '测试失败', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  if (!cleaning || !download) return <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>

  const engineRows: { label: string; ok: boolean; okText: string; badText: string; hint: string }[] = [
    {
      label: '浏览器引擎',
      ok: engines.browserEngine === 'cloakbrowser' ? engines.cloakbrowserInstalled : engines.playwrightInstalled,
      okText: engines.browserEngine === 'cloakbrowser' ? 'CloakBrowser（源码级隐身）' : 'Playwright',
      badText: '未安装',
      hint: 'BROWSER_ENGINE=cloakbrowser 切换；CloakBrowser 启动失败自动回退 Playwright',
    },
    { label: 'iv8 补环境（JS cookie 挑战）', ok: engines.iv8Configured, okText: '已启用', badText: '未启用', hint: 'IV8_ENABLED=1 + pip install iv8；无浏览器算出通行 cookie' },
    { label: 'Hyperbrowser 云隐身', ok: engines.hyperbrowserConfigured, okText: '已配置', badText: '未配置', hint: 'HYPERBROWSER_API_KEY 云端浏览器策略' },
    { label: '验证码视觉识别', ok: engines.captchaVisionConfigured, okText: '已配置', badText: '未配置', hint: 'CAPTCHA_VISION_API_BASE/KEY/MODEL（GoEdge 验证码自动过）' },
  ]

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* 反反爬引擎状态（只读） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">反反爬引擎</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {engineRows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 rounded-md border p-2.5">
              <div className="min-w-0">
                <p className="text-sm">{row.label}</p>
                <p className="text-[11px] text-muted-foreground">{row.hint}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${row.ok ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}
              >
                {row.ok ? row.okText : row.badText}
              </span>
            </div>
          ))}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            降级链：HTTP 直连 → WAF 验证码 HTTP 求解 → iv8 补环境（JS cookie）→ 浏览器渲染（CloakBrowser/Playwright）→ Hyperbrowser 云。
            环境变量配置详见 DEPLOY.md「反反爬引擎扩展」。
          </p>
        </CardContent>
      </Card>
      {/* 采集速度（自适应节流档位） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4" /> 采集速度（自适应节流）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            {(Object.keys(COLLECT_SPEED_META) as CollectSpeed[]).map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => setCollectSpeed(speed)}
                aria-pressed={collectSpeed === speed}
                className={`flex items-start justify-between gap-3 rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40 ${collectSpeed === speed ? 'border-primary bg-primary/5' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block text-sm">{COLLECT_SPEED_META[speed].label}</span>
                  <span className="block text-[11px] text-muted-foreground">{COLLECT_SPEED_META[speed].desc}</span>
                </span>
                {collectSpeed === speed && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">当前</span>}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            自适应巡航：起步永远使用规则配置的完整间隔（反 WAF 安全第一）；连续干净响应才逐档提速，
            任何验证码挑战/封禁/失败立即回满间隔重新起步。提速上限 = 该档位下限 × 规则间隔
            （礼貌 100% / 均衡 45% / 极速 30%），对严格站点选「礼貌模式」即完全等价旧版行为。
            同时配合 SQLite WAL 写入提速（多线程章节落库不再串行 fsync）。
          </p>
        </CardContent>
      </Card>

      {/* 内容清洗 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">内容清洗系统（全局规则）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">移除标签（逗号分隔）</Label>
            <Input className="h-8 font-mono text-xs" value={cleaning.removeTags.join(', ')}
              onChange={(e) => setCleaning({ ...cleaning, removeTags: e.target.value.split(/[,，]/).map((s) => s.trim()) })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">广告清洗正则（每行一条，命中行剔除或行内删除）</Label>
            <Textarea className="h-36 font-mono text-[11px]" value={cleaning.adPatterns.join('\n')}
              onChange={(e) => setCleaning({ ...cleaning, adPatterns: e.target.value.split('\n') })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-sm">实体解码</p>
                <p className="text-[11px] text-muted-foreground">&amp;nbsp; 等 → 字符</p>
              </div>
              <Switch checked={cleaning.decodeEntities} onCheckedChange={(v) => setCleaning({ ...cleaning, decodeEntities: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-sm">段落规范化</p>
                <p className="text-[11px] text-muted-foreground">合并空行、规范缩进</p>
              </div>
              <Switch checked={cleaning.normalizeParagraphs} onCheckedChange={(v) => setCleaning({ ...cleaning, normalizeParagraphs: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-sm">行内链接剥离</p>
                <p className="text-[11px] text-muted-foreground">正文中的 URL/短链/域名</p>
              </div>
              <Switch checked={cleaning.stripInlineUrls} onCheckedChange={(v) => setCleaning({ ...cleaning, stripInlineUrls: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-sm">章首垃圾识别</p>
                <p className="text-[11px] text-muted-foreground">书名/作者/简介/纯序号行</p>
              </div>
              <Switch checked={cleaning.removeHeaderJunk} onCheckedChange={(v) => setCleaning({ ...cleaning, removeHeaderJunk: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-sm">重复推广行</p>
                <p className="text-[11px] text-muted-foreground">同行重复≥2 且含群号/域名等</p>
              </div>
              <Switch checked={cleaning.removePromoRepeats} onCheckedChange={(v) => setCleaning({ ...cleaning, removePromoRepeats: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2.5">
              <div>
                <p className="text-sm">不可见字符剥离</p>
                <p className="text-[11px] text-muted-foreground">零宽字符/方向控制符/BOM</p>
              </div>
              <Switch checked={cleaning.stripInvisibleChars} onCheckedChange={(v) => setCleaning({ ...cleaning, stripInvisibleChars: v })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">最短段落字数（0 = 不过滤）</Label>
            <Input className="h-8" type="number" min={0} value={cleaning.minParagraphLength}
              onChange={(e) => setCleaning({ ...cleaning, minParagraphLength: Math.max(0, toNumOr(e.target.value, 0)) })} />
          </div>

          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">清洗测试</p>
            <Textarea className="h-20 font-mono text-[11px]" placeholder="粘贴包含广告的 HTML 片段，如：<div>正文第一段</div><div>一秒记住本站网址…</div>"
              value={testHtml} onChange={(e) => setTestHtml(e.target.value)} />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={testing || !testHtml.trim()} onClick={() => void runCleanTest()}>
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Beaker className="h-3.5 w-3.5" />} 运行清洗测试
              </Button>
            </div>
            {testOut && (
              <ScrollArea className="max-h-72 rounded-md border bg-muted/30 p-3">
                <pre className="whitespace-pre-wrap text-xs leading-relaxed">{testOut}</pre>
              </ScrollArea>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 下载注入 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">小说文件下载系统（注入配置）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-md border p-2.5">
            <div>
              <p className="text-sm">插入站点信息</p>
              <p className="text-[11px] text-muted-foreground">文件头尾附加站名 / 域名 / 引流文案</p>
            </div>
            <Switch checked={download.insertSiteInfo} onCheckedChange={(v) => setDownload({ ...download, insertSiteInfo: v })} />
          </div>
          {download.insertSiteInfo && (
            <div className="space-y-1.5">
              <Label className="text-xs">站点信息模板（{'{siteName}'} / {'{domain}'} 占位）</Label>
              <Textarea className="h-16 text-xs" value={download.siteInfoTemplate}
                onChange={(e) => setDownload({ ...download, siteInfoTemplate: e.target.value })} />
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border p-2.5">
            <div>
              <p className="text-sm">插入广告</p>
              <p className="text-[11px] text-muted-foreground">每 N 章随机注入一条广告模板</p>
            </div>
            <Switch checked={download.insertAds} onCheckedChange={(v) => setDownload({ ...download, insertAds: v })} />
          </div>
          {download.insertAds && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">广告模板（每行一条，支持占位符）</Label>
                <Textarea className="h-20 text-xs" value={download.adTemplates.join('\n')}
                  onChange={(e) => setDownload({ ...download, adTemplates: e.target.value.split('\n') })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">每 N 章插入一条</Label>
                <Input className="h-8" type="number" min={1} value={download.adEveryNChapters}
                  onChange={(e) => setDownload({ ...download, adEveryNChapters: Math.max(1, toNumOr(e.target.value, 1)) })} />
              </div>
            </>
          )}
          <div className="flex items-center justify-between rounded-md border p-2.5">
            <div>
              <p className="text-sm">插入混淆内容</p>
              <p className="text-[11px] text-muted-foreground">干扰采集与抄袭比对</p>
            </div>
            <Switch checked={download.insertObfuscation} onCheckedChange={(v) => setDownload({ ...download, insertObfuscation: v })} />
          </div>
          {download.insertObfuscation && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">混淆方式</Label>
                <Select value={download.obfuscationMode} onValueChange={(v) => setDownload({ ...download, obfuscationMode: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zero-width">零宽字符（不可见）</SelectItem>
                    <SelectItem value="lookalike">同形异码字</SelectItem>
                    <SelectItem value="junk-line">随机干扰行</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">混淆密度（{download.obfuscationRate}）</Label>
                <input type="range" min={0} max={0.1} step={0.005} value={download.obfuscationRate}
                  onChange={(e) => setDownload({ ...download, obfuscationRate: Number(e.target.value) })}
                  className="mt-2 w-full accent-primary" />
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            使用方式：书籍管理 → 详情 → 「下载 TXT」，注入在生成时实时执行。
          </p>
        </CardContent>
      </Card>

      {/* 账户安全 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">账户安全（后台登录）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">旧密码</Label>
            <Input className="h-8" type="password" autoComplete="current-password" value={oldPw}
              onChange={(e) => setOldPw(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">新密码（至少 6 位）</Label>
              <Input className="h-8" type="password" autoComplete="new-password" value={newPw}
                onChange={(e) => setNewPw(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">确认新密码</Label>
              <Input className="h-8" type="password" autoComplete="new-password" value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void changePassword()} disabled={savingPw || !oldPw || !newPw || !confirmPw}>
              {savingPw ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} 修改密码
            </Button>
            <p className="text-[11px] text-muted-foreground">前后端分离：后台入口 /admin 与全部管理 API 均需登录会话</p>
          </div>
        </CardContent>
      </Card>

      <div className="xl:col-span-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} 保存全部设置
        </Button>
      </div>
    </div>
  )
}
