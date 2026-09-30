import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // dev 保留逐条 query 日志便于调试；生产（standalone）只留 warn/error，
    // 否则每次 SQL 都打 stdout，日志洪水且拖慢请求
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db