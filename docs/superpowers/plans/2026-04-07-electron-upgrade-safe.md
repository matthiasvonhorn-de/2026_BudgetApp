# Electron Upgrade-Safe App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Electron .app upgrade-safe: empty DB for new users, automatic schema migration with backup for existing users, custom app icon.

**Architecture:** `better-sqlite3` in the Electron main process handles DB creation and schema diffing. A build script generates an empty template DB from `prisma/dev.db`. At runtime, the migrator compares the user's DB against the bundled template and auto-applies additive changes (new tables, columns, indexes) with backup.

**Tech Stack:** better-sqlite3, sharp (icon generation), Electron, SQLite

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install better-sqlite3 as a production dependency**

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npm install better-sqlite3
```

`better-sqlite3` must be a `dependency` (not `devDependency`) so electron-builder includes it in the packaged app. It's a native module — `@electron/rebuild` (already in the project) will recompile it for the Electron Node version during `electron:build`.

- [ ] **Step 2: Install sharp as a dev dependency (for icon generation)**

```bash
npm install -D sharp
```

Only used once at build time to generate the app icon PNG from SVG.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add better-sqlite3 and sharp dependencies for Electron upgrade-safe build"
```

---

### Task 2: Generate app icon

**Files:**
- Create: `scripts/generate-icon.js`
- Create: `electron/icon.png`

- [ ] **Step 1: Create the icon generation script**

Create `scripts/generate-icon.js`:

```js
/**
 * Generates the BudgetApp icon as a 1024x1024 PNG from an inline SVG.
 * Run once: node scripts/generate-icon.js
 * Requires: sharp (npm install -D sharp)
 */

const sharp = require('sharp')
const path = require('path')

const SIZE = 1024

// Simple budget/wallet icon: rounded purple square with a white Euro coin
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#818cf8"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${SIZE}" height="${SIZE}" rx="220" fill="url(#bg)"/>
  <!-- Wallet body -->
  <rect x="160" y="320" width="704" height="404" rx="48" fill="white" fill-opacity="0.95"/>
  <!-- Wallet flap -->
  <path d="M160 420 Q160 320 260 320 H804 Q864 320 864 380 V420 H160Z" fill="white"/>
  <!-- Clasp area -->
  <rect x="580" y="450" width="200" height="130" rx="28" fill="#6366f1" fill-opacity="0.15"/>
  <!-- Clasp circle -->
  <circle cx="680" cy="515" r="28" fill="#6366f1"/>
  <!-- Euro symbol on clasp -->
  <text x="680" y="528" text-anchor="middle" font-size="36" font-weight="700" font-family="system-ui, -apple-system, sans-serif" fill="white">€</text>
</svg>
`

async function main() {
  const outPath = path.join(__dirname, '..', 'electron', 'icon.png')
  await sharp(Buffer.from(svg)).png().toFile(outPath)
  console.log(`✓ Icon generated: ${outPath} (${SIZE}x${SIZE})`)
}

main().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the script to generate the icon**

```bash
node scripts/generate-icon.js
```

Expected output: `✓ Icon generated: .../electron/icon.png (1024x1024)`

- [ ] **Step 3: Verify the icon file exists and has reasonable size**

```bash
ls -lh electron/icon.png
```

Expected: file exists, roughly 5–50 KB.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icon.js electron/icon.png
git commit -m "chore: add BudgetApp icon for Electron build"
```

---

### Task 3: Create the build script for empty DB generation

**Files:**
- Create: `scripts/prepare-electron-db.js`

- [ ] **Step 1: Create `scripts/prepare-electron-db.js`**

```js
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

// Create fresh empty.db
const emptyDb = new Database(emptyDbPath)

emptyDb.exec('PRAGMA journal_mode=WAL')

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
```

- [ ] **Step 2: Run the script and verify output**

```bash
node scripts/prepare-electron-db.js
```

Expected output: `✓ Created electron/empty.db (21 tables, N indexes, schema_version=1)`

- [ ] **Step 3: Verify the empty DB has the correct schema and no data**

```bash
sqlite3 electron/empty.db "SELECT COUNT(*) FROM Account"
sqlite3 electron/empty.db "SELECT value FROM AppSetting WHERE key='schema_version'"
sqlite3 electron/empty.db ".tables"
```

Expected:
- Count: `0`
- Version: `1`
- Tables: all 21 tables listed

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-electron-db.js
git commit -m "feat: add build script to generate empty Electron DB from dev.db schema"
```

---

### Task 4: Create the migrator module

**Files:**
- Create: `electron/migrator.js`
- Create: `electron/migrations/.gitkeep`

This is the core logic: schema comparison, backup, auto-migration, manual migration runner.

- [ ] **Step 1: Create `electron/migrations/.gitkeep`**

Create the empty directory for future manual migration files:

```bash
mkdir -p electron/migrations
touch electron/migrations/.gitkeep
```

- [ ] **Step 2: Create `electron/migrator.js`**

```js
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
    const manualMigrations = detectManualMigrations(userDb, bundledDb, migrationsDir)

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

    // Apply manual migrations
    if (manualMigrations.length > 0) {
      for (const migration of manualMigrations) {
        const sql = fs.readFileSync(migration.path, 'utf-8')
        userDb.exec(sql)
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
      const safeSql = sql.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS')
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
    return ` DEFAULT ${col.dflt_value}`
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
function detectManualMigrations(userDb, bundledDb, migrationsDir) {
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
  fs.copyFileSync(dbPath, backupPath)
  console.log(`[BudgetApp] Backup created: ${backupPath}`)
  return backupPath
}

module.exports = { migrate }
```

- [ ] **Step 3: Verify the module loads without errors**

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
node -e "const m = require('./electron/migrator'); console.log('migrator loaded OK, exports:', Object.keys(m))"
```

Expected: `migrator loaded OK, exports: [ 'migrate' ]`

- [ ] **Step 4: Commit**

```bash
git add electron/migrator.js electron/migrations/.gitkeep
git commit -m "feat: add Electron database migrator with auto-diff and manual migration support"
```

---

### Task 5: Update electron/main.js — integrate migrator + splash

**Files:**
- Modify: `electron/main.js`

- [ ] **Step 1: Add migrator import and splash window logic**

Replace the entire `electron/main.js` with the updated version. Key changes:
- Import `migrator.js`
- Call `migrate()` in `createWindow()` after `ensureDatabase()` and before starting the server
- Show a small splash `BrowserWindow` during migration
- Show error dialog if migration fails (with backup path)

```js
// Electron main process
// In production: starts Next.js standalone server, then opens BrowserWindow
// In development: assumes `npm run dev` is already running on port 3000

const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const net = require('net')
const { migrate } = require('./migrator')

const isDev = !app.isPackaged
const PREFERRED_PORT = 3000

function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(findFreePort(startPort + 1)))
    server.once('listening', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.listen(startPort)
  })
}

let mainWindow = null

// ------- Database -------

function getDbPath() {
  return path.join(app.getPath('userData'), 'budget.db')
}

function getBundledDbPath() {
  return isDev
    ? path.join(__dirname, 'empty.db')
    : path.join(process.resourcesPath, 'db', 'budget.db')
}

function getMigrationsDir() {
  // Works in both dev and production: __dirname resolves inside the asar in
  // packaged builds, and Node.js can read files from asar transparently.
  return path.join(__dirname, 'migrations')
}

function ensureDatabase() {
  const dbPath = getDbPath()
  if (fs.existsSync(dbPath)) return

  const bundledDb = getBundledDbPath()

  if (fs.existsSync(bundledDb)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.copyFileSync(bundledDb, dbPath)
    console.log('[BudgetApp] Database initialized at', dbPath)
  } else {
    console.warn('[BudgetApp] No bundled database found')
  }
}

// ------- Migration -------

function showMigrationSplash() {
  const splash = new BrowserWindow({
    width: 400,
    height: 200,
    center: true,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#f8fafc',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8fafc;font-family:system-ui,-apple-system,sans-serif;">
      <div style="text-align:center;">
        <div style="font-size:32px;margin-bottom:16px;">⏳</div>
        <div style="font-size:16px;color:#334155;font-weight:500;">Datenbank wird aktualisiert...</div>
        <div style="font-size:13px;color:#94a3b8;margin-top:8px;">Ein Backup wurde erstellt.</div>
      </div>
    </body>
    </html>
  `

  splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  return splash
}

function runMigration() {
  const dbPath = getDbPath()
  const bundledDbPath = getBundledDbPath()
  const migrationsDir = getMigrationsDir()

  if (!fs.existsSync(dbPath)) return null

  let splash = null
  try {
    const result = migrate(dbPath, bundledDbPath, migrationsDir)

    if (result.migrated) {
      splash = showMigrationSplash()
      console.log('[BudgetApp] Migration applied:', result.changes)
      if (result.backupPath) {
        console.log('[BudgetApp] Backup at:', result.backupPath)
      }
      // Give the splash a moment to render before we close it
      return splash
    }
  } catch (err) {
    console.error('[BudgetApp] Migration failed:', err)
    dialog.showErrorBox(
      'BudgetApp – Datenbankfehler',
      `Die Datenbank konnte nicht aktualisiert werden.\n\n${err.message}\n\nEin Backup wurde im Datenverzeichnis erstellt.`
    )
  }

  return splash
}

// ------- Next.js Server -------

function startProductionServer(port) {
  const serverPath = path.join(process.resourcesPath, 'server', 'server.js')

  process.env.DATABASE_URL = `file:${getDbPath()}`
  process.env.PORT = String(port)
  process.env.HOSTNAME = '127.0.0.1'
  process.env.NODE_ENV = 'production'

  require(serverPath)
}

function waitForServer(port, retries = 60) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${port}`, () => resolve())
      req.on('error', () => {
        if (retries-- > 0) {
          setTimeout(attempt, 500)
        } else {
          reject(new Error('Next.js server did not start within 30 seconds'))
        }
      })
      req.end()
    }
    attempt()
  })
}

// ------- Window -------

async function createWindow() {
  // Step 1: Ensure DB exists (copy bundled DB on first launch)
  ensureDatabase()

  // Step 2: Run schema migration if needed (backup + auto-diff + manual migrations)
  const splash = runMigration()

  // Step 3: Create main window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'BudgetApp',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL(`http://127.0.0.1:${PREFERRED_PORT}`)
  } else {
    const port = await findFreePort(PREFERRED_PORT)
    startProductionServer(port)
    try {
      await waitForServer(port)
    } catch (err) {
      dialog.showErrorBox(
        'BudgetApp – Startfehler',
        'Die App konnte nicht gestartet werden.\n\n' + err.message
      )
      app.quit()
      return
    }
    mainWindow.loadURL(`http://127.0.0.1:${port}`)
  }

  mainWindow.once('ready-to-show', () => {
    if (splash) splash.close()
    mainWindow.show()
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

// ------- App lifecycle -------

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
```

- [ ] **Step 2: Verify main.js loads without syntax errors**

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
node -e "try { require('./electron/main.js') } catch(e) { console.log(e.code === 'MODULE_NOT_FOUND' && e.message.includes('electron') ? 'OK (electron not available outside Electron)' : 'ERROR: ' + e.message) }"
```

Expected: `OK (electron not available outside Electron)` — the file parses fine, it just can't run outside Electron.

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "feat: integrate database migrator into Electron main process with splash window"
```

---

### Task 6: Update package.json build configuration

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `extraResources` to use `electron/empty.db`**

In `package.json`, change:

```json
"extraResources": [
  {
    "from": "prisma/dev.db",
    "to": "db/budget.db"
  }
]
```

To:

```json
"extraResources": [
  {
    "from": "electron/empty.db",
    "to": "db/budget.db"
  }
]
```

- [ ] **Step 2: Update `files` to include migrator and migrations**

Change:

```json
"files": [
  "electron/main.js"
]
```

To:

```json
"files": [
  "electron/main.js",
  "electron/migrator.js",
  "electron/migrations/**/*"
]
```

- [ ] **Step 3: Add `asarUnpack` for native module**

Add inside the `"build"` object (alongside `"files"`, `"mac"`, etc.):

```json
"asarUnpack": [
  "node_modules/better-sqlite3/**/*"
]
```

This ensures `better-sqlite3`'s native `.node` addon is accessible outside the asar archive at runtime.

- [ ] **Step 4: Add icon path to mac config**

Inside `"build" > "mac"`, add:

```json
"icon": "electron/icon.png"
```

electron-builder automatically converts PNG to `.icns` on macOS.

- [ ] **Step 5: Update `electron:build` script to include DB generation**

Change:

```json
"electron:build": "node node_modules/next/dist/bin/next build && node scripts/copy-static.js && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac zip"
```

To:

```json
"electron:build": "node node_modules/next/dist/bin/next build && node scripts/copy-static.js && node scripts/prepare-electron-db.js && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac zip"
```

Also update `electron:build:dir`:

```json
"electron:build:dir": "node node_modules/next/dist/bin/next build && node scripts/copy-static.js && node scripts/prepare-electron-db.js && CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --dir"
```

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat: update Electron build config for empty DB, icon, and migrator"
```

---

### Task 7: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `electron/empty.db` to `.gitignore`**

Append to `.gitignore`:

```
# Electron build artifacts
electron/empty.db
```

This file is generated by `scripts/prepare-electron-db.js` during the build — it should not be committed.

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore generated electron/empty.db"
```

---

### Task 8: Full build test

- [ ] **Step 1: Run the full Electron build**

```bash
cd "/Users/matthiasvonhorn/Documents/4. Projekte/2026_BudgetApp"
npm run electron:build
```

Expected: build completes without errors. Check for:
- `✓ Created electron/empty.db` in the output
- `afterPack: Copying standalone server` in the output
- No errors from `@electron/rebuild` for `better-sqlite3`
- Final output: `building target=macOS zip`

- [ ] **Step 2: Verify the built app contains the correct resources**

```bash
# Check the app bundle has the empty DB (not dev.db with data)
sqlite3 "dist/mac/BudgetApp.app/Contents/Resources/db/budget.db" "SELECT COUNT(*) FROM Account"
sqlite3 "dist/mac/BudgetApp.app/Contents/Resources/db/budget.db" "SELECT value FROM AppSetting WHERE key='schema_version'"
```

Expected: Count = `0`, Version = `1`

- [ ] **Step 3: Verify better-sqlite3 is unpacked**

```bash
ls dist/mac/BudgetApp.app/Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/
```

Expected: `better_sqlite3.node` file exists.

- [ ] **Step 4: Verify the migrator and migrations are in the app**

```bash
# Check the asar contains the migrator
npx asar list dist/mac/BudgetApp.app/Contents/Resources/app.asar | grep electron
```

Expected output includes:
- `/electron/main.js`
- `/electron/migrator.js`
- `/electron/migrations/`

- [ ] **Step 5: Verify the icon is applied**

Open the built app in Finder and check the icon is the custom purple wallet icon, not the default Electron icon:

```bash
open dist/mac/
```

- [ ] **Step 6: Launch the app and verify first-start behavior**

First, remove any existing userData DB (if present from previous testing):

```bash
rm -f ~/Library/Application\ Support/BudgetApp/budget.db
```

Then launch:

```bash
open dist/mac/BudgetApp.app
```

Expected:
- App starts without errors
- A new `budget.db` is created in `~/Library/Application Support/BudgetApp/`
- The database is empty (no accounts, no transactions)

- [ ] **Step 7: Verify upgrade migration works**

While the app is closed, manually remove a column from the user DB to simulate an older schema, then relaunch:

```bash
# Close the app first, then:
sqlite3 ~/Library/Application\ Support/BudgetApp/budget.db "ALTER TABLE Account DROP COLUMN icon"
sqlite3 ~/Library/Application\ Support/BudgetApp/budget.db "PRAGMA table_info(Account)" | grep icon
# Should show nothing — column is gone

# Relaunch
open dist/mac/BudgetApp.app
```

Expected:
- Brief splash "Datenbank wird aktualisiert..." appears
- A backup file `budget-backup-*.db` is created in `~/Library/Application Support/BudgetApp/`
- The `icon` column is restored in the Account table
- App starts normally

- [ ] **Step 8: Commit final state and push**

```bash
git add -A
git status
git commit -m "feat: upgrade-safe Electron build with auto-migration, backup, and custom icon"
git push
```
