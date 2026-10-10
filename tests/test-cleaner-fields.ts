/**
 * 字段级噪声清洗测试（cleanFieldText）：
 * 噪声清洗范围覆盖所有采集字段——书名/作者/分类/状态/关键词/最新章节/章节标题。
 * 运行：bun tests/test-cleaner-fields.ts
 */
import { cleanFieldText } from '../src/lib/collect/cleaner'

let pass = 0
let fail = 0

function expect(label: string, actual: string, expected: string): void {
  if (actual === expected) {
    pass++
    console.log(`  ✓ ${label}`)
  } else {
    fail++
    console.log(`  ✗ ${label}\n      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`)
  }
}

console.log('— 书名 bookTitle —')
expect('尾部站名+无弹窗话术', cleanFieldText('凡人修仙传-笔趣阁无弹窗', 'bookTitle'), '凡人修仙传')
expect('整串《》包裹剥离', cleanFieldText('《斗破苍穹》', 'bookTitle'), '斗破苍穹')
expect('尾部无弹窗广告', cleanFieldText('斗破苍穹_无弹窗广告', 'bookTitle'), '斗破苍穹')
expect('尾部小说网家族', cleanFieldText('凡人修仙传_大文学无错小说网', 'bookTitle'), '凡人修仙传')
expect('URL token 剥离', cleanFieldText('斗破苍穹 https://t.co/abc', 'bookTitle'), '斗破苍穹')
expect('裸域名剥离', cleanFieldText('斗破苍穹 bqg123.com 免费阅读', 'bookTitle'), '斗破苍穹')
expect('全角空格折叠', cleanFieldText('斗破\u3000\u3000苍穹', 'bookTitle'), '斗破 苍穹')
expect('零宽字符剥离', cleanFieldText('凡人\u200b修\u200e仙传', 'bookTitle'), '凡人修仙传')
expect('实体解码兜底', cleanFieldText('斗破苍穹&nbsp;上', 'bookTitle'), '斗破苍穹 上')
expect('正常书名不误伤', cleanFieldText('回到过去当学阀', 'bookTitle'), '回到过去当学阀')
expect('叠缀循环剥离', cleanFieldText('凡人修仙传-笔趣阁-无弹窗', 'bookTitle'), '凡人修仙传')

console.log('— 章节标题 chapterTitle —')
expect('尾部站名', cleanFieldText('第12章 大结局_笔趣阁', 'chapterTitle'), '第12章 大结局')
expect('分页残留 (2/3)', cleanFieldText('第12章 大风波(2/3)', 'chapterTitle'), '第12章 大风波')
expect('分页残留 （第2/3页）', cleanFieldText('第12章 大风波（第2/3页）', 'chapterTitle'), '第12章 大风波')
expect('下划线页码 _2', cleanFieldText('第12章 大风波_2', 'chapterTitle'), '第12章 大风波')
expect('章节目录后缀', cleanFieldText('第3章 风起 章节目录', 'chapterTitle'), '第3章 风起')
expect('叠缀+分页', cleanFieldText('第1章 开始-笔趣阁-无弹窗(1/5)', 'chapterTitle'), '第1章 开始')
expect('序号在前不受影响', cleanFieldText('第12章 2023', 'chapterTitle'), '第12章 2023')
expect('破折号数字不误剥', cleanFieldText('第123-3章 双日期', 'chapterTitle'), '第123-3章 双日期')
expect('正常章节标题', cleanFieldText('第九百章 巅峰对决', 'chapterTitle'), '第九百章 巅峰对决')
expect('修订标记保留', cleanFieldText('第5章 重逢(修)', 'chapterTitle'), '第5章 重逢(修)')

console.log('— 最新章节 latestChapter —')
expect('前缀剥离', cleanFieldText('最新章节：第100章 大结局', 'latestChapter'), '第100章 大结局')
expect('前缀+尾部词缀', cleanFieldText('最新章节：第100章 大结局_笔趣阁', 'latestChapter'), '第100章 大结局')
expect('全书完词缀', cleanFieldText('第1024章 尾声（全书完）', 'latestChapter'), '第1024章 尾声')
expect('最新更新前缀', cleanFieldText('最新更新: 第88章 落幕', 'latestChapter'), '第88章 落幕')

console.log('— 保守字段（作者/分类/状态/关键词）：只做基础清洗，词缀不适用 —')
expect('作者正常值', cleanFieldText('天蚕土豆', 'author'), '天蚕土豆')
expect('作者URL剥离', cleanFieldText('天蚕土豆 www.xx.com', 'author'), '天蚕土豆')
expect('作者不剥站名后缀', cleanFieldText('我吃西红柿', 'author'), '我吃西红柿')
expect('分类正常值', cleanFieldText('玄幻魔法', 'category'), '玄幻魔法')
expect('分类零宽剥离', cleanFieldText('玄\u200b幻魔法', 'category'), '玄幻魔法')
expect('状态正常值', cleanFieldText('连载中', 'status'), '连载中')
expect('关键词零宽剥离', cleanFieldText('热血\u2060', 'keywords'), '热血')

console.log('— 守卫 —')
expect('清洗为空回退原值', cleanFieldText('https://t.co/abc', 'bookTitle'), 'https://t.co/abc')
expect('空串', cleanFieldText('', 'bookTitle'), '')
expect('纯空白', cleanFieldText('   ', 'bookTitle'), '')

console.log(`\n结果：${pass} 通过，${fail} 失败`)
if (fail > 0) process.exit(1)
