#!/usr/bin/env bash
# ============================================================
# 小说管理系统 —— 全新服务器一键安装脚本
#
# 一行命令（海外服务器/可直连 GitHub）：
#   curl -fsSL https://raw.githubusercontent.com/u4399com-beep/fdfef/main/scripts/oneclick.sh | bash
#
# 一行命令（国内服务器，raw.githubusercontent 被重置时用 jsDelivr CDN）：
#   curl -fsSL https://cdn.jsdelivr.net/gh/u4399com-beep/fdfef@main/scripts/oneclick.sh | bash
#   curl -fsSL https://fastly.jsdelivr.net/gh/u4399com-beep/fdfef@main/scripts/oneclick.sh | bash
#
# 可选环境变量（放在管道前）：
#   INSTALL_DIR=/opt/novel-system   安装目录（默认 ~/novel-system）
#   PORT=3000                       服务端口（默认 3000）
#   HYPERBROWSER_API_KEY=xxx        云端隐身采集（可选，写入 .env 供 compose 读取）
#   CLONE_MIRRORS="a/ b/"           覆盖 git 克隆镜像前缀列表（空格分隔）
#
# 网络受限自适应：GitHub 直连克隆失败 → 自动切换镜像加速；
# bun.sh 安装失败 → 自动回退 npmmirror；并给 deploy.sh 传递 MIRROR=1
# （依赖与 Prisma 引擎走国内镜像）。
# ============================================================
set -euo pipefail

GIT_URL="${GIT_URL:-https://github.com/u4399com-beep/fdfef.git}"
GIT_REF="${GIT_REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/novel-system}"
PORT="${PORT:-3000}"
# git 克隆镜像前缀（用法：前缀 + 原仓库地址）。公开镜像经常变动，可用 CLONE_MIRRORS 覆盖。
CLONE_MIRRORS="${CLONE_MIRRORS:-https://ghfast.top/ https://gh-proxy.com/ https://github.moeyy.xyz/}"
MIRROR=0  # 检测到网络受限时置 1，传递给 deploy.sh

info()  { echo -e "\033[1;32m[oneclick]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[oneclick]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[oneclick]\033[0m $*" >&2; exit 1; }

# ---------- 1. 基础依赖：git ----------
ensure_git() {
  command -v git >/dev/null 2>&1 && return 0
  warn "未检测到 git，尝试自动安装…"
  local prefix=""
  [ "$(id -u)" != 0 ] && command -v sudo >/dev/null 2>&1 && prefix="sudo"
  if command -v apt-get >/dev/null 2>&1; then
    $prefix apt-get update -y && $prefix apt-get install -y git
  elif command -v dnf >/dev/null 2>&1; then
    $prefix dnf install -y git
  elif command -v yum >/dev/null 2>&1; then
    $prefix yum install -y git
  fi
  command -v git >/dev/null 2>&1 || fail "git 安装失败，请手动安装后重试（apt install git / yum install git）"
}

# ---------- 2. 获取代码（直连失败自动镜像回退） ----------
fetch_code() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "检测到已有安装目录，拉取最新代码…"
    git -C "$INSTALL_DIR" pull --ff-only || warn "git pull 失败（本地有改动/网络受限？），继续使用现有代码"
    return 0
  fi
  if [ -d "$INSTALL_DIR" ]; then
    fail "目录 $INSTALL_DIR 已存在但不是 git 仓库（可能是上次安装中断残留），请清空后重试或用 INSTALL_DIR=路径 指定其他目录"
  fi
  info "克隆仓库到 $INSTALL_DIR …"
  if git clone --depth 1 --branch "$GIT_REF" "$GIT_URL" "$INSTALL_DIR"; then
    return 0
  fi
  warn "直连 GitHub 克隆失败（连接被重置/超时？），自动切换镜像加速…"
  MIRROR=1
  local m
  for m in $CLONE_MIRRORS; do
    info "尝试镜像：${m%/}"
    if git clone --depth 1 --branch "$GIT_REF" "${m%/}/$GIT_URL" "$INSTALL_DIR"; then
      warn "注意：代码经第三方镜像（${m%/}）加速获取；如对来源有安全顾虑，可在可直连环境自行 git clone 后上传服务器"
      return 0
    fi
  done
  fail "全部克隆方式失败。请手动获取代码到 $INSTALL_DIR 后重跑本脚本（会自动复用已有目录）：\n  git clone https://ghfast.top/$GIT_URL $INSTALL_DIR"
}

# ---------- 3. Docker 检测 ----------
has_docker() {
  docker compose version >/dev/null 2>&1 && return 0
  docker-compose version >/dev/null 2>&1 && return 0
  return 1
}

# ---------- 4. Bun 安装（bun.sh 失败自动回退 npmmirror） ----------
ensure_npm() {
  command -v npm >/dev/null 2>&1 && return 0
  local prefix=""
  [ "$(id -u)" != 0 ] && command -v sudo >/dev/null 2>&1 && prefix="sudo"
  if command -v apt-get >/dev/null 2>&1; then
    $prefix apt-get update -y && $prefix apt-get install -y nodejs npm || true
  elif command -v dnf >/dev/null 2>&1; then
    $prefix dnf install -y nodejs npm || true
  elif command -v yum >/dev/null 2>&1; then
    $prefix yum install -y nodejs npm || true
  fi
  command -v npm >/dev/null 2>&1
}

ensure_bun() {
  command -v bun >/dev/null 2>&1 && return 0
  info "未检测到 Bun，自动安装…"
  if curl -fsSL https://bun.sh/install | bash; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
  if ! command -v bun >/dev/null 2>&1; then
    warn "bun.sh 安装失败（网络受限？），回退 npmmirror 镜像安装…"
    MIRROR=1
    if ensure_npm; then
      npm install -g bun --registry=https://registry.npmmirror.com \
        || [ "$(id -u)" = 0 ] \
        || sudo npm install -g bun --registry=https://registry.npmmirror.com \
        || true
    fi
    command -v bun >/dev/null 2>&1 || fail "Bun 自动安装失败。请任选其一手动安装后重跑本脚本：\n  1) curl -fsSL https://bun.sh/install | bash\n  2) npm install -g bun --registry=https://registry.npmmirror.com"
  fi
  info "Bun $(bun --version) 就绪"
}

main() {
  echo ""
  info "==================== 小说管理系统 一键部署 ===================="
  info "安装目录：$INSTALL_DIR"
  info "服务端口：$PORT"
  echo ""

  # 1. git + 代码（仓库为公开仓库，克隆无需任何凭证；被重置自动镜像回退）
  ensure_git
  fetch_code
  cd "$INSTALL_DIR"

  # 2. 可选 API Key 写入 .env（compose 自动读取；已存在则不覆盖）
  if [ -n "${HYPERBROWSER_API_KEY:-}" ] && [ -f docker-compose.yml ] && ! grep -q "^HYPERBROWSER_API_KEY=" .env 2>/dev/null; then
    echo "HYPERBROWSER_API_KEY=$HYPERBROWSER_API_KEY" >> .env
    info "已写入 HYPERBROWSER_API_KEY 到 .env"
  fi

  # 3. 选择部署路径：有 Docker 走容器，否则装 Bun 裸机直跑
  if has_docker; then
    info "检测到 Docker Compose，走容器部署（首次构建约 2~5 分钟）…"
    if [ "$MIRROR" = "1" ]; then
      warn "提示：容器构建需从 Docker Hub 拉取 oven/bun 基础镜像，国内拉取失败时请配置镜像加速（/etc/docker/daemon.json 的 registry-mirrors）或改走裸机路径（docker compose down 后重跑本脚本前卸载/停用 docker）"
    fi
    docker compose up -d --build
    info "等待服务就绪…"
    for _ in $(seq 1 90); do
      curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null && break
      sleep 2
    done
    RUNTIME="Docker Compose（容器）"
    STATUS_HINT="docker compose ps"
    LOGS_HINT="docker compose logs -f novel-system"
    UPDATE_HINT="git pull && docker compose up -d --build"
  else
    info "未检测到 Docker，走 Bun 裸机部署（更轻量）…"
    ensure_bun
    if [ "$MIRROR" = "1" ]; then
      info "已进入受限网络模式（MIRROR=1）：依赖/引擎将使用 npmmirror 国内镜像"
    fi
    MIRROR="$MIRROR" PORT="$PORT" bash deploy.sh up
    RUNTIME="Bun 裸机（deploy.sh 托管）"
    STATUS_HINT="./deploy.sh status"
    LOGS_HINT="./deploy.sh logs"
    UPDATE_HINT="./deploy.sh update"
  fi

  # 4. 完成信息
  echo ""
  info "==================== 🎉 部署完成 ===================="
  echo ""
  echo "    运行方式   : $RUNTIME"
  echo "    访问地址   : http://服务器IP:$PORT/   （后台管理：/admin）"
  echo "    首次登录   : 用户名 admin / 密码 admin123 —— 请立即在后台修改密码！"
  echo "    数据位置   : $INSTALL_DIR/db（数据库） $INSTALL_DIR/storage（封面/章节）"
  echo "                 数据随仓库自带（书籍/规则/章节/封面开箱即用），运行时目录挂载持久化"
  echo "    查看状态   : $STATUS_HINT"
  echo "    查看日志   : $LOGS_HINT"
  echo "    后续升级   : $UPDATE_HINT"
  echo "    站群/反代  : 多域名解析到本机后，Nginx/Caddy 全部反代到 127.0.0.1:$PORT 即可"
  echo ""
  warn "安全提示：生产环境请（1）立即修改默认密码 （2）建议配置 AUTH_SECRET 环境变量"
  echo ""
}

main
