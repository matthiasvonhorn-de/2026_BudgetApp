import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export default function globalSetup() {
  const root = path.resolve(__dirname, '../..')
  const devDbPath = path.join(root, 'prisma', 'dev.db')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  // If test.db already exists (e.g. created by CI workflow step), use it as-is
  if (fs.existsSync(testDbPath)) {
    const count = execSync(
      `sqlite3 "${testDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`,
      { encoding: 'utf-8' }
    ).trim()
    console.log(`[test-setup] Using existing prisma/test.db (${count} tables)`)
    return
  }

  // Local development: create test.db from dev.db schema
  if (!fs.existsSync(devDbPath)) {
    console.warn('[test-setup] Neither test.db nor dev.db found — skipping API test DB setup')
    return
  }

  const tableSql = execSync(
    `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' AND sql IS NOT NULL ORDER BY name;"`,
    { encoding: 'utf-8' }
  )
  const indexSql = execSync(
    `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name;"`,
    { encoding: 'utf-8' }
  )
  const fullSql = [tableSql.trim(), indexSql.trim()].filter(Boolean).join('\n')
  const tmpFile = path.join(root, 'prisma', '_test_schema_tmp.sql')
  fs.writeFileSync(tmpFile, fullSql)
  try {
    execSync(`sqlite3 "${testDbPath}" < "${tmpFile}"`, { stdio: 'pipe' })
  } finally {
    fs.unlinkSync(tmpFile)
  }

  const count = execSync(
    `sqlite3 "${testDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`,
    { encoding: 'utf-8' }
  ).trim()

  console.log(`[test-setup] Created prisma/test.db (${count} tables)`)
}
