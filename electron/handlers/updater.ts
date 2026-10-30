import { app, BrowserWindow, ipcMain } from 'electron'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'node:path'
import logger from 'electron-log/main'

const GITHUB_OWNER = 'Eminium-Games'
const GITHUB_REPO = 'EminiumLauncher-v3'
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`
const LAST_COMMIT_FILE = 'last-commit.txt'
const MIN_UPDATE_INTERVAL_MS = 30_000

let lastCheckEpoch = 0
let updateInProgress = false

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
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message))
      else resolve(stdout || stderr)
    })
  })
}

function findProjectRoot(): string | null {
  const candidates = [
    process.cwd(),
    app.getAppPath(),
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..')
  ]

  for (const candidate of candidates) {
    try {
      if (require('node:fs').existsSync(path.join(candidate, '.git')) && require('node:fs').existsSync(path.join(candidate, 'package.json'))) {
        return candidate
      }
    } catch {
      // ignore
    }
  }
  return null
}

function getLastCommitPath(): string {
  return path.join(app.getPath('userData'), LAST_COMMIT_FILE)
}

async function readLastCommit(): Promise<string | null> {
  try {
    return await fs.readFile(getLastCommitPath(), 'utf-8')
  } catch {
    return null
  }
}

async function writeLastCommit(sha: string): Promise<void> {
  await fs.mkdir(path.dirname(getLastCommitPath()), { recursive: true })
  await fs.writeFile(getLastCommitPath(), sha, 'utf-8')
}

async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/commits/main`, {
      headers: {
        'User-Agent': 'Eminium-Games-Launcher/1.0',
        Accept: 'application/vnd.github.v3+json',
      },
    })
    if (!response.ok) {
      logger.warn(`GitHub API returned ${response.status} for commit check`)
      return null
    }
    const data = (await response.json()) as { sha: string }
    return data.sha ?? null
  } catch (error) {
    logger.error('Failed to fetch latest commit:', error)
    return null
  }
}

async function performUpdate(mainWindow: BrowserWindow, projectRoot: string, latestSha: string) {
  const totalSteps = 3
  broadcastProgress(mainWindow, 0, totalSteps)
  logger.log('Pulling latest changes...')
  await execAsync('git pull', projectRoot)

  broadcastProgress(mainWindow, 1, totalSteps)
  logger.log('Installing dependencies...')
  await execAsync('npm install', projectRoot)

  broadcastProgress(mainWindow, 2, totalSteps)
  logger.log('Building launcher...')
  await execAsync('npm run build', projectRoot)

  broadcastProgress(mainWindow, totalSteps, totalSteps)
  await writeLastCommit(latestSha)

  broadcastStatus(mainWindow, { status: 'updated' })

  setTimeout(() => {
    try {
      app.relaunch({ execPath: process.execPath, args: process.argv.slice(1) })
      app.quit()
    } catch (err) {
      logger.error('Relaunch failed:', err)
      if (!mainWindow.isDestroyed()) mainWindow.webContents.reload()
    }
  }, 1500)
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  const projectRoot = findProjectRoot()

  const checkForUpdates = async () => {
    const now = Date.now()
    if (updateInProgress || now - lastCheckEpoch < MIN_UPDATE_INTERVAL_MS) {
      return { updated: false, skipped: true }
    }
    lastCheckEpoch = now
    updateInProgress = true

    try {
      if (!projectRoot) {
        broadcastStatus(mainWindow, { status: 'error', error: 'Updater not available (no git repository found)' })
        return { updated: false, error: 'No git repository' }
      }

      const latestSha = await fetchLatestCommitSha()
      if (!latestSha) {
        broadcastStatus(mainWindow, { status: 'error', error: 'Cannot check for updates from GitHub' })
        return { updated: false }
      }

      const lastSha = await readLastCommit()

      if (lastSha === null) {
        await writeLastCommit(latestSha)
        broadcastStatus(mainWindow, { status: 'not-available' })
        return { updated: false }
      }

      if (lastSha === latestSha) {
        broadcastStatus(mainWindow, { status: 'not-available' })
        return { updated: false }
      }

      broadcastStatus(mainWindow, { status: 'found' })
      await performUpdate(mainWindow, projectRoot, latestSha)
      return { updated: true, version: latestSha.slice(0, 7) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Update failed:', error)
      broadcastStatus(mainWindow, { status: 'error', error: message })
      return { updated: false, error: message }
    } finally {
      updateInProgress = false
    }
  }

  ipcMain.handle('updater:checkNow', () => checkForUpdates())

  ipcMain.handle('updater:installNow', () => {
    if (projectRoot && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload()
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      checkForUpdates().catch((error) => {
        logger.error('Auto updater check failed:', error)
      })
    }, 2500)
  })
}
