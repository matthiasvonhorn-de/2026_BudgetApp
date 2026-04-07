/**
 * Database migrator for the Electron app.
 *
 * Compares the user's existing database against the bundled template DB
 * and auto-applies additive schema changes (new tables, columns, indexes).
 * Also runs versioned manual migrations from electron/migrations/.
 *
 * Called from electron/main.js BEFORE the Next.js server starts.
 */

const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

/**
 * @param {string} userDbPath   — path to the user's budget.db in userData
 * @param {string} bundledDbPath — path to the bundled empty.db in Resources
 * @param {string} migrationsDir — path to electron/migrations/ directory
 * @returns {{ migrated: boolean, changes: string[], backupPath: string|null }}
 */
function migrate(userDbPath, bundledDbPath, migrationsDir) {
  const result = { migrated: false, changes: [], backupPath: null }

  if (!fs.existsSync(userDbPath)) return result
  if (!fs.existsSync(bundledDbPath)) return result

  const userDb = new Database(userDbPath)
  const bundledDb = new Database(bundledDbPath, { readonly: true })

  try {
    const changes = detectChanges(userDb, bundledDb)
    const manualMigrations = detectManualMigrations(userDb, migrationsDir)

    if (changes.length === 0 && manualMigrations.length === 0) {
      return result
    }

    // Create backup before any changes
    result.backupPath = createBackup(userDbPath)

    // Apply auto-detected schema changes
    if (changes.length > 0) {
      userDb.transaction(() => {
        for (const change of changes) {
          userDb.exec(change.sql)
          result.changes.push(change.description)
        }
      })()
    }

    // Apply manual migrations (each in its own transaction for safety)
    if (manualMigrations.length > 0) {
      for (const migration of manualMigrations) {
        const sql = fs.readFileSync(migration.path, 'utf-8')
        userDb.transaction(() => {
          userDb.exec(sql)
        })()
        result.changes.push(`Manual migration: ${migration.name}`)
      }
    }

    // Update schema_version to match bundled DB
    const bundledVersion = getSchemaVersion(bundledDb)
    setSchemaVersion(userDb, bundledVersion)

    result.migrated = true
  } finally {
    bundledDb.close()
    userDb.close()
  }

  return result
}

/**
 * Compare user DB against bundled DB and return a list of SQL changes.
 */
function detectChanges(userDb, bundledDb) {
  const changes = []

  // --- Missing tables ---
  const bundledTables = bundledDb
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'"
    )
    .all()

  const userTableNames = new Set(
    userDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
  )

  for (const { name, sql } of bundledTables) {
    if (!userTableNames.has(name)) {
      changes.push({
        description: `Create table: ${name}`,
        sql,
      })
    }
  }

  // --- Missing columns in existing tables ---
  const sharedTables = bundledTables.filter((t) => userTableNames.has(t.name))

  for (const { name: tableName } of sharedTables) {
    const bundledCols = bundledDb.pragma(`table_info("${tableName}")`)
    const userColNames = new Set(
      userDb.pragma(`table_info("${tableName}")`).map((c) => c.name)
    )

    for (const col of bundledCols) {
      if (!userColNames.has(col.name)) {
        const defaultClause = buildDefaultClause(col)
        changes.push({
          description: `Add column: ${tableName}.${col.name}`,
          sql: `ALTER TABLE "${tableName}" ADD COLUMN "${col.name}" ${col.type}${defaultClause}`,
        })
      }
    }
  }

  // --- Missing indexes ---
  const bundledIndexes = bundledDb
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
    )
    .all()

  const userIndexNames = new Set(
    userDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => r.name)
  )

  for (const { name, sql } of bundledIndexes) {
    if (!userIndexNames.has(name)) {
      // Use IF NOT EXISTS for safety
      const safeSql = sql.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\b/, 'CREATE $1INDEX IF NOT EXISTS')
      changes.push({
        description: `Create index: ${name}`,
        sql: safeSql,
      })
    }
  }

  return changes
}

/**
 * Build the DEFAULT clause for ALTER TABLE ADD COLUMN.
 */
function buildDefaultClause(col) {
  if (col.dflt_value !== null) {
    return `${col.notnull ? ' NOT NULL' : ''} DEFAULT ${col.dflt_value}`
  }
  if (col.notnull) {
    // NOT NULL columns need a default for ALTER TABLE ADD COLUMN
    switch (col.type.toUpperCase()) {
      case 'INTEGER':
      case 'REAL':
        return ' NOT NULL DEFAULT 0'
      case 'BOOLEAN':
        return ' NOT NULL DEFAULT 0'
      case 'DATETIME':
        return " NOT NULL DEFAULT '1970-01-01 00:00:00'"
      default:
        return " NOT NULL DEFAULT ''"
    }
  }
  return ''
}

/**
 * Find manual migration files that haven't been applied yet.
 */
function detectManualMigrations(userDb, migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return []

  const currentVersion = getSchemaVersion(userDb)
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f.match(/^v(\d+)/))
    .sort()

  const pending = []
  for (const file of files) {
    const match = file.match(/^v(\d+)/)
    const version = parseInt(match[1], 10)
    if (version > currentVersion) {
      pending.push({
        name: file,
        version,
        path: path.join(migrationsDir, file),
      })
    }
  }

  return pending
}

/**
 * Read schema_version from AppSetting. Returns 0 if not set.
 */
function getSchemaVersion(db) {
  try {
    const row = db
      .prepare("SELECT value FROM AppSetting WHERE key = 'schema_version'")
      .get()
    return row ? parseInt(row.value, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Write schema_version to AppSetting (upsert).
 */
function setSchemaVersion(db, version) {
  db.prepare(
    "INSERT INTO AppSetting (key, value, updatedAt) VALUES ('schema_version', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt"
  ).run(String(version))
}

/**
 * Create a timestamped backup of the database file.
 * Returns the backup file path.
 */
function createBackup(dbPath) {
  const dir = path.dirname(dbPath)
  const now = new Date()
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  const backupPath = path.join(dir, `budget-backup-${ts}.db`)

  // Flush WAL to main file before copying so the backup is consistent
  const db = new Database(dbPath)
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()

  fs.copyFileSync(dbPath, backupPath)
  console.log(`[BudgetApp] Backup created: ${backupPath}`)
  return backupPath
}

module.exports = { migrate }
