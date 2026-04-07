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
