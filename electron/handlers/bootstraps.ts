import { app, ipcMain, BrowserWindow } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn, exec } from 'node:child_process'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'

// ---------- Git helpers (fallback when admin tool has no installer) ----------
function findProjectRoot(): string | null {
  const candidates = [process.cwd(), app.getAppPath(), path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')]
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, '.git')) && fs.existsSync(path.join(c, 'package.json'))) return c
    } catch {}
  }
  return null
}

function execAsync(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout || stderr)
    })
  })
}

const projectRoot = findProjectRoot()

// ---------- Admin tool helpers ----------
function getOSCode(): string {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  return 'lin'
}

let cachedUpdate: { version: string; fileName: string; url: string } | null = null
let updateMode: 'admin' | 'git' = 'admin'

async function fetchLatestAdmin(): Promise<{ version: string; fileName: string; url: string } | null> {
  const base = `${ADMINTOOL_URL}/files/bootstraps/${getOSCode()}`
  const res = await fetch(`${base}/latest.yml`)
  if (!res.ok) throw new Error(`Failed to fetch latest.yml: HTTP ${res.status}`)
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
  // Verify the file actually exists
  const fileRes = await fetch(`${base}/${fileName}`, { method: 'HEAD' })
  if (!fileRes.ok) throw new Error(`Installer not hosted: HTTP ${fileRes.status}`)
  return { version, fileName, url: `${base}/${fileName}` }
}

const LAST_COMMIT_FILE = 'last-commit.txt'
function getLastCommitPath() { return path.join(app.getPath('userData'), LAST_COMMIT_FILE) }
async function readLastCommit(): Promise<string | null> {
  try { return await fs.promises.readFile(getLastCommitPath(), 'utf-8') } catch { return null }
}
async function writeLastCommit(sha: string) {
  await fs.promises.mkdir(path.dirname(getLastCommitPath()), { recursive: true })
  await fs.promises.writeFile(getLastCommitPath(), sha, 'utf-8')
}
async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/Eminium-Games/EminiumLauncher-v3/commits/main`, {
      headers: { 'User-Agent': 'Eminium-Games-Launcher/1.0', Accept: 'application/vnd.github.v3+json' }
    })
    if (!res.ok) return null
    const data = await res.json() as { sha: string }
    return data.sha ?? null
  } catch { return null }
}

export function registerBootstrapHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('bootstraps:check', async () => {
    // Try admin tool first
    try {
      const latest = await fetchLatestAdmin()
      const currentVersion = app.getVersion()
      if (latest.version !== currentVersion) {
        cachedUpdate = latest
        updateMode = 'admin'
        return { updateAvailable: true, currentVersion, latestVersion: latest.version, updateInfo: { releaseName: latest.version, releaseNotes: null, releaseDate: new Date() } }
      }
      cachedUpdate = null
    } catch (err) {
      logger.warn('Admin tool bootstraps unavailable, trying git fallback:', err)
    }

    // Git fallback
    if (projectRoot) {
      try {
        const latestSha = await fetchLatestCommitSha()
        if (latestSha) {
          const lastSha = await readLastCommit()
          if (lastSha === null) {
            await writeLastCommit(latestSha)
          } else if (lastSha !== latestSha) {
            updateMode = 'git'
            return { updateAvailable: true, currentVersion: app.getVersion(), latestVersion: latestSha.slice(0, 7), updateInfo: { releaseName: latestSha.slice(0, 7), releaseNotes: null, releaseDate: new Date() } }
          }
        }
      } catch (err) {
        logger.error('Git fallback check failed:', err)
      }
    }

    return { updateAvailable: false, currentVersion: app.getVersion(), latestVersion: app.getVersion() }
  })

  ipcMain.handle('bootstraps:download', async () => {
    if (updateMode === 'git' && projectRoot) {
      // Perform git update inline
      try {
        const totalSteps = 3
        const sendProgress = (i: number) => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('bootstraps:download_progress', {
              downloaded: { amount: 0, size: i },
              total: { amount: 1, size: totalSteps },
              speed: 0,
              type: 'BOOTSTRAP'
            })
          }
        }
        sendProgress(0)
        await execAsync('git pull', projectRoot)
        sendProgress(1)
        await execAsync('npm install', projectRoot)
        sendProgress(2)
        await execAsync('npm run build', projectRoot)
        sendProgress(3)
        const latestSha = await fetchLatestCommitSha()
        if (latestSha) await writeLastCommit(latestSha)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('bootstraps:download_end', { downloaded: { amount: 1, size: -1 } })
        }
        return null
      } catch (err: any) {
        logger.error('Git fallback update failed:', err)
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('bootstraps:error', { message: err?.message ?? String(err) })
        throw err
      }
    }

    // Admin tool download
    try {
      if (!cachedUpdate) {
        const latest = await fetchLatestAdmin()
        if (latest.version === app.getVersion()) return null
        cachedUpdate = latest
      }
      const { url, fileName } = cachedUpdate!
      const dest = path.join(app.getPath('temp'), fileName)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to download update: HTTP ${res.status}`)
      const total = Number(res.headers.get('content-length') || 0)
      const file = fs.createWriteStream(dest)
      const reader = res.body!.getReader()
      let transferred = 0
      let lastTime = Date.now()
      let lastTransferred = 0
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
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('bootstraps:download_progress', {
            downloaded: { amount: 0, size: transferred },
            total: { amount: 1, size: total || transferred },
            speed,
            type: 'BOOTSTRAP'
          })
        }
      }
      file.end()
      await new Promise<void>((resolve, reject) => {
        file.on('finish', () => resolve())
        file.on('error', (e) => reject(e))
      })
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bootstraps:download_end', { downloaded: { amount: 1, size: -1 } })
      }
      return dest
    } catch (err: any) {
      logger.error('Bootstraps download failed:', err)
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bootstraps:error', { message: err?.message ?? String(err) })
      }
      // Fallback to git if available
      if (projectRoot) {
        updateMode = 'git'
        try {
          const totalSteps = 3
          const sendProgress = (i: number) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('bootstraps:download_progress', {
                downloaded: { amount: 0, size: i },
                total: { amount: 1, size: totalSteps },
                speed: 0,
                type: 'BOOTSTRAP'
              })
            }
          }
          sendProgress(0)
          await execAsync('git pull', projectRoot)
          sendProgress(1)
          await execAsync('npm install', projectRoot)
          sendProgress(2)
          await execAsync('npm run build', projectRoot)
          sendProgress(3)
          const latestSha = await fetchLatestCommitSha()
          if (latestSha) await writeLastCommit(latestSha)
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('bootstraps:download_end', { downloaded: { amount: 1, size: -1 } })
          }
          return null
        } catch (gitErr: any) {
          logger.error('Git fallback update failed:', gitErr)
          if (!mainWindow.isDestroyed()) mainWindow.webContents.send('bootstraps:error', { message: gitErr?.message ?? String(gitErr) })
          throw gitErr
        }
      }
      throw err
    }
  })

  ipcMain.handle('bootstraps:install', async (_event, installerPath?: string) => {
    if (updateMode === 'git') {
      // Restart to load new code
      setTimeout(() => {
        app.relaunch({ execPath: process.execPath, args: process.argv.slice(1) })
        app.quit()
      }, 500)
      return
    }
    try {
      const target = installerPath || cachedUpdate?.fileName
      const fullPath = target && path.isAbsolute(target) ? target : path.join(app.getPath('temp'), target || '')
      if (!fs.existsSync(fullPath)) throw new Error(`Installer not found: ${fullPath}`)
      const child = spawn(fullPath, [], { detached: true, stdio: 'ignore' })
      child.unref()
      setTimeout(() => app.quit(), 500)
    } catch (err: any) {
      logger.error('Bootstraps install failed:', err)
      throw err
    }
  })
}
