/**
 * 清洗系统 v2 验证：内置噪声层/行内URL剥离/章首垃圾/重复推广行/不可见字符/幂等性
 * 用法: bun tests/test-cleaner-v2.ts
 */
import { cleanContent } from '../src/lib/collect/cleaner'
import { mergeCleaning } from '../src/lib/collect-types'

const cfg = mergeCleaning(null)

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ---------- 1. QQ 群推广（真实样本：星穹铁道书） ----------
console.log('[1] QQ 群推广')
{
  const html = `<p>走在大街上，苏洛被一生老态的声音叫住。</p><p>每日更新qq群962827651</p><p>每日更新qq群962827651</p><p>每日更新qq群</p><p>“年轻人，你看我像人还是像神？”</p>`
  const r = cleanContent(html, cfg)
  check('QQ群号行全部移除', !r.text.includes('qq群') && !r.text.includes('962827651'), r.text)
  check('正文对话保留', r.text.includes('你看我像人还是像神'), r.text)
  check('统计 promoRepeat/adPattern>0', r.stats.promoRepeat + r.stats.adPattern >= 2, JSON.stringify(r.stats))
}

// ---------- 2. 行内 URL / 短链 / 云盘链剥离（真实样本：9lnk.io 短链粘连行尾） ----------
console.log('[2] 行内 URL 剥离')
{
  const html = `<p>“你看热搜了吗，你的好日子要来了！”每日 推文 :https://9lnk.io/yeC9</p><p>助理小莫在那头一脸兴奋。</p>`
  const r = cleanContent(html, cfg)
  check('URL 与残留话术全部剥离', !r.text.includes('9lnk') && !r.text.includes('推文') && !r.text.includes('每日'), r.text)
  check('正文对话主体保留', r.text.includes('你看热搜了吗') && r.text.includes('助理小莫'), r.text)
}
{
  const html = `<p>②每天本历史更新合集链接:</p><p>https://www.kdocs.cn/l/cvulde27muXf</p><p>①搜书神器</p><p>https://</p><p>正文第一段。</p>`
  const r = cleanContent(html, cfg)
  check('云盘链/搜书神器/孤协议行全部移除', !r.text.includes('kdocs') && !r.text.includes('搜书神器') && !r.text.includes('https'), r.text)
  check('正文保留', r.text.includes('正文第一段'), r.text)
}
{
  // 无协议裸域名 + 中文上下文
  const html = `<p>最新章节请访问 www.kelexs.com 阅读全文</p><p>他推开门走了出去。</p>`
  const r = cleanContent(html, cfg)
  check('www 裸域名剥离', !r.text.includes('kelexs'), r.text)
  check('剩余正文保留', r.text.includes('阅读全文') || r.text.includes('他推开门'), r.text)
}

// ---------- 3. 章首结构性垃圾（真实样本：你就顶着这张脸搞暗恋啊） ----------
console.log('[3] 章首结构性垃圾')
{
  const html = `<p>第1段</p><p>你就顶着这张脸搞暗恋啊？</p><p>作者：司皎</p><p>简介：</p><p>内娱传奇影帝沈寂星，高山白雪，矜贵冷冽。</p>`
  const r = cleanContent(html, cfg, [], { bookTitle: '你就顶着这张脸搞暗恋啊？' })
  check('纯序号行/书名行/作者行/简介标记移除', !r.text.includes('第1段') && !r.text.includes('司皎') && !r.text.includes('简介'), r.text)
  check('正文首段保留', r.text.includes('沈寂星'), r.text)
  check('headerJunk 统计 ≥3', r.stats.headerJunk >= 3, JSON.stringify(r.stats))
}
{
  // 非章首位置的「作者：」行不动（正文对话可能性）
  const html = `<p>段落一的内容比较多一些。</p><p>段落二也有内容。</p><p>段落三继续。</p><p>段落四继续。</p><p>段落五继续。</p><p>段落六继续。</p><p>段落七继续。</p><p>段落八继续。</p><p>作者：某人说道</p>`
  const r = cleanContent(html, cfg)
  check('章首 8 行之外的作者行保留', r.text.includes('作者：某人说道'), r.text)
}

// ---------- 4. 重复推广行 vs 对话重复（防误杀） ----------
console.log('[4] 重复推广行')
{
  const html = `<p>本章说人数上限50人，加群：123456789，微信群同号。</p><p>本章说人数上限50人，加群：123456789，微信群同号。</p><p>正常对话第一句。</p>`
  const r = cleanContent(html, cfg)
  check('重复含群号行移除', !r.text.includes('微信群'), r.text)
  check('正常行保留', r.text.includes('正常对话第一句'), r.text)
}
{
  // 对话重复 3 次但无推广特征 → 保留
  const html = `<p>“年轻人，你看我像人还是像神。”</p><p>“年轻人，你看我像人还是像神？”</p><p>“年轻人，你看我像人还是像神！”</p><p>他问第三遍了。</p>`
  const r = cleanContent(html, cfg)
  check('无特征对话重复保留（防误杀）', r.text.includes('你看我像人还是像神'), r.text)
}

// ---------- 5. 不可见字符剥离 ----------
console.log('[5] 不可见字符')
{
  const html = `<p>这是被插入零宽字符的&#8203;正文段落，防抄袭水印。</p>`
  const r = cleanContent(html, cfg)
  check('零宽字符剥离', !r.text.includes('\u200b') && r.stats.invisibleChars >= 1, JSON.stringify(r.stats))
  check('正文无损', r.text.includes('这是被插入零宽字符的正文段落'), r.text)
}

// ---------- 6. 幂等性（已清洗文本再清洗 = 无变化） ----------
console.log('[6] 幂等性')
{
  const dirty = `<p>第1章 起点</p><p>王莽猛然惊醒，抓住身下的锦缎被褥。</p><p>每日更新qq群962827651</p><p>“今日是何年月？”他嘶哑地问。</p>`
  const first = cleanContent(dirty, cfg, [], { bookTitle: '测试书名', chapterTitle: '第1章 起点' })
  const second = cleanContent(`<div>${first.text}</div>`, cfg, [], { bookTitle: '测试书名', chapterTitle: '第1章 起点' })
  check('二次清洗不再移除（removedLines=0）', second.removedLines === 0, `second removed=${second.removedLines} text=${second.text.slice(0, 60)}`)
  check('二次清洗文本一致', second.text === first.text, 'text mismatch')
}

// ---------- 7. 开关关闭时不过度清洗 ----------
console.log('[7] 开关')
{
  const html = `<p>访问 https://example.com/book 获取全文</p>`
  const off = cleanContent(html, { ...cfg, stripInlineUrls: false })
  check('stripInlineUrls=false 保留 URL', off.text.includes('example.com'), off.text)
  const junkOff = cleanContent(`<p>第1段</p><p>正文内容。</p>`, { ...cfg, removeHeaderJunk: false })
  check('removeHeaderJunk=false 保留序号行', junkOff.text.includes('第1段'), junkOff.text)
}

// ---------- 8. removedSamples 报告 ----------
console.log('[8] 移除样本')
{
  const html = `<p>正常内容。</p><p>一秒记住本站网址.com</p><p>www.spam-site.xyz</p>`
  const r = cleanContent(html, cfg)
  check('样本非空且含垃圾行', r.removedSamples.length >= 1 && r.removedSamples.some((s) => s.includes('spam-site')), JSON.stringify(r.removedSamples))
}

// ---------- 9. 混淆变形推广（token 插入正文/群号中文谐音） ----------
console.log('[9] 混淆变形推广')
{
  const html = `<p>备用qq群 八jiu三jiu硫祀驷⒍澪</p><p>正常段落一字不差。</p>`
  const r = cleanContent(html, cfg)
  check('备用qq群+变形群号行移除', !r.text.includes('备用qq群') && !r.text.includes('八jiu'), r.text)
  check('正常段落保留', r.text.includes('正常段落一字不差'), r.text)
}
{
  // token 插入句中：「毁小说qq群灭伞其全人类」→ 剥 token 及后续变形群号，句子残留但广告消失
  const html = `<p>至少神明并不是要毁小说qq群灭伞其全人类，伊七⑵九只是对其进行审判。</p>`
  const r = cleanContent(html, cfg)
  check('句中「小说qq群」token 剥除', !r.text.includes('小说qq群'), r.text)
}
{
  // 裸「qq群」正文合法提及不受影响（无混淆前缀、无纯数字群号）
  const html = `<p>他后来建了个qq群方便书友聊天，这个习惯保持了很久。</p>`
  const r = cleanContent(html, cfg)
  check('正文合法「qq群」保留（防误杀）', r.text.includes('qq群'), r.text)
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
process.exit(fail > 0 ? 1 : 0)
