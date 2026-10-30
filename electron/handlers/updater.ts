import { app, BrowserWindow, ipcMain } from 'electron'
import { NsisUpdater, MacUpdater, AppImageUpdater } from 'electron-updater'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
import logger from 'electron-log/main'

const GITHUB_OWNER = 'Eminium-Games'
const GITHUB_REPO = 'EminiumLauncher-v3'
const MIN_UPDATE_INTERVAL_MS = 30_000

let lastCheckEpoch = 0
let updateInProgress = false
let updateAvailable = false
let availableVersion: string | null = null

function broadcastStatus(mainWindow: BrowserWindow, status: Record<string, unknown>) {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status)
  }
}

function broadcastProgress(mainWindow: BrowserWindow, index: number, total: number) {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:progress', { index, total })
  }
}

function execAsync(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message))
      else resolve(stdout || stderr)
    })
  })
}

function getProjectRoot(): string {
  return path.resolve(__dirname, '..')
}

async function performGitUpdate(mainWindow: BrowserWindow) {
  const projectRoot = getProjectRoot()
  const totalSteps = 2

  broadcastProgress(mainWindow, 0, totalSteps)
  logger.log('Pulling latest changes...')
  await execAsync('git pull', projectRoot)

  broadcastProgress(mainWindow, 1, totalSteps)
  logger.log('Installing dependencies...')
  await execAsync('npm install', projectRoot)

  broadcastProgress(mainWindow, totalSteps, totalSteps)
  broadcastStatus(mainWindow, { status: 'updated' })

  setTimeout(() => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.reload()
  }, 1500)
}

function createLauncherUpdater() {
  if (process.platform === 'win32') return new NsisUpdater()
  if (process.platform === 'darwin') return new MacUpdater()
  return new AppImageUpdater()
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  if (app.isPackaged) {
    const updater = createLauncherUpdater()
    updater.logger = logger
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = true
    updater.setFeedURL({ provider: 'github', owner: GITHUB_OWNER, repo: GITHUB_REPO })

    updater.on('checking-for-update', () => {
      logger.log('Checking for updates...')
    })

    updater.on('update-available', (info) => {
      updateAvailable = true
      availableVersion = info?.version ?? null
      logger.log('Update available:', info?.version)
      broadcastStatus(mainWindow, { status: 'found' })
      updater.downloadUpdate().catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        logger.error('Update download failed:', message)
        broadcastStatus(mainWindow, { status: 'error', error: message })
      })
    })

    updater.on('download-progress', (progress) => {
      const percent = Math.round(progress?.percent ?? 0)
      broadcastProgress(mainWindow, percent, 100)
    })

    updater.on('update-downloaded', (info) => {
      logger.log('Update downloaded:', info?.version)
      broadcastStatus(mainWindow, { status: 'updated' })
      setTimeout(() => {
        try {
          updater.quitAndInstall(false, true)
        } catch (err) {
          logger.error('quitAndInstall failed:', err)
        }
      }, 2000)
    })

    updater.on('update-not-available', () => {
      updateAvailable = false
      availableVersion = null
      logger.log('No update available')
      broadcastStatus(mainWindow, { status: 'not-available' })
    })

    updater.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Updater error:', message)
      broadcastStatus(mainWindow, { status: 'error', error: message })
    })

    ipcMain.handle('updater:checkNow', async () => {
      const now = Date.now()
      if (updateInProgress || now - lastCheckEpoch < MIN_UPDATE_INTERVAL_MS) {
        return { updated: false, skipped: true }
      }
      lastCheckEpoch = now
      updateInProgress = true
      updateAvailable = false
      availableVersion = null
      try {
        await updater.checkForUpdates()
        return { updated: updateAvailable, version: availableVersion ?? undefined }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        broadcastStatus(mainWindow, { status: 'error', error: message })
        return { updated: false, error: message }
      } finally {
        updateInProgress = false
      }
    })

    ipcMain.handle('updater:installNow', () => {
      try {
        updater.quitAndInstall(false, true)
      } catch (err) {
        logger.error('installNow failed:', err)
      }
    })

    mainWindow.webContents.on('did-finish-load', () => {
      updater.checkForUpdates().catch((error) => {
        logger.error('Auto updater check failed:', error)
      })
    })
  } else {
    // Development mode: git-based update
    ipcMain.handle('updater:checkNow', async () => {
      const now = Date.now()
      if (updateInProgress || now - lastCheckEpoch < MIN_UPDATE_INTERVAL_MS) {
        return { updated: false, skipped: true }
      }
      lastCheckEpoch = now
      updateInProgress = true
      try {
        await performGitUpdate(mainWindow)
        return { updated: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        broadcastStatus(mainWindow, { status: 'error', error: message })
        return { updated: false, error: message }
      } finally {
        updateInProgress = false
      }
    })

    ipcMain.handle('updater:installNow', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.reload()
      }
    })
  }
}
