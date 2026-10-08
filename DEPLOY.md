# 小说管理系统 —— 生产环境分步部署说明

> 技术栈：Next.js 16（App Router）+ TypeScript + SQLite（Prisma）+ Tailwind / shadcn
> 一套后台 + 一套数据库 + 一套本地文件，通过「站群系统」派生多个前台站点。
> 本文档提供 **一键部署 / Docker（推荐）** 与 **裸机直跑** 几种部署方式，全部命令可直接复制执行。

---

## 目录

1. [一键部署（30 秒开始）](#1-一键部署30-秒开始)
2. [功能总览](#2-功能总览)
3. [方式一：Docker 部署（推荐）](#3-方式一docker-部署推荐)
4. [方式二：裸机部署（bun / deploy.sh）](#4-方式二裸机部署bun--deploysh)
5. [站群上线：多域名反向代理](#5-站群上线多域名反向代理)
6. [可选：启用 Playwright / Hyperbrowser 采集策略](#6-可选启用-playwright--hyperbrowser-采集策略)
7. [数据备份与恢复](#7-数据备份与恢复)
8. [常见问题（FAQ）](#8-常见问题faq)

---

## 1. 一键部署（30 秒开始）

仓库为公开仓库，**自带全部在库数据**（数据库 + 封面 + 章节 txt），克隆即得、开箱即用。

### 全新服务器 · 零依赖一行命令

```bash
curl -fsSL https://raw.githubusercontent.com/u4399com-beep/fdfef/main/scripts/oneclick.sh | bash
```

脚本自动完成：安装 git/Bun → 克隆代码 → **有 Docker 走容器、无 Docker 自动裸机直跑** → 建库 → 构建 → 启动 → 健康检查。

可选参数（放在管道前）：

```bash
# 自定义安装目录 / 端口 / 云采集 Key
curl -fsSL https://raw.githubusercontent.com/u4399com-beep/fdfef/main/scripts/oneclick.sh \
  | INSTALL_DIR=/opt/novel-system PORT=3000 HYPERBROWSER_API_KEY=你的key bash
```

### 国内服务器 · 网络受限自适应

`raw.githubusercontent.com` 在国内常被重置（报 `curl: (35) Connection reset by peer`），改用 jsDelivr CDN：

```bash
curl -fsSL https://cdn.jsdelivr.net/gh/u4399com-beep/fdfef@main/scripts/oneclick.sh | bash
# 若上者仍慢，换 Fastly 节点：
curl -fsSL https://fastly.jsdelivr.net/gh/u4399com-beep/fdfef@main/scripts/oneclick.sh | bash
```

脚本内部已内置受限网络自适应：GitHub 直连克隆失败 → **自动切换镜像加速**（ghfast/gh-proxy/moeyy，可用 `CLONE_MIRRORS` 覆盖）；bun.sh 安装失败 → **自动回退 npmmirror**；并自动进入 `MIRROR=1` 模式（npm 依赖与 Prisma 引擎走国内镜像）。

也可跳过脚本直接克隆（github.com 域名通常可达）：

```bash
git clone https://github.com/u4399com-beep/fdfef.git novel-system && cd novel-system && bash deploy.sh up
# 若 clone 也被重置，用镜像前缀：
git clone https://ghfast.top/https://github.com/u4399com-beep/fdfef.git novel-system && cd novel-system && MIRROR=1 bash deploy.sh up
```

### 已有 Docker 的服务器 · 两条命令

```bash
git clone https://github.com/u4399com-beep/fdfef.git novel-system && cd novel-system
docker compose up -d --build
```

### 无 Docker 的服务器 · 三条命令（Bun 裸机）

```bash
git clone https://github.com/u4399com-beep/fdfef.git novel-system && cd novel-system
bash deploy.sh up
```

`deploy.sh` 是完整的裸机管理脚本：`up / down / restart / status / logs / update / build`。

### 部署完成后（必读）

| 项 | 说明 |
|---|---|
| 访问地址 | `http://服务器IP:3000/`，后台管理 `/admin` |
| 首次登录 | 用户名 `admin` / 密码 `admin123`，**请立即在后台修改密码** |
| 数据位置 | `./db`（SQLite 数据库）、`./storage`（封面 webp / 章节 txt），均为目录挂载持久化，可直接备份 |
| 后续升级 | 裸机：`./deploy.sh update`；Docker：`git pull && docker compose up -d --build` |

---

## 2. 功能总览

| 模块 | 说明 |
|---|---|
| 采集规则 | 列表页 / 书籍信息页 / 章节目录页 / 章节内容页四类规则；**CSS、正则、XPath 三种选择器可混用**；**目录页支持完整分页采集（下一页/select 下拉/URL 模板三种模式）**；每类规则编辑页内置「测试」功能 |
| 书籍字段 | 书名、作者、分类、关键词、简介、封面图；封面自动下载转 **webp** 存储 |
| 反反爬 | UA 随机轮换、Cookie/Referer/自定义 Header、随机超时；抓取策略可切换 **HTTP 直连 / Playwright（JS 渲染）/ Hyperbrowser（云端隐身）** |
| 内容清洗 | script/iframe 标签剔除、广告正则清洗（整行/行内）、HTML 实体解码、段落规范化；全局规则可配置、可即时测试 |
| 智能化 | 智能分类匹配（内置 15 类词典+置信度）、智能完结判断（状态字段/最新章节特征/简介特征） |
| 任务调度 | 单本 / 范围（列表 URL 模板 + 页码区间）采集；**随机线程数范围、随机间隔范围**；每任务可编辑、立即执行、暂停、继续、停止；完整任务日志 |
| 目录处理 | 乱序重排（支持中文数字章节号）、URL 去重、章节名去重 |
| 增量/全量 | 「完全覆盖重采集」与「增量更新」双模式按钮级切换 |
| 双存储 | 章节正文可**直接写数据库**或**生成 txt 文件**到指定目录（storage/novels/），或两者同时 |
| 下拉词 | 书名自动抓取百度/必应/360/DuckDuckGo/谷歌**多搜索引擎下拉词**，作为辅助标签；每个关键词拥有**独立落地页且全部指向主关键词（主书籍信息页）** |
| 主题模板 | **6 套完全不同**（样式/配色/布局）的主题：经典书香 / 暗夜极简 / 清新杂志 / 古典水墨 / 现代炫彩 / UAA 蓝调；全主题适配 TDK、JSON-LD 结构化数据（SEO/GEO） |
| 站群系统 | 添加域名、站名、主题模板、TDK、偏移量即可生成新站点；后台+数据库+本地文件共用一套 |
| 下载系统 | 整书 TXT 下载；后台可配置插入**站点信息 / 广告 / 混淆**（零宽字符、同形字、干扰行三种方式+密度可调） |

---

## 3. 方式一：Docker 部署（推荐）

> 一键命令见第 1 节；本节为分步说明与原理。

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
git clone https://github.com/u4399com-beep/fdfef.git novel-system && cd novel-system
# 或直接上传整个项目目录到服务器，例如：
# scp -r ./my-project root@your-server:/opt/novel-system
```

> 仓库已包含当前全部数据：`db/custom.db`（书籍/章节/规则/任务/站点配置）与 `storage/`（封面 webp + 章节 txt），克隆后无需重新采集即可运行。

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

### 第 5 步：（可选）配置 Hyperbrowser 云采集 / 会话密钥

编辑 `.env`（与 docker-compose.yml 同目录）：

```env
HYPERBROWSER_API_KEY=你的key
# 可选：显式指定后台会话签名密钥（>=16 字符）；不设置时自动生成 db/auth-secret 文件持久化
# AUTH_SECRET=一串足够长的随机字符串
```

然后 `docker compose up -d --force-recreate` 生效。未配置时 HTTP 与 Playwright 策略不受影响。

### 数据落盘位置（务必挂载持久化）

| 宿主机路径 | 容器路径 | 内容 |
|---|---|---|
| `./db` | `/app/db` | SQLite 数据库（书籍/章节/规则/任务/站点配置） |
| `./storage` | `/app/storage` | 封面 webp（covers/）、章节 txt（novels/）、**WAF 通行 cookie（waf-cookies.json）** |
| `./download` | `/app/download` | 生成下载文件 |

> **waf-cookies.json 说明**：VLM 验证码解题后的 WAF 通行 cookie 会自动持久化到此文件（2 秒防抖写盘，7 天 TTL）。
> 容器/进程重启后直接复用通行会话，无需重新解验证码——这是 GoEdge 类 WAF 站点"稳定长期采集"的关键一环。
> 该文件已加入 .gitignore（会话凭据不入 git），迁移/备份时随 `storage/` 目录整体拷贝即可。

---

## 4. 方式二：裸机部署（bun / deploy.sh）

### 推荐用法：deploy.sh 一键脚本

```bash
# 首次部署：自动装依赖 → 建库 → 构建 → 启动 → 健康检查
cd novel-system && bash deploy.sh up

# 日常管理
bash deploy.sh status      # 运行状态 + 健康检查
bash deploy.sh logs        # 实时日志（Ctrl+C 退出）
bash deploy.sh restart     # 重启
bash deploy.sh down        # 停止
bash deploy.sh update      # git pull + 重建 + 重启（一条命令完成升级）

# 指定端口 / 强制重建
PORT=8080 bash deploy.sh up
FORCE_BUILD=1 bash deploy.sh restart
```

脚本内置最易踩坑的处理：standalone 产物以 `.next/standalone` 为工作目录、不读项目根 `.env`，`deploy.sh` 会把 `DATABASE_URL`（绝对路径）显式注入启动环境。

### systemd 常驻（可选）

若希望 systemd 托管（而非 deploy.sh 的 PID 管理），把 ExecStart 指向 deploy.sh 不适用；请直接配置：

```ini
# /etc/systemd/system/novel.service
[Unit]
Description=Novel System
After=network.target

[Service]
WorkingDirectory=/opt/novel-system
ExecStart=/root/.bun/bin/bun .next/standalone/server.js
Environment=NODE_ENV=production PORT=3000
Environment=DATABASE_URL=file:/opt/novel-system/db/custom.db
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now novel
```

---

## 5. 站群上线：多域名反向代理

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

## 6. 可选：启用 Playwright / Hyperbrowser 采集策略

规则中的「抓取策略」默认为 HTTP 直连（最轻量）。需要 JS 渲染时：

### Docker：构建参数一键开启（推荐）

```bash
# 构建时安装 chromium（镜像约 +400MB），容器内 JS 渲染策略立即可用
INSTALL_PLAYWRIGHT=true docker compose up -d --build
```

### 裸机：进项目目录执行

```bash
cd /opt/novel-system && bunx playwright install --with-deps chromium
```

> 必须带 `--with-deps`：只装浏览器不装系统库，launch 时会报
> `Target page, context or browser has been closed`（缺 libnss3/libgbm 等）。

### 已装浏览器但启动崩溃（browser has been closed）？

症状：采集日志报 `WAF 拦截且浏览器策略不可用：launch: Target page, context or browser has been closed`。
原因：chromium 二进制存在但 Linux 系统依赖库缺失，chrome 进程启动即崩。
修复（装完依赖即时生效，无需重启服务——浏览器是每次采集按需拉起的子进程）：

```bash
# 裸机
cd /opt/novel-system && bunx playwright install-deps chromium

# Docker 容器（即时生效，但容器重建后丢失；根治见下方重新构建）
docker compose exec novel-system bun node_modules/playwright/cli.js install-deps chromium

# Docker 根治：更新代码后带构建参数重建（镜像层固化依赖）
git pull && INSTALL_PLAYWRIGHT=true docker compose up -d --build
```

### Hyperbrowser（云端，无需本地浏览器）

1. 到 hyperbrowser.ai 获取 API Key
2. 配置 `HYPERBROWSER_API_KEY` 环境变量（见第 3 节第 5 步）
3. 在规则编辑页把抓取策略切换为「Hyperbrowser (云隐身)」

### 验证码自动识别（WAF 挑战页全自动过码）

目标站弹出验证码（GoEdge 类 WAF，如 kelexs/存书啦/人气完本）时，系统自动走**双通道求解**：

1. **① 纯 HTTP 无浏览器求解（首选，无需安装 Playwright）**：
   检测到挑战页 → HTTP 解析验证码表单 → 下载验证码图 → **放大+二值化预处理**（识别率关键环节）→ 视觉模型识别 → POST 表单提交 → 通行 cookie（`ge_wc_20`，约 2h 有效）自动入 jar 并持久化到 `storage/waf-cookies.json`（7 天 TTL，重启不丢）。kelexs 生产实测一次通过，**服务器不装浏览器也能全自动过码**。
2. **② Playwright DOM 求解（兑底）**：仅当响应为非 GoEdge 布局/结构化失败时升级；同一 VLM 下不再对已解析的 GoEdge 表单做浏览器重试（无精度增益，避免无谓延迟）。

辅助机制：

- **同主机求解串行锁**：多线程采集并发命中 WAF 时只解一次，其余请求共享通行 cookie
- **指纹一致性策略**：无会话 cookie 的首次访问按「简单客户端」画像发请求（不发 Sec-Fetch 声明）；带 cookie 的回访才发完整浏览器导航指纹——kelexs 实测「声称浏览器导航却零 cookie」是嫌疑分最高的组合，稳定触发 307 挑战乃至 403
- **硬 403（IP 黑名单）**：明确报错并自动冷却 3 分钟，不无谓重试加剧封禁；请求频率过高会累积 IP 信誉惩罚，调大规则 `throttleGap`（如 3000~5000ms）可显著降低触发概率

视觉识别有两条通道（自动降级）：

| 通道 | 适用环境 | 配置 |
|---|---|---|
| 内置 z-ai SDK | 平台沙箱内开箱即用 | 无需配置 |
| **自定义 OpenAI 兼容视觉 API** | **自部署服务器（推荐配置）** | 三个环境变量（缺一不启用） |

自部署服务器配置（推荐智谱 `glm-4v-flash`，免费）：

```bash
# Docker：写入 .env 后 docker compose up -d --force-recreate
CAPTCHA_VISION_API_BASE=https://open.bigmodel.cn/api/paas/v4
CAPTCHA_VISION_API_KEY=你的key
CAPTCHA_VISION_MODEL=glm-4v-flash

# 裸机：export 到环境后 ./deploy.sh restart（或写入 .env 经 systemd Environment 注入）
```

> 兼容任何 OpenAI `/chat/completions` 视觉端点：OpenAI（`gpt-4o-mini`）、本地 Ollama（`http://127.0.0.1:11434/v1` + `llava`/`qwen2-vl`，完全离线）等。

### 手动过码（不配置任何 API，1 分钟生效）

1. 本机浏览器打开目标站任意页面，完成验证码
2. F12 → 应用(Application)/网络(Network) 面板 → 复制该站 Cookie（GoEdge 站形如 `ge_wc_20=...`）
3. 后台规则编辑 → 「Cookie」字段粘贴 → **关闭「UA 随机轮换」**，并把 UA 填成你浏览器的 UA（通行 cookie 与 UA 绑定，换 UA 即失效）
4. 任务线程数建议 1~2、间隔 2000~5000ms（`throttleGap: 1500`）

> 通行 cookie 通常有效数小时～数天；失效后重复以上步骤即可。解题成功的 cookie 系统也会自动持久化复用，无需每次手动。

### 循环采集任务（定时自动更新）

后台「采集任务」页顶部为**循环任务**面板：按固定分钟间隔自动创建并启动一次增量采集任务（上一轮未跑完不会重复触发；服务重启后自动把残留任务标记中断并自愈）。典型用途：每隔 2 小时自动采集某站的最新更新。

- **新建**：点「新建循环任务」→ 填名称与间隔（最短 5 分钟）→ 从现有任务下拉选一个作为模板（自动复用其规则/URL/并发配置，可在 JSON 里微调）→ 创建。模板 JSON 与手动建任务的字段完全同构（`targetType` / 规则 id / `urlTemplate` / `mode: incremental` 等）。
- **立即执行**：不等间隔，手动触发一轮（上轮仍在跑时会拒绝并提示）。
- **启停**：右上开关控制是否参与调度，删除不影响历史任务记录。
- **首次触发**：新建/种子化的循环任务从「间隔到期」后开始自然触发；想立刻跑一轮就点「立即执行」。

系统内置了一个种子任务「dwxwc最新更新循环采集」（每 120 分钟对 `https://www.dwxwc.com/sort/1/{page}/` 第 1~2 页做增量采集，玄幻最近更新列表；增量模式对已入库书籍只补新章节）。修改间隔或启用其他站点：面板内直接操作，或 `bun tests/register-dwxwc-schedule.ts <间隔分钟>` 重置模板。

调度器随服务器进程自动启动（`src/instrumentation.ts`），无需额外进程或 crontab；日志前缀 `[scheduler]`。

### 反反爬引擎扩展：CloakBrowser 与 iv8（可选增强）

除内置 Playwright 与 Hyperbrowser 外，系统还支持两款第三方反反爬引擎，可按需启用（都不装则一切按默认行为，零影响）。

**两者定位对比（互补而非替代）：**

| 维度 | CloakBrowser | iv8 |
|---|---|---|
| 本质 | **源码级隐身 Chromium**：87 处 C++ 补丁（canvas/WebGL/音频/字体/GPU/网络时序/自动化信号），反爬系统看到的就是一台真实浏览器 | **V8 补环境运行时**：Python 原生扩展，C++ 层模拟 BOM/DOM/CSSOM，在无浏览器的进程里执行站点 JS |
| 解决什么 | 真实渲染场景的指纹/行为检测：Cloudflare Turnstile、FingerprintJS、BrowserScan 等 30+ 检测实测通过 | JS 计算型 cookie 挑战（瑞数系/acw_sc__v2 类）：页面无验证码图，靠混淆 JS 算 cookie 后刷新 |
| 资源开销 | 真实浏览器进程（二进制约 200MB，首次启动自动下载） | 极轻（Python 进程 + V8，无浏览器、毫秒级、可高并发） |
| 接入方式 | npm 包 `cloakbrowser`，与 Playwright 同 API（返回标准 Browser 对象），fetcher 自动接入 | pip 包 `iv8`，经内置 `scripts/iv8-solver.py` 以外部命令协议接入（stdin/stdout JSON） |
| 局限 | 有浏览器资源成本；个别站点检测 headless 需 Pro 版 humanize | 只能算 cookie/签名，不能渲染页面、不能过图片验证码；极复杂 JSVMP 需 Pro 版 |
| 选型 | WAF 指纹检测强、需要真渲染时 | 目标站只差一枚 JS 算的 cookie、想免浏览器成本时 |

**① CloakBrowser（浏览器引擎替换）**

```bash
# 裸机：项目目录安装包（首次用它启动时会自动下载隐身 Chromium 二进制，约 200MB）
bun add cloakbrowser

# 切换引擎（三选一）
BROWSER_ENGINE=cloakbrowser ./deploy.sh restart          # 显式指定
CLOAKBROWSER_LICENSE_KEY=cb_xxx ./deploy.sh restart      # 有 Pro 许可证时自动启用
# Docker：.env 写 BROWSER_ENGINE=cloakbrowser 后 docker compose up -d --force-recreate
```

- 自动降级：CloakBrowser 启动失败（未装包/下载失败/二进制损坏）自动回退 Playwright，任务日志有 `[browser-engine]` 降级警告，采集不中断
- 已装 cloakbrowser 但想用回 Playwright：`BROWSER_ENGINE=playwright` 即可
- 离线服务器：`CLOAKBROWSER_BINARY_PATH=/path/to/chromium` 指向本地二进制免下载

**② iv8 补环境求解通道（JS cookie 挑战）**

```bash
# 裸机：安装（Python 3.9-3.14；Linux x64/aarch64 官方 manylinux 轮子）
pip3 install --upgrade iv8 -i https://pypi.org/simple
python3 scripts/iv8-solver.py --selftest     # 自检：内置挑战页，PASS 即链路可用

# 启用（二选一）
IV8_ENABLED=1 ./deploy.sh restart            # 使用内置 scripts/iv8-solver.py
IV8_COMMAND="python3 /abs/path/solver.py" ./deploy.sh restart   # 自定义求解命令

# Docker：容器内需具备 python3 + iv8 + 脚本（标准镜像不含 python，可自行扩展或挂载）；
# .env 写 IV8_COMMAND 指向容器内可达的求解命令
```

- 触发条件（自动，无需改规则）：HTTP 响应为 200 且命中「JS 写 cookie 后刷新」挑战特征（瑞数变量运算流 / `document.cookie=` + reload），规则也可显式加 `"iv8Cookies": true` 强制启用
- 求解流程：挑战页 HTML 喂给求解器 → iv8 补环境执行站点 JS（`eventLoop.advance` 逻辑时间推进，无需真实等待 setTimeout）→ 取回通行 cookie 入 CookieJar → 同 UA 重放请求
- 协议（自定义求解器只需实现）：stdin 收 `{"url","ua","html"}`，stdout 回 `{"ok":true,"cookies":[{"name","value"}]}` 或 `{"ok":false,"error":"..."}`
- 未配置时：通道静默跳过，零开销；日志出现 `[iv8-solve]` 前缀即该通道在工作

---

## 7. 数据备份与恢复

```bash
# 备份（数据库 + 文件；download/ 为生成产物，可选备份）
tar czf novel-backup-$(date +%F).tar.gz db/ storage/ download/

# 恢复
tar xzf novel-backup-YYYY-MM-DD.tar.gz -C /opt/novel-system/
docker compose restart
```

建议加入 crontab 每日备份：

```cron
0 3 * * * cd /opt/novel-system && tar czf /backup/novel-$(date +\%F).tar.gz db/ storage/ download/
```

---

## 8. 常见问题（FAQ）

**Q0：一键命令报 `curl: (35) Recv failure: Connection reset by peer`？**
服务器无法直连 `raw.githubusercontent.com`（国内常见）。改用 jsDelivr CDN 版一键命令（见第 1 节「国内服务器」）；若容器构建拉取 `oven/bun` 基础镜像也失败，需在 `/etc/docker/daemon.json` 配置 `registry-mirrors` 镜像加速，或直接走裸机路径 `bash deploy.sh up`（自动 MIRROR 模式）。

**Q1：访问 3000 端口无响应？**
`docker compose logs novel-system` 查看日志；确认云服务器安全组/防火墙放行 3000（或用 Nginx 80/443 反代）。

**Q2：采集时目标站返回 403/验证码？**
先配置视觉 API（见「验证码自动识别」节）——HTTP 无浏览器通道即可全自动过码；仍受限时再依次尝试：规则里配置 Cookie 与 Referer → 切换 Playwright 策略（JS 渲染）→ 切换 Hyperbrowser 云隐身策略；并适当加大任务「间隔时间范围」（请求过频会累积 IP 信誉惩罚，表现为连裸请求都 403）。

**Q2.5：JS 渲染策略报 `launch: Target page, context or browser has been closed`？**
chromium 已装但缺系统依赖库。裸机：`bunx playwright install-deps chromium`；Docker：`docker compose exec novel-system bun node_modules/playwright/cli.js install-deps chromium`（根治：`INSTALL_PLAYWRIGHT=true docker compose up -d --build`）。详见第 6 节。

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
HTTP 直连（无 cookie 首访按简单客户端画像，不易触发挑战）→ WAF 检测 → **① 纯 HTTP 求解**：解析验证码表单 → 下载图 → 放大+二值化预处理 → VLM 识别 → POST 表单（最多 4 次，每次自动刷新验证码）；表单已解析但 VLM 连续未命中则跳过浏览器重试直接报可行动错误 → **② Playwright 兑底**（仅非 GoEdge 布局）→ 通行 cookie 回写全局 CookieJar 复用（**并持久化到 storage/waf-cookies.json，重启不丢**）→ 同主机求解串行锁（并发只解一次）→ 同域节流（throttleGap）+ 封禁冷却（reportBlock）

### 长期稳定性机制（自动生效，无需配置）
- **通行 cookie 持久化**：解题成果跨进程重启保留（7 天 TTL，过期自动放弃）
- **镜像域名轮换**：规则配置 `mirrorUrls` 后，主域网络级不可达（DNS/超时/连接失败）自动按序切换镜像并记忆 10 分钟
- **硬 403 冷却**：IP 拉黑时全局冷却 3 分钟，冷却后自动恢复，期间任务暂停等待而非报错中断
- **select 下拉分页**：`pagination.mode: "select"` 枚举全部分页选项，免疫"末页下一页指向书籍页"蜜罐

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
