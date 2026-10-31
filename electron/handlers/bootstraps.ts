import { app, ipcMain, BrowserWindow } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'

export interface BootstrapsCheckResult {
  updateAvailable: boolean
  currentVersion: string
  latestVersion: string
}

export interface BootstrapsProgress {
  transferred: number
  total: number
  percent: number
  speed: number
}

function getOSCode(): string {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  return 'lin'
}

let cachedFile: { version: string; url: string; fileName: string } | null = null

async function fetchLatest(): Promise<{ version: string; url: string; fileName: string }> {
  const base = `${ADMINTOOL_URL}/files/bootstraps/${getOSCode()}`
  const res = await fetch(`${base}/latest.yml`)
  if (!res.ok) throw new Error(`latest.yml unreachable: HTTP ${res.status}`)
  const yaml = await res.text()

  const versionMatch = yaml.match(/^version:\s*(.+)$/m)
  if (!versionMatch) throw new Error('latest.yml: missing version')
  const version = versionMatch[1].trim().replace(/^['"]|['"]$/g, '')

  let fileName = ''
  const pathMatch = yaml.match(/^\s*path:\s*(.+)$/m)
  const urlMatch = yaml.match(/^\s*url:\s*(.+)$/m)
  if (pathMatch) fileName = pathMatch[1].trim().replace(/^['"]|['"]$/g, '')
  else if (urlMatch) fileName = urlMatch[1].trim().replace(/^['"]|['"]$/g, '')
  if (!fileName) throw new Error('latest.yml: missing file path/url')

  // The update is only real if the file is actually hosted.
  const head = await fetch(`${base}/${fileName}`, { method: 'HEAD' })
  if (!head.ok) throw new Error(`Installer not hosted: HTTP ${head.status}`)

  return { version, url: `${base}/${fileName}`, fileName }
}

function sendProgress(mainWindow: BrowserWindow, transferred: number, total: number, speed: number) {
  if (mainWindow.isDestroyed()) return
  const percent = total > 0 ? Math.min(100, (transferred / total) * 100) : 0
  const payload: BootstrapsProgress = { transferred, total, percent, speed }
  mainWindow.webContents.send('bootstraps:download_progress', payload)
}

export function registerBootstrapHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('bootstraps:check', async (): Promise<BootstrapsCheckResult> => {
    try {
      const latest = await fetchLatest()
      const currentVersion = app.getVersion()
      if (latest.version !== currentVersion) {
        cachedFile = latest
        return { updateAvailable: true, currentVersion, latestVersion: latest.version }
      }
      cachedFile = null
      return { updateAvailable: false, currentVersion, latestVersion: latest.version }
    } catch (err) {
      logger.warn('Bootstraps check: no update available:', err)
      cachedFile = null
      return { updateAvailable: false, currentVersion: app.getVersion(), latestVersion: app.getVersion() }
    }
  })

  ipcMain.handle('bootstraps:download', async (): Promise<string | null> => {
    let latest = cachedFile
    if (!latest) {
      latest = await fetchLatest().catch(() => null)
    }
    if (!latest || latest.version === app.getVersion()) return null
    cachedFile = latest

    const dest = path.join(app.getPath('temp'), latest.fileName)
    const res = await fetch(latest.url)
    if (!res.ok) throw new Error(`Bootstraps download failed: HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length') || 0)

    const file = fs.createWriteStream(dest)
    const reader = res.body!.getReader()
    let transferred = 0
    let lastTime = Date.now()
    let lastTransferred = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        file.write(Buffer.from(value))
        transferred += value.length
        const now = Date.now()
        const dt = (now - lastTime) / 1000
        let speed = 0
        if (dt >= 0.25) {
          speed = (transferred - lastTransferred) / dt
          lastTime = now
          lastTransferred = transferred
        }
        sendProgress(mainWindow, transferred, total || transferred, speed)
      }
    } catch (err) {
      try {
        file.close()
      } catch {
        // ignore
      }
      throw err
    }

    file.end()
    await new Promise<void>((resolve, reject) => {
      file.on('finish', () => resolve())
      file.on('error', (e) => reject(e))
    })

    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('bootstraps:download_end', { downloaded: { amount: 1, size: -1 } })
    return dest
  })

  ipcMain.handle('bootstraps:install', async (_event, installerPath?: string): Promise<void> => {
    const target = installerPath ?? (cachedFile ? path.join(app.getPath('temp'), cachedFile.fileName) : null)
    if (!target || !fs.existsSync(target)) throw new Error(`Installer not found: ${target ?? '(none)'}`)
    const child = spawn(target, [], { detached: true, stdio: 'ignore' })
    child.unref()
    setTimeout(() => app.quit(), 500)
  })
}
