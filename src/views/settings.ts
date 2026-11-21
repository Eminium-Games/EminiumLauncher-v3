import { setView, closeOverlay, logout } from '../state'
import { auth, settings, system, skin, updater } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'
import type { IGameSettings } from '../../electron/handlers/settings'
import shared from '../shared'
import { t } from '../i18n'

const resolutionList = [
  { label: 'Auto (default)', value: '854x480', width: 854, height: 480 },
  { label: 'Fullscreen', value: 'fullscreen', width: 854, height: 480 },
  { label: '2560x1440 (1440p)', value: '2560x1440', width: 2560, height: 1440 },
  { label: '1920x1080 (1080p)', value: '1920x1080', width: 1920, height: 1080 },
  { label: '1600x900', value: '1600x900', width: 1600, height: 900 },
  { label: '1366x768', value: '1366x768', width: 1366, height: 768 },
  { label: '1280x1024', value: '1280x1024', width: 1280, height: 1024 },
  { label: '1280x720 (720p)', value: '1280x720', width: 1280, height: 720 },
  { label: '1024x768', value: '1024x768', width: 1024, height: 768 },
  { label: '800x600', value: '800x600', width: 800, height: 600 }
]

let currentSettings: IGameSettings

export async function initSettings() {
  const sysInfo = await system.getInfo()
  currentSettings = await settings.get()

  initUIListeners()
  initDualSlider(sysInfo.totalMem)
  initFormValues(sysInfo.resolution)

  // Traduction i18n des libellés statiques
  const navGame = document.querySelector('.nav-btn[data-tab="game"] span')
  const navAccount = document.querySelector('.nav-btn[data-tab="account"] span')
  const navPrivacy = document.querySelector('.nav-btn[data-tab="privacy"] span')
  const navPatch = document.querySelector('.nav-btn[data-tab="patch"] span')
  if (navGame) navGame.textContent = t('settings.tab_game')
  if (navAccount) navAccount.textContent = t('settings.tab_account')
  if (navPrivacy) navPrivacy.textContent = t('settings.tab_privacy')
  if (navPatch) navPatch.textContent = t('settings.tab_patch')

  const javaSelectEl = document.getElementById('java-select') as HTMLSelectElement | null
  if (javaSelectEl) {
    const optBundled = javaSelectEl.querySelector('option[value="bundled"]')
    const optSystem = javaSelectEl.querySelector('option[value="system"]')
    if (optBundled) optBundled.textContent = t('settings.java_bundled')
    if (optSystem) optSystem.textContent = t('settings.java_system')
  }

  const patchTitle = document.getElementById('patch-title')
  if (patchTitle) patchTitle.textContent = t('patch.title')

  const tabGameTitle = document.getElementById('tab-game-title')
  const tabAccountTitle = document.getElementById('tab-account-title')
  const tabPrivacyTitle = document.getElementById('tab-privacy-title')
  if (tabGameTitle) tabGameTitle.textContent = t('settings.section_game')
  if (tabAccountTitle) tabAccountTitle.textContent = t('settings.section_account')
  if (tabPrivacyTitle) tabPrivacyTitle.textContent = t('settings.section_privacy')
  const patchDesc = document.getElementById('patch-desc')
  if (patchTitle) patchTitle.textContent = t('patch.title')
  if (patchDesc) patchDesc.textContent = t('patch.description')
  const installPatchedJavaBtn = document.getElementById('btn-install-patched-java') as HTMLButtonElement | null
  const installPatchedJavaStatus = document.getElementById('install-patched-java-status')

  // Traductions supplémentaires
  const el = (id: string) => document.getElementById(id)
  const setHtml = (id: string, html: string) => { const e = el(id); if (e) e.innerHTML = html }

  setHtml('label-ram', `<i class="fa-fw fa-solid fa-memory"></i>&nbsp;&nbsp;${t('settings.ram')}`)
  setHtml('label-resolution', `<i class="fa-fw fa-solid fa-display"></i>&nbsp;&nbsp;${t('settings.resolution')}`)
  setHtml('label-launcher-action', `<i class="fa-solid fa-power-off"></i>&nbsp;&nbsp;${t('settings.launcher_action')}`)
  setHtml('label-java', `<i class="fa-brands fa-java"></i>&nbsp;&nbsp;${t('settings.java')}`)
  setHtml('label-launcher-updates', `<i class="fa-fw fa-solid fa-arrows-rotate"></i>&nbsp;&nbsp;${t('settings.launcher_updates')}`)

  const launcherActionSelect = document.getElementById('launcher-action-select') as HTMLSelectElement | null
  if (launcherActionSelect) {
    const optClose = launcherActionSelect.querySelector('option[value="close"]')
    const optKeep = launcherActionSelect.querySelector('option[value="keep"]')
    const optHide = launcherActionSelect.querySelector('option[value="hide"]')
    if (optClose) optClose.textContent = t('settings.launcher_action_close')
    if (optKeep) optKeep.textContent = t('settings.launcher_action_keep')
    if (optHide) optHide.textContent = t('settings.launcher_action_hide')
  }

  const btnManageAccount = document.getElementById('btn-manage-account')
  const manageSpan = btnManageAccount?.querySelector('span')
  if (manageSpan) manageSpan.textContent = t('settings.manage_account')
  const labelLogout = document.getElementById('label-logout')
  if (labelLogout) labelLogout.textContent = t('settings.logout')
  const labelCheckUpdates = document.getElementById('label-check-updates')
  if (labelCheckUpdates) labelCheckUpdates.textContent = t('settings.check_updates')

  const labelTelemetryStats = document.getElementById('label-telemetry-stats')
  if (labelTelemetryStats) {
    const span = labelTelemetryStats.querySelector('span')
    if (span) span.textContent = t('settings.telemetry_stats')
  }
  const hintStats = document.getElementById('hint-telemetry-stats')
  if (hintStats) hintStats.textContent = t('settings.telemetry_stats_hint')
  const labelTelemetryCrash = document.getElementById('label-telemetry-crash')
  if (labelTelemetryCrash) {
    const span = labelTelemetryCrash.querySelector('span')
    if (span) span.textContent = t('settings.telemetry_crash')
  }
  const hintCrash = document.getElementById('hint-telemetry-crash')
  if (hintCrash) hintCrash.textContent = t('settings.telemetry_crash_hint')

  if (installPatchedJavaBtn) installPatchedJavaBtn.innerHTML = `<i class="fa-solid fa-download"></i> ${t('patch.install')}`
  if (installPatchedJavaBtn) installPatchedJavaBtn.innerHTML = `<i class="fa-solid fa-download"></i> ${t('patch.install')}`

  installPatchedJavaBtn?.addEventListener('click', async () => {
    if (installPatchedJavaBtn) installPatchedJavaBtn.disabled = true
    if (installPatchedJavaStatus) installPatchedJavaStatus.innerText = t('patch.installing')
    try {
      const path = await settings.installPatchedJava17()
      if (path) {
        if (installPatchedJavaBtn) installPatchedJavaBtn.style.display = 'none'
        if (installPatchedJavaStatus) installPatchedJavaStatus.innerText = t('patch.installed', { path })
        await Dialog.show('Patched Java 17 installed. Select "Use system Java (PATH)" or restart to use it.', [{ text: 'OK', type: 'ok' }])
      } else {
        if (installPatchedJavaStatus) installPatchedJavaStatus.innerText = t('patch.failed')
      }
    } catch (err) {
      logger.error('installPatchedJava17 failed:', err)
      if (installPatchedJavaStatus) installPatchedJavaStatus.innerText = 'Installation failed. See logs.'
    } finally {
      if (installPatchedJavaBtn) installPatchedJavaBtn.disabled = false
    }
  })
  // Masque le bouton d'installation si un Java patché est déjà disponible.
  try {
    const resolved = await settings.resolveJava()
    if (resolved && parseInt(resolved.version.split('.')[0], 10) >= 17) {
      if (installPatchedJavaBtn) installPatchedJavaBtn.style.display = 'none'
      if (installPatchedJavaStatus) installPatchedJavaStatus.innerText = t('patch.available', { version: resolved.version, path: resolved.path })
    }
  } catch (err) {
    logger.error('resolveJava check failed:', err)
  }
  const versionElem = document.getElementById('version')
  if (versionElem) versionElem.innerText = t('settings.version', { version: sysInfo.version })

  const commitElem = document.getElementById('launcher-commit')
  const checkUpdatesBtn = document.getElementById('btn-check-updates') as HTMLButtonElement | null
  const updateStatus = document.getElementById('update-status')

  const setStatus = (text: string) => {
    if (updateStatus) updateStatus.innerText = text
  }

  try {
    const info = await updater.getInfo()
    if (commitElem) commitElem.innerText = t('settings.commit', { commit: info.current.slice(0, 7), mode: info.mode === 'dev' ? 'dev' : 'prod' })
  } catch {
    if (commitElem) commitElem.innerText = ''
  }

  checkUpdatesBtn?.addEventListener('click', async () => {
    checkUpdatesBtn.disabled = true
    setStatus('Checking for updates...')
    try {
      const res = await updater.check()
      if (!res.updateAvailable || !res.latest) {
        if (res.reason === 'offline') setStatus('Cannot reach GitHub, check your connection.')
        else if (res.reason === 'build-pending') setStatus('CI has not built this commit yet, try again later.')
        else if (res.reason === 'install-pending')
          setStatus('Update already installed, but this copy is still outdated (installed in another folder?).')
        else setStatus('You are up to date.')
      } else {
        setStatus(`Update ${res.latest.slice(0, 7)} found. Downloading...`)
        const off = updater.onProgress((p) => {
          setStatus(`Downloading update... ${Math.round(p.percent)}%`)
        })
        try {
          const installerPath = await updater.download()
          setStatus('Installing update, the launcher will restart...')
          await updater.install(installerPath ?? undefined)
        } finally {
          off()
        }
      }
    } catch (err) {
      setStatus(`Update failed: ${err instanceof Error ? err.message : String(err)}`)
      logger.error(err)
    } finally {
      checkUpdatesBtn.disabled = false
    }
  })
}

function initUIListeners() {
  const closeBtn = document.getElementById('btn-close-settings')
  const tabContents = document.querySelectorAll('.tab-content')
  const tabButtons = document.querySelectorAll('.nav-btn')
  const logoutBtn = document.getElementById('btn-logout')

  const addSkinUrlBtn = document.getElementById('btn-add-skin-url')!
  const addSkinFileBtn = document.getElementById('btn-add-skin-file')!

  const addSkinFileForm = document.getElementById('form-add-skin-file')!
  const addSkinFileInput = document.getElementById('input-add-skin-file') as HTMLInputElement
  const addSkinFileButton = document.getElementById('btn-add-skin-choose-file') as HTMLButtonElement
  const addSkinFileSelectedDiv = document.getElementById('div-add-skin-file-selected')!
  const addSkinFileSelectedName = document.getElementById('span-add-skin-file-name')!
  const addSkinFileResetBtn = document.getElementById('btn-selected-file-reset') as HTMLButtonElement

  const addSkinUrlForm = document.getElementById('form-add-skin-url')!
  const addSkinUrlInput = document.getElementById('input-add-skin-url') as HTMLInputElement

  const addSkinSubmitBtn = document.getElementById('btn-add-skin-submit') as HTMLButtonElement

  closeBtn?.addEventListener('click', async () => {
    await saveSettings()
    closeOverlay('settings')
  })

  logoutBtn?.addEventListener('click', async () => {
    if (
      await Dialog.show('Log out?', [
        { text: 'Cancel', type: 'cancel' },
        { text: 'Logout', type: 'danger' }
      ])
    ) {
      await auth.logout()
      logout()
      closeOverlay('settings')
      setView('login')
    }
  })

  addSkinUrlBtn?.addEventListener('click', () => {
    addSkinUrlBtn!.classList.add('active')
    addSkinFileBtn!.classList.remove('active')
    addSkinUrlForm!.style.display = 'block'
    addSkinFileForm!.style.display = 'none'
    addSkinFileInput.value = ''
    addSkinUrlInput.value = ''
    addSkinFileSelectedDiv.style.display = 'none'
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
  })

  addSkinFileBtn?.addEventListener('click', () => {
    addSkinFileBtn!.classList.add('active')
    addSkinUrlBtn!.classList.remove('active')
    addSkinUrlForm!.style.display = 'none'
    addSkinFileForm!.style.display = 'block'
    addSkinUrlInput.value = ''
    addSkinFileInput.value = ''
    addSkinFileSelectedDiv.style.display = 'none'
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
  })

  addSkinFileButton?.addEventListener('click', async () => {
    addSkinFileInput.click()
  })

  addSkinFileInput?.addEventListener('change', async () => {
    const file = addSkinFileInput.files?.[0]
    if (!file) {
      addSkinFileButton.style.display = 'block'
      addSkinSubmitBtn.disabled = true
      addSkinFileSelectedDiv.style.display = 'none'
      return
    }

    addSkinFileButton.style.display = 'none'
    addSkinSubmitBtn.disabled = false
    addSkinFileSelectedName.innerText = file.name
    addSkinFileSelectedDiv.style.display = 'block'
  })

  addSkinUrlInput?.addEventListener('input', () => {
    addSkinSubmitBtn.disabled = addSkinUrlInput.value.trim() === ''
  })

  addSkinFileResetBtn?.addEventListener('click', () => {
    addSkinFileInput.value = ''
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
    addSkinFileSelectedDiv.style.display = 'none'
  })

  addSkinSubmitBtn?.addEventListener('click', async () => {
    addSkin()
    addSkinUrlInput.value = ''
    addSkinFileInput.value = ''
    addSkinFileButton.style.display = 'block'
    addSkinSubmitBtn.disabled = true
    addSkinFileSelectedDiv.style.display = 'none'
    document.getElementById('settings-content')?.scrollTo({ top: 0, behavior: 'smooth' })
  })

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      const targetTab = btn.getAttribute('data-tab')
      tabContents.forEach((c) => (c.id === `tab-${targetTab}` ? c.classList.add('active') : c.classList.remove('active')))
    })
  })
}

function initDualSlider(maxRamSystem: number) {
  maxRamSystem = Math.min(maxRamSystem, 16)
  const minInput = document.getElementById('ram-min') as HTMLInputElement
  const maxInput = document.getElementById('ram-max') as HTMLInputElement
  const fill = document.getElementById('ram-track-fill')
  const minLabel = document.getElementById('ram-min-label')
  const maxLabel = document.getElementById('ram-max-label')

  if (!minInput || !maxInput || !fill) return

  minInput.max = maxRamSystem.toString()
  maxInput.max = maxRamSystem.toString()

  const gap = 0.5
  const updateSlider = (e?: Event) => {
    let minVal = parseFloat(minInput.value)
    let maxVal = parseFloat(maxInput.value)

    if (maxVal - minVal < gap) {
      if (e?.target === minInput) {
        minInput.value = (maxVal - gap).toString()
        minVal = parseFloat(minInput.value)
      } else {
        maxInput.value = (minVal + gap).toString()
        maxVal = parseFloat(maxInput.value)
      }
    }

    if (minLabel) minLabel.innerText = `${minVal} GB`
    if (maxLabel) maxLabel.innerText = `${maxVal} GB`

    const range = maxRamSystem - parseFloat(minInput.min)
    const minPercent = ((minVal - parseFloat(minInput.min)) / range) * 100
    const maxPercent = ((maxVal - parseFloat(maxInput.min)) / range) * 100

    fill.style.left = `${minPercent}%`
    fill.style.width = `${maxPercent - minPercent}%`
  }

  minInput.addEventListener('input', updateSlider)
  maxInput.addEventListener('input', updateSlider)
  updateSlider()
}

function initFormValues(resolution: { width: number; height: number }) {
  if (!currentSettings) return

  const minInput = document.getElementById('ram-min') as HTMLInputElement
  const maxInput = document.getElementById('ram-max') as HTMLInputElement
  const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement
  const launcherActionSelect = document.getElementById('launcher-action-select') as HTMLSelectElement
  const javaSelect = document.getElementById('java-select') as HTMLSelectElement

  if (minInput) minInput.value = currentSettings.memory.min + ''
  if (maxInput) maxInput.value = currentSettings.memory.max + ''
  if (resolutionSelect) {
    const availableResolutions = getAvailableResolutions(resolution)
    resolutionSelect.innerHTML = ''
    availableResolutions.forEach((res) => {
      const option = document.createElement('option')
      option.value = res.value
      option.innerText = res.label
      resolutionSelect.appendChild(option)
    })

    resolutionSelect.value = currentSettings.resolution.fullscreen
      ? 'fullscreen'
      : `${currentSettings.resolution.width}x${currentSettings.resolution.height}`
  }
  if (launcherActionSelect) launcherActionSelect.value = currentSettings.launcherAction
  if (javaSelect) javaSelect.value = currentSettings.java === 'bundled' ? 'bundled' : 'system'

  const statsCheckbox = document.getElementById('telemetry-stats') as HTMLInputElement | null
  const crashCheckbox = document.getElementById('telemetry-crash') as HTMLInputElement | null
  if (statsCheckbox) statsCheckbox.checked = currentSettings.telemetry?.statsEnabled ?? true
  if (crashCheckbox) crashCheckbox.checked = currentSettings.telemetry?.crashReportsEnabled ?? false

  minInput.dispatchEvent(new Event('input'))
}

async function saveSettings() {
  const minInput = document.getElementById('ram-min') as HTMLInputElement
  const maxInput = document.getElementById('ram-max') as HTMLInputElement
  const launcherActionSelect = document.getElementById('launcher-action-select') as HTMLSelectElement
  const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement
  const javaSelect = document.getElementById('java-select') as HTMLSelectElement
  const statsCheckbox = document.getElementById('telemetry-stats') as HTMLInputElement | null
  const crashCheckbox = document.getElementById('telemetry-crash') as HTMLInputElement | null

  const newSettings: IGameSettings = {
    ...currentSettings,
    memory: {
      min: parseFloat(minInput.value),
      max: parseFloat(maxInput.value)
    },
    resolution: {
      height: resolutionList.find((r) => r.value === resolutionSelect.value)?.height ?? 854,
      width: resolutionList.find((r) => r.value === resolutionSelect.value)?.width ?? 480,
      fullscreen: resolutionSelect.value === 'fullscreen'
    },
    java: javaSelect.value === 'bundled' ? 'bundled' : 'path',
    launcherAction: launcherActionSelect.value as 'close' | 'keep' | 'hide',
    telemetry: {
      statsEnabled: statsCheckbox?.checked ?? currentSettings.telemetry?.statsEnabled ?? true,
      crashReportsEnabled: crashCheckbox?.checked ?? currentSettings.telemetry?.crashReportsEnabled ?? false
    }
  }

  await settings.set(newSettings)
  currentSettings = newSettings
}

async function addSkin() {
  const addSkinUrlBtn = document.getElementById('btn-add-skin-url')!
  const addSkinFileBtn = document.getElementById('btn-add-skin-file')!
  const addSkinFileInput = document.getElementById('input-add-skin-file') as HTMLInputElement
  const addSkinUrlInput = document.getElementById('input-add-skin-url') as HTMLInputElement
  const addSkinSlimVariant = document.getElementById('input-add-skin-variant-slim') as HTMLInputElement

  let skinSource: string | ArrayBuffer | null = null
  let variant: 'classic' | 'slim' = 'classic'

  if (addSkinUrlBtn.classList.contains('active')) {
    skinSource = addSkinUrlInput.value.trim()
  } else if (addSkinFileBtn.classList.contains('active')) {
    const file = addSkinFileInput.files?.[0]
    if (file) {
      skinSource = await file.arrayBuffer()
    }
  }

  if (!skinSource) return

  if (addSkinSlimVariant.checked) variant = 'slim'

  try {
    const result = await skin.updateSkin(skinSource, variant)
    if (!result) {
      await Dialog.show('Failed to add skin. Please check the URL or file and try again.', [{ text: 'Close', type: 'ok' }])
      return
    }

    shared.skins = result
    shared.resetMainView()
    shared.resetSkinViews()
  } catch (err) {
    await Dialog.show('An error occurred while adding the skin. Please try again in few minutes.', [{ text: 'Close', type: 'ok' }])
    return
  }
}

function getAvailableResolutions(systemResolution: { width: number; height: number }) {
  return resolutionList.filter((res) => res.width <= systemResolution.width && res.height <= systemResolution.height)
}

