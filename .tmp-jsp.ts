import { testRule } from './src/lib/collect/testing'
const cfg = {
  items: {
    item: { mode: 'css', expr: '#list dd a' },
    title: { mode: 'css', expr: 'a', attr: 'text' },
    link: { mode: 'css', expr: 'a', attr: 'href' },
  },
  jsPages: { enabled: true, itemsSelector: '.chapter_page select option', skipFirst: true, waitAfterClick: 1200, maxPages: 5 },
}
const r = await testRule('toc', cfg, 'http://localhost:3031/rqtocjs/3.html')
console.log('JSP:' + JSON.stringify({ ok: r.ok, msg: r.message?.slice(0, 60), total: r.data?.total, pages: r.data?.pagesFetched, dup: r.data?.dupRemoved }))
