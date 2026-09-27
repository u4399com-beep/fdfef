#!/bin/sh
set -e

echo "[entrypoint] 1/2 同步数据库 schema（SQLite）…"
node_modules/.bin/prisma db push --accept-data-loss --skip-generate || \
  echo "[entrypoint] 警告：prisma db push 未成功（若数据库已初始化可忽略）"

echo "[entrypoint] 2/2 启动小说管理系统（0.0.0.0:3000）…"
exec bun server.js
