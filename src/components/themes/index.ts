import type { ThemeComponent, ThemeMeta } from '@/lib/theme-types'
import { ThemeClassic } from './theme-classic'
import { ThemeInk } from './theme-ink'
import { ThemeMagazine } from './theme-magazine'
import { ThemeNeon } from './theme-neon'
import { ThemeNoir } from './theme-noir'
import { ThemeUaa } from './theme-uaa'

export interface ThemeEntry {
  meta: ThemeMeta
  Component: ThemeComponent
}

/**
 * 主题注册表：后台模板选择与前台渲染共用。
 * key 为主题 id（与 ThemeMeta.id 一致），新增主题时在此登记即可。
 */
export const THEMES: Record<string, ThemeEntry> = {
  classic: {
    meta: {
      id: 'classic',
      name: '经典书香',
      description: '暖米黄纸张底色的传统小说站布局，衬线字体、顶部横向导航、左封面右信息行式书列与双栏章节目录，稳重耐读。',
      preview: 'amber 纸色 / 衬线字体 / 行式书列 / 双栏目录',
    },
    Component: ThemeClassic,
  },
  noir: {
    meta: {
      id: 'noir',
      name: '暗夜极简',
      description: 'zinc-950 深色单栏窄版心，等宽字体点缀、无图纯文字书目索引与细线分隔，大量留白，冷峻极简。',
      preview: '深色 zinc / mono 点缀 / 纯文字书目 / 细线分隔',
    },
    Component: ThemeNoir,
  },
  magazine: {
    meta: {
      id: 'magazine',
      name: '清新杂志',
      description: '明亮白底多卡片杂志风，渐变斑马纹大 banner、彩色分类徽章、封面卡片网格悬浮抬升，活泼清新。',
      preview: '白底卡片 / 彩色徽章 / 渐变 banner / 胶囊筛选',
    },
    Component: ThemeMagazine,
  },
  ink: {
    meta: {
      id: 'ink',
      name: '古典水墨',
      description: '宣纸质感中国风，stone 墨字配朱砂红点缀，竖排诗句装饰、墨线分隔、长卷书列与三列密排目录，古雅沉静。',
      preview: '宣纸灰 / 朱砂红 / 竖排诗句 / 长卷卡片',
    },
    Component: ThemeInk,
  },
  neon: {
    meta: {
      id: 'neon',
      name: '现代炫彩',
      description: '深灰底上的紫粉橙大渐变，渐变描边卡片、巨幅 hero 横幅与超粗黑标题，炫酷沉浸的新潮阅读体验。',
      preview: '深灰底 / 紫粉橙渐变 / 描边卡片 / 粗黑标题',
    },
    Component: ThemeNeon,
  },
  uaa: {
    meta: {
      id: 'uaa',
      name: 'UAA 蓝调',
      description: '克隆 uaa.com/novel/list 版式：白色吸顶导航（站内搜索）、分类/状态筛选条、封面卡片流 + 右侧最近更新榜与热门标签侧栏、页码分页；配浅蓝笔趣阁底色与蓝色主调，清爽现代。',
      preview: '浅蓝底 / 筛选条 / 封面卡片流 / 排行侧栏 / 站内搜索',
    },
    Component: ThemeUaa,
  },
}

export const THEME_LIST: ThemeEntry[] = Object.values(THEMES)
