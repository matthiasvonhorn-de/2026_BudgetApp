import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defineConfig } = require('prisma/config')

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
  migrate: {
    async adapter() {
      const { PrismaLibSql } = await import('@prisma/adapter-libsql')
      return new PrismaLibSql({ url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' })
    },
  },
})
