// ============================================================
// 站群 SEO 增强引擎（纯函数库，浏览器端 DOM 部分单独隔离）
// ① TDK/关键词转码：entity / decimal / zerowidth / mixed
// ② 句子干扰 + 伪原创（确定性种子 → 同章稳定、跨章不重复）
// ③ 混淆代码模式：每站点唯一结构代码（外观不变）
// 全部变换以站点 id 为种子 —— 同站输出稳定（蜘蛛重访文本一致），
// 跨站输出互异（站群间结构/文本不重复）。
// ============================================================

// ---------- 种子化伪随机 ----------

/** djb2 变体字符串哈希 → uint32 */
export function seoHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

/** mulberry32：小而快的确定性 PRNG */
export function seoRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- ① TDK / 关键词转码 ----------

export type TranscodeMode = 'entity' | 'decimal' | 'zerowidth' | 'mixed'

// 零宽字符池：零宽空格/非断连字符/左至右标记（不可见，打散精确匹配与 shingling 指纹）
const ZW_CHARS = ['\u200b', '\u200c', '\u200d']

function toHexEntity(ch: string): string {
  return `&#x${ch.codePointAt(0)!.toString(16)};`
}

function toDecimalEntity(ch: string): string {
  return `&#${ch.codePointAt(0)!};`
}

function isCJK(code: number): boolean {
  // CJK 统一表意文字 + 扩展A + 兼容表意
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) || (code >= 0xf900 && code <= 0xfaff)
}

/**
 * 转码一段 TDK 文本。浏览器渲染结果与原文完全一致（实体解码/零宽不可见），
 * 但源码层面的关键词以转码形态存在，干扰朴素的关键词审核/匹配机制。
 *
 * allowEntities=false（document.title 为纯文本节点、不解析实体）时
 * 自动退化为仅零宽插入，避免标题栏显示字面 &#x4E66;。
 *
 * 转码位置由种子决定：同站稳定、跨站不同；rate 控制转码密度（0~1）。
 */
export function transcodeText(text: string, mode: TranscodeMode, seedKey: string, opts?: { rate?: number; allowEntities?: boolean }): string {
  if (!text) return text
  const allowEntities = opts?.allowEntities !== false
  const rate = opts?.rate ?? 0.7
  // mixed 模式按字符位置种子化选择具体手段；entity/decimal/zerowidth 固定手段
  const rng = seoRng(seoHash(`tc:${seedKey}:${text.length}`))
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = ch.codePointAt(0)!
    // 仅对 CJK 转码：ASCII/标点保持原样（URL、空格、英文 SEO 词不受影响）
    if (!isCJK(code) || rng() > rate) {
      out += ch
      continue
    }
    let useMode = mode
    if (mode === 'mixed') {
      const r = rng()
      useMode = !allowEntities && r < 0.6 ? 'zerowidth' : r < 0.4 ? 'entity' : r < 0.8 ? 'decimal' : 'zerowidth'
    }
    if (useMode === 'entity' && allowEntities) out += toHexEntity(ch)
    else if (useMode === 'decimal' && allowEntities) out += toDecimalEntity(ch)
    else {
      out += ch
      // 零宽插入（含 entity 不可用时的退化主手段）：按位置种子决定插入哪种零宽字符
      if (i < text.length - 1) out += ZW_CHARS[seoHash(`zw:${seedKey}:${i}`) % ZW_CHARS.length]
    }
  }
  return out
}

// ---------- ② 句子干扰 + 伪原创 ----------

/** 同义词组（小说语域；每组首项为规范词，其余为可替换项） */
const SYNONYM_GROUPS: [string, string[]][] = [
  ['立刻', ['当即', '马上', '旋即']],
  ['顿时', ['霎时', '瞬间', '登时']],
  ['突然', ['忽然', '猛地', '猝然']],
  ['非常', ['十分', '极为', '格外']],
  ['十分', ['非常', '相当', '颇为']],
  ['已经', ['已然', '早已']],
  ['依然', ['仍旧', '依旧', '仍']],
  ['仍然', ['依旧', '仍旧', '仍']],
  ['缓缓', ['慢慢', '徐徐', '渐渐']],
  ['渐渐', ['逐渐', '缓缓', '慢慢']],
  ['似乎', ['仿佛', '好似', '宛如']],
  ['仿佛', ['似乎', '好像', '恍若']],
  ['看着', ['望着', '瞧着']],
  ['说道', ['开口道', '言道']],
  ['问道', ['出声问', '开口问']],
  ['回答', ['答道', '回应']],
  ['点头', ['颔首', '点了点头']],
  ['摇头', ['摇了摇头', '摆头']],
  ['皱眉', ['蹙眉', '眉头微皱']],
  ['微笑', ['浅笑', '莞尔', '笑了笑']],
  ['大笑', ['放声大笑', '哈哈大笑']],
  ['沉默', ['默然', '不作声']],
  ['平静', ['淡然', '波澜不惊']],
  ['紧张', ['忐忑', '心里发紧']],
  ['害怕', ['畏惧', '心里发怵']],
  ['愤怒', ['恼怒', '怒火中烧']],
  ['高兴', ['欣喜', '欢喜', '心中一喜']],
  ['伤心', ['难过', '心里发酸']],
  ['完成', ['做完', '了结', '达成']],
  ['开始', ['着手', '起头']],
  ['继续', ['接着', '接续']],
  ['决定', ['打定主意', '决意']],
  ['知道', ['晓得', '清楚']],
  ['认为', ['觉得', '只当']],
  ['发现', ['察觉', '注意到']],
  ['感觉', ['觉得', '只觉']],
  ['走到', ['行至', '来到']],
  ['跑到', ['奔到', '冲到']],
  ['拿起', ['取过', '抄起']],
  ['放下', ['搁下', '放置']],
  ['站起', ['起身', '站起身来']],
  ['坐下', ['落座', '坐定']],
  ['离开', ['离去', '告辞']],
  ['回到', ['返回', '折返']],
  ['四处', ['四下', '周遭']],
  ['许多', ['不少', '诸多']],
  ['所有', ['全部', '一切']],
  ['很快', ['不多时', '须臾']],
  ['半晌', ['良久', '许久']],
  ['此刻', ['这时', '此时']],
  ['先前', ['之前', '方才']],
  ['之后', ['以后', '随后']],
  ['终于', ['总算', '最终']],
  ['几乎', ['险些', '差一点']],
  ['只是', ['不过', '仅是']],
  ['但是', ['可是', '然而']],
  ['因为', ['由于', '只因']],
  ['所以', ['因此', '故而']],
  ['如果', ['若是', '倘若']],
  ['虽然', ['虽说', '尽管']],
  ['一起', ['一同', '一道']],
  ['自己', ['自身', '本人']],
  ['对方', ['对面之人', '对方那人']],
  ['众人', ['大伙', '在场众人']],
  ['身上', ['周身', '体内']],
  ['力量', ['力道', '气力']],
  ['声音', ['嗓音', '话音']],
  ['目光', ['视线', '眼神']],
  ['脸色', ['面色', '神色']],
]

/** 干扰句池：与上下文弱相关的环境/氛围短句，自然不显突兀 */
const INTERFERE_SENTENCES = [
  '窗外风声轻缓，书页正翻到新的一章。',
  '夜色安静，灯下的字迹一行行清晰起来。',
  '远处传来隐约的钟声，故事还在继续。',
  '茶杯里的热气缓缓升起，又慢慢散去。',
  '檐角的雨滴落下，敲出细碎的节奏。',
  '晨光落在桌角，把影子拉得很长。',
  '巷口的猫伸了个懒腰，又蜷了回去。',
  '旧墙上的时钟走得慢，故事却从未停歇。',
  '云层散开，月光洒在空荡的长街上。',
  '炉火噼啪作响，映得屋角忽明忽暗。',
  '纸张摩挲的声响里，时间悄悄滑过。',
  '庭前的树叶晃了晃，落下一小片阴影。',
  '风把窗帘吹起一角，又轻轻放下。',
  '街道尽头亮起一盏灯，黄昏正在收尾。',
  '书架上的尘埃在光柱里打转。',
  '铜壶里的水开了，咕嘟声打破寂静。',
  '列车驶过铁桥，轰鸣声由远及近。',
  '海风带着咸味，掠过码头的缆绳。',
  '雪落在窗棂上，积了薄薄一层。',
  '蝉声渐弱，夏天正在慢慢退场。',
  '墨迹未干的信笺摊在案头。',
  '走廊尽头的门虚掩着，透出一线光。',
  '旧唱片转着，沙沙声混进旋律里。',
  '炉上的粥咕嘟着，米香漫了满屋。',
  '山道上的雾散了些，露出青色的石阶。',
  '渡船靠岸，水面荡开一圈圈波纹。',
  '风铃在檐下轻响，像是谁路过的问候。',
  '炭笔在纸上沙沙走着，草稿堆了一沓。',
  '暮色四合，城市的灯一盏盏亮起来。',
  '邮筒里塞进了新的一封信。',
  '槐花的香气顺着风飘进院里。',
  '老槐树影子底下，石凳还带着凉意。',
  '台灯的光圈里，浮尘缓缓游动。',
  '铁轨延伸向远方，看不见尽头。',
  '麦田翻起金色的浪，一直铺到天边。',
  '潮水退去，沙滩上留下几道长长的痕。',
]

const DENSITY_MAP: Record<'low' | 'medium' | 'high', number> = { low: 0.1, medium: 0.22, high: 0.38 }
/** 伪原创替换概率（命中词典词时） */
const PSEUDO_RATE = 0.6

export interface InterfereConfig {
  density: 'low' | 'medium' | 'high'
  /** 伪原创（同义词替换） */
  pseudo: boolean
  /** 零宽字符打散（不可见干扰） */
  zeroWidth: boolean
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 词典合并正则（模块级编译一次；按词长优先匹配，避免「说道」被短词抢先） */
const SYNONYM_RE = new RegExp(
  [...SYNONYM_GROUPS]
    .flatMap(([std, alts]) => [std, ...alts])
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|'),
  'g'
)
const SYNONYM_MAP = new Map<string, string[]>()
for (const [std, alts] of SYNONYM_GROUPS) {
  for (const w of [std, ...alts]) SYNONYM_MAP.set(w, [std, ...alts].filter((x) => x !== w))
}

/**
 * 章节正文干扰 + 伪原创。
 * - 确定性：相同 (content, seedKey, cfg) 输出恒定 —— 蜘蛛重访文本稳定，不判定为内容抖动；
 * - 不重复：替换选择以「词 + 出现序号 + 章节种子」做种子，同一词不同位置、不同章节产生不同替换；
 *   干扰句在章内轮转去重（used 集合 + 取模回绕），整章不重复同一句。
 */
export function interfereContent(content: string, seedKey: string, cfg: InterfereConfig): string {
  if (!content) return content
  const paragraphs = content.split('\n')
  const insDensity = DENSITY_MAP[cfg.density] ?? DENSITY_MAP.low
  const usedSentences = new Set<number>()
  const out: string[] = []

  paragraphs.forEach((para, pIdx) => {
    let line = para
    const trimmed = line.trim()
    if (trimmed.length >= 12) {
      // ---- 伪原创：同义词按位置种子替换 ----
      if (cfg.pseudo) {
        let wIdx = 0
        line = line.replace(SYNONYM_RE, (match) => {
          const alts = SYNONYM_MAP.get(match)
          if (!alts || alts.length === 0) return match
          const rng = seoRng(seoHash(`pw:${seedKey}:${pIdx}:${wIdx}:${match}`))
          wIdx++
          if (rng() > PSEUDO_RATE) return match
          return alts[Math.floor(rng() * alts.length) % alts.length]
        })
      }
      // ---- 干扰句插入：段尾按密度种子插入（章内去重轮转） ----
      const rngIns = seoRng(seoHash(`ins:${seedKey}:${pIdx}`))
      if (rngIns() < insDensity) {
        let pick = Math.floor(seoRng(seoHash(`pick:${seedKey}:${pIdx}`))() * INTERFERE_SENTENCES.length)
        // 章内去重：若已用过则顺移到下一个未用槽位（轮转回绕）
        for (let t = 0; t < INTERFERE_SENTENCES.length && usedSentences.has(pick); t++) {
          pick = (pick + 1) % INTERFERE_SENTENCES.length
        }
        usedSentences.add(pick)
        line = `${line}${INTERFERE_SENTENCES[pick]}`
      }
      // ---- 零宽打散：句内不可见字符（每段至多一处） ----
      if (cfg.zeroWidth && line.length > 20) {
        const zwRng = seoRng(seoHash(`zw2:${seedKey}:${pIdx}`))
        const insertAt = 6 + Math.floor(zwRng() * Math.min(line.length - 8, 30))
        line = `${line.slice(0, insertAt)}${ZW_CHARS[zwRng() < 0.5 ? 0 : 1]}${line.slice(insertAt)}`
      }
    }
    out.push(line)
  })
  return out.join('\n')
}

// ---------- ③ 混淆代码模式（每站点唯一结构代码） ----------

export type ObfuscateStrength = 'light' | 'standard' | 'heavy'

const STRENGTH_CFG: Record<ObfuscateStrength, { clsRate: number; attrRate: number; commentRate: number }> = {
  light: { clsRate: 0.25, attrRate: 0.12, commentRate: 0.04 },
  standard: { clsRate: 0.55, attrRate: 0.35, commentRate: 0.12 },
  heavy: { clsRate: 0.9, attrRate: 0.65, commentRate: 0.28 },
}

export interface ObfuscateDomOptions {
  strength: ObfuscateStrength
}

/**
 * 浏览器端 DOM 混淆：对已渲染容器注入「站点唯一」的结构噪声——
 *  - 每元素追加站点专属随机类名（o{siteHash36}-{rand}，与样式无关、纯标识）
 *  - 注入站点专属 data-* 属性
 *  - 元素间隙插入站点专属 HTML 注释
 * 视觉外观零变化（不动样式/文本/结构层级），蜘蛛抓到的结构代码逐站不同。
 * 幂等：已带 data-ob 标记的节点跳过（视图切换后新节点会被再次扫描）。
 */
export function obfuscateDom(root: HTMLElement, seedKey: string, opts: ObfuscateDomOptions): number {
  const cfg = STRENGTH_CFG[opts.strength] ?? STRENGTH_CFG.standard
  const siteTag = seoHash(seedKey).toString(36)
  const rng = seoRng(seoHash(`ob:${seedKey}`))
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  let touched = 0
  let node = walker.nextNode() as HTMLElement | null
  const nodes: HTMLElement[] = []
  while (node && nodes.length < 2000) {
    nodes.push(node)
    node = walker.nextNode() as HTMLElement | null
  }
  for (const el of nodes) {
    if (el.dataset.ob) continue
    el.dataset.ob = siteTag
    if (rng() < cfg.clsRate) {
      el.classList.add(`o${siteTag}-${Math.floor(rng() * 0xfffff).toString(36)}`)
    }
    if (rng() < cfg.attrRate) {
      el.dataset[`o${Math.floor(rng() * 0xfffff).toString(36)}`] = seoHash(`${seedKey}:${touched}`).toString(36)
    }
    if (rng() < cfg.commentRate && el.parentNode) {
      el.parentNode.insertBefore(root.ownerDocument!.createComment(`s${siteTag}.${Math.floor(rng() * 0xffffff).toString(36)}`), el)
    }
    touched++
  }
  return touched
}

// ---------- SEO 配置解析 ----------

export interface SeoConfig {
  obfuscate?: { enabled: boolean; strength?: ObfuscateStrength }
  transcode?: { enabled: boolean; mode?: TranscodeMode }
  interfere?: { enabled: boolean; density?: 'low' | 'medium' | 'high'; pseudo?: boolean; zeroWidth?: boolean }
  pseo?: { enabled: boolean; keywords?: string[]; titleTemplate?: string; descTemplate?: string; kwTemplate?: string }
}

/** 宽松解析站点 seoConfig JSON（损坏/类型漂移一律回退空配置，不阻断前台渲染） */
export function parseSeoConfig(raw: string | null | undefined): SeoConfig {
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as SeoConfig
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
