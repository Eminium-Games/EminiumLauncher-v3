import { ipcMain, app, screen, dialog, shell } from 'electron'
import logger from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolvePatchedJava, installPatchedJava17 } from './java-resolver'

const settingsPath = path.join(app.getPath('userData'), 'settings.json')

export interface ISystemInfo {
  totalMem: number // in GB
  resolution: {
    width: number
    height: number
  }
  version: string
  locale: string
}

export interface ITelemetrySettings {
  statsEnabled: boolean
  crashReportsEnabled: boolean
}

export interface IGameSettings {
  java: string
  memory: {
    min: number
    max: number
  }
  resolution: {
    width: number
    height: number
    fullscreen: boolean
  }
  launcherAction: 'close' | 'keep' | 'hide'
  telemetry: ITelemetrySettings
}

export const DEFAULT_SETTINGS: IGameSettings = {
  java: 'bundled',
  memory: {
    min: 1,
    max: 4
  },
  resolution: {
    width: 1280,
    height: 720,
    fullscreen: false
  },
  launcherAction: 'close',
  telemetry: {
    statsEnabled: true,
    crashReportsEnabled: false
  }
}

export function readSettings(): IGameSettings {
  try {
    if (!fs.existsSync(settingsPath)) {
      return structuredClone(DEFAULT_SETTINGS)
    }
    const data = fs.readFileSync(settingsPath, 'utf-8')
    const parsed = JSON.parse(data)
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      memory: { ...DEFAULT_SETTINGS.memory, ...parsed.memory },
      resolution: { ...DEFAULT_SETTINGS.resolution, ...parsed.resolution },
      telemetry: { ...DEFAULT_SETTINGS.telemetry, ...parsed.telemetry }
    }
  } catch (err) {
    logger.error('Error reading settings:', err)
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    const settings = readSettings()
    try {
      if (!fs.existsSync(settingsPath)) {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      }
    } catch (err) {
      logger.error('Error writing settings:', err)
    }
    return settings
  })

  ipcMain.handle('settings:set', async (_event, newSettings: IGameSettings) => {
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2))
      return true
    } catch (err) {
      logger.error('Error writing settings:', err)
      return false
    }
  })

  ipcMain.handle('system:info', async () => {
    const totalMemBytes = os.totalmem()
    const totalMemGB = Math.round(totalMemBytes / 1024 / 1024 / 1024)

    const primaryDisplay = screen.getPrimaryDisplay()
    const { width, height } = primaryDisplay.workAreaSize

    return {
      totalMem: totalMemGB,
      resolution: { width, height },
      version: app.getVersion(),
      locale: app.getLocale()
    }
  })

  ipcMain.handle('system:open_logs', async () => {
    try {
      const logsPath = app.getPath('logs')
      await shell.openPath(logsPath)
      return true
    } catch (err) {
      logger.error('Failed to open logs folder:', err)
      return false
    }
  })

  ipcMain.handle('system:repair_game', async () => {
    const root = path.join(process.env.APPDATA || app.getPath('appData'), '.eminiumgames', 'eminium-factions')
    const targets = ['versions', 'libraries']
    let deleted = 0
    for (const t of targets) {
      const p = path.join(root, t)
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true })
          deleted++
          logger.log(`Repaired (deleted): ${p}`)
        }
      } catch (err) {
        logger.error(`Failed to delete ${p}:`, err)
        return { success: false, error: String(err), deleted }
      }
    }
    return { success: true, deleted, root }
  })

  ipcMain.handle('settings:pick_java', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Java Executable', extensions: ['exe', 'bin', ''] }]
    })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('java:resolve', async () => {
    return await resolvePatchedJava()
  })
  ipcMain.handle('java:install_patched_17', async () => {
    return await installPatchedJava17()
  })
}

