'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { THEMES } from '@/components/themes'
import { PseoHub } from '@/components/site/pseo-hub'
import type { SiteMeta, SiteView } from '@/lib/theme-types'
import { interfereContent, obfuscateDom, parseSeoConfig, transcodeText } from '@/lib/seo/engine'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Globe, Loader2 } from 'lucide-react'

interface PreviewResponse {
  site: SiteMeta
  view: SiteView
  data: {
    books?: import('@/lib/theme-types').BookCard[]
    book?: import('@/lib/theme-types').BookDetail
    chapter?: import('@/lib/theme-types').ChapterDetail
    keywordBooks?: import('@/lib/theme-types').BookCard[]
    categories?: string[]
    pseoKeywords?: import('@/lib/theme-types').PseoKeyword[]
  }
}

function viewToQuery(view: SiteView): string {
  switch (view.type) {
    case 'book':
      return `type=book&bookId=${encodeURIComponent(view.bookId)}`
    case 'toc':
      return `type=toc&bookId=${encodeURIComponent(view.bookId)}`
    case 'chapter':
      return `type=chapter&chapterId=${encodeURIComponent(view.chapterId)}`
    case 'keyword':
      return `type=keyword&keyword=${encodeURIComponent(view.keyword)}`
    case 'pseo':
      return 'type=pseo'
    default:
      return 'type=home'
  }
}

/** 计算 TDK（站群 SEO：每个视图独立 title/description/keywords） */
function computeTDK(preview: PreviewResponse): { title: string; description: string; keywords: string } {
  const { site, view, data } = preview
  const siteTitle = site.title || site.siteName
  const siteDesc = site.description
  const siteKw = site.keywords
  // PSEO 模板占位符展开（仅 keyword/pseo 视图消费）
  const pseoCfg = parseSeoConfig(site.seoConfig).pseo
  const fill = (tpl: string, kw: string) =>
    tpl.replaceAll('{keyword}', kw).replaceAll('{siteName}', site.siteName).replaceAll('{domain}', site.domain)
  switch (view.type) {
    case 'book': {
      const b = data.book
      if (!b) break
      return {
        title: `${b.title}_${b.author ? b.author + '_' : ''}${site.siteName}`,
        description: (b.intro || siteDesc).slice(0, 120),
        keywords: [b.title, ...b.keywords, ...b.suggestKeywords].filter(Boolean).join(','),
      }
    }
    case 'chapter': {
      const c = data.chapter
      if (!c) break
      return {
        title: `${c.title}_${c.bookTitle}_${site.siteName}`,
        description: `${c.bookTitle} ${c.title} 章节阅读，${siteDesc}`,
        keywords: [c.bookTitle, c.title, site.keywords].filter(Boolean).join(','),
      }
    }
    case 'keyword': {
      const kw = view.keyword
      if (pseoCfg?.enabled && (pseoCfg.titleTemplate || pseoCfg.descTemplate || pseoCfg.kwTemplate)) {
        return {
          title: pseoCfg.titleTemplate ? fill(pseoCfg.titleTemplate, kw) : `${kw}_相关小说_${site.siteName}`,
          description: pseoCfg.descTemplate ? fill(pseoCfg.descTemplate, kw) : `与「${kw}」相关的小说列表，${site.siteName}为您提供，更多精彩请访问主书籍信息页。`,
          keywords: pseoCfg.kwTemplate ? fill(pseoCfg.kwTemplate, kw) : [kw, site.keywords].filter(Boolean).join(','),
        }
      }
      return {
        title: `${kw}_相关小说_${site.siteName}`,
        description: `与「${kw}」相关的小说列表，${site.siteName}为您提供，更多精彩请访问主书籍信息页。`,
        keywords: [kw, site.keywords].filter(Boolean).join(','),
      }
    }
    case 'pseo': {
      return {
        title: `${site.siteName}_关键词专题导航`,
        description: `${site.siteName}全部小说专题与关键词导航，${siteDesc}`,
        keywords: [site.siteName, '专题导航', siteKw].filter(Boolean).join(','),
      }
    }
    case 'toc': {
      const b = data.book
      if (!b) break
      return {
        title: `${b.title}章节目录_${b.author ? b.author + '_' : ''}${site.siteName}`,
        description: `《${b.title}》${b.author ? `（${b.author} 著）` : ''}全部 ${b.totalChapters} 章完整目录，${siteDesc}`,
        keywords: [b.title, '章节目录', '全部章节', ...b.keywords.slice(0, 3)].filter(Boolean).join(','),
      }
    }
    default:
      break
  }
  return { title: siteTitle, description: siteDesc, keywords: siteKw }
}

/** TDK 转码：关键词/TDK 以转码形态写入 head（浏览器渲染不变，源码层干扰审核匹配）。
 * document.title 是纯文本节点不解析实体 → 标题仅用零宽插入；meta 属性可解析实体 → 按所选模式 */
function applyTranscode(tdk: { title: string; description: string; keywords: string }, site: SiteMeta): {
  title: string
  description: string
  keywords: string
} {
  const cfg = parseSeoConfig(site.seoConfig).transcode
  if (!cfg?.enabled) return tdk
  const mode = cfg.mode ?? 'mixed'
  const seed = site.id || site.domain || site.siteName
  return {
    title: transcodeText(tdk.title, 'zerowidth', `${seed}:title`, { allowEntities: false }),
    description: transcodeText(tdk.description, mode, `${seed}:desc`),
    keywords: transcodeText(tdk.keywords, mode, `${seed}:kw`),
  }
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export function SitePreview({
  siteId,
  onBack,
  embedded = false,
}: {
  siteId?: string
  onBack?: () => void
  embedded?: boolean
}) {
  const [view, setView] = useState<SiteView>({ type: 'home' })
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  // 请求序号：快速导航时旧响应晚到不得覆盖新视图（乱序竞态）
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++reqRef.current
    setLoading(true)
    setError('')
    try {
      const qs = [`siteId=${encodeURIComponent(siteId ?? '')}`, viewToQuery(view)].join('&')
      const res = await fetch(`/api/preview?${qs}`, { cache: 'no-store' })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error || `加载失败（${res.status}）`)
      }
      const data = (await res.json()) as PreviewResponse
      if (reqId !== reqRef.current) return
      // 内容干扰 + 伪原创：章节正文渲染层变换（DB 原文不受影响；种子=站点+章节，同章稳定、跨章不重复）
      const icfg = parseSeoConfig(data.site.seoConfig).interfere
      if (icfg?.enabled && data.data.chapter?.content) {
        data.data.chapter = {
          ...data.data.chapter,
          content: interfereContent(data.data.chapter.content, `${data.site.id}:${data.data.chapter.id}`, {
            density: icfg.density ?? 'low',
            pseudo: icfg.pseudo ?? true,
            zeroWidth: icfg.zeroWidth ?? true,
          }),
        }
      }
      setPreview(data)
      containerRef.current?.scrollTo({ top: 0 })
    } catch (e) {
      if (reqId !== reqRef.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }, [siteId, view])

  useEffect(() => {
    void load()
  }, [load])

  // ---------- TDK + JSON-LD（SEO / GEO 结构化数据） ----------
  // 卸载时还原后台页面自身的 title/meta，避免预览污染宿主页面的 head
  const headSnapshotRef = useRef<{
    title: string
    description: string | null
    descriptionExisted: boolean
    keywords: string | null
    keywordsExisted: boolean
  } | null>(null)
  useEffect(() => {
    const descEl = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
    const kwEl = document.head.querySelector<HTMLMetaElement>('meta[name="keywords"]')
    headSnapshotRef.current = {
      title: document.title,
      description: descEl?.content ?? null,
      descriptionExisted: !!descEl,
      keywords: kwEl?.content ?? null,
      keywordsExisted: !!kwEl,
    }
    return () => {
      const snap = headSnapshotRef.current
      if (snap) {
        document.title = snap.title
        if (snap.descriptionExisted) {
          if (snap.description !== null) upsertMeta('name', 'description', snap.description)
        } else {
          // 宿主页面原本没有该 meta：预览注入的属于新增污染，卸载时应移除而非保留
          document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.remove()
        }
        if (snap.keywordsExisted) {
          if (snap.keywords !== null) upsertMeta('name', 'keywords', snap.keywords)
        } else {
          document.head.querySelector<HTMLMetaElement>('meta[name="keywords"]')?.remove()
        }
        headSnapshotRef.current = null
      }
      document.getElementById('site-jsonld')?.remove()
    }
  }, [])

  useEffect(() => {
    if (!preview) return
    const tdk = applyTranscode(computeTDK(preview), preview.site)
    document.title = tdk.title
    upsertMeta('name', 'description', tdk.description)
    upsertMeta('name', 'keywords', tdk.keywords)

    const ld: Record<string, unknown>[] = []
    const { site, view: v, data } = preview
    if (v.type === 'book' && data.book) {
      const b = data.book
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'Book',
        name: b.title,
        author: { '@type': 'Person', name: b.author || '佚名' },
        genre: b.category,
        inLanguage: 'zh-CN',
        numberOfPages: b.totalChapters,
        description: b.intro.slice(0, 300),
        keywords: [...b.keywords, ...b.suggestKeywords].join(','),
        url: `https://${site.domain}/`,
      })
    }
    if (v.type === 'chapter' && data.chapter) {
      const c = data.chapter
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.siteName },
          { '@type': 'ListItem', position: 2, name: c.bookTitle },
          { '@type': 'ListItem', position: 3, name: c.title },
        ],
      })
    }
    if (v.type === 'toc' && data.book) {
      const b = data.book
      ld.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.siteName },
          { '@type': 'ListItem', position: 2, name: `${b.title} 章节目录` },
        ],
      })
    }
    let script = document.getElementById('site-jsonld')
    if (ld.length > 0) {
      if (!script) {
        script = document.createElement('script')
        script.id = 'site-jsonld'
        ;(script as HTMLScriptElement).type = 'application/ld+json'
        document.head.appendChild(script)
      }
      script.textContent = JSON.stringify(ld)
    } else if (script) {
      script.remove()
    }
  }, [preview])

  // 混淆代码模式：渲染完成后对前台容器做站点唯一结构噪声（外观零变化，蜘蛛抓到的代码逐站不同）
  useEffect(() => {
    if (!preview || loading) return
    const ocfg = parseSeoConfig(preview.site.seoConfig).obfuscate
    if (!ocfg?.enabled) return
    const el = containerRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => {
      obfuscateDom(el, preview.site.id || preview.site.siteName, { strength: ocfg.strength ?? 'standard' })
    })
    return () => cancelAnimationFrame(raf)
  }, [preview, loading, view])

  const theme = preview ? THEMES[preview.site.themeId] ?? THEMES.classic : null
  const ThemeComponent = theme?.Component
  const showPseoHub = view.type === 'pseo' && !!preview

  return (
    <div className="flex flex-col h-full" data-testid="site-preview">
      {!embedded && (
        <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> 返回后台
            </Button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
              <Globe className="h-4 w-4 shrink-0" />
              前台预览：{preview?.site.siteName ?? '…'}
              {preview ? `（主题：${theme?.meta.name}）` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {Object.values(THEMES).map((t) => (
              <button
                key={t.meta.id}
                disabled={!preview}
                onClick={() => {
                  if (preview) setPreview({ ...preview, site: { ...preview.site, themeId: t.meta.id } })
                }}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                  preview?.site.themeId === t.meta.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-accent'
                }`}
              >
                {t.meta.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>
              重试
            </Button>
          </div>
        ) : preview && showPseoHub ? (
          <PseoHub
            site={preview.site}
            keywords={preview.data.pseoKeywords ?? []}
            books={preview.data.books ?? []}
            onNavigate={setView}
          />
        ) : preview && ThemeComponent ? (
          <ThemeComponent
            site={preview.site}
            view={view}
            data={preview.data}
            loading={loading}
            onNavigate={setView}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">正在加载前台数据…</span>
          </div>
        )}
      </div>
    </div>
  )
}
