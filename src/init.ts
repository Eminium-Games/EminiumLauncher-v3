import { setBlockingView, setUser, setView } from './state'
import { auth, background, maintenance, skin, updater } from './ipc'
import { showMaintenanceProfile } from './views/maintenance-login'
import logger from 'electron-log/renderer'
import type { UpdaterProgress } from '../electron/handlers/updater'
import { t } from './i18n'

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
  const title = document.getElementById('update-title')
  if (title) title.innerText = t('update.available')
  const updateText = document.getElementById('update-text')
  if (updateText) updateText.innerText = t('update.wait')
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

// function renderUpdateProgress(p: UpdaterProgress, action: string) {
function renderUpdateProgress(p: UpdaterProgress) {

  // const { bar, label, percent } = getUpdateView()
  const { bar, percent } = getUpdateView()
  const pct = Math.round(p.percent)
  if (bar) bar.style.width = `${pct}%`
  if (percent) percent.innerText = `${pct}%`
  // if (label) label.innerText = `${action} ${pct}%`
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
  showUpdateView(check.mode === 'dev' ? t('update.installing') : t('update.downloading'))

  const offProgress = updater.onProgress((p) => {
    // renderUpdateProgress(p, check.mode === 'dev' ? 'Updating...' : 'Downloading update...')
    renderUpdateProgress(p)
  })

  try {
    const installerPath = await updater.download()
    const { label } = getUpdateView()
    if (label) label.innerText = t('update.installing')
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

  // Reset stale blocking overlays (ex: double exécution via HMR) : on
  // re-décide juste après, donc partir d'un état propre est toujours sûr.
  document.querySelector('div#view-maintenance')?.classList.remove('loaded')
  document.querySelector('div#view-update')?.classList.remove('loaded')

  const bgElement = document.querySelector('.app-background') as HTMLElement
  const maintenanceDates = document.getElementById('maintenance-dates')!
  const maintenanceReason = document.getElementById('maintenance-reason')!

  // 1. Launcher self-update (commit-based, checked at every startup).
  if (await applyLauncherUpdate()) return

  // 2. Restore the session first: the player's pseudo is needed so the
  // AdminTool can tell us if they bypass maintenance (`canBypass`).
  let session: Awaited<ReturnType<typeof auth.refresh>> | null = null
  try {
    session = await auth.refresh()
  } catch (err) {
    logger.error('Failed to restore session:', err)
  }

  // 3. Load remote config in parallel.
  const [bg, mn] = await Promise.all([
    background.get(),
    maintenance.get(session && session.success ? session.account : undefined)
  ])
  const bgUrl = bg?.file?.url ?? DEFAULT_BACKGROUND
  // Set immediately: the maintenance screen may return early (bypass login
  // happens later, without going through the code below).
  if (bgElement) bgElement.style.backgroundImage = `url('${bgUrl}')`

  // Maintenance blocks everyone except bypass-listed pseudos (`canBypass`).
  if (mn && !mn.canBypass) {
    const start = new Date(mn.startTime as Date)
    const end = new Date(mn.endTime as Date)
    maintenanceDates.innerText = t('maintenance.from_to', { start: start.toLocaleString([], dateFormatOptions), end: end.toLocaleString([], dateFormatOptions) })
    maintenanceReason.innerText = mn.message ?? t('maintenance.reason_default')
    // A logged-in (but not whitelisted) player sees their profile capsule,
    // with a logout option to retry with another account.
    if (session && session.success) showMaintenanceProfile(session.account)
    setBlockingView('maintenance')
    return
  }

  try {
    await preloadImage(bgUrl)

    if (session && session.success) {
      logger.log(`Session restored: ${(session.account as any).name}`)
      try {
        const [__, skins, capes, avatar] = await Promise.all([skin.reload(session.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])
        try {
          await setUser(session.account, { skins, capes, avatar })
        } catch (err) {
          logger.error('setUser failed, continuing to home anyway:', err)
        }
      } catch (err) {
        logger.error('Skin loading failed, continuing to home anyway:', err)
        // Still enter home with minimal user data so the app never stays black.
        try {
          await setUser(session.account, { skins: null, capes: null, avatar: null })
        } catch (err2) {
          logger.error('Minimal setUser failed:', err2)
        }
      }
      logger.log('Entering home view')
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
    logger.log('Bootstrap finished, app shown')
  }
}
