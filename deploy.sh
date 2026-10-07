#!/usr/bin/env bash
# ============================================================
# 小说管理系统 —— 裸机一键部署脚本（Bun 直跑，无需 Docker）
#
#   ./deploy.sh up          一键部署/启动（首次自动装依赖+建库+构建）
#   ./deploy.sh down        停止服务
#   ./deploy.sh restart     重启服务
#   ./deploy.sh status      查看运行状态
#   ./deploy.sh logs        查看运行日志（Ctrl+C 退出）
#   ./deploy.sh update      拉取最新代码并重建重启
#   ./deploy.sh build       仅重新构建（不重启）
#
# 可用环境变量：
#   PORT=3000                 监听端口
#   FORCE_BUILD=1             up 时强制重新构建
#   MIRROR=1                  受限网络模式：依赖与 Prisma 引擎走 npmmirror 国内镜像
#   HYPERBROWSER_API_KEY=xxx  云端隐身采集（可选）
#   AUTH_SECRET=xxx           会话签名密钥（可选，>=16 字符）
#   BROWSER_ENGINE=xxx        浏览器引擎 playwright|cloakbrowser（可选，默认 playwright）
#   IV8_ENABLED=1             iv8 补环境求解通道（可选，JS cookie 挑战；需 python3 + pip install iv8）
#   IV8_COMMAND=xxx           自定义 iv8 求解命令（可选，覆盖内置脚本）
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3000}"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$ROOT/server.log"
DB_URL="file:$ROOT/db/custom.db"

# 受限网络模式（MIRROR=1）：npm 依赖与 Prisma 引擎二进制走 npmmirror 国内镜像
if [ "${MIRROR:-0}" = "1" ]; then
  export PRISMA_ENGINES_MIRROR="https://registry.npmmirror.com/-/binary/prisma"
fi

# ---------- 输出工具 ----------
info()  { echo -e "\033[1;32m[deploy]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[deploy]\033[0m $*"; }
fail()  { echo -e "\033[1;31m[deploy]\033[0m $*" >&2; exit 1; }

# ---------- 基础检查 ----------
ensure_bun() {
  if command -v bun >/dev/null 2>&1; then return; fi
  warn "未检测到 Bun，正在自动安装…"
  if curl -fsSL https://bun.sh/install | bash; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
  if ! command -v bun >/dev/null 2>&1; then
    warn "bun.sh 安装失败（网络受限？），回退 npmmirror 镜像安装…"
    if command -v npm >/dev/null 2>&1; then
      npm install -g bun --registry=https://registry.npmmirror.com 2>/dev/null || true
    fi
    if ! command -v bun >/dev/null 2>&1 && [ "$(id -u)" != 0 ] && command -v sudo >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
      sudo npm install -g bun --registry=https://registry.npmmirror.com 2>/dev/null || true
    fi
  fi
  command -v bun >/dev/null 2>&1 || fail "Bun 安装失败，请手动执行其一后重试：\n  curl -fsSL https://bun.sh/install | bash\n  npm install -g bun --registry=https://registry.npmmirror.com"
  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"
  info "Bun $(bun --version) 安装完成"
}

# standalone 产物以 .next/standalone 为工作目录，不会读取项目根 .env，
# 因此 DATABASE_URL 必须作为环境变量显式注入（最易踩的坑，此处统一处理）
run_env() {
  export NODE_ENV=production
  export PORT="$PORT"
  export HOSTNAME=0.0.0.0
  export DATABASE_URL="$DB_URL"
  # 可选项显式导出为空值（避免 set -e 下 AND 列表短路返回非零导致误退出）
  export HYPERBROWSER_API_KEY="${HYPERBROWSER_API_KEY:-}"
  export AUTH_SECRET="${AUTH_SECRET:-}"
  # 验证码自动识别·自定义视觉通道（OpenAI 兼容；可选）
  export CAPTCHA_VISION_API_BASE="${CAPTCHA_VISION_API_BASE:-}"
  export CAPTCHA_VISION_API_KEY="${CAPTCHA_VISION_API_KEY:-}"
  export CAPTCHA_VISION_MODEL="${CAPTCHA_VISION_MODEL:-}"
  # 浏览器引擎 / iv8 补环境求解通道（可选）
  export BROWSER_ENGINE="${BROWSER_ENGINE:-}"
  export CLOAKBROWSER_LICENSE_KEY="${CLOAKBROWSER_LICENSE_KEY:-}"
  export CLOAKBROWSER_BINARY_PATH="${CLOAKBROWSER_BINARY_PATH:-}"
  export IV8_ENABLED="${IV8_ENABLED:-}"
  export IV8_COMMAND="${IV8_COMMAND:-}"
}

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

wait_healthy() {
  info "等待服务就绪（最多 60s）…"
  for _ in $(seq 1 60); do
    if bun -e "fetch('http://127.0.0.1:$PORT/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# ---------- 动作 ----------
do_install() {
  ensure_bun
  info "安装依赖（bun install --frozen-lockfile）…"
  if [ "${MIRROR:-0}" = "1" ]; then
    (cd "$ROOT" && bun install --frozen-lockfile --registry=https://registry.npmmirror.com)
  else
    (cd "$ROOT" && bun install --frozen-lockfile)
  fi
  info "生成 Prisma Client…"
  (cd "$ROOT" && bunx prisma generate)
}

do_dbpush() {
  info "同步数据库 schema（SQLite，幂等）…"
  (cd "$ROOT" && DATABASE_URL="$DB_URL" bunx prisma db push --accept-data-loss --skip-generate)
}

do_build() {
  info "构建生产产物（首次约 2~5 分钟）…"
  (cd "$ROOT" && bun run build)
}

start_server() {
  if is_running; then
    warn "服务已在运行（PID $(cat "$PID_FILE")），如需重启请执行 ./deploy.sh restart"
    return 0
  fi
  mkdir -p "$RUN_DIR" "$ROOT/db" "$ROOT/storage/covers" "$ROOT/storage/novels" "$ROOT/download"
  run_env
  info "启动服务（0.0.0.0:$PORT）…"
  nohup bun "$ROOT/.next/standalone/server.js" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  if wait_healthy; then
    info "✅ 部署完成！"
    echo ""
    echo "    前台/后台入口 : http://127.0.0.1:$PORT/  （后台管理：/admin）"
    echo "    首次登录      : 用户名 admin / 密码 admin123（请立即在后台修改密码）"
    echo "    数据目录      : $ROOT/db（数据库） $ROOT/storage（封面/章节文件）"
    echo "    日志          : $LOG_FILE   停止：./deploy.sh down"
    echo ""
  else
    fail "服务未在 60s 内就绪，请查看日志：tail -50 $LOG_FILE"
  fi
}

stop_server() {
  if ! is_running; then
    info "服务未在运行"
    rm -f "$PID_FILE"
    return 0
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  info "停止服务（PID $pid）…"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  rm -f "$PID_FILE"
  info "已停止"
}

cmd="${1:-up}"
case "$cmd" in
  up)
    cd "$ROOT"
    if [ ! -d node_modules ] || [ "${FORCE_INSTALL:-0}" = "1" ]; then
      do_install
    else
      ensure_bun
    fi
    do_dbpush
    if [ ! -f .next/standalone/server.js ] || [ "${FORCE_BUILD:-0}" = "1" ]; then
      do_build
    else
      info "已有构建产物（.next/standalone/server.js），跳过构建（FORCE_BUILD=1 可强制重建）"
    fi
    start_server
    ;;
  down)     stop_server ;;
  restart)  stop_server; start_server ;;
  build)    cd "$ROOT"; do_install; do_dbpush; do_build ;;
  logs)     tail -n 100 -f "$LOG_FILE" ;;
  status)
    if is_running; then
      info "运行中（PID $(cat "$PID_FILE")，端口 $PORT）"
      if bun -e "fetch('http://127.0.0.1:$PORT/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
        info "健康检查通过：http://127.0.0.1:$PORT/"
      else
        warn "进程存活但 HTTP 探活未通过，请查看：./deploy.sh logs"
      fi
    else
      warn "未运行"
      exit 1
    fi
    ;;
  update)
    cd "$ROOT"
    info "拉取最新代码…"
    git pull --ff-only
    FORCE_INSTALL=1 FORCE_BUILD=1 "$0" up
    ;;
  *)
    fail "未知命令：$cmd（可用：up / down / restart / status / logs / build / update）"
    ;;
esac
