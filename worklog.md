---
Task ID: 5
Agent: frontend-styling-expert
Task: 开发 5 套小说站前台主题模板

Work Log:
- 读取 src/lib/theme-types.ts 确认 ThemeProps/SiteView/BookCard/BookDetail/ChapterDetail 契约；确认 lucide-react 可用、无新依赖引入。
- 新建 src/components/themes/ 目录，逐一实现 5 套主题（均为 'use client'，内部 useState 做分类筛选与目录正/倒序切换，view 由主组件 switch 分发到 4 个视图：home/book/chapter/keyword）：
  1. theme-classic.tsx — 经典书香：amber-50 米黄纸底 + stone 墨字 + font-serif，顶部横向导航（Feather logo），书籍为左封面(无封面用首字色块)右信息行式列表，book 页双栏章节网格(max-h-96 overflow-y-auto)，chapter 页大字号衬线正文居中排版。
  2. theme-noir.tsx — 暗夜极简：zinc-950 深底 + max-w-3xl 窄单栏 + font-mono 点缀（编号/分类 uppercase tracking），无图纯文字书目目录式列表（01/02 序号 + hover 亮起），章节目录 mono 三位编号，阅读页 max-w-xl 行长短句式排版；仅 zinc 色板，无蓝/靛。
  3. theme-magazine.tsx — 清新杂志：白底 + stone-50 页面，渐变斑马纹大 banner（repeating-linear-gradient 45° 白纹叠加 emerald→amber→rose 渐变），分类按 hash 映射 emerald/rose/amber/teal/orange 彩色徽章，书籍 1/2/3/4 列卡片网格（移动端 16/10 横版封面、sm 起 3/4 竖版，hover -translate-y-1 + shadow-xl，stretched-button 覆盖层保证可点击），章节目录双栏胶囊行，阅读页圆角卡片容器。
  4. theme-ink.tsx — 古典水墨：stone-100 宣纸底（径向渐变纸纹 + 微 vignette 模拟纹理），stone-900 墨字，朱砂红 #9e2b25 点缀（印章 logo、标签、active 下划线），右侧 writing-mode: vertical-rl 竖排诗句装饰(lg 以上显示)，渐变墨线分隔，横向长卷书列卡片（左朱砂竖条 + 封面 + 内容），章节目录 2/3 列 gap-px 密排，阅读页宣纸卡片 + 正文 indent-8 首行缩进。
  5. theme-neon.tsx — 现代炫彩：#18181b 深灰底 + violet-500→fuchsia-500→orange-400 渐变体系（渐变 logo 文字/渐变 hairline/渐变描边 p-[2px] 卡片内层 #1d1d22），sticky 毛玻璃页头，hero 大渐变横幅（模糊光斑 + 粗黑大标题 + CTA），3 列渐变描边卡片网格 hover 发光，阅读页 text-zinc-200 易读浅色正文 + 渐变返回目录按钮。
- 每套主题均实现契约要求的 4 视图公共能力：loading 时该主题风格 animate-pulse 骨架屏；data 缺失优雅降级（未找到书籍/章节文案 + 返回首页）；book 页含面包屑、信息行(作者/分类/状态/章节数/更新时间)、简介、keywords+suggestKeywords 去重标签(点击进 keyword 视图)、正/倒序切换 + max-h-96 滚动章节目录；chapter 页按 \n 拆段渲染、prev/next 为 null 时禁用；keyword 页最顶部醒目「进入主书籍信息页」按钮(mainBookId 优先否则回 home) + h1 关键词 + 相关书籍 + 底部相关关键词链。
- 规范落实：语义化 header/nav/main/article/footer/h1-h3/ul-li；所有 img 带 alt；交互目标 min-h-[44px]；移动端单栏、md+ 多栏；lucide-react 图标（Feather/BookOpen/Clock/User/Tag/ChevronRight/ArrowLeft/Right/Up/Down/Hash/Flame/Sparkles/List/Scroll/Brush/Zap）全部 aria-hidden 装饰处理；未使用 blue-*/indigo-* 任何色板。
- 新建 src/components/themes/index.ts 注册表：THEMES Record（classic/noir/magazine/ink/neon，含 ThemeMeta 中文名/描述/preview）+ THEME_LIST 导出，类型来自 @/lib/theme-types。
- 自检：bun run lint 通过（0 错误 0 警告输出）；bunx tsc --noEmit 过滤确认 src/components/themes 无任何类型错误（仓库其余 examples/skills 下为与本次无关的既有错误）；grep 确认无 blue/indigo 色值。未运行 dev/build，未改动 theme-types、src/app、prisma 等其他文件。

Stage Summary:
- 交付 6 个文件：theme-classic.tsx / theme-noir.tsx / theme-magazine.tsx / theme-ink.tsx / theme-neon.tsx（命名导出 ThemeClassic/ThemeNoir/ThemeMagazine/ThemeInk/ThemeNeon，签名 (props: ThemeProps) => ReactElement，含默认导出）+ index.ts 注册表（THEMES/THEME_LIST/ThemeEntry）。
- 5 套主题布局/配色/字体/间距差异明显：米黄衬线行式 vs 深色 mono 纯文字 vs 白底彩色卡片网格 vs 宣纸长卷水墨 vs 深灰渐变描边，均为换皮禁区内的独立设计。
- 全部通过 eslint 与类型检查，仅用 tailwind class + lucide-react + react 内置，零新依赖；keyword 视图均按要求将主书籍入口置于最醒目位置以服务站群 SEO。

---
Task ID: 1,2,3,4,6,7,8,9,10,11
Agent: orchestrator (Z.ai Code)
Task: 小说管理系统全栈开发（数据库/采集核心库/任务管线/API/后台UI/前台预览/Docker/端到端验证）

Work Log:
- Task 1: 安装 cheerio / iconv-lite / @xmldom/xmldom / xpath / playwright（动态策略加载）依赖
- Task 2: 重写 prisma/schema.prisma（Book/Chapter/CollectRule/CollectTask/TaskLog/SiteConfig/SystemConfig 7 模型），db push 同步 SQLite
- Task 3: 采集核心库 src/lib/collect/：
  - parser.ts 统一选择器引擎（CSS/正则/XPath 三模式混用，xpath 经 cheerio 规范化→xmldom 解析，命名实体解码；列表项/字段集/正文段落保留提取）
  - fetcher.ts 多策略抓取（HTTP 直连+UA轮换+GBK/iconv 编码识别+重试；Playwright JS 渲染；Hyperbrowser 云隐身 SDK 动态加载）
  - cleaner.ts 内容清洗（标签剔除/广告正则整行+行内/实体解码/段落规范化/最短段落过滤）
  - matcher.ts 智能分类（15类词典+置信度）+ 智能完结（状态字段/最新章节特征/简介三级判断）+ 中文数字章节序号解析
  - suggest.ts 五引擎下拉词（baidu/bing/360/ddg/google，超时优雅降级+合并去重）
  - storage.ts 章节txt存储 + sharp封面转webp + safeFileName
- Task 4: task-manager.ts 全局运行时（立即执行/暂停自旋/恢复/停止）+ runRandomPool 随机线程池（线程数与间隔均在[min,max]随机）；pipeline.ts 采集管线（range列表展开→URL去重→书籍upsert（增量按置信度更新/全量覆盖）→封面webp→目录分页+乱序重排+URL/标题去重→正文分页合并清洗→db/txt/both三态存储），testing.ts 四类规则测试引擎，download-builder.ts 下载注入（站点信息模板/每N章广告/零宽·同形字·干扰行三种混淆）
- Task 6: 19 个 API 路由（rules CRUD+test、tasks CRUD+control(start/pause/resume/stop)+logs增量、books+chapters+suggest+download、covers webp 服务、sites、settings、stats、preview、clean-test、chapters/[id]）
- Task 7: 后台 SPA（dashboard 实时统计轮询 / rules-page 结构化选择器编辑器+每类内置测试面板+示例预设 / tasks-page 任务卡+编辑器+2.5s轮询+日志抽屉 / books-page 搜索筛选+详情+章节滚动列表+下拉词抓取 / sites-page 站群CRUD / templates-page 主题一览 / settings-page 清洗+下载注入配置+清洗测试），粘性页脚 min-h-screen flex flex-col + mt-auto
- Task 8: preview-shell.tsx 前台预览壳（视图路由 home/book/chapter/keyword、逐视图 TDK 动态注入 document.title+meta、JSON-LD Book/BreadcrumbList 结构化数据、5主题即切）
- Task 9: Dockerfile（bun 多阶段构建+prisma db push entrypoint+healthcheck）、docker-compose.yml（db/storage/download 卷持久化+HYPERBROWSER_API_KEY）、.dockerignore、DEPLOY.md 分步部署说明（Docker/裸机双路径、站群 Nginx+Caddy 反代、Playwright 扩展镜像、备份、FAQ）
- Task 10 端到端验证：构建 mini-services/mock-novel-site（3031端口：列表分页/书籍页/目录乱序+分页+重复URL/正文两页+广告行），真实跑通范围采集任务（3书30章0错误），验证：URL去重(9候选→3本)、智能分类、乱序重排、封面webp、txt落盘、广告剔除、分页合并、下载注入(1广告+47零宽字符+站点信息×2)、百度下拉词10条（其余引擎沙箱网络优雅降级）、暂停(进度冻结)→继续→停止、Agent Browser 走查仪表盘/规则编辑+测试面板/任务控制+日志/书籍详情/站群/5套前台主题TDK+JSON-LD+关键词落地页/移动端响应式
- 修复问题：Turbopack 对未安装模块静态解析报错（playwright 改为安装包+动态变量导入）、xmldom 类型断言、cheerio v1 API 类型、JSX 下标成员标签、日志暗底深字不可见、download URL 中文编码

Stage Summary:
- 交付完整可运行的小说管理系统：Next.js 16 + SQLite + 5主题站群 + 全功能采集管线，lint 0错误0警告，tsc 无业务错误，dev.log 无运行时错误
- 全部用户需求点落地：三模式选择器/四类规则+测试/反反爬三策略/清洗/智能分类完结/随机线程间隔/乱序重排去重/全量增量/双存储+webp封面/五引擎下拉词+独立关键词页指向主书籍/5套迥异主题TDK+SEO+GEO/站群偏移量/下载混淆注入/Docker开箱即用+分步文档
- 演示数据已入库（3本书/30章/1任务/1站点/4规则），用户可直接预览全部功能

---
Task ID: R1(修复)-a
Agent: orchestrator (Z.ai Code)
Task: 深度代码审查修复 + 反反爬增强 + kelexs.com 采集

Work Log:
- 修复 task-manager 嵌套池 runtime 覆盖/误删 bug（ensure/owned 语义），书籍级池内嵌章节池时暂停/停止不再失效
- fetcher.ts 全面重写：CookieJar 进程级会话（Set-Cookie/Playwright cookies 双向同步）、Client Hints 指纹头、Playwright stealth 注入、WAF 挑战页检测 + VLM 验证码自动求解（25s 超时保护）、HTTP 403 自动升级浏览器、重试轮换 UA、fetchImage 校验
- 新增 jsPages：JS 渲染翻页交互（分页参数加密/URL 不变站点），逐项点击+triggerSelector 展开控件+短超时防挂起+快照拼接
- 新增 DomainThrottle 全局同域节流器（默认 1200ms），从源头防止多线程任务触发 WAF
- 修复 parser selectValue URL 误解析（URL_ATTRS 白名单，meta content 不再被 URL 编码）
- 修复 cleaner 广告双重计数 + 命中首个规则即 break 导致广告残留 → 循环应用全部规则
- 修复 storage readChapterTxt 路径穿越校验（path.resolve + sep 前缀）
- testing.ts 防自循环（next===finalUrl）、合并重复 import
- pipeline tocLink 类型规范化（collect-types BookRuleConfig.fields.tocLink）、死代码清理、书籍采集失败重试一次、finalStatus 语义修正
- task-manager/cookieJar/throttle globalThis 缓存 key 版本化（dev 热重载后旧实例缺新方法问题）
- matcher 科幻词典补充'诸天无限/诸天/无限流'等
- suggest.ts UA 轮换
- 实战验证：kelexs.com（GoEdge WAF）WAF 验证页 → Playwright stealth + VLM 验证码求解 → 通过（35KB 真实页面），Cookie 复用后 HTTP 直连免验证

Stage Summary:
- 采集系统反反爬能力：HTTP→WAF检测→Playwright(stealth)→VLM验证码→Cookie会话复用→同域节流 全链路闭环
- kelexs.com 四类规则已注册（列表/书籍og:novel/目录jsPages翻页/正文多页合并+广告清洗），离线验证全部选择器通过
- 发现并应对真实 WAF 对抗场景：验证码挑战、IP 临时封禁（硬403）、JS 加密分页

---
Task ID: R1(采集)-b
Agent: orchestrator (Z.ai Code)
Task: kelexs.com 实战采集（对抗 GoEdge WAF）

Work Log:
- 深度探测 kelexs.com：GoEdge WAF（验证码挑战/JS加密分页/IP封禁三层防护）
- 破解过程：HTTP 403→Playwright stealth→VLM 验证码求解→通过；IP 被封后改用"curl 会话+VLM"方案（POST 挑战页自身 URL）获得通行 cookie ge_wc_20
- 发现通行 cookie 与 UA 绑定 → 规则固化 rotateUA=false + 固定 UA
- 发现 3 本书均 ≤100 章 → 目录页改 http 策略（单页完整），绕开被指纹拒绝的 playwright
- fetcher 增加进程级浏览器单例（持久会话）、DomainThrottle lockout（403 全局冷却 3 分钟）、goto 网络重试
- globalThis 缓存重构：状态数据挂 globalThis、类实例每次新建（根治热重载旧实例缺方法问题）
- pipeline 全链路限频：书籍→封面→目录→章节各阶段统一 interval；书籍失败重试跨冷却期
- 修复 GET /api/tasks 误杀运行中任务（stale 检测加 taskManager.has 条件）
- 最终全链路打通：《光之国》书籍+48章目录+正文 18篇 0错误

Stage Summary:
- 反反爬实战 arsenal：VLM 验证码求解（脚本 tests/solve-captcha2.sh 可复用）、cookie 注入规则（tests/inject-cookie.ts）、同域节流+lockout、全链路限频
- kelexs 采集继续后台运行中，增量模式可随时补采缺失章节

---
Task ID: R1(采集)-final
Agent: orchestrator (Z.ai Code)
Task: kelexs.com 三本书完整采集收官 + 最终验证

Work Log:
- 增量任务最终轮：3 本书全部处理完成
- 数据库核对：光之国 48/48、诸天霸主 77/77、病娇 96/96 —— 221 章正文 100% 采集
- 质量审计：零空章、零广告残留、总字数 52.3 万、均章 2200-2500 字、封面 webp ×3、搜索引擎下拉词 10-17 个/本
- 智能功能验证：智能分类（军事/武侠/都市）、智能完结（全本→完结）、下拉词标签链
- Agent Browser 端到端：前台 3 本书展示 → 书籍详情 48 章目录 → 章节阅读（TDK 正确/正文渲染/上一章下一章导航/末章禁用）
- TXT 下载：346KB 文件、零宽混淆 2124 字符、站点信息注入 ✓、广告 4 条、UTF-8 文件名
- 移动端响应式验证、页脚自然下推
- lint 0 错误、业务 TSC 0 错误、dev.log 无运行时错误

Stage Summary:
- kelexs.com（GoEdge WAF 严防站点）三本书 221 章完整采集交付
- 反反爬全链路闭环：WAF 检测→Playwright stealth→VLM 验证码求解→通行 cookie 会话复用→同域节流+lockout 冷却→全链路限频
- 可复用工具：tests/solve-captcha2.sh（curl+VLM 解验证码）、tests/inject-cookie.ts（cookie 注入规则）、tests/register-kelex-rules.ts（规则注册）
---
Task ID: R2(iteration)-a
Agent: orchestrator (Z.ai Code)
Task: 新迭代 18 轮次：cunshu.la + rqwb.com 采集规则/实采 + 逐行深度抓 bug + 清理整合优化

Work Log:
- 探测目标站：两站均为 GoEdge WAF（/WAF/VERIFY/CAPTCHA）；泛化验证码求解器 tests/solve-captcha-generic.sh（curl 会话 + VLM 识别，均第 2 次尝试通过）
- 【轮1 反反爬增强】parser.ts 新增 decodeProtectedChars：解码存书啦 kw-protect 藏字（data-cp 十六进制码点，浏览器端 JS 回填防采集）；挂载 parseFields/parseListEntries/parseContentHtml 三入口；实测 ch2「风暴降生的龙女」完整还原
- 【轮2】fetcher fetchWithRetry 增加 keepUA 参数（rotateUA=false 时重试不再轮换 UA，根治 WAF cookie-UA 绑定失效）；fetchImage 支持显式 cookies；导出 FIXED_UA；pipeline 封面下载传入规则 cookies + 固定 UA
- 【轮3 重大缺失修复】前端测试面板调用 POST /api/rules/test 但路由从未创建（405）→ 新建 src/app/api/rules/test/route.ts 暴露 testRule 引擎，四类规则测试功能恢复可用
- 【轮4】nodeToText/cleaner 块级元素改 before+after 双侧断行（修复 rqwb 正文头部域名行与首段粘连无法按行清除）
- 规则注册：存书啦×4（列表 resource-card / 书籍 ph-name / 目录 chapter-chip 284章单页 / 正文 chapter-text + 藏字解码 + 乱码广告 run 正则）；人气完本×4（首页 side_commend / novel_info 全字段（畸形嵌套 p 用 nth-of-type(2) 取简介）/ ul_all_chapters / article#article + 域名行与站点话术清洗）；rotateUA=false + WAF 通行 cookie 注入；11 项测试全部通过
- 【轮5】pipeline executeTask 在首个 await 前同步注册运行时（根治启动窗口被 /api/tasks stale 检测误杀）；runRandomPool 返回 stopped → 任务最终状态写 stopped（修复 stop 路由与 pipeline 完成写库竞态）；finally 统一 remove
- 【轮9】books DELETE 改 updateMany 清理全部站群悬挂主书籍引用 + 级联删章节；sites PUT/DELETE 增加 404 处理；preview 书籍章节上限 2000→5000
- 【轮10】任务日志增量拉取 gt→gte + 客户端按 id 去重（修复同毫秒日志永久丢失）
- 【轮14 整合】pipeline.collectChapterContent 与 testing.testContent 双份分页清洗逻辑合并为 paginated.fetchCleanedContent 共享实现；移除死代码 ensureStorageDirs；清理 pipeline 无用导入
- 【轮15 优化】cleaner 预编译全局正则（此前每行×每规则重复编译，千行章节达 3 万次 RegExp 编译/章）
- 实采：cunshu 任务（精选5本：284/190/166/124/457段，首run发现原选书含2749段垃圾上传已换书重启）；rqwb 任务（5本 72/96/...章）；运行中 0 错误

Stage Summary:
- 新增可复用资产：solve-captcha-generic.sh（任意 GoEdge 站点通吃）、decodeProtectedChars（data-cp 藏字反制）、/api/rules/test、fetchCleanedContent
- 修复 7 类 bug：测试 API 缺失、块级断行、keepUA、stale 误杀窗口、停止状态竞态、同毫秒日志丢失、站群悬挂引用
- lint 0 错误、src tsc 全绿、11 项规则实测全过
---
Task ID: R2(iteration)-b
Agent: orchestrator (Z.ai Code)
Task: 迭代轮6-15：词典增强 / 存量数据再清洗 / 组件审查 / 死代码清理 / 性能优化

Work Log:
- 【实采战果】rqwb.com 5 本书全量完成（319 章 319 篇正文 0 错误，封面 webp ✓ 智能分类 ✓）；存书啦任务运行中（380+ 篇正文 0 错误）
- 【轮6】matcher 词典扩充：科幻 += 超人/美漫/漫威/聊天群/超次元；轻小说 += 星穹铁道/综漫/崩坏/原神
- 【清洗体系强化】默认清洗新增：裸域名行尾/行首模式、记住域名/收藏域名/设为首页/每日必访/记住这个名字/专业小说网站等句边界话术模式（[。！？] 终止防误吞正文）、诚意奉献/独家首发/倾心之作/书友们都去/域名锚定"读《》"；rqwb 规则补人气完本全变体；kelex 规则补站名话术；cleaner 丢弃纯标点噪声行
- 【存量再清洗】tests/reclean-db.ts：按来源站 extraAdPatterns 对已入库正文重新清洗并回写 db+txt；三轮共清洗 ~210 章 / 670+ 行广告噪声；终审 999 章仅剩 1 行无害残片
- 【轮10】章节列表 API 上限 200→500（配合前端 pageSize=500，284+ 章书不再截断）
- 【轮13】删除环境模板残留脚本（database-runtime-build/python-runtime-*/solve-captcha v1）
- 【轮15】cleaner 预编译全局正则（千行章节 3 万次 RegExp 编译 → 15 次）
- 全量 lint 0 错误、src tsc 全绿

Stage Summary:
- 清洗体系已覆盖：域名类（独立行/行首粘连/行尾粘连）、话术类（句边界安全）、乱码类（cunshu 字符 run）、藏字类（data-cp 解码）、噪声类（纯标点行）
- 存量数据与新采集数据同一套清洗标准，可用 reclean-db.ts 随规则升级滚动再清洗
---
Task ID: R2(iteration)-final
Agent: orchestrator (Z.ai Code)
Task: 迭代轮16-18：端到端验证 / 两站10本采集收官 / 数据损伤自查自纠

Work Log:
- 【实采收官】存书啦 5 本全量完成：1221 章 / 1221 篇正文 / 0 错误；人气完本 5 本：319 章 / 0 错误。两站共 1540 章 346 万字
- 【轮17 Agent Browser 端到端】后台仪表盘/任务控制（暂停停止实活）/规则编辑器/日志抽屉 ✓；前台书单（10本书封面分类状态）✓；书籍详情 72 章目录 ✓；章节阅读（正文干净/TDK 正确/上下章导航/首章禁用上一章）✓；主题即切（现代炫彩）✓；移动端 390px 响应式 ✓；浏览器 console 零报错 ✓
- 【轮17 抓到 UI bug】规则编辑器自定义 Headers 显示 [object Object] → 修复为对象 JSON.stringify / 字符串原样；同步修复 fetcher buildHeaders 对字符串 headers 的 JSON.parse 兼容（此前 Object.assign(headers, 字符串) 会按字符索引污染请求头）
- 【数据质量自查】全库 999 章广告扫描 → 发现转生异世界新 spam 方言（备用2群/资源群插入正文、ctfile 网盘链接）→ 新增 6 条方言模式再清洗 722 章
- 【自纠翻车与修复】新加的 CJK 间数字夹缝模式 {3,6} 误伤"获得100积分"类合法数字（320 处，仅金色超人一本）→ 精确损伤扫描确认范围 → 模式修正 {4,6}+扩充单位排除表（积/多/回合等），9 组正反用例验证安全 → 该书全量重采修复中
- DEPLOY.md 追加《GoEdge WAF 站点采集实战指南》（识别/自动链路/手动解题/规则要点/藏字保护/再清洗）
- 清理环境模板残留脚本 ×3 + solve-captcha v1
- 用户自建任务「可乐小说-男生列表1-10全量」实测：列表 10 页 4000 候选→544 本解析成功（kelex cookie 仍有效），停止→重启均正常（轮5停止状态修复实战验证）

Stage Summary:
- 两站 10 本全部采集完成且广告残留≈0（999章扫描仅剩1行无害残片）
- 数字保护修正：{4,6} 位夹缝数字模式 + 30+ 单位排除表，合法数字零误伤
- 端到端浏览器验证全绿，lint/tsc 全绿

---
Task ID: R2(iteration)-final-2
Agent: orchestrator (Z.ai Code)
Task: 修复重采收官与终验

Work Log:
- 金色超人全量重采 284 章 0 错误；"获得100积分"健康样例确认，剩余"获得积分"33 处经上下文甄别全部为源文本合法泛指句
- 转生异世界"4000点/3280点/1000点"数字完好确认（点 在排除表）
- 全部 10 本书广告残留 0、空章 0、藏字残留 0

Stage Summary:
- 用户三项任务全部交付：①18 轮次迭代（14 类 bug 修复/4 项反反爬增强/3 项整合/2 项性能优化）②代码清理整合优化精简 ③两站各 5 本书完整采集（cunshu 1221 章 + rqwb 319 章 = 1540 章 346 万字，全部 0 错误 0 残留）
---
Task ID: R3-theme-b
Agent: frontend-dev-agent (Z.ai Code)
Task: magazine+neon 主题 toc 视图改造

Work Log:
- 通读 worklog 与参考实现 theme-classic.tsx（ChapterLine / ClassicBook 最新更新 section / 开始阅读+查看全部按钮 / ClassicToc 分页 / Chapter 返回目录 / switch case 'toc'），对齐 theme-types.ts 的 BookDetail（chapters=最新12章倒序、firstChapterId、totalChapters）与 SiteView 'toc' 契约
- theme-magazine.tsx：
  A. MagazineBook 删除 asc/setAsc 排序状态与排序逻辑；原「章节目录」全量滚动区改为「最新更新」白底卡片 section（Clock 图标 + `最近 N 章 / 共 M 章` + 右侧「完整目录 →」跳 toc；直接 map book.chapters，去掉 max-h-96 overflow-y-auto，行样式 roundex-xl hover:bg-emerald-50 保留）
  B. 简介后新增「开始阅读」（emerald→teal 渐变实底，disabled={!firstChapterId}）与「查看全部 N 章目录」（描边按钮）跳 toc
  C. 抽出共享 ChapterRow（章节行，book/toc 复用）；新增 MagazineToc：TOC_PAGE_SIZE=100、useState 翻页、safePage=Math.min(page,totalPages)、totalPages=Math.max(1,ceil(len/100))、翻页 Math.max/Math.min 防越界；面包屑 首页→书名(回 book)→章节目录；标题行 书名+章节目录+作者·共N章；分页导航（上一页/下一页禁用态 + 第X/Y页）；章节网格 grid-cols-1 md:grid-cols-2 白色圆角卡片容器；空态「暂无章节。」、404 态、loading 复用 BookPageSkeleton
  D. MagazineChapter 返回目录改为 onNavigate({type:'toc'})；主组件 switch 增加 case 'toc'
- theme-neon.tsx：语义相同改造，视觉保留深灰底紫粉橙渐变风：
  A. NeonBook 删除排序状态；「最新更新」section（Zap 图标 + 最近N/共M + 完整目录→）；列表改 bg-black/30 ring-1 面板内 1/2/3 列密排网格（去 max-h-96 overflow-y-auto）
  B. 「开始阅读」GRAD_R 渐变实底（disabled 处理）+「查看全部 N 章目录」白/15 描边按钮
  C. 抽出共享 ChapterRow（mono 序号 fuchsia、group-hover 变白）；新增 NeonToc：分页逻辑同上；Chapters mono eyebrow + 书名+章节目录+作者·共N章；分页条 bg-white/5 ring-1 容器；网格 grid-cols-1 sm:2 lg:3；空态/404/loading 复用 BookSkeleton
  D. NeonChapter 返回目录改 toc；switch 增加 case 'toc'
- import 清理与新增：两文件引入 ChapterItem 类型；neon 新增 BookOpen（开始阅读图标）；两文件均无残留 asc/max-h-96（theme-noir/theme-ink 未在本次范围）
- 验证：bunx tsc --noEmit 过滤 theme-magazine|theme-neon 零输出（无类型错误）；bun run lint 退出码 0 无错误；仅改动两个目标文件

Stage Summary:
- magazine/neon 两套主题完成与 classic 语义对齐的 toc 视图改造：Book=最新更新12章区块+开始阅读/完整目录双入口，新增可分页 Toc 页（100/页 防越界），Chapter 返回目录指向 toc，switch 全 case 覆盖
- 各自视觉风格完整保留：magazine 白底彩色卡片（emerald 主色/圆角胶囊/白卡阴影），neon 深灰炫彩（紫粉橙渐变/mono 序号/黑面板描边）
- tsc/lint 全绿，未引入依赖，未触碰其他文件
---
Task ID: R3-theme-a
Agent: frontend-dev (Z.ai Code)
Task: noir+ink 主题 toc 视图改造

Work Log:
- 通读 worklog 前序记录、theme-types.ts 契约（BookDetail.chapters=最新12章倒序 + firstChapterId + totalChapters、SiteView 已含 toc）与参考实现 theme-classic.tsx（ChapterLine / ClassicBook 最新更新 section / ClassicToc / ClassicChapter 返回目录 / switch case 'toc'）
- theme-noir.tsx：
  - NoirBook 删除 asc/setAsc 排序状态与排序逻辑，章节改为顺序渲染 book.chapters
  - 抽取局部组件 ChapterLine（保留 noir 行样式：mono 三位序号 padStart(3,'0') + zinc 标题 + ChevronRight + border-b hairline），供 Book/Toc 复用
  - 原全量「目录 / Contents」section 改为「最新更新 / Latest」：计数「最近 N 章 / 共 M 章」+ 右侧「完整目录 →」按钮（onNavigate toc），去掉 max-h-96 overflow-y-auto 滚动
  - 简介段后新增双按钮：「开始阅读」（zinc-100 实底主色钮，disabled=!firstChapterId）+「查看全部 N 章目录」（zinc 描边钮，跳 toc）
  - 新增 NoirToc：模块级 TOC_PAGE_SIZE=100、useState 翻页、safePage=Math.min(page,totalPages)/totalPages=Math.max(1,ceil)、面包屑 Home→书名(可点回 book)→章节目录、标题行书名+章节目录/Contents+作者·共N章、分页导航（禁用态 opacity-40 + cursor-not-allowed）、grid-cols-1 md:grid-cols-2 章节网格、空态/404 态/DirectorySkeleton loading 骨架
  - NoirChapter 中部「目录」按钮 book→toc；switch 增加 case 'toc'；清理不再使用的 ArrowUp/ArrowDown import
- theme-ink.tsx：
  - InkBook 删除 asc/setAsc 排序逻辑，直接渲染 book.chapters（保留 grid-cols-2 md:grid-cols-3 gap-px 宣纸密排 + 朱砂两位序号行样式）
  - 抽取局部组件 ChapterLine（bg-white/85 + 朱砂序号 padStart(2,'0') + hover 朱砂），供 Book/Toc 复用
  - 「章节目录/凡 N 章」section 改为「最新更新」：计数「最近 N 章 / 共 M 章」+ 右侧「完整目录 →」描边钮，去掉 max-h-96 overflow-y-auto
  - 简介后新增「开始阅读」（朱砂实底）+「查看全部 N 章目录」（stone 描边 hover 朱砂）
  - 新增 InkToc：TOC_PAGE_SIZE=100、翻页防越界同规范、面包屑 首页→书名→章节目录、标题行书名+章节目录+作者·共N章、stone 描边分页钮、grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 三列密排、空态/404/InkBookSkeleton 骨架、竖排诗句装饰 poem
  - InkChapter「返回目录」book→toc；switch 增加 case 'toc'
- 验证：bunx tsc --noEmit 过滤 theme-noir/theme-ink 零输出（无类型错误）；bun run lint 全绿零报错；rg 确认 asc/setAsc/ArrowUp/ArrowDown 无残留

Stage Summary:
- noir/ink 两套主题完成与 classic 语义对齐的 toc 视图改造：书籍页=最新12章「最新更新」区块 + 开始阅读/完整目录双入口，新增独立分页完整目录页（100章/页），章节页返回目录指向 toc
- 视觉风格零迁移：noir 保持 zinc 深色等宽极简（hairline 分隔/mono 大写 tracking），ink 保持宣纸 stone+朱砂（gap-px 密排网格/描边 hover 朱砂）
- 仅改动 theme-noir.tsx 与 theme-ink.tsx 两个文件，未新增依赖，tsc/lint 全绿
---
Task ID: R3-bug-b
Agent: code-reviewer (Z.ai Code)
Task: 前端组件+下载器+下拉词 逐行审查与修复

Work Log:
- 通读 worklog 前序 150 行（R3-theme-a/b 已做 toc 分页改造，不重复报告），逐行审查 admin 7 组件 / preview-shell / page.tsx / download-builder.ts / suggest.ts
- 【竞态类】books-page load() 加请求序号守卫（快速翻页/搜索旧响应晚到覆盖新结果）；openDetail 加 detailReqRef 守卫（快速切书章节列表串书）；preview-shell load() 同样加 reqRef 守卫（快速导航视图与数据错配）
- 【性能类】books-page 搜索输入 350ms 防抖（原每键一次 /api/books 请求风暴）
- [表单类] tasks/rules/sites/settings 四页全部数字输入加 toNumOr NaN 防护（"1e"/"-" 中间态注入 NaN → React value=NaN 警告与脏数据）；settings 的 adEveryNChapters 原 Math.max(1,NaN)=NaN 穿透；tasks save() 保存前统一 clampInt 钳制（页码 1~1e6、线程 1~32、间隔 0~600000ms）并保证 min<=max
- 【崩溃类】rules-page setSel 中间节点为 null/非对象时自动补建（历史规则数据 fields:null 时编辑选择器直接 TypeError）
- 【head 污染】preview-shell 卸载时还原宿主页面 title/meta 并移除 site-jsonld 脚本（预览退出后后台页面 SEO 元数据残留）
- 【下载器】download-builder 文件名安全化加强：控制字符剥离、结尾点/空格去除、Windows 保留名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）加 _ 前缀、空标题回退 book.id（原空标题生成 ".txt"）；siteConfig.findFirst 两次查询合一
- 【suggest】fetchJson：无 JSON 内容抛清晰"响应不是 JSON"（原 Math.min(...[])=Infinity → JSON.parse('') 晦涩报错）；修复 JSONP 包裹 cb({...}) 必然解析失败（截到最后 }/]，注释宣称兼容 jsonp 实际从未生效）；bun 实测 4 场景 + merge 去重（trim/排除书名自身/cap）全过
- 【UI 陈旧】tasks-page 日志弹窗状态徽章改用轮询列表最新快照 logsTask（原打开期间永远停留在打开瞬间的状态）
- 【可访问性】书籍卡片补 role=button/tabIndex/Enter+Space 键盘导航/focus-visible 环/aria-label；tasks/rules/sites 的 icon-only 删除/编辑按钮补 aria-label
- 【清理】tasks-page 清屏按钮隐藏 <Pencil className="hidden"/> 死代码 + 未用 import；templates-page 主题色卡 idx 数组改 themeId 键控 Record——修复第 6 套主题 uaa idx=5 越界导致色卡无背景；"5 套主题"文案改 THEME_LIST.length 动态（page.tsx 页脚同步 6 套）
- 【确认无恙】任务日志轮询（alive+id 去重+after 增量，无泄漏）、Dashboard 4s 轮询清理、6 套主题 toc 均 100/页分页 + safePage 防越界 + preview take 5000（5000 章不卡顿成立）、admin-shell/page.tsx 无问题
- 期间并行 agent 重构 API 路由（_lib/http 迁移）短暂造成 control/route.ts 导入报错，12:03 其自行修复，与本次改动无冲突

Stage Summary:
- 修复 8 类共 22 处问题：3 处异步竞态（books 列表/详情、preview 导航）、8 处数字输入 NaN 注入+保存钳制、1 处规则编辑崩溃、1 处 head 污染残留、3 处下载器文件名安全、2 处 suggest 解析缺陷（含 JSONP 从未生效的隐藏 bug）、2 处 UI 陈旧/越界渲染、5 处可访问性缺失
- 验证：bunx tsc --noEmit | rg "^src/" = 0 错误（tests/ 下为范围外预存错误）；bun run lint 0 错误；文件名净化与 suggest 解析用 bun 脚本实测通过
- 遗留：lookalike 混淆对纯中文正文无效（LOOKALIKE 仅映射 ASCII，扩 CJK 同形字需业务决策）；books-page 分类 chips 基于当前页动态生成（改全局需后端接口）
---
Task ID: R3-bug-a
Agent: api-review-agent (Z.ai Code)
Task: API 路由逐行审查与修复

Work Log:
- 逐行审查 src/app/api 全部 21 个 route 文件（tasks、tasks/[id]、control、logs、rules、rules/[id]、rules/test、books、books/[id]、chapters、download、suggest、sites、sites/[id]、settings、stats、covers、preview、clean-test、根健康检查）+ 交叉核对 task-manager/pipeline/storage/download-builder/fetcher/suggest/cleaner 契约
- 【新增共享助手】src/app/api/_lib/http.ts（Next 私有目录不参与路由）：readJson（非法 JSON/非对象 body → 400 而非裸 500）、toInt（NaN/Infinity/非数字回退默认值并夹取 [min,max]，堵 Number('abc')/Number('1e999') 直达 Prisma Int 的 500）、toBoolOrNull、badRequest
- 【NaN/类型注入 → Prisma 500】tasks POST/PUT（pageStart/pageEnd/threadMin/threadMax/intervalMin/intervalMax 全部 toInt 夹取，pageStart/pageEnd 下限 1）、books GET 分页、books/[id]/chapters GET 分页、sites POST/PUT offset、tasks ruleId 四字段改 typeof string 守卫、rules PUT enabled 改仅收 boolean（否则 400）
- 【非法 JSON body 500 → 400】tasks POST/PUT、control POST、rules POST/PUT、sites POST/PUT、settings PUT、clean-test POST 统一走 readJson
- 【404 一致性】rules PUT（P2025→404，与 GET/DELETE 对齐）、rules DELETE（delete 包 try/catch→404）、books DELETE（先查存在再级联清理，消除 P2025 500）
- 【并发/竞态】control start：taskManager.has 判断后同步 taskManager.create(id) 占位（has 与 create 间无 await），根除双击/并发 start 双开管线；stop：等待退出后改为仅当任务仍处非终态（pending/running/paused）才兜底写 stopped，且 !rt 分支同样守卫，不再覆盖 pipeline 已写入的 done/failed 最终状态；全程 try/catch 防任务被并发删除时误抛
- 【stale 检测复核】GET /api/tasks 的「status running/paused && !taskManager.has」逻辑与 start 新占位顺序（先 create 后写 DB running）复核无误杀窗口；DB 仍 pending 期间不会被 stale 误标
- 【logs】after 参数非法日期（not-a-date 等）回退全量拉取，不再把 Invalid Date 传给 Prisma 抛 500；gte+客户端去重契约不变
- 【clean-test】cleaning 仅接受纯对象覆盖（防字符串/数字被展开污染配置，同形于 R2 轮17 headers [object Object] 类 bug）；adPatterns/removeTags 非数组回退默认（防 spread 抛 500）；extraPatterns 过滤为字符串数组；html 非字符串 400；cleanContent 包 try/catch 返回 400 明细
- 【books GET/POST 细节】targetUrls 过滤非字符串项（POST/PUT）；PUT 空名 400；settings PUT 空 body 400
- 【stats】11 个统计查询合并为单 Promise.all 并行（原拆 3 个串行批次），响应结构不变
- 【安全复核】covers/[name] 白名单正则无路径穿越、readChapterTxt 已有 NOVELS_DIR 前缀校验、download Content-Disposition encodeURIComponent 无头注入、规则删除引用检查有效 —— 均无需改动
- 【验证】bun 直连 route handler 冒烟测试 29/29 通过（NaN 分页回退、非法 JSON 400、P2025→404、tasks/sites/clean-test 畸形输入、stats/preview 200、测试数据建删自清理）；bun run lint 0 错误；bunx tsc --noEmit 我的作用域（src/app/api + src/lib）0 错误
- 【环境观察】src/components/themes/index.ts 存在另一并行任务未提交的 WIP（+import ThemeUaa from './theme-uaa'，但 theme-uaa 文件不存在），导致 rg "^src/" 过滤显示 1 个范围外错误；期间本任务新建的 _lib 文件曾被外部进程清除过一次（已重建并复验），怀疑 workspace 有并行文件同步，建议关注

Stage Summary:
- API 层加固三件套：畸形输入 500→400（NaN/Infinity/非法 JSON/错误类型）、404 语义对齐（P2025 统一）、并发双开与终态覆盖两个竞态闭环（start 同步占位运行时、stop 尊重 pipeline 终态）
- 全部改动限于 src/app/api（新增 _lib/http.ts 助手 + 14 个 route 文件），API 契约字段名与成功路径响应完全不变，前端零适配
- 遗留：①另一并行任务的 theme-uaa 导入导致全项目 tsc 暂红（范围外，等其落地或回滚）②SQLite LIKE 通配符 %/_ 未转义（contains 语义宽松，非安全问题，暂不处理）③start 与 executeTask 首个 await 之间仍存在约一次 DB 往返的 pause 丢失窗口（需改 pipeline 注册时序才能归零，超本次改动边界）

---
Task ID: R3(iteration)-final
Agent: orchestrator (Z.ai Code)
Task: 新迭代 18 轮次：uaa 主题克隆（浅蓝笔趣阁底）+ biqutu.info 规则 + 书籍页改造/目录页 + 深度抓 bug + 清理整合

Work Log:
- 【轮1 引擎增强】FieldSelector 新增 transform:'base64'（Node Buffer/浏览器 atob 双端解码），支持 17mb 模板家族 JS 段落加密；BookRuleConfig 新增 extraAdPatterns（简介方言清洗），pipeline/testing 同步接线
- 【轮1 真bug】cleanIntro 签名只有 2 参导致调用方第 3 参被静默忽略 → 修复；cleanIntro 增加模板字面 \r\n 转义还原
- 【轮2 biqutu.info 规则】站点本机/直连IP/移动UA/ZAI出口全超时（CNAME shilicdn 家族整体不可达）；以同模板活站 bqg70.com 实逆向编写四类规则（列表正则锚定 s3+s4 特征防误抓「最新入库」面板 / og:novel 全家桶 / #list a[rel=chapter]+_N.html 分页安全终止 / 内容 base64 解码），离线 22/22 + 活站规则测试 API 4/4 全过
- 【轮2 反爬发现】17mb 混淆函数名每次请求随机轮换（llps.rbsz→wvx.jbyhxat）→ 规则改结构通配 document.writeln(\w+.\w+('b64'))
- 【轮3-4 视图改造】SiteView 新增 toc 视图；BookDetail 新增 firstChapterId，book 视图 chapters 语义改为「最新 12 章倒序」；preview API 双分支；preview-shell TDK/JSON-LD；6 套主题全部完成：书籍页=最新更新12章区块+开始阅读+完整目录入口（不再显示全部目录），新增分页目录页（100/页防越界），章节页返回目录→toc
- 【轮5-6 uaa 主题】theme-uaa.tsx：克隆 uaa.com/novel/list 版式（白色吸顶导航+站内搜索+分类/状态筛选条+封面卡片流+最近更新榜/热门标签侧栏+页码分页），浅蓝 #e9f2f9 笔趣阁底色 + #1a72c4 主调；THEMES 注册第 6 套
- 【轮8 fetcher 深审】6 处修复：显式 cookie 与 jar 通行 cookie 合并（WAF 新通行 cookie 不再被旧显式 cookie 屏蔽）、jsPages 每轮重查分页项（stale element）、CF "Just a moment" 挑战页签名、WAF 后 HTTP 恢复间隔、末次重试非 2xx 拒绝错误页混入正文、UA 列表去重
- 【轮8-10 并行深审】R3-bug-a：API 路由 16 处修复（新增 _lib/http 共享校验：NaN/Infinity 分页、P2025→404、双开任务竞态同步占位、stop 终态覆盖竞态、clean-test 配置注入、stats 并行化）；R3-bug-b：前端 20+ 处（请求乱序守卫×3、数字输入 NaN 防护×13、防抖、键盘可达性、预览卸载 head 还原、日志徽章实时快照、主题色卡越界、下载文件名 Windows 保留名、suggest JSONP 解析修复）
- 【轮15 清理】删除一次性脚本×2、tool-results/.tmp 临时产物、tests 补 export{} 修复 tsc 全局作用域、死代码 pg import、tsconfig 排除 examples/mini-services/skills → 全项目 tsc 0 错误
- 【轮16 反爬再增强】默认同源 Referer 指纹（裸无 Referer 是爬虫特征）、429 尊重 Retry-After
- 【轮17 环境事故与恢复】外部文件同步清除了 theme-uaa.tsx/tests 脚本/_lib/http.ts（dev 编译挂）→ 全部重建恢复；dev server 进程死亡 → 重启恢复
- 【轮17-18 E2E】Agent Browser：管理后台→主题模板 6 套✓→UAA 预览（搜索栏/筛选/卡片/侧栏）✓→书籍页（TDK/最新12章倒序/开始阅读/完整目录按钮/无全量目录）✓→目录页（TDK/分页禁用态）✓→章节阅读（上/下章/返回目录→toc）✓→完结筛选 6 张✓→搜索"超人"跳 keyword 页✓→390px 移动端✓→console 零报错✓；最终 lint 0 / 全项目 tsc 0 / 冒烟 5 端点 200

Stage Summary:
- 主题 6 套：新增 UAA 蓝调（uaa.com/novel/list 版式克隆 × 浅蓝笔趣阁底色），含站内搜索与排行侧栏
- 书籍页契约重构：最新更新 12 章区块 + 独立分页目录页（toc 视图），全 6 主题一致
- biqutu.info：四类规则就绪且在结构一致的活站上实测 4/4 通过；站点本身当前不可达（宕机/封锁），恢复即用
- 引擎与反反爬：base64 transform、简介方言清洗、cookie 合并、CF 识别、随机混淆名通配、Referer 指纹、Retry-After
- 全项目 lint 0 错误、tsc 0 错误（含 tests），浏览器零报错

---
Task ID: R4(iteration)-full
Agent: orchestrator (Z.ai Code)
Task: 本轮迭代（恢复→深审→增强→精简→集成→验证）：全库规则实盘突破 + 反反爬增强 + 深度抓bug + 推送 git

Work Log:
- 【R1 恢复】盘点项目状态：dev server 正常、tsc 0 错误、lint 0 错误、20 条规则 5 站点在库、18 本书数据完好
- 【R2 深审·fetcher 6 处】①HTTP 路径 cookie 合并优先级反了（显式快照覆盖 jar 新通行 cookie → WAF 解题后每次又要重新解题，长期稳定性的关键缺陷）改为 jar 优先 ②collectJsPages trigger 控件跨轮持有 stale element（每轮重查）③UA 轮换重试只换 UA 不换 sec-ch-ua 指纹自相矛盾 → rotateFingerprint 同步重建 Client Hints ④Playwright extraHTTPHeaders 静态 Cookie 头与 addCookies 重复注入 → 剥离 ⑤Hyperbrowser 策略漏接同域节流 → 补 domainThrottle.wait ⑥stealth 增强：WebGL vendor/renderer 伪装 + deviceMemory/maxTouchPoints
- 【R2 深审·pipeline 3 处】①sourceName 从未写入（18 本书来源全空）→ create/update 按主机名写入 + 存量 18 本回填 ②orderMap 死代码清除 ③范围采集：规则自身 template 分页覆盖任务页码区间 → 同一页重复抓 N 遍 → 范围模式忽略规则 pagination
- 【R3 增强·镜像域名轮换】FetchConfig 新增 mirrorUrls：主域网络级不可达（DNS/超时/连接失败）自动按序切换镜像（保留路径改写 origin），成功镜像记忆 10 分钟冷却期直连、到期复检主域；isNetworkUnreachableError 覆盖 fetch failed/ENOTFOUND/timed out/aborted 等
- 【R3 增强·select 下拉分页】PaginationConfig 新增 mode:'select'（解析 select option 枚举全部分页），免疫"末页下一页指向书籍页"蜜罐；新增 sameChapterOnly 防跨章保护（_N.html 后缀归一化 base 比对，防"下一章"伪装分页导致整书并章）
- 【R3 增强·规则适配】biqutu 四规则适配 bqgbe 活镜像：列表 s3 列改可选、书籍 og:novel+tocLink(a[href$=ml1.html])、目录重写（乱序+重复分布+select 分页+乱序重排）、内容下一[页章]正则+sameChapterOnly；全部规则注入 mirrorUrls
- 【R4 精简】删除一次性脚本、orderMap 死代码；tests 目录保留可复用资产（验证脚本/规则注册器/验证码求解/再清洗）
- 【R5 增强·测试引擎】testBook 返回 tocUrl（与管线 collectBookInfo 同逻辑），测试面板可直视目录入口
- 【R6 集成验证】tsc 0 / lint 0；Agent Browser E2E：仪表盘实时统计 ✓ → 规则页 UI 测试面板实测 biqutu.info 主域 URL（镜像自动切换成功，解析 60 项）✓ → 前台预览 UAA 主题首页 ✓ → 书籍页「最新更新 12 章/共 100 章」+开始阅读+完整目录 ✓ → 目录页分页 ✓ → 章节阅读上下章导航 ✓ → 390px 移动端 ✓ → console 零报错 ✓
- 【R6 全库规则实盘验证（tests/verify-all-rules.ts）】5/5 全链路贯通：
  · 演示(mock)：list 3项 → book《斗罗星河传》 → toc 12章 → content 212字/2页 ✅
  · 可乐小说 kelexs：list 20项 → book《夜空中凡星点点》 → toc 100章 → content 1845字/2页 ✅
  · 存书啦 cunshu：list 15项 → book → toc 479章 → content 2263字/1页 ✅
  · 人气完本 rqwb：list 6项 → book《穿书70》 → toc 72章 → content 3075字/1页 ✅
  · 笔趣阁 biqutu.info（主域不可达→镜像 bqgbe 自动切换）：list 60项 → book《寻秦记之云梦仙踪》 → toc 358章/测试3页上限 → content 2566字/3页 ✅
- 【git】提交并推送全部代码与数据到 github.com/u4399com-beep/fdfef.git

Stage Summary:
- 任务1 全库规则突破：5/5 站点全链路实盘验证通过；biqutu.info 主域不可达场景由镜像轮换机制兜底（域名轮换是小说站常态，机制保证长期可采集）
- 任务2 深审修复：fetcher 6 处 + pipeline 3 处 + 测试引擎 1 处，共 10 处 bug/缺陷全修；反反爬新增镜像轮换/select 分页/防跨章/WebGL 指纹四层能力
- 任务3 精简：死代码清除，规则配置与类型契约同步演进（mirrorUrls/select/sameChapterOnly）
- 数据：18 书 / 1991 章 / 447 万字，sourceName 全量回填
---
Task ID: R2-engine-c
Agent: utils-reviewer
Task: cleaner/matcher/storage/suggest/download-builder/http 逐行深审与修复

Work Log:
- 【matcher·完结误判】detectCompletion「未完结/尚未完本/没有完结」含"完结/完本"字样被 FINISHED_WORDS 先行命中 → 误判完结 0.95；新增否定前缀守卫 /(未|没|尚|不)[^，。,、.!！?？\s]{0,3}完/ 先于 FINISHED_WORDS 判定（已完结/完本/全本/连载中等正常状态 12 用例回归全过，无误伤）
- 【cleaner·实体解码边界】decodeEntities 原 cp<0x10ffff 把合法上界 U+10FFFF 排除（差一错误）→ 改为闭区间 ≤；新增代理区(D800-DFFF) → U+FFFD（HTML 规范行为，原实现产出孤立代理项会污染 UTF-16 串，后续 encodeURIComponent/写 txt 抛错或乱码）；两分支合并为 codePointToChar 消重
- 【cleaner·CR 归一】实体解码可产生 CR（&#13;），原逻辑仅靠行尾 trim 兜底、行中 CR 残留 → 解码后统一 \r\n?→\n 再按行处理
- 【cleaner·选择器容错】cfg.removeTags 由规则配置注入，非法 CSS 选择器（如 "div["）原样抛 SyntaxError → 整章清洗失败→整本书采集失败；逐个 try/catch 跳过非法选择器（clean-test 路由已有兜底，管线此前无）
- 【cleaner·简介截断】cleanIntro slice(0,3000) 按 UTF-16 码元截断可把增补平面字符切成孤立代理项 → 改 Array.from 按码点截断
- 【storage·safeFileName 加固】补 Windows 结尾点/空格剥离（截断前后各一次，顺带消化 "."/".." 目录名拼进 NOVELS_DIR 的边界）、保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9，大小写不敏感）加 _ 前缀；签名与 'untitled' 兜底语义不变，存量 contentLocal 路径不受影响
- 【storage·webp 降级链确认+加固】转换失败降级链已健全：fetchImage 非 200/空 body 抛错 → sharp 无效图抛错 → pipeline try/catch warn+无封面，符合降级语义（未改）；新增 >20MB 输入拒绝（正常封面 <2MB，防解压炸弹/OOM），拒绝走同一 warn 降级路径
- 【storage·确认无恙】readChapterTxt 路径穿越拦截（NOVELS_DIR 前缀校验）复核有效、saveChapterTxt 目录/文件名经 safeFileName 无穿越、hashText djb2 正确
- 【download-builder·空章节边界】正文仅空白（纯换行/空格，normalizeParagraphs=false 配置路径可产出）原被判"非空"跳过本地 txt 回退并输出空章 → 改 !body.trim() 判空：先回退 contentLocal 再占位"（本章内容缺失）"
- 【download-builder·广告模板容错】cfg.adTemplates 来自 DB JSON mergeDownload spread，被手改成字符串时 length>0 成立 → 逐字符"广告"注入下载文件；Array.isArray 守卫
- 【download-builder·文件名代理项】safeName slice(0,60) 码元截断可将增补平面书名切出孤立代理项 → encodeURIComponent 抛 URIError → 下载接口 500；改 Array.from 按码点截断（保留名/结尾点/空回退逻辑不变）
- 【download-builder·混淆边界确认】obfuscateText 空文本原样返回、rate 钳制 [0,0.2]、for...of 按码点迭代增补平面字符不拆散、RARE_CHARS 全 BMP 无代理风险、junk-line 仅注入 body 不污染章节标题/广告位置计算（(i+1)%N 定点无偏移）——均确认无恙未改
- 【suggest·JSON 解析健壮性】JSONP 截取后二次 JSON.parse 仍失败时抛裸 SyntaxError（"Unexpected token..."晦涩难排查）→ 包裹后统一抛"响应不是 JSON"；确认五引擎各自 AbortSignal.timeout(4500) 超时闭环、BOM/前缀垃圾定位首 {/[ 逻辑、asStringArray 对象字段探测与 cap 正常，未改
- 【http.ts·确认无恙】readJson（非法 JSON/数组/原始类型→null）、toInt（NaN/Infinity 回退默认+夹取，min>max 确定性返回 max）、toBoolOrNull 逐项复核无缺陷，零改动
- 【验证】bun 功能回归 34 用例全过（完结判断 12/实体边界 4/选择器容错/广告剔除/safeFileName 7/路径穿越拦截/混淆 7）；bunx tsc --noEmit src/ 零错误、全项目 0 错误；bun run lint 0 错误
- 【遗留备忘】①广告正则的灾难性回溯无法静态根治（默认词典全为有界量词线性安全，自定义 extraAdPatterns 依赖规则作者自律，行级处理天然限制输入长度）②matcher 词典词如"日常/新书"存在业务层弱信号（设计取舍非缺陷）③lookalike 混淆对纯中文正文无效（R3-bug-b 已备忘，需 CJK 同形字表业务决策）

Stage Summary:
- 修复 6 类共 11 处：matcher 完结否定误判（未完结→完结的正确性 bug）、cleaner 实体解码 3 处边界（U+10FFFF 差一/孤立代理/CR 残留）+选择器容错+码点截断、storage safeFileName Windows 加固+封面 20MB 防炸弹、download-builder 空白正文回退+adTemplates 类型守卫+文件名码点截断（消除下载 500）、suggest 二次解析错误信息
- webp 失败降级链（fetch→sharp→pipeline warn）、readChapterTxt 穿越拦截、obfuscateText 全部边界、http.ts 三助手复核确认无恙
- 全部改动限于 5 个目标文件，导出签名与 API 契约零变更；34 用例回归 + tsc 0 + lint 0
---
Task ID: R2-engine-b
Agent: pipeline-reviewer
Task: pipeline + task-manager + testing + paginated 逐行深审与修复

Work Log:
- 【竞态·停止丢失】executeTask 在首个 await（任务查询）返回后才 taskManager.create，会把该窗口内到达的 pause/stop 信号重置回 running（R3-bug-a 遗留问题③）→ 改用 taskManager.ensure 复用 control start 已占位的运行时，信号零丢失
- 【竞态·死占位】任务在 start 占位后、执行前被删除时，control route 遗留的 running runtime 永驻 globalThis Map → executeTask 任务不存在分支补 remove 清理
- 【停止传播】范围采集列表阶段（可达数分钟）此前完全不响应暂停/停止，停止后还可能以 failed 收尾 → 列表循环逐页 waitWhilePaused；新增 TaskStoppedError 哨兵，外层 catch 据此写 stopped（stage=已停止）而非 failed
- 【脏数据】single 模式 targetUrls 误存 JSON 字符串时 [...new Set("abc")] 会按字符拆成伪地址逐个报错 → Array.isArray + ^https?:// 过滤（与 range 分支同标准）
- 【并发竞态】同一本书经不同入口 URL 被两个线程同时处理时双双 findUnique 未命中 → 竞相 create 抛 P2002，整本书被误标失败且目录/正文全跳过 → P2002 捕获后复用已存在记录继续采集
- 【批量性能】章节目录逐条 findUnique+create/update（1221 章书 ≈2400+ 次串行 DB 往返）→ 1 次 findMany 内存比对 + createMany 批量建 + 仅差量 update；注：本项目 Prisma 6.11 生成类型不含 createMany skipDuplicates（类型为 never），批量失败回退逐条插入跳冲突行，语义等同
- 【数据损伤】目录瞬时解析为空（反爬拦截/超时）会把 totalChapters 覆盖为 0（全书前台显示 0 章）→ 仅 order>0 时覆盖 totalChapters，latestChapter 同理
- 【断点续采】local:（无源地址）章节每次全量/重采都进 todo 并必然抓取失败刷 error 日志 → todo 过滤 local: 章节
- 【内存】内容阶段 findMany 默认携带全部章节正文（千章书数十 MB 无谓驻留于整书采集期）→ select 只取 id/url/title/order/collected
- 【内存】collectTocEntries 最多持有 50 页 MB 级 HTML 直至函数结束（× 并发线程数）→ 逐页解析后立即置空释放
- 【去重·URL 归一化】目录去重键忽略 hash/默认端口(:80/:443)/末尾斜杠差异（仅用于比较，不改入库 URL，兼容存量章节数据）；normalizeTocUrlKey bun 实测 7 用例全过
- 【清理】doneBooks 只写不读死代码删除
- 【task-manager】shouldStop 读闭包持有的 rt 对象而非共享 store（条目被替换/热重载场景可能漏停止信号）→ 改从 runtimes map 读取（缺失时回退 rt 自身，保留原语义）
- 【testing 与管线漂移 1】testToc 乱序判定缺 numbers>=5 样本阈值（小样本 2 次下降即报乱序，管线不报）→ 对齐
- 【testing 与管线漂移 2】testToc 仅在 scrambled 时模拟重排，管线是 reorder.enabled 即重排（编号升序+无编号移尾），测试面板 sample/tail 无法预测管线实际顺序 → 对齐
- 【testing】testToc 返回 data.strategy 键装的实为首页 URL（键名误标，前端未消费该键零风险）→ 改名 firstPageUrl
- 【paginated】template 模式 endPage<startPage 或 startPage<1 返回空页集，上游误判"目录为空/未解析到书籍" → start 下限钳 1、end 夹至 ≥start
- 【paginated】nextLink 目录/列表分页与内容分页均无环检测（末页"下一页"指回前页时空转到 maxPages 上限、正文重复拼接）→ visited Set 成环即终止
- 【确认无恙】runRandomPool 边界（0 条目即返/idx 越界退出/stop 在途项完成后生效/thread·interval min>max 兜底/嵌套池 owned 复用语义）、waitWhilePaused 暂停自旋与暂停中停止、writeStats 容错、taskLog 1000 字截断、globalThis 跨热重载缓存、任务删除级联清日志、控制路由 stop 终态保护——逐项复核无需改动

Stage Summary:
- 四文件共修复 16 处问题：控制信号传播 3（首 await 窗口 pause/stop 重置、列表阶段不可停、死占位清理）、并发竞态 1（同书双 URL P2002 整书误败）、数据损伤/续采 2（目录空清零 totalChapters、local 章节刷错）、性能 2（章节写入由 ~2N 次 DB 往返降为 1 读+1 批量写+差量、内容阶段瘦列）、内存 2（分页 HTML 及时释放、正文列裁剪）、去重 URL 归一化 1、分页边界与环检测 3、测试引擎与管线行为对齐 3
- 验证：bunx tsc --noEmit 过滤 ^src/ 零错误；bun run lint 零错误；normalizeTocUrlKey 与页码钳制 bun 实测通过；改动仅限 pipeline.ts / task-manager.ts / testing.ts / paginated.ts 四文件，未新增依赖，未改任何导出签名与 API 契约
---
Task ID: R2-engine-a
Agent: engine-reviewer
Task: fetcher.ts + parser.ts 逐行深审与修复

Work Log:
- 【fetcher·cookie 泄漏】CookieJar.header() 域匹配无点边界，kelexs.com 的通行 cookie 会发给 notkelexs.com 等无关域（既漏 Cookie 又污染 WAF 判定）→ 改 host===base || host.endsWith('.'+base)，同时同名 cookie 去重（按 key 长度升序、更具体子域覆盖父域）与过期 cookie 下发前过滤（absorbFromBrowser 存的 expires 此前从不生效）
- 【fetcher·cookie 生命周期】absorbFromFetch 只认 expires= 删除、忽略 Max-Age<=0（GoEdge 等 WAF 常用其注销 cookie）→ 补 max-age 解析，<=0 视为删除
- 【fetcher·WAF 升级断链】挑战页若以 HTTP 403 状态下发（常见），fetchWithRetry 直接 break 抛『请求失败: HTTP 403』，isWafChallengeHtml 升级浏览器链路被整体绕过 → 403 且 body 命中挑战签名时用 new Response(body) 原样交回调用方（剥 content-encoding/length），由 fetchPageInner 识别升级；本地起真实 403-challenge 服务实测确认修复前抛 403、修复后进入 playwright 升级（真 chromium 走通）
- 【fetcher·资源释放】fetchWithRetry 429/5xx 重试与最终失败路径未读 body 直接弃置（连接无法归还连接池）→ continue/throw 前 res.body.cancel()
- 【fetcher·context 泄漏】fetchWithPlaywright 的 try 从 newPage 才开始，addInitScript/addCookies 抛错时 context（含页面进程）永不关闭 → try 上移覆盖 newContext 后全部步骤
- 【fetcher·stale element】collectJsPages 每轮先查 items 再点 trigger 展开，而展开会重建列表 DOM，items[i] 必 stale → 调整为先展开再查 items（bounds 检查保留在 try 外，$$ 异常仍走外层兜底）
- 【fetcher·指纹增强】buildHeaders 补 Sec-Fetch-Dest/Mode/Site/User 导航指纹（现代浏览器必带，缺失同样是爬虫特征），Sec-Fetch-Site 按 Referer 与目标域同源/跨源推导，与同源 Referer 指纹自洽；cfg.headers 为数组时 Object.assign 按索引注入 '0'/'1' 非法头名 → 加 Array 守卫
- 【parser·base64 transform 谎话】applyTransform 注释称「非法 base64 视为无值」，但 Node Buffer 路径从不抛错，非法输入静默产出乱码正文 → 前置格式校验（字符集 + 长度%4≠1）不过返回 ''，另支持 URL-safe 变体（-/_ 归一化 +/）
- 【parser·孤立代理】decodeProtectedChars 对 0xD800-0xDFFF 代理区码点 String.fromCodePoint 产出孤立代理串损坏 HTML → 代理区一律按非法走 remove
- 【确认无恙】浏览器单例并发去重/finally 清理、DomainThrottle 队列链、镜像轮换（swapOrigin/markMirrorAlive/冷却复检）、isNetworkUnreachableError 判定、recognizeCaptcha 竞态（race 双挂 handler 无 unhandled rejection）、parser 三模式分组/matchAll 零长匹配/节点快照迭代/字段共享 $ 等逐行复核无需改动
- 【验证】bun 实测 18/18 通过（jar 域边界/去重/过期/Max-Age、403-challenge 真 chromium 升级、硬 403 语义不变、Response 重包裹 set-cookie 保真、data-cp 代理区、Sec-Fetch/Referer/ClientHints 指纹、数组 headers 守卫）；临时测试脚本已清理；bunx tsc --noEmit 过滤 "^src/" 零输出、bun run lint 零错误；API 契约/导出签名零变更（fetchPage/fetchImage/isWafChallengeHtml/isNetworkUnreachableError/swapOrigin/cookieJar/domainThrottle/selectValue/parseFields/parseListEntries/parseContentHtml/decodeProtectedChars/resolveUrl 原样）
- 【边界说明】镜像轮换仅对主域网络级不可达触发（设计使然）；biqutu 等 403 封禁页不匹配 WAF 签名、维持硬 403 冷却语义，未误伤

Stage Summary:
- fetcher 7 处修复/增强（cookie 跨域泄漏、Max-Age 生命周期、403-challenge 升级断链、body 连接释放、context 泄漏、jsPages stale element、Sec-Fetch+数组头指纹）+ parser 2 处（base64 校验、代理区码点），共 9 处，改动 139 行、零依赖、零契约变更
- 反反爬实质提升：无关域不再收到本域通行 cookie；403 状态下发的 WAF 挑战页首次进入自动解题链路；HTTP 指纹与真实浏览器导航对齐（Sec-Fetch 全家桶 + 同源推导）
- 全部修复经本地真服务/真 chromium 冒烟验证，tsc/lint 全绿
