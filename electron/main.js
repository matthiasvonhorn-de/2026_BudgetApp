// Electron main process
// In production: starts Next.js standalone server, then opens BrowserWindow
// In development: assumes `npm run dev` is already running on port 3000

const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const net = require('net')

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

function ensureDatabase() {
  const dbPath = getDbPath()
  if (fs.existsSync(dbPath)) return

  // First launch: copy bundled empty-schema database
  const bundledDb = isDev
    ? path.join(__dirname, '..', 'prisma', 'dev.db')
    : path.join(process.resourcesPath, 'db', 'budget.db')

  if (fs.existsSync(bundledDb)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    fs.copyFileSync(bundledDb, dbPath)
    console.log('[BudgetApp] Database initialized at', dbPath)
  } else {
    console.warn('[BudgetApp] No bundled database found – a new one will be created on first use')
  }
}

// ------- Next.js Server -------

function startProductionServer(port) {
  const serverPath = path.join(process.resourcesPath, 'server', 'server.js')

  // Must be set before requiring the server so Prisma picks them up
  process.env.DATABASE_URL = `file:${getDbPath()}`
  process.env.PORT = String(port)
  process.env.HOSTNAME = '127.0.0.1'
  process.env.NODE_ENV = 'production'

  // The standalone server.js starts an HTTP listener in the current process
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
  ensureDatabase()

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
    // Dev mode: Next.js dev server must already be running via `npm run dev`
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

  mainWindow.once('ready-to-show', () => mainWindow.show())
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
