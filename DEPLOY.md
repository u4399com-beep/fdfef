# 小说管理系统 —— 生产环境分步部署说明

> 技术栈：Next.js 16（App Router）+ TypeScript + SQLite（Prisma）+ Tailwind / shadcn
> 一套后台 + 一套数据库 + 一套本地文件，通过「站群系统」派生多个前台站点。
> 本文档提供 **Docker（推荐）** 与 **裸机直跑** 两种部署方式，全部命令可直接复制执行。

---

## 目录

1. [功能总览](#1-功能总览)
2. [方式一：Docker 部署（推荐）](#2-方式一docker-部署推荐)
3. [方式二：裸机部署（bun）](#3-方式二裸机部署bun)
4. [站群上线：多域名反向代理](#4-站群上线多域名反向代理)
5. [可选：启用 Playwright / Hyperbrowser 采集策略](#5-可选启用-playwright--hyperbrowser-采集策略)
6. [数据备份与恢复](#6-数据备份与恢复)
7. [常见问题（FAQ）](#7-常见问题faq)

---

## 1. 功能总览

| 模块 | 说明 |
|---|---|
| 采集规则 | 列表页 / 书籍信息页 / 章节目录页 / 章节内容页四类规则；**CSS、正则、XPath 三种选择器可混用**；每类规则编辑页内置「测试」功能 |
| 书籍字段 | 书名、作者、分类、关键词、简介、封面图；封面自动下载转 **webp** 存储 |
| 反反爬 | UA 随机轮换、Cookie/Referer/自定义 Header、随机超时；抓取策略可切换 **HTTP 直连 / Playwright（JS 渲染）/ Hyperbrowser（云端隐身）** |
| 内容清洗 | script/iframe 标签剔除、广告正则清洗（整行/行内）、HTML 实体解码、段落规范化；全局规则可配置、可即时测试 |
| 智能化 | 智能分类匹配（内置 15 类词典+置信度）、智能完结判断（状态字段/最新章节特征/简介特征） |
| 任务调度 | 单本 / 范围（列表 URL 模板 + 页码区间）采集；**随机线程数范围、随机间隔范围**；每任务可编辑、立即执行、暂停、继续、停止；完整任务日志 |
| 目录处理 | 乱序重排（支持中文数字章节号）、URL 去重、章节名去重 |
| 增量/全量 | 「完全覆盖重采集」与「增量更新」双模式按钮级切换 |
| 双存储 | 章节正文可**直接写数据库**或**生成 txt 文件**到指定目录（storage/novels/），或两者同时 |
| 下拉词 | 书名自动抓取百度/必应/360/DuckDuckGo/谷歌**多搜索引擎下拉词**，作为辅助标签；每个关键词拥有**独立落地页且全部指向主关键词（主书籍信息页）** |
| 主题模板 | **5 套完全不同**（样式/配色/布局）的主题：经典书香 / 暗夜极简 / 清新杂志 / 古典水墨 / 现代炫彩；全主题适配 TDK、JSON-LD 结构化数据（SEO/GEO） |
| 站群系统 | 添加域名、站名、主题模板、TDK、偏移量即可生成新站点；后台+数据库+本地文件共用一套 |
| 下载系统 | 整书 TXT 下载；后台可配置插入**站点信息 / 广告 / 混淆**（零宽字符、同形字、干扰行三种方式+密度可调） |

---

## 2. 方式一：Docker 部署（推荐）

### 第 1 步：安装 Docker

```bash
# CentOS / RHEL
curl -fsSL https://get.docker.com | sh && systemctl enable --now docker

# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh

# 验证
docker --version && docker compose version
```

### 第 2 步：获取代码

```bash
git clone <你的仓库地址> novel-system && cd novel-system
# 或直接上传整个项目目录到服务器，例如：
# scp -r ./my-project root@your-server:/opt/novel-system
```

### 第 3 步：一键构建并启动

```bash
docker compose up -d --build
```

首次构建约 2~5 分钟。容器启动时自动完成：
- SQLite schema 同步（`prisma db push`）
- 服务启动（监听 `0.0.0.0:3000`）
- 健康检查（`/` 每 30s 探活）

### 第 4 步：验证部署

```bash
# 查看容器状态（STATUS 应为 Up (healthy)）
docker compose ps

# 查看启动日志
docker compose logs -f novel-system

# 本机探活
curl -I http://127.0.0.1:3000/
```

浏览器打开 `http://服务器IP:3000/` 即可看到管理后台。

### 第 5 步：（可选）配置 Hyperbrowser 云采集

编辑 `.env`（与 docker-compose.yml 同目录）：

```env
HYPERBROWSER_API_KEY=你的key
```

然后 `docker compose up -d --force-recreate` 生效。未配置时 HTTP 与 Playwright 策略不受影响。

### 数据落盘位置（务必挂载持久化）

| 宿主机路径 | 容器路径 | 内容 |
|---|---|---|
| `./db` | `/app/db` | SQLite 数据库（书籍/章节/规则/任务/站点配置） |
| `./storage` | `/app/storage` | 封面 webp（covers/）、章节 txt（novels/） |
| `./download` | `/app/download` | 生成下载文件 |

---

## 3. 方式二：裸机部署（bun）

```bash
# 1. 安装 bun（已装跳过）
curl -fsSL https://bun.sh/install | bash

# 2. 安装依赖
cd novel-system && bun install

# 3. 配置环境变量
echo 'DATABASE_URL=file:/opt/novel-system/db/custom.db' > .env

# 4. 同步数据库
bun run db:push

# 5. 构建生产产物
bun run build

# 6. 启动（建议 pm2/systemd 守护）
bun run start          # 等价于 bun .next/standalone/server.js

# systemd 示例（/etc/systemd/system/novel.service）
# [Service]
# WorkingDirectory=/opt/novel-system
# ExecStart=/root/.bun/bin/bun .next/standalone/server.js
# Environment=NODE_ENV=production PORT=3000
# Restart=always
```

---

## 4. 站群上线：多域名反向代理

系统内「站群管理」添加站点（域名/站名/主题/TDK/偏移量）后，把各域名解析到本服务器，并用 Nginx 或 Caddy 把**所有站点域名指向同一个 3000 端口**即可。

### Nginx 示例（/etc/nginx/conf.d/novel.conf）

```nginx
# 站点一
server {
    listen 80;
    server_name novel1.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
# 站点二（同一后端，共用数据库与文件）
server {
    listen 80;
    server_name novel2.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

### Caddy 示例（自动 HTTPS）

```caddy
novel1.example.com, novel2.example.com, novel3.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

> 各站点前台由系统按域名/站点配置渲染不同主题与内容序列；后台统一在任一域名下访问。

---

## 5. 可选：启用 Playwright / Hyperbrowser 采集策略

规则中的「抓取策略」默认为 HTTP 直连（最轻量）。需要 JS 渲染时：

### Docker 容器内追加 Playwright（示例 Dockerfile.playwright）

```dockerfile
FROM novel-system:latest
USER root
RUN bun add playwright && bunx playwright install --with-deps chromium
```

```bash
docker build -f Dockerfile.playwright -t novel-system:pw .
# 然后把 docker-compose.yml 的 image 改为 novel-system:pw，重新 up -d
```

### Hyperbrowser（云端，无需本地浏览器）

1. 到 hyperbrowser.ai 获取 API Key
2. 配置 `HYPERBROWSER_API_KEY` 环境变量（见第 2 节第 5 步）
3. 在规则编辑页把抓取策略切换为「Hyperbrowser (云隐身)」

---

## 6. 数据备份与恢复

```bash
# 备份（数据库 + 文件）
tar czf novel-backup-$(date +%F).tar.gz db/ storage/

# 恢复
tar xzf novel-backup-YYYY-MM-DD.tar.gz -C /opt/novel-system/
docker compose restart
```

建议加入 crontab 每日备份：

```cron
0 3 * * * cd /opt/novel-system && tar czf /backup/novel-$(date +\%F).tar.gz db/ storage/
```

---

## 7. 常见问题（FAQ）

**Q1：访问 3000 端口无响应？**
`docker compose logs novel-system` 查看日志；确认云服务器安全组/防火墙放行 3000（或用 Nginx 80/443 反代）。

**Q2：采集时目标站返回 403/验证码？**
依次尝试：规则里配置 Cookie 与 Referer → 切换 Playwright 策略（JS 渲染）→ 切换 Hyperbrowser 云隐身策略；并适当加大任务「间隔时间范围」。

**Q3：章节正文乱码？**
在对应规则「编码」中选择 GBK/GB2312/Big5（默认自动识别可覆盖大部分站点）。

**Q4：目录顺序错乱？**
目录页规则勾选「乱序重排」（内置中文数字解析），并保持「URL 去重」开启。

**Q5：想重新采集某本书？**
任务编辑 → 模式切换为「完全覆盖重采集」→ 立即执行；增量模式下系统只补采缺失章节。

**Q6：txt 文件存到哪了？如何改目录？**
默认 `storage/novels/书名/00001-章节标题.txt`；任务编辑中「章节内容存储」选择 txt 或 库+文件 即可。

**Q7：如何为下载的 txt 注入广告/混淆？**
「系统设置 → 小说文件下载系统」中开启并配置，随后在书籍详情点「下载 TXT」即时生效。

## 附录：GoEdge WAF 站点采集实战指南（kelexs / 存书啦 / 人气完本 均为此类）

### 症状与识别
- 访问任意页返回小体积"Verify Yourself"页（`/WAF/VERIFY/CAPTCHA`）→ 触发验证码挑战
- 页面返回 `403 Forbidden` → IP 已被临时拉黑（约 3 分钟自动冷却）
- 分页参数加密或点击后 URL 不变 → 需要 JS 渲染翻页

### 系统自动应对链路
HTTP 直连 → WAF 检测 → 自动升级 Playwright（stealth 注入）→ 截图验证码 → VLM 自动识别求解 → 通行 cookie 回写全局 CookieJar 复用 → 同域节流（throttleGap）+ 封禁冷却（reportBlock）

### 手动解题（推荐用于规则配置阶段）
```bash
# 1. 通用验证码求解器（任意 GoEdge 站点，第 2~3 次尝试即可通过）
bash tests/solve-captcha-generic.sh www.example.com "https://www.example.com/target.html"
# 输出 JAR_FILE 与通行 cookie（ge_wc_20=...）

# 2. 将通行 cookie 填入规则配置的 cookies 字段，并设置 rotateUA: false
#    （GoEdge 通行 cookie 与 UA 绑定，换 UA 即失效）
```

### 规则要点
- `rotateUA: false` + `cookies: "ge_wc_20=..."`（固定 UA 与通行 cookie 配套）
- `throttleGap: 1500`（同域全局最小间隔，防触发 WAF）
- 任务线程数建议 1~2、间隔 2000~5000ms
- 目录/内容优先 `http` 策略（部分站点对浏览器指纹反而不友好）

### 特殊反爬：藏字保护（data-cp）
部分站点（如存书啦）把真实字符以十六进制码点写入 `data-cp` 属性、浏览器端 JS 回填，
直接抓 HTML 会丢字。解析器 `decodeProtectedChars` 已自动解码，无需额外配置。

### 清洗规则升级后的存量数据再清洗
```bash
bun tests/reclean-db.ts rqwb.com   # 按域名过滤，可省略参数清洗全部书籍
```
