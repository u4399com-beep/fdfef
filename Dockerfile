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
# 注意：prisma CLI 的依赖闭包不止 @prisma/*（bun 扁平 hoist），缺下列任一包会在
# entrypoint 报 MODULE_NOT_FOUND（如 @prisma/config -> c12/effect 等），
# 首次部署空卷时 schema 将无法初始化。清单对应 bun.lock 锁定的 prisma 6.19.2，
# 升级 prisma 后需同步核对（闭包可从 node_modules/prisma 递归 dependencies 导出）。
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
# 生成到 node_modules/.prisma 的客户端（含 SQLite 查询引擎二进制）：standalone 追踪通常已带上，
# 此处显式复制一份作双保险，避免运行时 P1012/引擎缺失
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@standard-schema ./node_modules/@standard-schema
COPY --from=builder /app/node_modules/c12 ./node_modules/c12
COPY --from=builder /app/node_modules/chokidar ./node_modules/chokidar
COPY --from=builder /app/node_modules/citty ./node_modules/citty
COPY --from=builder /app/node_modules/confbox ./node_modules/confbox
COPY --from=builder /app/node_modules/consola ./node_modules/consola
COPY --from=builder /app/node_modules/deepmerge-ts ./node_modules/deepmerge-ts
COPY --from=builder /app/node_modules/defu ./node_modules/defu
COPY --from=builder /app/node_modules/destr ./node_modules/destr
COPY --from=builder /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder /app/node_modules/effect ./node_modules/effect
COPY --from=builder /app/node_modules/empathic ./node_modules/empathic
COPY --from=builder /app/node_modules/exsolve ./node_modules/exsolve
COPY --from=builder /app/node_modules/fast-check ./node_modules/fast-check
COPY --from=builder /app/node_modules/giget ./node_modules/giget
COPY --from=builder /app/node_modules/jiti ./node_modules/jiti
COPY --from=builder /app/node_modules/node-fetch-native ./node_modules/node-fetch-native
COPY --from=builder /app/node_modules/nypm ./node_modules/nypm
COPY --from=builder /app/node_modules/ohash ./node_modules/ohash
COPY --from=builder /app/node_modules/pathe ./node_modules/pathe
COPY --from=builder /app/node_modules/perfect-debounce ./node_modules/perfect-debounce
COPY --from=builder /app/node_modules/pkg-types ./node_modules/pkg-types
COPY --from=builder /app/node_modules/pure-rand ./node_modules/pure-rand
COPY --from=builder /app/node_modules/rc9 ./node_modules/rc9
COPY --from=builder /app/node_modules/readdirp ./node_modules/readdirp
COPY --from=builder /app/node_modules/tinyexec ./node_modules/tinyexec

# 数据与文件存储目录（挂载卷持久化）
RUN mkdir -p /app/storage/covers /app/storage/novels /app/download
VOLUME ["/app/db", "/app/storage"]

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

# debian slim 基底无 wget/curl，用镜像内自带的 bun 发起探活（200 -> 健康码）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
