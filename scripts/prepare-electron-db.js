/**
 * Generates electron/empty.db — an empty database with the full current schema.
 *
 * Uses the sqlite3 CLI (not better-sqlite3) to avoid native module version
 * conflicts between Node.js and Electron.
 *
 * Run as part of electron:build, AFTER `next build` + `copy-static.js`.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const devDbPath = path.join(root, 'prisma', 'dev.db')
const emptyDbPath = path.join(root, 'electron', 'empty.db')

// Current schema version — bump when adding a manual migration to electron/migrations/
const SCHEMA_VERSION = 1

if (!fs.existsSync(devDbPath)) {
  console.error('ERROR: prisma/dev.db not found.')
  process.exit(1)
}

// Remove old empty.db and sidecar files if present
for (const f of [emptyDbPath, emptyDbPath + '-shm', emptyDbPath + '-wal']) {
  if (fs.existsSync(f)) fs.unlinkSync(f)
}

// Extract CREATE TABLE statements (excluding _prisma_migrations and sqlite_ internals)
const tableSql = execSync(
  `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' AND sql IS NOT NULL ORDER BY name;"`,
  { encoding: 'utf-8' }
)

// Extract CREATE INDEX statements
const indexSql = execSync(
  `sqlite3 "${devDbPath}" "SELECT sql || ';' FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name;"`,
  { encoding: 'utf-8' }
)

// Combine DDL + schema_version seed
const fullSql = [
  tableSql.trim(),
  indexSql.trim(),
  `INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('schema_version', '${SCHEMA_VERSION}', datetime('now'));`,
].filter(Boolean).join('\n')

// Write to temp file, then create empty.db via sqlite3 CLI
const tmpFile = path.join(root, 'electron', '_schema_tmp.sql')
fs.writeFileSync(tmpFile, fullSql)

try {
  execSync(`sqlite3 "${emptyDbPath}" < "${tmpFile}"`, { stdio: 'pipe' })
} finally {
  fs.unlinkSync(tmpFile)
}

// Count tables and indexes for output
const tableCount = execSync(
  `sqlite3 "${emptyDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"`,
  { encoding: 'utf-8' }
).trim()

const indexCount = execSync(
  `sqlite3 "${emptyDbPath}" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%';"`,
  { encoding: 'utf-8' }
).trim()

console.log(`✓ Created electron/empty.db (${tableCount} tables, ${indexCount} indexes, schema_version=${SCHEMA_VERSION})`)
