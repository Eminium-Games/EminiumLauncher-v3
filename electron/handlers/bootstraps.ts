import { app, ipcMain, BrowserWindow } from 'electron'
import { NsisUpdater, MacUpdater, AppImageUpdater } from 'electron-updater'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'

function getOSCode(): string {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  return 'lin'
}

function createUpdater(mainWindow: BrowserWindow) {
  let updater: any
  if (process.platform === 'win32') updater = new NsisUpdater()
  else if (process.platform === 'darwin') updater = new MacUpdater()
  else updater = new AppImageUpdater()

  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  updater.allowDowngrade = true
  updater.allowPrerelease = true
  updater.setFeedURL({ provider: 'generic', url: `${ADMINTOOL_URL}/files/bootstraps/${getOSCode()}` })

  updater.on('download-progress', (progress: any) => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('bootstraps:download_progress', {
      downloaded: { amount: 0, size: progress?.transferred ?? 0 },
      total: { amount: 1, size: progress?.total ?? 0 },
      speed: progress?.bytesPerSecond ?? 0,
      type: 'BOOTSTRAP'
    })
  })

  updater.on('update-downloaded', () => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('bootstraps:download_end', { downloaded: { amount: 1, size: -1 } })
  })

  updater.on('error', (err: any) => {
    if (mainWindow.isDestroyed()) return
    mainWindow.webContents.send('bootstraps:error', { message: err?.message ?? String(err) })
  })

  return updater
}

export function registerBootstrapHandlers(mainWindow: BrowserWindow) {
  const updater = createUpdater(mainWindow)

  ipcMain.handle('bootstraps:check', async () => {
    try {
      const result = await updater.checkForUpdates()
      if (result && result.updateInfo && result.updateInfo.version !== updater.currentVersion.version) {
        return {
          updateAvailable: true,
          currentVersion: updater.currentVersion,
          latestVersion: result.updateInfo.version,
          updateInfo: {
            releaseName: result.updateInfo.releaseName ?? null,
            releaseNotes: result.updateInfo.releaseNotes ?? null,
            releaseDate: new Date(result.updateInfo.releaseDate)
          }
        }
      }
      return {
        updateAvailable: false,
        currentVersion: updater.currentVersion.version,
        latestVersion: updater.currentVersion.version
      }
    } catch (err: any) {
      logger.error('Error checking for bootstraps update', err)
      return { updateAvailable: false }
    }
  })

  ipcMain.handle('bootstraps:download', async () => {
    try {
      const result = await updater.checkForUpdates()
      if (!result || !result.updateInfo || result.updateInfo.version === updater.currentVersion.version) {
        return null
      }
      const files = await updater.downloadUpdate()
      return files?.[0] ?? ''
    } catch (err: any) {
      logger.error('Bootstraps download failed:', err)
      mainWindow.webContents.send('bootstraps:error', { message: err?.message ?? String(err) })
      throw err
    }
  })

  ipcMain.handle('bootstraps:install', async () => {
    try {
      updater.quitAndInstall(false, true)
    } catch (err: any) {
      logger.error('Bootstraps install failed:', err)
      throw err
    }
  })
}
