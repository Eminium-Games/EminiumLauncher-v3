import { app, BrowserWindow, ipcMain } from 'electron'
import { exec } from 'child_process'
import { promises as fs } from 'fs'
import * as path from 'path'
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

async function performGitUpdate(mainWindow: BrowserWindow, latestSha: string) {
  const projectRoot = getProjectRoot()
  const totalSteps = 3

  broadcastProgress(mainWindow, 0, totalSteps)

  broadcastProgress(mainWindow, 0, totalSteps)
  logger.log('Pulling latest changes...')
  await execAsync('git pull', projectRoot)

  broadcastProgress(mainWindow, 1, totalSteps)
  logger.log('Installing dependencies...')
  await execAsync('npm install', projectRoot)

  broadcastProgress(mainWindow, 2, totalSteps)
  logger.log('Building project...')
  await execAsync('npm run build', projectRoot)

  broadcastProgress(mainWindow, totalSteps, totalSteps)
  await writeLastCommit(latestSha)

  broadcastStatus(mainWindow, { status: 'updated' })

  setTimeout(() => {
    app.relaunch()
    app.exit(0)
  }, 1500)
}

async function checkForUpdates(mainWindow: BrowserWindow) {
  const now = Date.now()
  if (updateInProgress || now - lastCheckEpoch < MIN_UPDATE_INTERVAL_MS) {
    return { updated: false, skipped: true }
  }

  lastCheckEpoch = now
  updateInProgress = true

  try {
    if (app.isPackaged) {
      broadcastStatus(mainWindow, { status: 'error', error: 'Auto-update not available in production mode' })
      return { updated: false }
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
    await performGitUpdate(mainWindow, latestSha)
    return { updated: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    broadcastStatus(mainWindow, { status: 'error', error: message })
    logger.error('Update failed:', error)
    return { updated: false }
  } finally {
    updateInProgress = false
  }
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('updater:checkNow', () => checkForUpdates(mainWindow))
  ipcMain.handle('updater:installNow', () => {
    if (!app.isPackaged) {
      app.relaunch()
      app.exit(0)
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    checkForUpdates(mainWindow).catch((error) => {
      logger.error('Auto updater check failed:', error)
    })
  })
}
