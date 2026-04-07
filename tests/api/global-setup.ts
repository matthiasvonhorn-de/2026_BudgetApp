import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export default function globalSetup() {
  const root = path.resolve(__dirname, '../..')
  const devDbPath = path.join(root, 'prisma', 'dev.db')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  if (!fs.existsSync(devDbPath)) {
    throw new Error('prisma/dev.db not found — run the dev server at least once to create it')
  }

  // Remove old test DB + WAL/SHM files
  for (const f of [testDbPath, testDbPath + '-shm', testDbPath + '-wal']) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  // Extract CREATE TABLE statements (exclude _prisma_migrations and sqlite internals)
  const tableSql = execSync(
    `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' AND sql IS NOT NULL ORDER BY name;"`,
    { encoding: 'utf-8' }
  )

  // Extract CREATE INDEX statements
  const indexSql = execSync(
    `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name;"`,
    { encoding: 'utf-8' }
  )

  const fullSql = [tableSql.trim(), indexSql.trim()].filter(Boolean).join('\n')

  // Write to temp file, then create test.db via sqlite3 CLI
  const tmpFile = path.join(root, 'prisma', '_test_schema_tmp.sql')
  fs.writeFileSync(tmpFile, fullSql)

  try {
    execSync(`sqlite3 "${testDbPath}" < "${tmpFile}"`, { stdio: 'pipe' })
  } finally {
    fs.unlinkSync(tmpFile)
  }

  // Verify tables were created
  const count = execSync(
    `sqlite3 "${testDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`,
    { encoding: 'utf-8' }
  ).trim()

  console.log(`[test-setup] Created prisma/test.db (${count} tables)`)
}

export function teardown() {
  const root = path.resolve(__dirname, '../..')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  for (const f of [testDbPath, testDbPath + '-shm', testDbPath + '-wal']) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  console.log('[test-teardown] Removed prisma/test.db')
}
