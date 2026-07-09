import { app, BrowserWindow, ipcMain } from 'electron'

import { autoUpdater } from 'electron-updater'

import logger from 'electron-log/main'

const AUTO_CHECK_DELAY_MS = 60_000
const MIN_UPDATE_INTERVAL_MS = 30_000
const PUBLISHER_NAME = 'Eminium Games'

let lastCheckEpoch = 0
let updateInProgress = false

type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; error: string }

function broadcastStatus(mainWindow: BrowserWindow, status: UpdateStatus) {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status)
  }
}

function broadcastProgress(mainWindow: BrowserWindow, percent: number) {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:progress', { percent })
  }
}

function configureAutoUpdater(mainWindow: BrowserWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false
  autoUpdater.disableWebInstaller = false
  // autoUpdater.verifyUpdateCodeSignature = true
  autoUpdater.requestHeaders = { 'User-Agent': `${PUBLISHER_NAME}-Launcher/${app.getVersion()}` }

  autoUpdater.on('checking-for-update', () => {
    broadcastStatus(mainWindow, { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    broadcastStatus(mainWindow, { status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    broadcastStatus(mainWindow, { status: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    broadcastProgress(mainWindow, Math.round(progress.percent))
  })

  autoUpdater.on('update-downloaded', (info) => {
    broadcastStatus(mainWindow, { status: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (error) => {
    updateInProgress = false
    broadcastStatus(mainWindow, { status: 'error', error: error?.message ?? String(error) })
    logger.error('Updater error', error)
  })
}

async function fetchVerifiedReleaseManifest(mainWindow: BrowserWindow) {
  const now = Date.now()

  if (updateInProgress || now - lastCheckEpoch < MIN_UPDATE_INTERVAL_MS) {
    return { updated: false, skipped: true }
  }

  lastCheckEpoch = now
  updateInProgress = true

  try {
    await autoUpdater.checkForUpdates()

    return { updated: false }
  } catch (error) {
    broadcastStatus(mainWindow, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    })

    return { updated: false, error }
  } finally {
    updateInProgress = false
  }
}

async function applySignedUpdate() {
  if (!updateInProgress) {
    return
  }

  await autoUpdater.quitAndInstall(false, true)
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  configureAutoUpdater(mainWindow)

  ipcMain.handle('updater:checkNow', () => fetchVerifiedReleaseManifest(mainWindow))
  ipcMain.handle('updater:installNow', () => applySignedUpdate())

  setTimeout(() => {
    fetchVerifiedReleaseManifest(mainWindow).catch((error) => {
      logger.error('Auto updater check failed', error)
    })
  }, AUTO_CHECK_DELAY_MS)
}
