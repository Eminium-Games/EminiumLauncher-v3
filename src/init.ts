import { setBlockingView, setUser, setView } from './state'
import { auth, background, maintenance, skin, updater } from './ipc'
import logger from 'electron-log/renderer'
import type { UpdaterProgress } from '../electron/handlers/updater'

const DEFAULT_BACKGROUND = '/src/static/images/bg.png'
const dateFormatOptions: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.src = url
    img.onload = () => resolve()
    img.onerror = () => resolve()
  })
}

function getUpdateView() {
  return {
    view: document.querySelector('div#view-update'),
    bar: document.getElementById('update-progress-bar'),
    label: document.getElementById('update-progress-label'),
    percent: document.getElementById('update-progress-percent')
  }
}

function showUpdateView(text: string) {
  const { bar, label, percent } = getUpdateView()
  if (bar) {
    bar.classList.remove('indeterminate')
    bar.style.width = '0%'
  }
  if (label) label.innerText = text
  if (percent) {
    percent.style.display = 'block'
    percent.innerText = '0%'
  }
  setBlockingView('update')
}

function hideUpdateView() {
  getUpdateView().view?.classList.remove('loaded')
}

function renderUpdateProgress(p: UpdaterProgress, action: string) {
  const { bar, label, percent } = getUpdateView()
  const pct = Math.round(p.percent)
  if (bar) bar.style.width = `${pct}%`
  if (percent) percent.innerText = `${pct}%`
  if (label) label.innerText = `${action} ${pct}%`
}

/** Check GitHub commits at startup, download + install when behind. Returns true when an update was applied (app will restart). */
async function applyLauncherUpdate(): Promise<boolean> {
  let check
  try {
    check = await updater.check()
  } catch (err) {
    logger.error('Updater check failed (offline?), continuing:', err)
    return false
  }

  if (!check.updateAvailable || !check.latest) {
    logger.log(`Launcher up to date (commit ${check.current.slice(0, 7)}, mode: ${check.mode})`)
    return false
  }

  logger.log(`Update found: ${check.current.slice(0, 7)} -> ${check.latest.slice(0, 7)} (mode: ${check.mode})`)
  showUpdateView(check.mode === 'dev' ? 'Updating from git...' : 'Downloading launcher update...')

  const offProgress = updater.onProgress((p) => {
    renderUpdateProgress(p, check.mode === 'dev' ? 'Updating...' : 'Downloading update...')
  })

  try {
    const installerPath = await updater.download()
    const { label } = getUpdateView()
    if (label) label.innerText = 'Installing update, the launcher will restart...'
    await updater.install(installerPath ?? undefined)
    return true
  } catch (err) {
    logger.error('Launcher update failed, continuing with current version:', err)
    hideUpdateView()
    const { Dialog } = await import('./views/dialog')
    const message = err instanceof Error ? err.message : String(err)
    await Dialog.show(`Launcher update failed: ${message}. Continuing with current version.`, [{ text: 'OK', type: 'ok' }], 'Update error')
    return false
  } finally {
    offProgress()
  }
}

export async function bootstrap() {
  logger.log('Initializing Launcher...')

  const bgElement = document.querySelector('.app-background') as HTMLElement
  const maintenanceDates = document.getElementById('maintenance-dates')!
  const maintenanceReason = document.getElementById('maintenance-reason')!

  // 1. Launcher self-update (commit-based, checked at every startup).
  if (await applyLauncherUpdate()) return

  // 2. Load remote config in parallel.
  const [bg, mn] = await Promise.all([background.get(), maintenance.get()])
  const bgUrl = bg?.file?.url ?? DEFAULT_BACKGROUND

  if (mn) {
    const start = new Date(mn.startTime as Date)
    const end = new Date(mn.endTime as Date)
    maintenanceDates.innerText = `From ${start.toLocaleString([], dateFormatOptions)} to ${end.toLocaleString([], dateFormatOptions)}`
    maintenanceReason.innerText = mn.message ?? 'Please come back later.'
    setBlockingView('maintenance')
    return
  }

  try {
    const [_, session] = await Promise.all([preloadImage(bgUrl), auth.refresh()])

    if (bgElement) bgElement.style.backgroundImage = `url('${bgUrl}')`

    if (session.success) {
      logger.log(`Session restored: ${(session.account as any).name}`)
      const [__, skins, capes, avatar] = await Promise.all([skin.reload(session.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])
      setUser(session.account, { skins, capes, avatar })
      setView('home')
    } else {
      logger.log('No session found - showing login')
      setView('login')
    }
  } catch (err) {
    logger.error('Error while initializing launcher:', err)
    if (bgElement) bgElement.style.backgroundImage = `url('${DEFAULT_BACKGROUND}')`
    setView('login')
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 400))
    document.querySelector('div#view-loading')?.classList.add('loaded')
    await new Promise((resolve) => setTimeout(resolve, 200))
    document.body.classList.add('loaded')
  }
}
