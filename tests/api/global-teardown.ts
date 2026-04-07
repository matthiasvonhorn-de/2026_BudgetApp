import fs from 'fs'
import path from 'path'

export default function globalTeardown() {
  const root = path.resolve(__dirname, '../..')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  for (const f of [testDbPath, testDbPath + '-shm', testDbPath + '-wal']) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  console.log('[test-teardown] Removed prisma/test.db')
}
