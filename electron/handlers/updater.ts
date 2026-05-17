import { ipcMain, BrowserWindow, app } from 'electron'
import https from 'node:https'
import * as fs from 'fs'
import * as path from 'path'
import logger from 'electron-log/main'

const REPO_OWNER = 'EminiumGames'
const REPO_NAME = 'EminiumLauncher-v3'
const BRANCH = 'main'
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`
const APP_ROOT = path.resolve(app.getAppPath(), '..')

let updateInProgress = false

type WrittenFileRecord = {
  targetPath: string
  hadBackup: boolean
}

function httpsGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Eminium-Updater' } }, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }

      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('error', reject)
  })
}

function httpsGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Eminium-Updater' } }, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }

      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.from(c)))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

function getUserDataPath() {
  return app.getPath('userData')
}

function getStateFile() {
  return path.join(getUserDataPath(), 'updater.json')
}

function getBackupRoot() {
  return path.join(getUserDataPath(), 'updater-backup')
}

async function getLatestCommitSha(): Promise<string> {
  const url = `${GITHUB_API}/commits/${BRANCH}`
  const data = await httpsGetJson(url)
  return data.sha
}

async function getRepoTree(): Promise<any[]> {
  const url = `${GITHUB_API}/git/trees/${BRANCH}?recursive=1`
  const data = await httpsGetJson(url)
  return data.tree || []
}

function isPathAllowed(p: string) {
  const normalized = path.posix.normalize(p)
  if (!normalized || normalized === '.' || path.posix.isAbsolute(normalized) || normalized.startsWith('..')) {
    return false
  }

  const blocked = ['node_modules', '.git', 'release', 'dist-electron/win-unpacked', 'linux-unpacked']
  for (const b of blocked) if (normalized === b || normalized.startsWith(`${b}/`)) return false
  return true
}

function resolveTargetPath(repoPath: string) {
  const targetPath = path.resolve(APP_ROOT, repoPath)
  if (!targetPath.startsWith(APP_ROOT + path.sep) && targetPath !== APP_ROOT) {
    throw new Error(`Refus de path hors racine: ${repoPath}`)
  }

  return targetPath
}

async function backupAndWriteFile(targetPath: string, nextContent: Buffer, backupRoot: string, writtenFiles: WrittenFileRecord[]) {
  const rel = path.relative(APP_ROOT, targetPath)
  const backupPath = path.join(backupRoot, rel)
  const hadBackup = fs.existsSync(targetPath)

  if (hadBackup) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(targetPath, backupPath)
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, nextContent)
  writtenFiles.push({ targetPath, hadBackup })
}

function rollbackFiles(backupRoot: string, writtenFiles: WrittenFileRecord[]) {
  for (const file of writtenFiles.reverse()) {
    const { targetPath, hadBackup } = file
    const rel = path.relative(APP_ROOT, targetPath)
    const backupPath = path.join(backupRoot, rel)

    try {
      if (hadBackup && fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.copyFileSync(backupPath, targetPath)
      } else if (!hadBackup && fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { force: true })
      }
    } catch (err) {
      logger.error('Updater rollback failed for file', targetPath, err)
    }
  }
}

async function runUpdateCheck(mainWindow: BrowserWindow) {
  if (updateInProgress) {
    logger.log('Updater: check skipped because another update is already running')
    return { updated: false, skipped: true }
  }

  updateInProgress = true

  const stateFile = getStateFile()
  const backupRoot = getBackupRoot()
  const writtenFiles: WrittenFileRecord[] = []

  try {
    const latest = await getLatestCommitSha()

    let localSha = null
    try {
      const s = fs.readFileSync(stateFile, 'utf-8')
      localSha = JSON.parse(s).sha
    } catch {
      localSha = null
    }

    // First run: initialize local SHA without updating files.
    // This ensures updates only run when a newer commit appears later.
    if (!localSha) {
      fs.writeFileSync(stateFile, JSON.stringify({ sha: latest }), 'utf-8')
      logger.log('Updater: baseline SHA initialized, skipping update on first run')
      return { updated: false, initialized: true }
    }

    if (localSha === latest) {
      logger.log('Updater: already up-to-date')
      return { updated: false }
    }

    mainWindow.webContents.send('updater:status', { status: 'found', latest })

    const tree = await getRepoTree()
    const files = tree.filter((t: any) => t.type === 'blob' && isPathAllowed(t.path))

    if (fs.existsSync(backupRoot)) {
      fs.rmSync(backupRoot, { recursive: true, force: true })
    }

    let i = 0
    for (const f of files) {
      i++
      const fileUrl = `${RAW_BASE}/${f.path}`
      const buf = await httpsGetBuffer(fileUrl)
      const targetPath = resolveTargetPath(f.path)
      await backupAndWriteFile(targetPath, buf, backupRoot, writtenFiles)
      mainWindow.webContents.send('updater:progress', { index: i, total: files.length, path: f.path })
    }

    fs.writeFileSync(stateFile, JSON.stringify({ sha: latest }), 'utf-8')
    if (fs.existsSync(backupRoot)) {
      fs.rmSync(backupRoot, { recursive: true, force: true })
    }
    mainWindow.webContents.send('updater:status', { status: 'updated', latest })

    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 1000)

    return { updated: true }
  } catch (err) {
    logger.error('Updater check failed', err)
    rollbackFiles(backupRoot, writtenFiles)

    mainWindow.webContents.send('updater:status', {
      status: 'error',
      error: err instanceof Error ? err.message : String(err)
    })
    return { updated: false, error: err }
  } finally {
    updateInProgress = false
  }
}

async function debugSimulateUpdate(mainWindow: BrowserWindow) {
  logger.log('Updater: debug simulate update')
  try {
    mainWindow.webContents.send('updater:status', { status: 'found', latest: 'debug-sha' })

    for (let i = 1; i <= 10; i++) {
      await new Promise((r) => setTimeout(r, 300))
      mainWindow.webContents.send('updater:progress', { index: i, total: 10, path: `src/file${i}.ts` })
    }

    mainWindow.webContents.send('updater:status', { status: 'updated', latest: 'debug-sha' })
    logger.log('Updater: debug simulate complete')
    return { simulated: true }
  } catch (err) {
    logger.error('Debug update failed', err)
    mainWindow.webContents.send('updater:status', { status: 'error', error: 'Debug error' })
    return { simulated: false, error: err }
  }
}

export function registerUpdaterHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('updater:checkNow', async () => await runUpdateCheck(mainWindow))
  ipcMain.handle('updater:debugSimulate', async () => await debugSimulateUpdate(mainWindow))

  setTimeout(async () => {
    try {
      await runUpdateCheck(mainWindow)
    } catch (e) {
      logger.error('Auto updater check failed', e)
    }
  }, 5000)
}

