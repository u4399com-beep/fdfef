# ============================================================
# 小说管理系统 生产镜像（多阶段构建，开箱即用）
# 构建：docker build -t novel-system .
# 运行：docker compose up -d
# ============================================================

# ---------- 阶段 1：构建 ----------
FROM oven/bun:1.2-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 先装依赖（利用层缓存）
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 拷贝源码并构建
COPY . .
ENV DATABASE_URL=file:/app/db/custom.db
RUN bunx prisma generate \
  && bun run build

# ---------- 阶段 2：运行时 ----------
FROM oven/bun:1.2-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL=file:/app/db/custom.db

# Next standalone 产物（package.json build 脚本已把 static/public 复制进去）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db

# Prisma CLI（容器启动时同步 schema）
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# 数据与文件存储目录（挂载卷持久化）
RUN mkdir -p /app/storage/covers /app/storage/novels /app/download
VOLUME ["/app/db", "/app/storage"]

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
