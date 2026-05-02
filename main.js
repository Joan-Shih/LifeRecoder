const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const dataDir = path.join(os.homedir(), 'Documents', 'LifeRecoder')
const dataFile = path.join(dataDir, 'data.json')

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.max(820, Math.round(sw * 0.5))
  const winH = Math.max(560, Math.round(sh * 0.9))

  const win = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: 700,
    minHeight: 500,
    title: 'LifeRecoder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(() => {
  ensureDataDir()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('read-data', () => {
  if (!fs.existsSync(dataFile)) {
    return { life: { dots: {} }, residency: { dots: {} } }
  }
  const raw = fs.readFileSync(dataFile, 'utf-8')
  return JSON.parse(raw)
})

ipcMain.handle('write-data', (event, data) => {
  ensureDataDir()
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8')
  return true
})

ipcMain.handle('export-notes', async (event, text) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: path.join(os.homedir(), 'Desktop', 'LifeRecoder_Notes.txt'),
    filters: [{ name: 'Text File', extensions: ['txt'] }]
  })
  if (canceled || !filePath) return false
  fs.writeFileSync(filePath, text, 'utf-8')
  return true
})
