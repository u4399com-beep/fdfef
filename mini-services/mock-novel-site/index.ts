// 本地模拟小说站：用于端到端验证采集系统
// 端口 3031 —— 列表分页 / 书籍信息 / 目录分页+乱序 / 正文分页+广告
const PORT = 3031

interface MockBook {
  id: number
  title: string
  author: string
  category: string
  keywords: string
  intro: string
  status: string
  coverColor: string
  chapters: number
}

const BOOKS: MockBook[] = [
  {
    id: 1, title: '斗罗星河传', author: '唐三少', category: '玄幻',
    keywords: '玄幻,斗气,星河,升级流', status: '连载',
    intro: '少年觉醒星河武魂，从此踏上斗气大陆的巅峰之路。这是玄幻世界的热血传奇，升级流爽文。',
    coverColor: '#7c5cbf', chapters: 12,
  },
  {
    id: 2, title: '都市重生之神豪', author: '锦鲤附体', category: '都市',
    keywords: '都市,重生,神豪,商战', status: '完结',
    intro: '重生回到2008年，这一次他要成为真正的都市之神豪，商战职场无所不能。',
    coverColor: '#2f8f6b', chapters: 10,
  },
  {
    id: 3, title: '星际机甲风暴', author: '铁翼', category: '科幻',
    keywords: '科幻,机甲,星际,末世', status: '连载',
    intro: '末世纪元，人类驾驶机甲征战星际文明。超级科技与废土求生交织的科幻史诗。',
    coverColor: '#b0642a', chapters: 8,
  },
]

const chapterTitle = (b: MockBook, n: number): string => `第${n}章 ${b.title}风云突变`

function coverSvg(b: MockBook): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="267"><rect width="200" height="267" fill="${b.coverColor}"/><text x="100" y="120" font-size="28" fill="#fff" text-anchor="middle" font-family="serif">${b.title.slice(0, 2)}</text><text x="100" y="160" font-size="16" fill="#fff" text-anchor="middle" opacity="0.8">${b.author}</text></svg>`
}

function bookPage(b: MockBook): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${b.title} - 模拟小说网</title>
<meta name="keywords" content="${b.keywords}">
</head><body>
<div class="breadcrumb"><a href="/">首页</a> &gt; <a href="/sort.html">${b.category}</a> &gt; <h1 id="title">${b.title}</h1></div>
<div class="book-info">
  <div id="cover"><img src="/cover/${b.id}.svg" alt="${b.title}封面"></div>
  <div>
    <p>作者：<span id="author">${b.author}</span></p>
    <p>分类：<span id="category">${b.category}</span></p>
    <p>状态：<span id="status">${b.status}</span></p>
    <p>最新章节：<span id="latest">${chapterTitle(b, b.chapters)}</span></p>
    <div id="intro">${b.intro}</div>
    <a id="toc-link" href="/toc/${b.id}.html">查看完整目录</a>
  </div>
</div>
</body></html>`
}

/** 目录页：乱序输出 + 分页（每页 6 章）+ URL 乱序 */
function tocPage(b: MockBook, page: number): string {
  const per = 6
  const total = b.chapters
  const nums: number[] = []
  for (let i = 1; i <= total; i++) nums.push(i)
  // 首页打乱顺序（制造乱序场景）
  const pageNums = nums.slice((page - 1) * per, page * per)
  if (page === 1) pageNums.sort(() => Math.random() - 0.5)
  const items = pageNums
    .map((n, idx) => {
      // URL 故意带无意义 query 参数制造 URL 去重场景（idx=0 与重复项）
      const dup = page === 2 && idx === 0 ? `?dup=${idx}` : ''
      return `<dd><a href="/chapter/${b.id}/${n}.html${dup}">${chapterTitle(b, n)}</a></dd>`
    })
    .join('\n')
  const next = page * per < total ? `<a id="toc-next" href="/toc/${b.id}_${page + 1}.html">下一页</a>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${b.title} 目录</title></head>
<body><h1>${b.title} 正文卷</h1><div id="list">${items}</div>${next}</body></html>`
}

/** 正文页：两页拼接 + 广告行 */
function chapterPage(b: MockBook, n: number, part: number): string {
  const para = (tag: string) =>
    `<p>　　${b.title}第${n}章${tag}，夜色如墨，星辰隐去。少年握紧手中的剑，感受着体内奔涌的力量，前方的道路注定不会平坦。</p>`
  const ad = `<div>一秒记住本站最新网址 www.demo-novel.com</div>`
  const next = part === 1 ? `<a id="next" href="/chapter/${b.id}/${n}_2.html">下一页</a>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${chapterTitle(b, n)}</title></head>
<body><h1>${chapterTitle(b, n)}</h1>
<div id="content">
${para('序幕')}
${ad}
${para(part === 1 ? '上篇' : '终篇')}
<p>　　(本章完)</p>
</div>
${next}
</body></html>`
}

function listPage(page: number): string {
  const items = BOOKS.map(
    (b) => `<li><a class="btitle" href="/book/${b.id}.html">${b.title}</a><span>${b.author}</span></li>`
  ).join('\n')
  const next = page < 2 ? `<a id="next" href="/list/${page + 1}.html">下一页</a>` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>书库列表 第${page}页</title></head>
<body><ul class="book-list">${items}</ul>${next}</body></html>`
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url)
    const p = url.pathname
    let body = 'not found'
    let type = 'text/html; charset=utf-8'
    const m1 = /^\/cover\/(\d+)\.svg$/.exec(p)
    const m2 = /^\/book\/(\d+)\.html$/.exec(p)
    const m3 = /^\/toc\/(\d+)_(\d+)\.html$/.exec(p)
    const m4 = /^\/toc\/(\d+)\.html$/.exec(p)
    const m5 = /^\/chapter\/(\d+)\/(\d+)_2\.html$/.exec(p)
    const m6 = /^\/chapter\/(\d+)\/(\d+)\.html$/.exec(p)
    const m7 = /^\/list\/(\d+)\.html$/.exec(p)
    if (m1) {
      const b = BOOKS.find((x) => x.id === Number(m1[1]))
      body = b ? coverSvg(b) : 'x'
      type = 'image/svg+xml'
    } else if (p === '/robots.txt') {
      body = 'User-agent: *\nAllow: /'
      type = 'text/plain'
    } else if (m2) {
      const b = BOOKS.find((x) => x.id === Number(m2[1]))
      body = b ? bookPage(b) : 'x'
    } else if (m3) {
      const b = BOOKS.find((x) => x.id === Number(m3[1]))
      body = b ? tocPage(b, Number(m3[2])) : 'x'
    } else if (m4) {
      const b = BOOKS.find((x) => x.id === Number(m4[1]))
      body = b ? tocPage(b, 1) : 'x'
    } else if (m5) {
      const b = BOOKS.find((x) => x.id === Number(m5[1]))
      body = b ? chapterPage(b, Number(m5[2]), 2) : 'x'
    } else if (m6) {
      const b = BOOKS.find((x) => x.id === Number(m6[1]))
      body = b ? chapterPage(b, Number(m6[2]), 1) : 'x'
    } else if (m7) {
      body = listPage(Number(m7[1]))
    } else if (p === '/') {
      body = '<html><head><meta charset="utf-8"><title>模拟小说站</title></head><body><a href="/list/1.html">进入书库</a></body></html>'
    }
    return new Response(body, { headers: { 'Content-Type': type } })
  },
})

console.log(`[mock-novel-site] listening on http://localhost:${PORT}`)
