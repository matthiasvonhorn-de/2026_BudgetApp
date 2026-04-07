/**
 * Database migrator for the Electron app.
 *
 * Compares the user's existing database against the bundled template DB
 * and auto-applies additive schema changes (new tables, columns, indexes).
 * Also runs versioned manual migrations from electron/migrations/.
 *
 * Uses the sqlite3 CLI (/usr/bin/sqlite3) instead of native modules to avoid
 * Node.js / Electron version conflicts.
 *
 * Called from electron/main.js BEFORE the Next.js server starts.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const SQLITE3 = '/usr/bin/sqlite3'

// ------- SQLite helpers -------

/**
 * Run a query and return parsed JSON results.
 * Uses stdin to avoid shell escaping issues.
 */
function query(dbPath, sql) {
  const raw = execSync(`${SQLITE3} -json "${dbPath}"`, {
    input: sql,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return raw.trim() ? JSON.parse(raw) : []
}

/**
 * Execute one or more SQL statements (no return value).
 */
function exec(dbPath, sql) {
  execSync(`${SQLITE3} "${dbPath}"`, {
    input: sql,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

// ------- Public API -------

/**
 * @param {string} userDbPath    — path to the user's budget.db in userData
 * @param {string} bundledDbPath — path to the bundled empty.db in Resources
 * @param {string} migrationsDir — path to electron/migrations/ directory
 * @returns {{ migrated: boolean, changes: string[], backupPath: string|null }}
 */
function migrate(userDbPath, bundledDbPath, migrationsDir) {
  const result = { migrated: false, changes: [], backupPath: null }

  if (!fs.existsSync(userDbPath)) return result
  if (!fs.existsSync(bundledDbPath)) return result

  const changes = detectChanges(userDbPath, bundledDbPath)
  const manualMigrations = detectManualMigrations(userDbPath, migrationsDir)

  if (changes.length === 0 && manualMigrations.length === 0) {
    return result
  }

  // Create backup before any changes
  result.backupPath = createBackup(userDbPath)

  // Apply auto-detected schema changes in a single transaction
  if (changes.length > 0) {
    const stmts = changes.map((c) => c.sql).join(';\n')
    exec(userDbPath, `BEGIN TRANSACTION;\n${stmts};\nCOMMIT;`)
    for (const change of changes) {
      result.changes.push(change.description)
    }
  }

  // Apply manual migrations (each wrapped in a transaction)
  if (manualMigrations.length > 0) {
    for (const migration of manualMigrations) {
      const sql = fs.readFileSync(migration.path, 'utf-8')
      exec(userDbPath, `BEGIN TRANSACTION;\n${sql}\nCOMMIT;`)
      result.changes.push(`Manual migration: ${migration.name}`)
    }
  }

  // Update schema_version to match bundled DB
  const bundledVersion = getSchemaVersion(bundledDbPath)
  setSchemaVersion(userDbPath, bundledVersion)

  result.migrated = true
  return result
}

// ------- Schema comparison -------

function detectChanges(userDbPath, bundledDbPath) {
  const changes = []

  // --- Missing tables ---
  const bundledTables = query(
    bundledDbPath,
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations' AND sql IS NOT NULL"
  )

  const userTableNames = new Set(
    query(userDbPath, "SELECT name FROM sqlite_master WHERE type='table'").map(
      (r) => r.name
    )
  )

  for (const { name, sql } of bundledTables) {
    if (!userTableNames.has(name)) {
      changes.push({ description: `Create table: ${name}`, sql })
    }
  }

  // --- Missing columns in existing tables ---
  const sharedTables = bundledTables.filter((t) => userTableNames.has(t.name))

  for (const { name: tableName } of sharedTables) {
    const bundledCols = query(bundledDbPath, `PRAGMA table_info("${tableName}")`)
    const userColNames = new Set(
      query(userDbPath, `PRAGMA table_info("${tableName}")`).map(
        (c) => c.name
      )
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
  const bundledIndexes = query(
    bundledDbPath,
    "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
  )

  const userIndexNames = new Set(
    query(userDbPath, "SELECT name FROM sqlite_master WHERE type='index'").map(
      (r) => r.name
    )
  )

  for (const { name, sql } of bundledIndexes) {
    if (!userIndexNames.has(name)) {
      const safeSql = sql.replace(
        /^CREATE\s+(UNIQUE\s+)?INDEX\b/,
        'CREATE $1INDEX IF NOT EXISTS'
      )
      changes.push({ description: `Create index: ${name}`, sql: safeSql })
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
    switch ((col.type || '').toUpperCase()) {
      case 'INTEGER':
      case 'REAL':
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

// ------- Manual migrations -------

function detectManualMigrations(userDbPath, migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return []

  const currentVersion = getSchemaVersion(userDbPath)
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f.match(/^v(\d+)/))
    .sort((a, b) => {
      const va = parseInt(a.match(/^v(\d+)/)[1], 10)
      const vb = parseInt(b.match(/^v(\d+)/)[1], 10)
      return va - vb
    })

  const pending = []
  for (const file of files) {
    const version = parseInt(file.match(/^v(\d+)/)[1], 10)
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

// ------- Schema version -------

function getSchemaVersion(dbPath) {
  try {
    const rows = query(
      dbPath,
      "SELECT value FROM AppSetting WHERE key = 'schema_version'"
    )
    return rows.length > 0 ? parseInt(rows[0].value, 10) : 0
  } catch {
    return 0
  }
}

function setSchemaVersion(dbPath, version) {
  exec(
    dbPath,
    `INSERT INTO AppSetting (key, value, updatedAt) VALUES ('schema_version', '${version}', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt;`
  )
}

// ------- Backup -------

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

  // Flush WAL to main file for a consistent backup
  try {
    exec(dbPath, 'PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    // WAL might not be active — that's fine
  }

  fs.copyFileSync(dbPath, backupPath)
  console.log(`[BudgetApp] Backup created: ${backupPath}`)
  return backupPath
}

module.exports = { migrate }
