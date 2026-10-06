#!/usr/bin/env bash
# ============================================================
# 小说管理系统 —— 全新服务器一键安装脚本
#
# 一行命令（复制到全新服务器执行）：
#   curl -fsSL https://raw.githubusercontent.com/u4399com-beep/fdfef/main/scripts/oneclick.sh | bash
#
# 可选环境变量（放在管道前）：
#   INSTALL_DIR=/opt/novel-system   安装目录（默认 ~/novel-system）
#   PORT=3000                       服务端口（默认 3000）
#   HYPERBROWSER_API_KEY=xxx        云端隐身采集（可选，写入 .env 供 compose 读取）
#
# 服务器已有 Docker 时自动走「docker compose up -d --build」；
# 没有 Docker 时自动安装 Bun 并裸机直跑（更轻量，脚本自动选择）。
# ============================================================
set -euo pipefail

GIT_URL="${GIT_URL:-https://github.com/u4399com-beep/fdfef.git}"
GIT_REF="${GIT_REF:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/novel-system}"
PORT="${PORT:-3000}"

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

# ---------- 2. 获取代码 ----------
fetch_code() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    info "检测到已有安装目录，拉取最新代码…"
    git -C "$INSTALL_DIR" pull --ff-only || warn "git pull 失败（本地有改动？），继续使用现有代码"
  else
    info "克隆仓库到 $INSTALL_DIR …"
    git clone --depth 1 --branch "$GIT_REF" "$GIT_URL" "$INSTALL_DIR"
  fi
}

# ---------- 3. Docker 检测 ----------
has_docker() {
  docker compose version >/dev/null 2>&1 && return 0
  docker-compose version >/dev/null 2>&1 && return 0
  return 1
}

main() {
  echo ""
  info "==================== 小说管理系统 一键部署 ===================="
  info "安装目录：$INSTALL_DIR"
  info "服务端口：$PORT"
  echo ""

  # 1. git + 代码（仓库为公开仓库，克隆无需任何凭证）
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
    docker compose up -d --build
    info "等待服务就绪…"
    for _ in $(seq 1 60); do
      curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null && break
      sleep 2
    done
    RUNTIME="Docker Compose（容器）"
    STATUS_HINT="docker compose ps"
    LOGS_HINT="docker compose logs -f novel-system"
    UPDATE_HINT="git pull && docker compose up -d --build"
  else
    info "未检测到 Docker，走 Bun 裸机部署（更轻量）…"
    if ! command -v bun >/dev/null 2>&1; then
      info "自动安装 Bun…"
      curl -fsSL https://bun.sh/install | bash
      export BUN_INSTALL="$HOME/.bun"
      export PATH="$BUN_INSTALL/bin:$PATH"
    fi
    command -v bun >/dev/null 2>&1 || fail "Bun 安装失败，请手动执行：curl -fsSL https://bun.sh/install | bash 后重跑本脚本"
    PORT="$PORT" bash deploy.sh up
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
