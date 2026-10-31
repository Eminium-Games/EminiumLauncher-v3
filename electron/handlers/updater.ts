import { app, ipcMain, BrowserWindow } from 'electron'
import { exec } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import logger from 'electron-log/main'

const GH_OWNER = 'EminiumGames'
const GH_REPO = 'EminiumLauncher-v3'
const GH_API_COMMIT = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/commits/main`
const CONTINUOUS_TAG = 'continuous'
const STABLE_INSTALLER = 'EminiumLauncher-Setup-win.exe'
const COMMIT_ASSET = 'commit-sha.txt'

export type UpdaterMode = 'dev' | 'prod'

export interface UpdaterCheckResult {
  updateAvailable: boolean
  current: string
  latest: string | null
  mode: UpdaterMode
  reason?: string
}

export interface UpdaterInfo extends UpdaterCheckResult {
  version: string
}

export interface UpdaterProgress {
  transferred: number
  total: number
  percent: number
  speed: number
  mode: UpdaterMode
}

let pendingUpdate: { latest: string; installerPath?: string } | null = null

// ---------- Helpers ----------

function findProjectRoot(): string | null {
  const candidates = [process.cwd(), app.getAppPath(), path.resolve(__dirname, '..'), path.resolve(__dirname, '../..')]
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, '.git')) && fs.existsSync(path.join(c, 'package.json'))) return c
    } catch {
      // ignore
    }
  }
  return null
}

function execAsync(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout || stderr)
    })
  })
}

/** Commit SHA baked into the build (dist/commit-sha.txt via public/). */
function getBakedSha(): string | null {
  const candidates = [
    path.join(__dirname, '../dist/commit-sha.txt'),
    path.join(app.getAppPath(), 'dist/commit-sha.txt'),
    path.join(process.cwd(), 'public/commit-sha.txt'),
    path.join(process.cwd(), 'dist/commit-sha.txt')
  ]
  for (const f of candidates) {
    try {
      if (fs.existsSync(f)) {
        const sha = fs.readFileSync(f, 'utf-8').trim()
        if (/^[0-9a-f]{40}$/i.test(sha)) return sha
      }
    } catch {
      // ignore
    }
  }
  return null
}

async function getGitHeadSha(projectRoot: string): Promise<string | null> {
  try {
    return (await execAsync('git rev-parse HEAD', projectRoot)).trim() || null
  } catch {
    return null
  }
}

function getLastCommitPath(): string {
  return path.join(app.getPath('userData'), 'last-commit.txt')
}

async function readLastCommit(): Promise<string | null> {
  try {
    const sha = (await fs.promises.readFile(getLastCommitPath(), 'utf-8')).trim()
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : null
  } catch {
    return null
  }
}

async function writeLastCommit(sha: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(getLastCommitPath()), { recursive: true })
  await fs.promises.writeFile(getLastCommitPath(), sha, 'utf-8')
}

/** Current commit of the running launcher (baked > git HEAD > last applied). */
async function getCurrentSha(projectRoot: string | null): Promise<string> {
  return getBakedSha() ?? (projectRoot ? await getGitHeadSha(projectRoot) : null) ?? (await readLastCommit()) ?? 'unknown'
}

/** Latest commit SHA of main on GitHub. Null when offline / rate-limited. */
async function getLatestSha(): Promise<string | null> {
  try {
    const res = await fetch(GH_API_COMMIT, {
      headers: { 'User-Agent': 'Eminium-Games-Launcher', Accept: 'application/vnd.github.v3+json' }
    })
    if (!res.ok) {
      logger.warn(`GitHub API returned HTTP ${res.status} for latest commit`)
      return null
    }
    const data = (await res.json()) as { sha?: string }
    return data.sha ?? null
  } catch (err) {
    logger.warn('Cannot reach GitHub API:', err)
    return null
  }
}

/** SHA the CI embedded in the continuous installer. Null when not published yet. */
async function getContinuousSha(): Promise<string | null> {
  try {
    const res = await fetch(`https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${CONTINUOUS_TAG}/${COMMIT_ASSET}`)
    if (!res.ok) return null
    const sha = (await res.text()).trim()
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : null
  } catch {
    return null
  }
}

function sendProgress(mainWindow: BrowserWindow, mode: UpdaterMode, transferred: number, total: number, speed: number) {
  if (mainWindow.isDestroyed()) return
  const percent = total > 0 ? Math.min(100, (transferred / total) * 100) : 0
  const payload: UpdaterProgress = { transferred, total, percent, speed, mode }
  mainWindow.webContents.send('updater:progress', payload)
}

// ---------- Registration ----------

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  const projectRoot = findProjectRoot()
  const mode: UpdaterMode = !app.isPackaged && projectRoot ? 'dev' : 'prod'

  ipcMain.handle('updater:get-info', async (): Promise<UpdaterInfo> => {
    const current = await getCurrentSha(projectRoot)
    return { updateAvailable: false, current, latest: null, mode, version: app.getVersion() }
  })

  ipcMain.handle('updater:check', async (): Promise<UpdaterCheckResult> => {
    const current = await getCurrentSha(projectRoot)
    const latest = await getLatestSha()

    if (!latest) {
      return { updateAvailable: false, current, latest: null, mode, reason: 'offline' }
    }
    if (latest === current) {
      pendingUpdate = null
      return { updateAvailable: false, current, latest, mode }
    }

    if (mode === 'prod') {
      // Only offer the update when CI has actually built this commit.
      const built = await getContinuousSha()
      if (!built) {
        return { updateAvailable: false, current, latest, mode, reason: 'build-pending' }
      }
      if (built !== latest) {
        return { updateAvailable: false, current, latest, mode, reason: 'build-pending' }
      }
    }

    pendingUpdate = { latest }
    return { updateAvailable: true, current, latest, mode }
  })

  ipcMain.handle('updater:download', async (): Promise<string | null> => {
    const current = await getCurrentSha(projectRoot)
    const latest = pendingUpdate?.latest ?? (await getLatestSha())
    if (!latest || latest === current) return null

    if (mode === 'dev' && projectRoot) {
      const steps = ['git pull', 'npm install', 'npm run build'] as const
      for (let i = 0; i < steps.length; i++) {
        sendProgress(mainWindow, mode, i, steps.length, 0)
        logger.log(`[updater] ${steps[i]}...`)
        await execAsync(steps[i], projectRoot)
      }
      sendProgress(mainWindow, mode, steps.length, steps.length, 0)
      await writeLastCommit(latest)
      pendingUpdate = { latest }
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('updater:download_end', { mode })
      return null
    }

    // Production: download the CI-built installer for this exact commit.
    const built = await getContinuousSha()
    if (!built || built !== latest) {
      throw new Error('Installer not built yet for the latest commit, try again later')
    }
    const url = `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${CONTINUOUS_TAG}/${STABLE_INSTALLER}`
    const dest = path.join(app.getPath('temp'), STABLE_INSTALLER)

    const res = await fetch(url)
    if (!res.ok) throw new Error(`Installer download failed: HTTP ${res.status}`)
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
        sendProgress(mainWindow, mode, transferred, total || transferred, speed)
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

    if (transferred === 0) throw new Error('Downloaded installer is empty')
    pendingUpdate = { latest, installerPath: dest }
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('updater:download_end', { mode })
    return dest
  })

  ipcMain.handle('updater:install', async (_event, installerPath?: string): Promise<void> => {
    if (mode === 'dev') {
      const latest = pendingUpdate?.latest
      if (latest) await writeLastCommit(latest)
      setTimeout(() => {
        try {
          app.relaunch({ execPath: process.execPath, args: process.argv.slice(1) })
        } catch {
          app.relaunch()
        }
        app.quit()
      }, 400)
      return
    }

    const target = installerPath || pendingUpdate?.installerPath
    if (!target || !fs.existsSync(target)) throw new Error(`Installer not found: ${target ?? '(none)'}`)
    if (pendingUpdate?.latest) await writeLastCommit(pendingUpdate.latest)
    const child = spawn(target, [], { detached: true, stdio: 'ignore' })
    child.unref()
    setTimeout(() => app.quit(), 500)
  })
}
