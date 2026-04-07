/**
 * Generates electron/empty.db — an empty database with the full current schema.
 *
 * Reads DDL (CREATE TABLE / CREATE INDEX) from prisma/dev.db and applies it
 * to a fresh SQLite file.  Sets schema_version = 1 in AppSetting.
 *
 * Run as part of electron:build, AFTER `next build` + `copy-static.js`.
 */

const Database = require('better-sqlite3')
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

// Remove old empty.db if present
if (fs.existsSync(emptyDbPath)) {
  fs.unlinkSync(emptyDbPath)
}

// Open dev.db read-only
const devDb = new Database(devDbPath, { readonly: true })

// Collect CREATE TABLE statements (skip internal Prisma/SQLite tables)
const tables = devDb
  .prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' ORDER BY name"
  )
  .all()

// Collect CREATE INDEX statements
const indexes = devDb
  .prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all()

devDb.close()

// Create fresh empty.db (no WAL mode — let the app set it at runtime)
const emptyDb = new Database(emptyDbPath)

emptyDb.transaction(() => {
  for (const { sql } of tables) {
    emptyDb.exec(sql)
  }
  for (const { sql } of indexes) {
    emptyDb.exec(sql)
  }

  // Seed schema_version so the migrator knows what version this DB is
  emptyDb
    .prepare(
      "INSERT INTO AppSetting (key, value, updatedAt) VALUES ('schema_version', ?, datetime('now'))"
    )
    .run(String(SCHEMA_VERSION))
})()

emptyDb.close()

console.log(`✓ Created electron/empty.db (${tables.length} tables, ${indexes.length} indexes, schema_version=${SCHEMA_VERSION})`)
