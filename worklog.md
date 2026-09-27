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
