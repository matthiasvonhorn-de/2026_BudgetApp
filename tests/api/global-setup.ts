import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

export default function globalSetup() {
  const root = path.resolve(__dirname, '../..')
  const devDbPath = path.join(root, 'prisma', 'dev.db')
  const testDbPath = path.join(root, 'prisma', 'test.db')

  // Remove old test DB + WAL/SHM files
  for (const f of [testDbPath, testDbPath + '-shm', testDbPath + '-wal']) {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  }

  if (fs.existsSync(devDbPath)) {
    // Local development: extract schema from dev.db via sqlite3 CLI
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
  } else {
    // CI environment: use prisma db push to create test.db directly from schema
    console.log('[test-setup] prisma/dev.db not found — using prisma db push for test.db...')
    execSync('npx prisma db push --skip-generate --accept-data-loss', {
      cwd: root,
      env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
      stdio: 'pipe',
    })
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
