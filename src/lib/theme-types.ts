// ============================================================
// 前台主题模板共享契约（全部主题共用）
// ============================================================

export interface SiteMeta {
  id: string
  domain: string
  siteName: string
  themeId: string
  title: string
  description: string
  keywords: string
  footerText: string
  mainBookId: string
  /** SEO 增强配置原文（JSON：混淆代码/TDK转码/内容干扰/PSEO，由 preview-shell 解析消费） */
  seoConfig: string
}

export interface BookCard {
  id: string
  title: string
  author: string
  category: string
  intro: string
  coverUrl: string
  status: string
  latestChapter: string
  totalChapters: number
  keywords: string[]
  suggestKeywords: string[]
}

export interface ChapterItem {
  id: string
  title: string
  order: number
}

export interface BookDetail extends BookCard {
  /** 最新更新章节（最新优先，最多 12 条；完整目录见 toc 视图） */
  chapters: ChapterItem[]
  /** 第一章 id（开始阅读入口） */
  firstChapterId: string | null
  updatedAt: string
}

export interface ChapterDetail {
  id: string
  title: string
  order: number
  content: string
  bookId: string
  bookTitle: string
  prevId: string | null
  nextId: string | null
}

export type SiteView =
  | { type: 'home' }
  | { type: 'book'; bookId: string }
  | { type: 'chapter'; chapterId: string }
  | { type: 'keyword'; keyword: string }
  | { type: 'toc'; bookId: string }
  | { type: 'pseo' }

/** PSEO 派生关键词（枢纽页索引项） */
export interface PseoKeyword {
  keyword: string
  /** 关联书籍数（枢纽页权重展示） */
  count: number
  /** 来源：manual 站点设定 / book 书籍标签 / suggest 搜索下拉词 / category 分类 */
  source: 'manual' | 'book' | 'suggest' | 'category'
}

export interface ThemeProps {
  site: SiteMeta
  view: SiteView
  data: {
    books?: BookCard[]
    book?: BookDetail
    chapter?: ChapterDetail
    keywordBooks?: BookCard[]
    categories?: string[]
    /** PSEO 派生关键词（pseo 枢纽视图；通用渲染不走主题） */
    pseoKeywords?: PseoKeyword[]
  }
  loading?: boolean
  onNavigate: (v: SiteView) => void
}

export interface ThemeMeta {
  id: string
  name: string
  description: string
  preview: string // 预览描述（用于后台模板选择卡片）
}

export type ThemeComponent = (props: ThemeProps) => React.ReactElement
