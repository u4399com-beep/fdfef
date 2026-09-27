// ============================================================
// 智能匹配：分类智能匹配 + 完结状态智能判断 + 章节序号提取（乱序重排）
// ============================================================

export const CATEGORY_DICT: Record<string, string[]> = {
  玄幻: ['玄幻', '异世大陆', '东方玄幻', '斗气', '魔法学院', '至尊', '神帝', '升级流', '废柴流', '玄奇'],
  奇幻: ['奇幻', '剑与魔法', '史诗奇幻', '西方奇幻', '领主', '龙与地下城', '剑与远征', '巫师'],
  武侠: ['武侠', '江湖', '侠客', '武林', '门派', '刀剑', '快意恩仇', '传统武侠', '国术'],
  仙侠: ['仙侠', '修真', '修仙', '修士', '金丹', '元婴', '渡劫', '飞升', '仙帝', '洪荒', '道祖', '古典仙侠'],
  都市: ['都市', '都市生活', '职场', '商战', '赘婿', '神豪', '兵王', '医生', '鉴宝', '重生都市', '异术超能'],
  现实: ['现实', '现实百态', '社会', '家庭伦理', '成功励志'],
  历史: ['历史', '历史架空', '架空历史', '秦汉', '三国', '隋唐', '宋元', '明清', '穿越历史', '王朝', '皇帝', '将相', '军史'],
  军事: ['军事', '军旅', '抗战', '烽火', '战争', '谍战', '特工', '特种兵'],
  游戏: ['游戏', '网游', '电竞', '全息', '游戏异界', '游戏系统', '主播', '网游竞技', '虚拟网游'],
  体育: ['体育', '篮球', '足球', '运动', '赛事', '冠军', '奥运'],
  科幻: ['科幻', '未来世界', '星际文明', '超级科技', '时空穿梭', '末世', '废土', '机甲', '星舰', '赛博', '进化', '变异', '基因'],
  悬疑: ['悬疑', '灵异', '推理', '侦探', '惊悚', '恐怖', '盗墓', '诡秘', '克苏鲁', '民俗', '侦探推理', '奇妙世界'],
  言情: ['言情', '古代言情', '现代言情', '总裁', '豪门', '甜宠', '宫斗', '宅斗', '婚恋', '穿越言情', '青春', '浪漫青春', '仙侠言情'],
  轻小说: ['轻小说', '同人', '衍生', '二次元', '吐槽', '搞笑', '日常', '恋爱轻小说', '原生幻想'],
  短篇: ['短篇', '短篇小说', '杂文', '故事'],
}

export interface MatchResult {
  category: string
  score: number // 0~1 置信度
  source: string // 命中来源说明
}

const ALL_CATEGORIES = Object.keys(CATEGORY_DICT)

function normalizeCategoryName(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (ALL_CATEGORIES.includes(s)) return s
  for (const cat of ALL_CATEGORIES) {
    if (s.includes(cat)) return cat
  }
  return ''
}

/** 智能分类匹配：来源分类 > 关键词命中 > 标题命中 > 简介 */
export function smartMatchCategory(input: {
  title: string
  intro: string
  keywords: string[]
  sourceCategory?: string
}): MatchResult {
  const { title, intro, keywords } = input
  const src = normalizeCategoryName(input.sourceCategory ?? '')
  if (src) return { category: src, score: 0.95, source: `来源站点分类「${src}」` }

  const scores = new Map<string, number>()
  const evidence = new Map<string, string>()
  const bump = (cat: string, v: number, why: string) => {
    scores.set(cat, (scores.get(cat) ?? 0) + v)
    if (!evidence.has(cat)) evidence.set(cat, why)
  }

  for (const kw of keywords) {
    for (const [cat, words] of Object.entries(CATEGORY_DICT)) {
      if (words.some((w) => kw.includes(w))) bump(cat, 3, `关键词「${kw}」`)
    }
  }
  for (const [cat, words] of Object.entries(CATEGORY_DICT)) {
    for (const w of words) {
      if (title.includes(w)) bump(cat, 2, `标题含「${w}」`)
    }
  }
  const introHead = intro.slice(0, 500)
  for (const [cat, words] of Object.entries(CATEGORY_DICT)) {
    for (const w of words) {
      if (introHead.includes(w)) bump(cat, 1, `简介含「${w}」`)
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length === 0 || ranked[0][1] < 1) {
    return { category: '其他', score: 0.1, source: '未命中特征，归类为其他' }
  }
  const [cat, sc] = ranked[0]
  const confidence = Math.min(0.9, 0.3 + sc * 0.08)
  return { category: cat, score: confidence, source: evidence.get(cat) ?? '特征命中' }
}

export interface CompletionResult {
  status: '连载' | '完结'
  confidence: number
  source: string
}

const FINISHED_WORDS = ['完结', '完本', '已完结', '全书完', '全本', '已完本', 'finished', '完結']
const FINISH_HINT_WORDS = ['大结局', '终章', '后记', '尾声', '最终章', '番外完', '新书', '正文完', '全书完']

/** 智能完结判断：状态字段 > 最新章节标题特征 > 简介特征 */
export function detectCompletion(input: {
  status?: string
  latestChapter?: string
  intro?: string
}): CompletionResult {
  const { status, latestChapter, intro } = input
  const st = (status ?? '').trim()
  if (st) {
    if (FINISHED_WORDS.some((w) => st.includes(w))) {
      return { status: '完结', confidence: 0.95, source: `状态字段「${st}」` }
    }
    if (st.includes('连载') || st.includes('未完') || st.includes('新作')) {
      return { status: '连载', confidence: 0.9, source: `状态字段「${st}」` }
    }
  }
  const lc = latestChapter ?? ''
  if (lc && FINISH_HINT_WORDS.some((w) => lc.includes(w))) {
    return { status: '完结', confidence: 0.85, source: `最新章节《${lc.slice(0, 20)}》含完结特征词` }
  }
  if (intro && (intro.includes('已完结') || intro.includes('已完本') || intro.includes('全书完'))) {
    return { status: '完结', confidence: 0.6, source: '简介包含完结描述' }
  }
  return { status: '连载', confidence: 0.5, source: '无完结特征，默认连载' }
}

const CN_NUM: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }

/** 中文数字 → 阿拉伯数字 */
export function chineseNumeralToInt(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  let total = 0
  let section = 0
  let current = 0
  for (const ch of s) {
    if (CN_NUM[ch] !== undefined) current = CN_NUM[ch]
    else if (CN_UNIT[ch] !== undefined) {
      const unit = CN_UNIT[ch]
      if (unit >= 10000) {
        section = (section + current) * unit
        total += section
        section = 0
      } else {
        section += (current === 0 ? 1 : current) * unit
      }
      current = 0
    }
  }
  return total + section + current
}

export const DEFAULT_CHAPTER_NUM_PATTERN =
  '(?:第\\s*)?([0-9零一二两三四五六七八九十百千万]+)\\s*[章节回卷集话篇]'

/** 提取章节序号（乱序重排依据），失败返回 -1 */
export function extractChapterNumber(title: string, pattern?: string): number {
  const p = pattern?.trim() || DEFAULT_CHAPTER_NUM_PATTERN
  try {
    const re = new RegExp(p)
    const m = re.exec(title)
    if (m && m[1]) {
      const n = chineseNumeralToInt(m[1])
      if (n >= 0 && Number.isFinite(n)) return n
    }
  } catch {
    /* invalid pattern */
  }
  // 兜底：取标题中最后一个数字
  const nums = title.match(/\d+/g)
  if (nums && nums.length) return parseInt(nums[nums.length - 1], 10)
  return -1
}
