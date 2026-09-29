/** 重复书检查：同 sourceUrl 多条记录 → 增量 upsert 键失配检测 */
import { db } from '../src/lib/db'

async function main() {
  const books = await db.book.findMany({
    where: { sourceName: 'www.cunshu.la' },
    select: { id: true, title: true, sourceUrl: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const byUrl = new Map<string, typeof books>()
  for (const b of books) {
    const key = b.sourceUrl.split('?')[0]
    const arr = byUrl.get(key) ?? []
    arr.push(b)
    byUrl.set(key, arr)
  }
  let dupes = 0
  for (const [url, bs] of byUrl) {
    if (bs.length > 1) {
      dupes++
      const labels = bs
        .map((b) => '《' + b.title.slice(0, 16) + '>@' + b.createdAt.toISOString().slice(5, 16))
        .join('  vs  ')
      console.log('重复:', labels, '|', url.slice(-24))
    }
  }
  console.log(`\n重复组: ${dupes} / 书源URL: ${byUrl.size} / 总记录: ${books.length}`)
  await db.$disconnect()
}

main()
