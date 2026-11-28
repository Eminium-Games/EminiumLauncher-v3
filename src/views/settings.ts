import { setView, closeOverlay, logout } from '../state'
import { auth, settings, system, skin, updater } from '../ipc'
import { Dialog } from './dialog'
import logger from 'electron-log/renderer'
import type { IGameSettings } from '../../electron/handlers/settings'
import shared from '../shared'
import { t } from '../i18n'
import { enterWithAccount, requestEminiumLogin } from './login'
import { setUser } from '../state'
import { isDevMode, setOverrideDate, getEffectiveDate, isSeasonalActive, startSnow, stopSnow } from '../seasonal'

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
  if (patchTitle) patchTitle.textContent = t('settings.tab_patch')

  const patchDesc = document.getElementById('patch-desc')
  if (patchDesc) patchDesc.textContent = t('patch.description')

  const labelManageAccount = document.getElementById('label-manage-account')
  if (labelManageAccount) labelManageAccount.textContent = t('settings.manage_account')
  const labelSavedAccounts = document.getElementById('label-saved-accounts')
  if (labelSavedAccounts) labelSavedAccounts.innerHTML = `<i class="fa-fw fa-solid fa-users"></i>&nbsp;&nbsp;${t('accounts.saved')}`
  const settingsTitle = document.getElementById('settings-title')
  if (settingsTitle) settingsTitle.textContent = t('settings.title')
  const tabGameTitle = document.getElementById('tab-game-title')
  const tabAccountTitle = document.getElementById('tab-account-title')
  const tabPrivacyTitle = document.getElementById('tab-privacy-title')
  if (tabGameTitle) tabGameTitle.textContent = t('settings.section_game')
  if (tabAccountTitle) tabAccountTitle.textContent = t('settings.section_account')
  if (tabPrivacyTitle) tabPrivacyTitle.textContent = t('settings.section_privacy')

  // Rendu des patches en accord�on (un seul ouvert � la fois)
  renderPatches()

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
  const labelOpenLogs = document.getElementById('label-open-logs')
  if (labelOpenLogs) labelOpenLogs.textContent = t('settings.open_logs')
  const labelRamAuto = document.getElementById('label-ram-auto')
  if (labelRamAuto) labelRamAuto.textContent = t('settings.ram_auto')

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

  const versionElem = document.getElementById('version')
  if (versionElem) versionElem.innerText = t('settings.version', { version: sysInfo.version })

  const commitElem = document.getElementById('launcher-commit')
  const btnRamAuto = document.getElementById('btn-ram-auto') as HTMLButtonElement | null
  btnRamAuto?.addEventListener('click', () => {
    const minInput = document.getElementById('ram-min') as HTMLInputElement
    const maxInput = document.getElementById('ram-max') as HTMLInputElement
    const totalMem = sysInfo.totalMem
    if (minInput && maxInput) {
      minInput.value = '2'
      maxInput.value = String(Math.min(Math.max(Math.round(totalMem / 4), 2), 8))
      minInput.dispatchEvent(new Event('input'))
      maxInput.dispatchEvent(new Event('input'))
    }
  })
  const repairGameBtn = document.getElementById('btn-repair-game') as HTMLButtonElement | null
  repairGameBtn?.addEventListener('click', async () => {
    const ok = await Dialog.show(t('settings.repair_confirm'), [{ text: t('common.cancel'), type: 'cancel' }, { text: t('settings.repair'), type: 'danger' }])
    if (!ok) return
    const res = await system.repairGame()
    if (res.success) {
      await Dialog.show(`Repaired: deleted ${res.deleted ?? 0} folders. Relaunch the game to re-download.`, [{ text: 'OK', type: 'ok' }])
    } else {
      await Dialog.show(`Repair failed: ${res.error ?? 'unknown error'}`, [{ text: 'OK', type: 'ok' }])
    }
  })
  const openLogsBtn = document.getElementById('btn-open-logs') as HTMLButtonElement | null
  openLogsBtn?.addEventListener('click', async () => {
    await system.openLogs()
  })

  async function renderAccounts() {
    const list = document.getElementById('accounts-list')
    if (!list) return
    list.innerHTML = ''
    let accounts: { name: string; uuid: string; role?: string; active: boolean }[] = []
    try {
      accounts = await auth.accounts()
    } catch (err) {
      logger.error('Failed to load accounts:', err)
    }
    if (accounts.length === 0) {
      list.innerHTML = '<p style="opacity:0.7;font-size:0.85rem;">' + t('accounts.none') + '</p>'
      return
    }
    accounts.forEach((acc, idx) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;border:1px solid var(--line-strong);border-radius:4px;'
      const name = document.createElement('span')
      name.style.flex = '1'
      name.textContent = `${acc.name}${acc.active ? ' (active)' : ''}`
      row.appendChild(name)
      if (!acc.active) {
        const switchBtn = document.createElement('button')
        switchBtn.className = 'btn btn-secondary'
        switchBtn.textContent = t('accounts.switch')
        switchBtn.onclick = async () => {
          const res = await auth.switch(idx)
          if (res.success && 'account' in res && res.account) {
            const [__, skins, capes, avatar] = await Promise.all([skin.reload(res.account), skin.getSkin(), skin.getCape(), skin.getAvatar()])
            await setUser(res.account, { skins, capes, avatar })
            await renderAccounts()
          }
        }
        row.appendChild(switchBtn)
      }
      const removeBtn = document.createElement('button')
      removeBtn.className = 'btn btn-danger'
      removeBtn.textContent = t('accounts.remove')
      removeBtn.onclick = async () => {
        await auth.remove(idx)
        await renderAccounts()
      }
      row.appendChild(removeBtn)
      list.appendChild(row)
    })
  }

  const btnAddAccount = document.getElementById('btn-add-account') as HTMLButtonElement | null
  if (btnAddAccount) btnAddAccount.innerHTML = `<i class="fa-solid fa-plus"></i> ${t('accounts.add')}`
  btnAddAccount?.addEventListener('click', async () => {
    const account = await requestEminiumLogin()
    if (account) {
      await enterWithAccount(account)
      await renderAccounts()
    }
  })

  // Mode dev : sélecteur de date pour tester les événements saisonniers
  if (isDevMode()) {
    const content = document.getElementById('settings-content')
    if (content) {
      const devSection = document.createElement('section')
      devSection.className = 'tab-content'
      devSection.id = 'tab-dev'
      devSection.innerHTML = `
        <h3>${t('dev.seasonal_title')}</h3>
        <div class="setting-group">
          <label>Override date (YYYY-MM-DD)</label>
          <input type="date" id="dev-seasonal-date" style="padding:8px;border-radius:4px;border:1px solid var(--line-strong);background:var(--surface);color:var(--text-main);" />
          <button id="dev-seasonal-apply" class="btn btn-secondary" style="margin-top:8px;">Apply</button>
          <button id="dev-seasonal-clear" class="btn btn-secondary" style="margin-top:8px;">${t('dev.clear_override')}</button>
          <p id="dev-seasonal-status" style="margin-top:6px;font-size:0.85rem;opacity:0.8;"></p>
        </div>
        <div class="setting-group" style="margin-top:1.5rem;">
          <label>${t('dev.language_title')}</label>
          <select id="dev-locale-select" style="padding:8px;border-radius:4px;border:1px solid var(--line-strong);background:var(--surface);color:var(--text-main);">
            <option value="">${t('accounts.os_default')}</option>
            <option value="fr">Français (fr)</option>
            <option value="en">English (en)</option>
            <option value="es">Español (es)</option>
            <option value="de">Deutsch (de)</option>
            <option value="it">Italiano (it)</option>
            <option value="pt">Português (pt)</option>
            <option value="ja">日本語 (ja)</option>
            <option value="ko">한국어 (ko)</option>
            <option value="zh">中文 (zh)</option>
            <option value="ru">Русский (ru)</option>
          </select>
          <button id="dev-locale-apply" class="btn btn-secondary" style="margin-top:8px;">${t('dev.apply_reload')}</button>
          <p id="dev-locale-status" style="margin-top:6px;font-size:0.85rem;opacity:0.8;"></p>
        </div>
      `
      // Add nav button
      const nav = document.querySelector('.settings-sidebar nav')
      if (nav) {
        const btn = document.createElement('button')
        btn.className = 'btn nav-btn'
        btn.setAttribute('data-tab', 'dev')
        btn.innerHTML = '<i class="fa-solid fa-flask"></i><span>Dev</span>'
        nav.appendChild(btn)
      }
      content.appendChild(devSection)

      const dateInput = document.getElementById('dev-seasonal-date') as HTMLInputElement
      const statusEl = document.getElementById('dev-seasonal-status')
      const effective = getEffectiveDate()
      dateInput.value = effective.toISOString().slice(0, 10)
      if (statusEl) statusEl.innerText = isSeasonalActive() ? t('seasonal.active') : t('seasonal.inactive')

      document.getElementById('dev-seasonal-apply')?.addEventListener('click', () => {
        const v = dateInput.value
        if (!v) return
        setOverrideDate(v)
        const d = new Date(v)
        stopSnow()
        if (isSeasonalActive(d)) startSnow()
        if (statusEl) statusEl.innerText = isSeasonalActive(d) ? 'Seasonal event ACTIVE for this date' : 'Seasonal event inactive for this date'
      })
      document.getElementById('dev-seasonal-clear')?.addEventListener('click', () => {
        setOverrideDate(null)
        const d = new Date()
        dateInput.value = d.toISOString().slice(0, 10)
        stopSnow()
        if (isSeasonalActive(d)) startSnow()
        if (statusEl) statusEl.innerText = isSeasonalActive(d) ? 'Seasonal event ACTIVE for this date' : 'Seasonal event inactive for this date'
      })

      // Language override
      const localeSelect = document.getElementById('dev-locale-select') as HTMLSelectElement | null
      const localeStatus = document.getElementById('dev-locale-status')
      if (localeSelect) {
        try {
          const cur = localStorage.getItem('locale_override') || ''
          localeSelect.value = cur
        } catch {}
        if (localeStatus) {
          const eff = localStorage.getItem('locale_override') || 'OS default'
          localeStatus.innerText = `Current override: ${eff}`
        }
      }
      document.getElementById('dev-locale-apply')?.addEventListener('click', () => {
        const v = localeSelect?.value || ''
        try {
          if (v) localStorage.setItem('locale_override', v)
          else localStorage.removeItem('locale_override')
        } catch (e) {
          console.error('localStorage failed:', e)
        }
        console.log('Reloading with locale override:', v || '(cleared)')
        window.location.reload()
      })
    }
  }

  function renderPatches() {
    const list = document.getElementById('patches-list')
    if (!list) return
    list.innerHTML = ''

    const patches = [
      {
        id: 'java4shell',
        title: t('patch.title'),
        body: () => {
          const wrap = document.createElement('div')
          const desc = document.createElement('p')
          desc.style.cssText = 'margin-bottom:1rem;opacity:0.85;'
          desc.textContent = t('patch.description')
          wrap.appendChild(desc)

          const group = document.createElement('div')
          group.className = 'setting-group'
          const label = document.createElement('label')
          label.innerHTML = `<i class="fa-fw fa-solid fa-shield-halved"></i>&nbsp;&nbsp;${t('patched_java_17')}`
          group.appendChild(label)

          const btn = document.createElement('button')
          btn.id = 'btn-install-patched-java'
          btn.className = 'btn btn-secondary'
          btn.style.marginTop = '8px'
          btn.innerHTML = `<i class="fa-solid fa-download"></i> ${t('patch.install')}`
          group.appendChild(btn)

          const status = document.createElement('p')
          status.id = 'install-patched-java-status'
          status.style.cssText = 'margin-top:6px;font-size:0.85rem;opacity:0.8;'
          group.appendChild(status)

          wrap.appendChild(group)

          // Wire button
          const installBtn = btn
          const statusEl = status
          installBtn.addEventListener('click', async () => {
            installBtn.disabled = true
            statusEl.innerText = t('patch.installing')
            try {
              const path = await settings.installPatchedJava17()
              if (path) {
                installBtn.style.display = 'none'
                statusEl.innerText = t('patch.installed', { path })
                await Dialog.show(t('settings.patched_java_installed'), [{ text: t('common.ok'), type: 'ok' }])
              } else {
                statusEl.innerText = t('patch.failed')
              }
            } catch (err) {
              logger.error('installPatchedJava17 failed:', err)
              statusEl.innerText = t('patch.failed')
            } finally {
              installBtn.disabled = false
            }
          })

          // Hide if already available
          settings.resolveJava().then((resolved) => {
            if (resolved && parseInt(resolved.version.split('.')[0], 10) >= 17) {
              installBtn.style.display = 'none'
              statusEl.innerText = t('patch.available', { version: resolved.version, path: resolved.path })
            }
          }).catch(() => {})

          return wrap
        }
      }
    ]

    // Accordion: only one open at a time
    patches.forEach((patch) => {
      const item = document.createElement('div')
      item.className = 'patch-item'
      item.style.cssText = 'border:1px solid var(--line-strong);border-radius:4px;overflow:hidden;'

      const header = document.createElement('button')
      header.className = 'patch-header'
      header.style.cssText = 'width:100%;text-align:left;padding:12px 16px;background:var(--surface);border:none;cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center;color:var(--text-main);'
      header.innerHTML = `<span>${patch.title}</span><i class="fa-solid fa-chevron-down" style="transition:transform 0.2s;"></i>`

      const body = document.createElement('div')
      body.className = 'patch-body'
      body.style.cssText = 'padding:16px;display:none;'

      item.appendChild(header)
      item.appendChild(body)
      list.appendChild(item)

      let rendered = false
      header.addEventListener('click', () => {
        const isOpen = body.style.display === 'block'
        // Close all
        list.querySelectorAll('.patch-body').forEach((b) => ((b as HTMLElement).style.display = 'none'))
        list.querySelectorAll('.patch-header i').forEach((i) => ((i as HTMLElement).style.transform = 'rotate(0deg)'))
        if (!isOpen) {
          if (!rendered) {
            body.appendChild(patch.body())
            rendered = true
          }
          body.style.display = 'block'
          const icon = header.querySelector('i')
          if (icon) (icon as HTMLElement).style.transform = 'rotate(180deg)'
        } else {
        }
      })
    })

    // Open first by default
    const firstHeader = list.querySelector('.patch-header') as HTMLElement | null
    firstHeader?.click()
  }

  renderAccounts()
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

  const checkUpdatesBtn = document.getElementById('btn-check-updates') as HTMLButtonElement | null
  checkUpdatesBtn?.addEventListener('click', async () => {
    checkUpdatesBtn.disabled = true
    setStatus(t('settings.checking_updates'))
    try {
      const res = await updater.check()
      if (!res.updateAvailable || !res.latest) {
        if (res.reason === 'offline') setStatus(t('settings.offline'))
        else if (res.reason === 'build-pending') setStatus(t('settings.build_pending'))
        else if (res.reason === 'install-pending') setStatus(t('settings.install_pending'))
        else setStatus(t('settings.up_to_date'))
      } else {
        setStatus(`Update ${res.latest.slice(0, 7)} found. Downloading...`)
        const off = updater.onProgress((p) => {
          setStatus(`Downloading update... ${Math.round(p.percent)}%`)
        })
        try {
          const installerPath = await updater.download()
          setStatus(t('update.installing'))
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
      await Dialog.show(t('settings.logout_confirm'), [
        { text: t('common.cancel'), type: 'cancel' },
        { text: t('settings.logout'), type: 'danger' }
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

  const nav = document.querySelector('.settings-sidebar nav')
  nav?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.nav-btn') as HTMLElement | null
    if (!btn) return
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    const targetTab = btn.getAttribute('data-tab')
    document.querySelectorAll('.tab-content').forEach((c) => (c.id === `tab-${targetTab}` ? c.classList.add('active') : c.classList.remove('active')))
    document.getElementById('settings-content')?.scrollTo({ top: 0, behavior: 'smooth' })
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
      option.innerText = res.value === 'fullscreen' ? t('settings.fullscreen') : res.value === '854x480' && res.label === 'Auto (default)' ? t('settings.auto_default') : res.label
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
      await Dialog.show(t('settings.failed_add_skin'), [{ text: t('common.close'), type: 'ok' }])
      return
    }

    shared.skins = result
    shared.resetMainView()
    shared.resetSkinViews()
  } catch (err) {
    await Dialog.show('An error occurred while adding the skin. Please try again in few minutes.', [{ text: t('common.close'), type: 'ok' }])
    return
  }
}

function getAvailableResolutions(systemResolution: { width: number; height: number }) {
  return resolutionList.filter((res) => res.width <= systemResolution.width && res.height <= systemResolution.height)
}

