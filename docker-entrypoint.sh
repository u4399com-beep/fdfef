#!/bin/sh
set -e

echo "[entrypoint] 1/2 同步数据库 schema（SQLite）…"
# oven/bun 基底无 node：node_modules/.bin/prisma 的 shebang 是 #!/usr/bin/env node，
# 直接 exec 会报 env: node: No such file or directory；改用 bun 运行 CLI 入口
# （prisma db push 在 bun 下实测可用，schema 引擎为独立二进制子进程）
bun node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate || \
  echo "[entrypoint] 警告：prisma db push 未成功（若数据库已初始化可忽略）"

echo "[entrypoint] 2/2 启动小说管理系统（0.0.0.0:3000）…"
exec bun server.js
